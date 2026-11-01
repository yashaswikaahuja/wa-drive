/**
 * WSS session controller for the extension service worker (T4 Stage A).
 * Owns a single CcWsClient + ReconnectManager, persists presence state for the popup.
 *
 * HTTPS remains for token mint / profile CRUD.
 * This module opens authenticated WSS after credentials land in storage.
 */
(function (root: any) {
  'use strict';

  const STORAGE_KEY = 'ccWssState';
  let _client = null;
  let _reconnect = null;
  let _lastToken = null;
  let _lastUrl = null;

  function deriveWsUrl(backendUrl) {
    if (!backendUrl) return null;
    try {
      // https://api.x/api → wss://api.x/ws  (prod nginx terminates both)
      // Local hybrid: hub :3000 HTTPS + extension-service :3300 WSS
      const trimmed = String(backendUrl).replace(/\/$/, '');
      const origin = trimmed.replace(/\/api$/i, '');
      const u = new URL(origin);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      u.pathname = '/ws';
      u.search = '';
      u.hash = '';
      const host = u.hostname;
      const port = u.port || (u.protocol === 'wss:' ? '443' : '80');
      if ((host === 'localhost' || host === '127.0.0.1') && (port === '3000' || port === '80')) {
        u.port = '3300';
      }
      return u.toString();
    } catch {
      return null;
    }
  }

  function publishState(partial) {
    const payload = {
      state: 'disconnected',
      sessionId: null,
      url: _lastUrl,
      lastError: null,
      updatedAt: Date.now(),
    };
    if (partial && typeof partial === 'object') {
      for (const k of Object.keys(partial)) {
        if (partial[k] !== undefined) payload[k] = partial[k];
      }
    }
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: payload });
    } catch (e) {
      console.warn('[CC][wss] publishState failed:', e.message);
    }
    return payload;
  }

  function replyBrowserTask(taskId, result) {
    try {
      if (_client && _client.state === 'connected') {
        _client.send('browser_task_result', Object.assign({ taskId: taskId }, result));
      }
    } catch (e) { /* socket gone */ }
  }

  function kernelScripts() {
    var manifests = root.CcScriptManifests;
    if (manifests && manifests.SEQUENTIAL_KERNEL_SCRIPTS && manifests.SEQUENTIAL_KERNEL_SCRIPTS.length) {
      return manifests.SEQUENTIAL_KERNEL_SCRIPTS.slice();
    }
    return [
      'shared-bundle.js',
      'autofill/plugins-bundle.js',
      'drivers-bundle.js',
      'autofill/extractor-bundle.js',
      'autofill/mapper-bundle.js',
      'autofill/executor-bundle.js',
    ];
  }

  function readFormPage() {
    if (typeof extractFormFieldsWithFingerprint !== 'function') return { ok: false, error: 'extractor_not_loaded' };
    var extracted = extractFormFieldsWithFingerprint();
    var formFields = (extracted && extracted.formFields) || [];
    var visible = formFields.filter(function (f) { return f && f.visible === true; });
    var snapshotId = (extracted && extracted.snapshotId) || '';
    var page = {
      ok: true,
      url: location.href,
      title: document.title,
      snapshotId: snapshotId,
      fields: visible.map(function (f) {
        return {
          selector: f.selector || '',
          label: f.label || '',
          visualLabel: f.visualLabel || f.label || '',
          type: f.type || 'text',
          options: f.options || null,
          placeholder: f.placeholder || '',
          fieldId: f.fieldId || '',
        };
      }),
    };
    try {
      var clickApi = (typeof globalThis !== 'undefined') ? (globalThis as any).CcClickControl : null;
      var buttons = clickApi && typeof clickApi.list === 'function' ? clickApi.list(document) : [];
      for (var b = 0; b < buttons.length; b++) page.fields.push(buttons[b]);
    } catch (e) { /* buttons stay out of the snapshot */ }
    return page;
  }

  async function fillFormPage(incoming) {
    if (typeof fillFormFieldsSequential !== 'function') return { ok: false, error: 'executor_not_loaded' };
    var loop = (typeof globalThis !== 'undefined') ? (globalThis as any).CcAgUiLoop : null;
    if (!loop || typeof loop.run !== 'function') return { ok: false, error: 'ag_ui_loop_missing' };
    var list = Array.isArray(incoming) ? incoming : [];
    var skip = /captcha|otp|password|cvv|card number|\bpin\b/i;
    var fields = [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f || !f.selector) continue;
      var label = f.visualLabel || f.label || '';
      if (skip.test(label) || skip.test(f.selector)) continue;
      fields.push(f);
    }
    var out = await loop.run(fields, document);
    var records = (out && out.records) || [];
    function count(name) {
      return records.filter(function (r) { return r && r.result === name; }).length;
    }
    return {
      ok: !(out && out.stopped),
      url: location.href,
      stopped: !!(out && out.stopped),
      filled: count('filled') + count('chosen'),
      skipped: count('skipped'),
      failed: count('failed') + count('not_landed') + count('no_option') + count('no_effect'),
      records: records.map(function (r) {
        return {
          selector: r.selector || '',
          label: r.label || '',
          result: r.result || '',
          failReason: r.failReason || '',
          plannedValue: r.plannedValue != null ? r.plannedValue : '',
          actualValue: r.actualValue != null ? r.actualValue : '',
        };
      }),
    };
  }

  async function pickTaskTab(tabId) {
    if (tabId) {
      try {
        var exact = await chrome.tabs.get(Number(tabId));
        if (exact && exact.id) return exact;
      } catch (e) { /* tab closed */ }
    }
    var irctc = await chrome.tabs.query({ url: '*://*.irctc.co.in/*' });
    if (irctc && irctc.length) return irctc[irctc.length - 1];
    var active = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return (active && active[0]) || null;
  }

  function isAdFrameUrl(url) {
    return /doubleclick|googlesyndication|googleads|adservice|adnxs|adplus|facebook\.com\/tr|hotjar|clarity\.ms/i.test(String(url || ''));
  }

  function mergeReadFrames(results) {
    var fields = [];
    var main = null;
    for (var i = 0; i < (results || []).length; i++) {
      var row = results[i];
      var page = row && row.result;
      if (!page || page.ok === false) continue;
      if (isAdFrameUrl(page.url)) continue;
      if (!main) main = page;
      var list = page.fields || [];
      for (var f = 0; f < list.length; f++) {
        fields.push(Object.assign({}, list[f], { frameId: row.frameId }));
      }
    }
    if (!main) return null;
    return Object.assign({}, main, { fields: fields });
  }

  function pickBestFrameResult(results) {
    var fallback = null;
    for (var i = 0; i < (results || []).length; i++) {
      var page = results[i] && results[i].result;
      if (!page) continue;
      var tagged = Object.assign({}, page, { frameId: results[i].frameId });
      if (page.ok) return tagged;
      if (!fallback || page.error !== 'not_found') fallback = tagged;
    }
    return fallback;
  }

  async function injectKernel(tabId, allFrames) {
    await chrome.scripting.executeScript({
      target: allFrames ? { tabId: tabId, allFrames: true } : { tabId: tabId },
      files: kernelScripts(),
    });
  }

  function isFrameGone(err) {
    return /Frame with ID .* was removed|frame was removed|The tab was closed|No tab with id|moved to a different document|click_script_timeout/i.test(String((err && err.message) || err || ''));
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error(label || 'script_timeout')); }, ms);
      }),
    ]);
  }

  async function tabIfNavigated(tab, beforeUrl) {
    for (var i = 0; i < 6; i++) {
      await waitMs(i === 0 ? 250 : 200);
      var after = tab;
      try { after = await chrome.tabs.get(tab.id); } catch (e) { return null; }
      if (after && after.status === 'loading') continue;
      if (pageUrl(after && after.url || '') && pageUrl(after.url) !== pageUrl(beforeUrl)) {
        return {
          ok: true,
          tabId: tab.id,
          url: pageUrl(after.url),
          title: after.title || '',
          moved: true,
          reason: '',
        };
      }
    }
    return null;
  }

  async function runPageTask(taskId, tabId, func, args) {
    var tab = await pickTaskTab(tabId);
    if (!tab || !tab.id) {
      replyBrowserTask(taskId, { ok: false, error: 'no_tab' });
      return;
    }
    var beforeUrl = tab.url || '';
    try {
      await injectKernel(tab.id, true);
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: func,
        args: args || [],
      });
      var page = func === readFormPage ? mergeReadFrames(results) : pickBestFrameResult(results);
      replyBrowserTask(taskId, Object.assign({ ok: false, tabId: tab.id, url: tab.url || null }, page || { error: 'no_result' }));
    } catch (e) {
      var nav = await tabIfNavigated(tab, beforeUrl);
      if (nav) {
        replyBrowserTask(taskId, nav);
        return;
      }
      replyBrowserTask(taskId, { ok: false, tabId: tab.id, error: (e && e.message) || 'page_task_failed' });
    }
  }

  async function runClickTask(taskId, tabId, spec) {
    var tab = await pickWebTab(tabId);
    if (!tab || !tab.id) {
      replyBrowserTask(taskId, { ok: false, error: 'no_tab' });
      return;
    }
    if (String(tab.url || '').indexOf('http') !== 0) {
      replyBrowserTask(taskId, { ok: false, error: 'open_a_form_page', tabId: tab.id });
      return;
    }
    var beforeUrl = tab.url || '';
    var want = (spec && spec.text) || '';
    try {
      try { await chrome.tabs.update(tab.id, { active: true }); } catch (e0) { /* stay */ }
      await injectKernel(tab.id, false);
      var results = null;
      try {
        results = await withTimeout(chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: clickFromJson,
          args: [spec || {}],
        }), 3500, 'click_script_timeout');
      } catch (e1) {
        var nav = await tabIfNavigated(tab, beforeUrl);
        if (nav) {
          replyBrowserTask(taskId, Object.assign(nav, { clicked: want, label: want }));
          return;
        }
        if (!isFrameGone(e1)) {
          replyBrowserTask(taskId, { ok: false, tabId: tab.id, error: (e1 && e1.message) || 'page_task_failed' });
          return;
        }
      }
      var page = results && results[0] && results[0].result;
      var after = tab;
      try { after = await chrome.tabs.get(tab.id); } catch (e2) { /* keep */ }
      var afterUrl = (after && after.url) || (page && page.url) || beforeUrl;
      var moved = pageUrl(afterUrl) !== pageUrl(beforeUrl);
      if (!moved && page && page.link) {
        var late = await tabIfNavigated(tab, beforeUrl);
        if (late) {
          replyBrowserTask(taskId, {
            ok: true,
            tabId: tab.id,
            url: late.url,
            title: late.title,
            clicked: (page && page.clicked) || want,
            hovered: (page && page.hovered) || null,
            selector: (page && page.selector) || '',
            label: (page && page.label) || want,
            reason: '',
            moved: true,
          });
          return;
        }
        try { after = await chrome.tabs.get(tab.id); } catch (e4) { /* keep */ }
        afterUrl = (after && after.url) || afterUrl;
        moved = pageUrl(afterUrl) !== pageUrl(beforeUrl);
      }
      var ok = !!(page && page.ok) || moved;
      replyBrowserTask(taskId, {
        ok: ok,
        tabId: tab.id,
        url: pageUrl(afterUrl),
        title: (after && after.title) || (page && page.title) || '',
        clicked: (page && page.clicked) || want,
        hovered: (page && page.hovered) || null,
        selector: (page && page.selector) || '',
        label: (page && page.label) || want,
        reason: ok ? '' : ((page && page.reason) || (page && page.error) || 'not_found'),
        moved: moved || !!(page && page.moved),
      });
    } catch (e3) {
      var nav2 = await tabIfNavigated(tab, beforeUrl);
      if (nav2) {
        replyBrowserTask(taskId, Object.assign(nav2, { clicked: want, label: want }));
        return;
      }
      replyBrowserTask(taskId, { ok: false, tabId: tab.id, error: (e3 && e3.message) || 'page_task_failed' });
    }
  }

  async function runFillFormTask(taskId, tabId, fields) {
    var tab = await pickTaskTab(tabId);
    if (!tab || !tab.id) {
      replyBrowserTask(taskId, { ok: false, error: 'no_tab' });
      return;
    }
    try {
      await injectKernel(tab.id, true);
      var groups: any = {};
      for (var i = 0; i < (fields || []).length; i++) {
        var field = fields[i];
        var key = Number.isFinite(Number(field && field.frameId)) ? String(Number(field.frameId)) : 'main';
        if (!groups[key]) groups[key] = [];
        groups[key].push(field);
      }
      var keys = Object.keys(groups);
      var records = [];
      var filled = 0;
      var skipped = 0;
      var failed = 0;
      var stopped = false;
      var url = tab.url || null;
      for (var g = 0; g < keys.length; g++) {
        var key = keys[g];
        var target: any = { tabId: tab.id };
        if (key !== 'main') target.frameIds = [Number(key)];
        var results = await chrome.scripting.executeScript({
          target: target,
          func: fillFormPage,
          args: [groups[key]],
        });
        var page = results && results[0] && results[0].result;
        if (!page) continue;
        url = page.url || url;
        if (page.stopped) stopped = true;
        filled += page.filled || 0;
        skipped += page.skipped || 0;
        failed += page.failed || 0;
        if (Array.isArray(page.records)) records = records.concat(page.records);
      }
      replyBrowserTask(taskId, {
        ok: !stopped,
        tabId: tab.id,
        url: url,
        stopped: stopped,
        filled: filled,
        skipped: skipped,
        failed: failed,
        records: records,
      });
    } catch (e) {
      replyBrowserTask(taskId, { ok: false, tabId: tab.id, error: (e && e.message) || 'page_task_failed' });
    }
  }

  async function clickFromJson(spec) {
    var api = (typeof globalThis !== 'undefined') ? (globalThis as any).CcClickControl : null;
    if (!api || typeof api.list !== 'function' || typeof api.press !== 'function') {
      return { ok: false, error: 'click_control_not_loaded' };
    }
    var entry = spec && spec.control;
    if (!entry || !entry.selector && !(entry && (entry.label || entry.visualLabel))) {
      var want = api.norm ? api.norm(spec && spec.text) : String((spec && spec.text) || '').toLowerCase();
      var buttons = api.list(document) || [];
      entry = null;
      for (var i = 0; i < buttons.length; i++) {
        var live = api.norm ? api.norm(buttons[i].visualLabel || buttons[i].label) : '';
        if (want && live === want) { entry = buttons[i]; break; }
      }
      if (!entry && api.findByText) {
        var found = api.findByText(spec && spec.text, document);
        if (found && found.field) entry = found.field;
      }
    }
    if (!entry) return { ok: false, error: 'not_found', url: location.href };
    var beforeUrl = location.href;
    var beforeTitle = document.title;
    var pressed = api.press(entry, document);
    var navigates = entry && entry.type === 'link';
    var hovered = !!(pressed && pressed.hovered);
    await new Promise(function (r) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        try { window.removeEventListener('pagehide', finish); } catch (e0) { /* stay */ }
        r();
      }
      try { window.addEventListener('pagehide', finish); } catch (e1) { /* stay */ }
      setTimeout(finish, navigates ? 50 : hovered ? 200 : 900);
    });
    var changed = location.href !== beforeUrl || document.title !== beforeTitle;
    // A SPA click is real even when the address and title stay. no_effect was a
    // false miss on DemoQA Submit / Click Me and The Internet Start (#349).
    var didPress = !!(pressed && pressed.pressed);
    return {
      ok: didPress,
      url: location.href,
      clicked: (pressed && pressed.clicked) || '',
      hovered: hovered ? ((pressed && pressed.clicked) || '') : null,
      selector: (pressed && pressed.selector) || entry.selector || '',
      label: entry.visualLabel || entry.label || '',
      reason: didPress ? '' : ((pressed && pressed.reason) || 'not_found'),
      moved: changed,
      link: navigates,
    };
  }

  function loadFillOrchestrator() {
    if (root.CcFillOrchestrator && typeof root.CcFillOrchestrator.runProductFill === 'function') return;
    importScripts('application/orchestrator-bundle.js', 'application/fill-orchestrator.js');
  }

  async function runExtensionFill(profileId, tabId) {
    try { loadFillOrchestrator(); } catch (e) {
      return { ok: false, error: 'fill_orchestrator_missing' };
    }
    var api = root.CcFillOrchestrator;
    if (!api || typeof api.runProductFill !== 'function') return { ok: false, error: 'fill_orchestrator_missing' };
    var stored = await chrome.storage.local.get(['accessToken', 'backendUrl']);
    var id = profileId ? String(profileId) : '';
    if (!id) return { ok: false, error: 'profile_required' };
    if (!stored.accessToken || !stored.backendUrl) return { ok: false, error: 'extension_not_signed_in' };
    var tab = await pickTaskTab(tabId);
    if (!tab || !tab.id) return { ok: false, error: 'no_tab' };
    if (!tab.url || String(tab.url).indexOf('chrome') === 0 || String(tab.url).indexOf('edge') === 0) {
      return { ok: false, error: 'open_a_form_page' };
    }
    var base = String(stored.backendUrl).replace(/\/$/, '');
    var res = await fetch(base + '/profiles/' + encodeURIComponent(id), {
      headers: { Authorization: 'Bearer ' + stored.accessToken },
    });
    if (!res.ok) return { ok: false, error: 'profile_fetch_' + res.status };
    var profile = await res.json();
    var out = await api.runProductFill({
      tabId: tab.id,
      profile: profile,
      backendUrl: stored.backendUrl,
      accessToken: stored.accessToken,
      runtimeVersion: 'mcp',
      executionPreference: 'AUTO',
    });
    var records = (out && out.records) || [];
    return {
      ok: !!(out && out.ok),
      tabId: tab.id,
      url: tab.url || '',
      profileId: id,
      filled: (out && out.filled) || 0,
      failed: (out && out.failed) || 0,
      skipped: (out && out.skipped) || 0,
      error: (out && out.error) || '',
      operatorMessage: (out && out.operatorMessage) || '',
      records: records.slice(0, 40).map(function (r) {
        return {
          selector: (r && r.selector) || '',
          label: (r && r.label) || '',
          result: (r && r.result) || '',
          plannedValue: r && r.plannedValue != null ? String(r.plannedValue).slice(0, 120) : '',
          actualValue: r && r.actualValue != null ? String(r.actualValue).slice(0, 120) : '',
        };
      }),
    };
  }

  function waitMs(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function isCaptureQuota(err) {
    return /MAX_CAPTURE_VISIBLE_TAB|quota/i.test(String((err && err.message) || err || ''));
  }

  async function captureVisibleJpeg(windowId, quality) {
    var last = null;
    for (var i = 0; i < 5; i++) {
      try {
        return await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: quality });
      } catch (e) {
        last = e;
        if (!isCaptureQuota(e)) throw e;
        await waitMs(600 + i * 300);
      }
    }
    var quota = new Error('capture_quota');
    quota.cause = last;
    throw quota;
  }

  function bytesToBase64(bytes) {
    var parts = [];
    var size = 0x8000;
    for (var i = 0; i < bytes.length; i += size) {
      parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + size))));
    }
    return btoa(parts.join(''));
  }

  async function bitmapFromDataUrl(dataUrl) {
    var response = await fetch(dataUrl);
    return createImageBitmap(await response.blob());
  }

  async function jpegBytes(canvas, quality) {
    var blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: quality });
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function encodeBitmap(bmp, sx, sy, sw, sh, maxWidth, quality) {
    var scale = Math.min(1, maxWidth / Math.max(1, sw));
    var dw = Math.max(1, Math.round(sw * scale));
    var dh = Math.max(1, Math.round(sh * scale));
    var canvas = new OffscreenCanvas(dw, dh);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dw, dh);
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, dw, dh);
    var bytes = await jpegBytes(canvas, quality);
    return { base64: bytesToBase64(bytes), width: dw, height: dh };
  }

  async function shrinkShot(make) {
    var first = await make(1280, 0.72);
    if (first.base64.length <= 1200000) return first;
    var second = await make(720, 0.52);
    if (second.base64.length <= 1200000) return second;
    return null;
  }

  function measureForSnapshot(spec) {
    var beforeX = window.scrollX || 0;
    var beforeY = window.scrollY || 0;
    var box = null;
    var selector = spec && spec.selector ? String(spec.selector) : '';
    if (selector) {
      var el = null;
      try {
        var resolver = (typeof globalThis !== 'undefined') ? globalThis.CcResolveCcSelector : null;
        if (resolver && typeof resolver.resolveCcSelector === 'function') el = resolver.resolveCcSelector(selector, document);
      } catch (e) { el = null; }
      if (!el) {
        try {
          var clickApi = (typeof globalThis !== 'undefined') ? globalThis.CcClickControl : null;
          if (clickApi && typeof clickApi.elementFor === 'function') el = clickApi.elementFor(selector, document);
        } catch (e2) { el = null; }
      }
      if (!el) {
        try { el = document.querySelector(selector); } catch (e3) { el = null; }
      }
      if (!el) return { ok: false, error: 'not_found' };
      try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e4) { /* stay */ }
      var rect = el.getBoundingClientRect();
      if (!rect || rect.width < 2 || rect.height < 2) return { ok: false, error: 'empty_area' };
      box = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    } else if (spec && spec.rect) {
      box = {
        x: Number(spec.rect.x) || 0,
        y: Number(spec.rect.y) || 0,
        width: Number(spec.rect.width) || 0,
        height: Number(spec.rect.height) || 0,
      };
      if (box.width < 2 || box.height < 2) return { ok: false, error: 'empty_area' };
    }
    var rootEl = document.documentElement;
    var body = document.body;
    return {
      ok: true,
      url: location.href,
      title: document.title,
      clientWidth: window.innerWidth || 1,
      clientHeight: window.innerHeight || 1,
      scrollHeight: Math.max(rootEl ? rootEl.scrollHeight : 0, body ? body.scrollHeight : 0, window.innerHeight || 0),
      scrollX: beforeX,
      scrollY: beforeY,
      scrolled: (window.scrollX || 0) !== beforeX || (window.scrollY || 0) !== beforeY,
      box: box,
    };
  }

  async function cropVisible(dataUrl, box, clientWidth) {
    var bmp = await bitmapFromDataUrl(dataUrl);
    try {
      var sx = 0;
      var sy = 0;
      var sw = bmp.width;
      var sh = bmp.height;
      var clipped = false;
      if (box) {
        var px = bmp.width / Math.max(1, clientWidth || bmp.width);
        sx = Math.max(0, Math.floor(box.x * px));
        sy = Math.max(0, Math.floor(box.y * px));
        sw = Math.max(1, Math.floor(box.width * px));
        sh = Math.max(1, Math.floor(box.height * px));
        if (box.x < 0 || box.y < 0 || box.x + box.width > (clientWidth || bmp.width)) clipped = true;
        if (sx + sw > bmp.width) { sw = bmp.width - sx; clipped = true; }
        if (sy + sh > bmp.height) { sh = bmp.height - sy; clipped = true; }
        if (sw < 2 || sh < 2) throw new Error('empty_area');
      }
      var encoded = await shrinkShot(function (maxWidth, quality) {
        return encodeBitmap(bmp, sx, sy, sw, sh, maxWidth, quality);
      });
      if (!encoded) throw new Error('snapshot_too_large');
      encoded.clipped = clipped;
      return encoded;
    } finally {
      if (bmp.close) bmp.close();
    }
  }

  async function captureWholePage(tabId, windowId, metrics) {
    var plan = root.CcPageShot.pageShotOffsets(metrics.scrollHeight, metrics.clientHeight, 6);
    var shots = [];
    for (var i = 0; i < plan.offsets.length; i++) {
      var top = plan.offsets[i];
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: function (y) { window.scrollTo(0, y); },
        args: [top],
      });
      await waitMs(i === 0 ? 250 : 650);
      shots.push({
        y: top,
        dataUrl: await captureVisibleJpeg(windowId, 60),
      });
    }
    var bitmaps = [];
    try {
      for (var s = 0; s < shots.length; s++) {
        bitmaps.push({ y: shots[s].y, bmp: await bitmapFromDataUrl(shots[s].dataUrl) });
      }
      var srcW = bitmaps[0].bmp.width;
      var pxPerCss = srcW / Math.max(1, metrics.clientWidth);
      var covered = Math.min(metrics.scrollHeight, bitmaps[bitmaps.length - 1].y + metrics.clientHeight);
      var fitScale = Math.min(1, 1000 / srcW);
      var naturalH = Math.round(covered * pxPerCss * fitScale);
      var outW = Math.max(1, Math.round(srcW * fitScale));
      var outH = naturalH;
      var drawScale = fitScale;
      if (outH > 4200) {
        var fit = 4200 / outH;
        outW = Math.max(1, Math.round(outW * fit));
        outH = 4200;
        drawScale = outW / srcW;
      }
      var canvas = new OffscreenCanvas(outW, outH);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
      for (var d = 0; d < bitmaps.length; d++) {
        ctx.drawImage(bitmaps[d].bmp, 0, Math.round(bitmaps[d].y * pxPerCss * drawScale));
      }
      var bytes = await jpegBytes(canvas, naturalH > 4200 ? 0.45 : 0.62);
      if (bytes.length > 1400000) throw new Error('snapshot_too_large');
      return {
        base64: bytesToBase64(bytes),
        width: outW,
        height: outH,
        clipped: plan.clipped || naturalH > 4200,
      };
    } finally {
      for (var c = 0; c < bitmaps.length; c++) {
        if (bitmaps[c].bmp && bitmaps[c].bmp.close) bitmaps[c].bmp.close();
      }
    }
  }

  async function pickWebTab(tabId) {
    if (tabId) {
      try {
        var exact = await chrome.tabs.get(Number(tabId));
        if (exact && exact.id && String(exact.url || '').indexOf('http') === 0) return exact;
      } catch (e) { /* tab closed */ }
    }
    var all = await chrome.tabs.query({});
    var pages = [];
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].url || '').indexOf('http') === 0) pages.push(all[i]);
    }
    if (!pages.length) return pickTaskTab(tabId);
    pages.sort(function (a, b) { return (b.lastAccessed || 0) - (a.lastAccessed || 0); });
    return pages[0];
  }

  async function runSnapshot(spec) {
    var tab = await pickWebTab(spec && spec.tabId);
    if (!tab || !tab.id) return { ok: false, error: 'no_tab' };
    var url = String(tab.url || '');
    if (url.indexOf('http') !== 0) return { ok: false, error: 'open_a_form_page', tabId: tab.id, url: url };
    var scope = spec && spec.scope === 'page' ? 'page' : 'viewport';
    if ((spec && spec.selector) || (spec && spec.rect)) scope = 'area';
    var metrics = null;
    try {
      if (spec && spec.selector) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: kernelScripts() });
      }
      var measured = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: measureForSnapshot,
        args: [{ selector: (spec && spec.selector) || '', rect: (spec && spec.rect) || null }],
      });
      metrics = measured && measured[0] && measured[0].result;
    } catch (e) {
      return { ok: false, error: 'page_not_readable', tabId: tab.id };
    }
    if (!metrics || metrics.ok === false) {
      return { ok: false, error: (metrics && metrics.error) || 'page_not_readable', tabId: tab.id, url: url };
    }
    try {
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId) {
        try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (eFocus) { /* window stays behind */ }
      }
    } catch (e2) {
      return { ok: false, error: 'tab_not_active', tabId: tab.id };
    }
    var shown = false;
    for (var attempt = 0; attempt < 8; attempt++) {
      await waitMs(120);
      try {
        var now = await chrome.tabs.get(tab.id);
        if (now && now.active) { shown = true; break; }
      } catch (eWait) { /* tab closed while switching */ }
    }
    if (!shown) return { ok: false, error: 'tab_not_active', tabId: tab.id, url: url };
    if (metrics.scrolled) await waitMs(200);
    var shot = null;
    try {
      if (scope === 'page') {
        shot = await captureWholePage(tab.id, tab.windowId, metrics);
      } else {
        var dataUrl = await captureVisibleJpeg(tab.windowId, 72);
        shot = await cropVisible(dataUrl, scope === 'area' ? metrics.box : null, metrics.clientWidth);
      }
    } catch (e3) {
      var message = (e3 && e3.message) || 'capture_failed';
      if (isCaptureQuota(e3) || message === 'capture_quota') message = 'capture_quota';
      return { ok: false, error: String(message).slice(0, 180), tabId: tab.id, url: metrics.url || url };
    } finally {
      if (scope === 'page' || metrics.scrolled) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: function (x, y) { window.scrollTo(x, y); },
            args: [metrics.scrollX || 0, metrics.scrollY || 0],
          });
        } catch (e4) { /* leave the page where it is */ }
      }
    }
    var cssW = metrics.clientWidth || 1;
    var cssH = metrics.clientHeight || 1;
    if (scope === 'area' && metrics.box) {
      cssW = metrics.box.width || cssW;
      cssH = metrics.box.height || cssH;
    } else if (scope === 'page') {
      cssH = Math.min(metrics.scrollHeight || cssH, (metrics.clientHeight || 1) * 6);
    }
    var imgW = shot.width || 1;
    var imgH = shot.height || 1;
    return {
      ok: true,
      tabId: tab.id,
      url: metrics.url || url,
      title: metrics.title || '',
      scope: scope,
      width: shot.width,
      height: shot.height,
      cssWidth: Math.round(cssW),
      cssHeight: Math.round(cssH),
      scaleX: cssW / imgW,
      scaleY: cssH / imgH,
      clickSpace: 'css',
      mimeType: 'image/jpeg',
      clipped: !!shot.clipped,
      image: shot.base64,
    };
  }

  function pageUrl(raw) {
    var value = String(raw || '');
    if (!value) return '';
    try {
      var parsed = new URL(value);
      return (parsed.origin + parsed.pathname).slice(0, 300);
    } catch (e) {
      return value.split('?')[0].slice(0, 300);
    }
  }

  function slimTab(tab) {
    return {
      tabId: tab.id,
      windowId: tab.windowId,
      title: String(tab.title || '').slice(0, 120),
      url: pageUrl(tab.url || tab.pendingUrl || ''),
      active: !!tab.active,
    };
  }

  async function runListTabs() {
    var all = await chrome.tabs.query({});
    var tabs = [];
    for (var i = 0; i < all.length && tabs.length < 40; i++) tabs.push(slimTab(all[i]));
    tabs.sort(function (a, b) { return (b.active ? 1 : 0) - (a.active ? 1 : 0); });
    return { ok: true, tabs: tabs };
  }

  async function runFocusTab(tabId) {
    if (!tabId) return { ok: false, error: 'tabId required' };
    var tab = null;
    try { tab = await chrome.tabs.get(Number(tabId)); } catch (e) { return { ok: false, error: 'no_tab' }; }
    if (!tab || !tab.id) return { ok: false, error: 'no_tab' };
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId) {
      try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (e2) { /* stay behind */ }
    }
    var shown = slimTab(tab);
    shown.active = true;
    return { ok: true, tabId: tab.id, title: shown.title, url: shown.url, active: true };
  }

  async function runCloseTab(tabId) {
    if (!tabId) return { ok: false, error: 'tabId required' };
    var id = Number(tabId);
    try { await chrome.tabs.get(id); } catch (e) { return { ok: false, error: 'no_tab' }; }
    try {
      await chrome.tabs.remove(id);
    } catch (e2) {
      return { ok: false, error: (e2 && e2.message) || 'close_failed', tabId: id };
    }
    return { ok: true, closed: true, tabId: id };
  }

  async function runScroll(spec) {
    var tab = await pickWebTab(spec && spec.tabId);
    if (!tab || !tab.id) return { ok: false, error: 'no_tab' };
    if (String(tab.url || '').indexOf('http') !== 0) return { ok: false, error: 'open_a_form_page', tabId: tab.id };
    var fn = root.CcScrollPage && root.CcScrollPage.scrollPage;
    if (typeof fn !== 'function') return { ok: false, error: 'scroll_not_loaded' };
    if (spec && spec.selector) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: kernelScripts() });
      } catch (e) { /* selector falls back to querySelector */ }
    }
    try { await chrome.tabs.update(tab.id, { active: true }); } catch (e0) { /* stay */ }
    try {
      var scrollMs = spec && spec.to === 'bottom' ? 20000 : 8000;
      var results = await withTimeout(chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fn,
        args: [{
          dy: spec && spec.dy || 0,
          dx: spec && spec.dx || 0,
          to: spec && spec.to || '',
          selector: spec && spec.selector || '',
        }],
        injectImmediately: true,
      }), scrollMs, 'scroll_script_timeout');
      var page = results && results[0] && results[0].result;
      return Object.assign({ tabId: tab.id }, page || { ok: false, error: 'no_result' });
    } catch (e2) {
      return { ok: false, error: (e2 && e2.message) || 'page_not_readable', tabId: tab.id };
    }
  }

  function historyStep(action) {
    if (action === 'back') history.back();
    else if (action === 'forward') history.forward();
    else location.reload();
    return location.href;
  }

  async function runHistory(spec) {
    var action = spec && spec.action;
    if (action !== 'back' && action !== 'forward' && action !== 'reload') return { ok: false, error: 'action required' };
    var tab = await pickWebTab(spec && spec.tabId);
    if (!tab || !tab.id) return { ok: false, error: 'no_tab' };
    if (String(tab.url || '').indexOf('http') !== 0) return { ok: false, error: 'open_a_form_page', tabId: tab.id };
    var before = pageUrl(tab.url);
    try {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: historyStep,
        args: [action],
      });
    } catch (e) {
      return { ok: false, error: 'page_not_readable', tabId: tab.id, action: action };
    }
    await waitMs(700);
    var after = tab;
    try { after = await chrome.tabs.get(tab.id); } catch (e2) { /* keep the old tab */ }
    return {
      ok: true,
      tabId: tab.id,
      action: action,
      url: pageUrl(after && after.url || ''),
      title: (after && after.title) || '',
      moved: pageUrl(after && after.url || '') !== before,
    };
  }

  async function runPointerTask(spec, fn) {
    var tab = await pickWebTab(spec && spec.tabId);
    if (!tab || !tab.id) return { ok: false, error: 'no_tab' };
    if (String(tab.url || '').indexOf('http') !== 0) return { ok: false, error: 'open_a_form_page', tabId: tab.id };
    if (typeof fn !== 'function') return { ok: false, error: 'pointer_not_loaded' };
    var beforeUrl = tab.url || '';
    try { await chrome.tabs.update(tab.id, { active: true }); } catch (e) { /* stay */ }
    if (spec && spec.selector) {
      try {
        await injectKernel(tab.id, true);
      } catch (e2) { /* selector falls back to querySelector */ }
    }
    try {
      var target: any = { tabId: tab.id };
      if (Number.isFinite(Number(spec && spec.frameId))) target.frameIds = [Number(spec.frameId)];
      var results = await withTimeout(chrome.scripting.executeScript({
        target: target,
        func: fn,
        args: [spec || {}],
        injectImmediately: true,
        world: spec && spec.action === 'drag' ? 'MAIN' : 'ISOLATED',
      }), 8000, 'pointer_script_timeout');
      var page = results && results[0] && results[0].result;
      if ((!page || page.error === 'not_found') && spec && spec.selector && !target.frameIds) {
        results = await withTimeout(chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: fn,
          args: [spec || {}],
          injectImmediately: true,
        }), 8000, 'pointer_script_timeout');
        page = pickBestFrameResult(results);
      }
      await waitMs(400);
      var after = tab;
      try { after = await chrome.tabs.get(tab.id); } catch (e3) { /* keep */ }
      return Object.assign({ tabId: tab.id }, page || { ok: false, error: 'no_result' }, { url: pageUrl(after && after.url || (page && page.url) || '') });
    } catch (e4) {
      var nav = await tabIfNavigated(tab, beforeUrl);
      if (nav) return Object.assign({ clicked: spec && spec.selector || '' }, nav);
      return { ok: false, error: isFrameGone(e4) ? (e4 && e4.message) : 'page_not_readable', tabId: tab.id };
    }
  }

  function runMouseClick(spec) {
    var api = root.CcPagePointer;
    return runPointerTask({
      tabId: spec && spec.tabId || null,
      x: spec && spec.x,
      y: spec && spec.y,
      x2: spec && spec.x2,
      y2: spec && spec.y2,
      selector: spec && spec.selector || '',
      toSelector: spec && spec.toSelector || '',
      frameId: spec && spec.frameId,
      button: spec && spec.button || 'left',
      count: spec && spec.count || 1,
      action: spec && spec.action || 'click',
    }, api && api.clickAt);
  }

  function runHover(spec) {
    return runMouseClick(Object.assign({}, spec, { action: 'hover' }));
  }

  function runDrag(spec) {
    return runMouseClick(Object.assign({}, spec, { action: 'drag' }));
  }

  function runKeyboard(spec) {
    var api = root.CcPagePointer;
    return runPointerTask({
      tabId: spec && spec.tabId || null,
      selector: spec && spec.selector || '',
      frameId: spec && spec.frameId,
      text: spec && spec.text || '',
      key: spec && spec.key || '',
      keys: Array.isArray(spec && spec.keys) ? spec.keys : [],
      ctrl: !!(spec && spec.ctrl),
      alt: !!(spec && spec.alt),
      shift: !!(spec && spec.shift),
      meta: !!(spec && spec.meta),
    }, api && api.pressKeys);
  }

  function runBrowserTask(msg) {
    if (!msg || !msg.task) {
      replyBrowserTask(msg && msg.taskId, { ok: false, error: 'unknown task' });
      return;
    }
    if (msg.task === 'click') {
      runClickTask(msg.taskId, msg.tabId, { text: msg.text || '', control: msg.control || null });
      return;
    }
    if (msg.task === 'read_form') {
      runPageTask(msg.taskId, msg.tabId, readFormPage, []);
      return;
    }
    if (msg.task === 'fill_form') {
      runFillFormTask(msg.taskId, msg.tabId, Array.isArray(msg.fields) ? msg.fields : []);
      return;
    }
    if (msg.task === 'fill') {
      runExtensionFill(msg.profileId, msg.tabId).then(function (result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function (err) {
        replyBrowserTask(msg.taskId, { ok: false, error: (err && err.message) || 'fill_failed' });
      });
      return;
    }
    if (msg.task === 'snapshot') {
      runSnapshot(msg).then(function (result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function (err) {
        replyBrowserTask(msg.taskId, { ok: false, error: (err && err.message) || 'snapshot_failed' });
      });
      return;
    }
    if (msg.task === 'list_tabs') {
      runListTabs().then(function (result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function (err) {
        replyBrowserTask(msg.taskId, { ok: false, error: (err && err.message) || 'list_tabs_failed' });
      });
      return;
    }
    if (msg.task === 'close_tab') {
      runCloseTab(msg.tabId).then(function (result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function (err) {
        replyBrowserTask(msg.taskId, { ok: false, error: (err && err.message) || 'close_failed' });
      });
      return;
    }
    if (msg.task === 'focus_tab') {
      runFocusTab(msg.tabId).then(function (result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function (err) {
        replyBrowserTask(msg.taskId, { ok: false, error: (err && err.message) || 'focus_failed' });
      });
      return;
    }
    if (msg.task === 'scroll') {
      runScroll(msg).then(function (result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function (err) {
        replyBrowserTask(msg.taskId, { ok: false, error: (err && err.message) || 'scroll_failed' });
      });
      return;
    }
    if (msg.task === 'history') {
      runHistory(msg).then(function (result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function (err) {
        replyBrowserTask(msg.taskId, { ok: false, error: (err && err.message) || 'history_failed' });
      });
      return;
    }
    if (msg.task === 'mouse_click') {
      runMouseClick(msg).then(function (result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function (err) {
        replyBrowserTask(msg.taskId, { ok: false, error: (err && err.message) || 'mouse_click_failed' });
      });
      return;
    }
    if (msg.task === 'hover') {
      runHover(msg).then(function (result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function (err) {
        replyBrowserTask(msg.taskId, { ok: false, error: (err && err.message) || 'hover_failed' });
      });
      return;
    }
    if (msg.task === 'drag') {
      runDrag(msg).then(function (result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function (err) {
        replyBrowserTask(msg.taskId, { ok: false, error: (err && err.message) || 'drag_failed' });
      });
      return;
    }
    if (msg.task === 'keyboard') {
      runKeyboard(msg).then(function (result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function (err) {
        replyBrowserTask(msg.taskId, { ok: false, error: (err && err.message) || 'keyboard_failed' });
      });
      return;
    }
    if (msg.task !== 'open_url') {
      replyBrowserTask(msg.taskId, { ok: false, error: 'unknown task' });
      return;
    }
    var url = msg.url;
    try {
      var parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        replyBrowserTask(msg.taskId, { ok: false, error: 'url must be http or https' });
        return;
      }
    } catch (e) {
      replyBrowserTask(msg.taskId, { ok: false, error: 'bad url' });
      return;
    }
    var reuse = !!(msg.tabId || msg.newTab === false);
    if (reuse) {
      runOpenInTab(msg.taskId, url, msg.tabId).catch(function (err) {
        replyBrowserTask(msg.taskId, { ok: false, error: (err && err.message) || 'navigate_failed' });
      });
      return;
    }
    chrome.tabs.create({ url: url, active: true }, function (tab) {
      if (chrome.runtime.lastError || !tab) {
        replyBrowserTask(msg.taskId, { ok: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'failed to open tab' });
        return;
      }
      replyBrowserTask(msg.taskId, { ok: true, tabId: tab.id, url: tab.pendingUrl || tab.url || url, navigated: false });
    });
  }

  async function runOpenInTab(taskId, url, tabId) {
    var tab = await pickWebTab(tabId);
    if (tab && tab.id) {
      try {
        var updated = await chrome.tabs.update(tab.id, { url: url, active: true });
        replyBrowserTask(taskId, {
          ok: true,
          tabId: tab.id,
          url: (updated && (updated.pendingUrl || updated.url)) || url,
          navigated: true,
        });
        return;
      } catch (e) { /* fall through and open a new tab */ }
    }
    chrome.tabs.create({ url: url, active: true }, function (created) {
      if (chrome.runtime.lastError || !created) {
        replyBrowserTask(taskId, { ok: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'failed to open tab' });
        return;
      }
      replyBrowserTask(taskId, { ok: true, tabId: created.id, url: created.pendingUrl || created.url || url, navigated: false });
    });
  }

  function ensureClient(wsUrl, token) {
    const WsClient = root.CcWsClient;
    const ReconnectManager = root.CcReconnectManager;
    if (!WsClient) {
      publishState({ state: 'error', lastError: 'CcWsClient not loaded' });
      return null;
    }

    if (_client && _lastToken === token && _lastUrl === wsUrl) {
      if (_client.state === 'disconnected' || _client.state === 'suspended') {
        _client.connect();
      }
      return _client;
    }

    if (_client) {
      try { _client.disconnect(); } catch { /* ignore */ }
      _client = null;
    }

    _lastToken = token;
    _lastUrl = wsUrl;

    _reconnect = new ReconnectManager({
      baseDelayMs: 400,
      maxDelayMs: 8000,
      multiplier: 1.6,
      jitter: 0.2,
      onAttempt: (attempt, delayMs) => {
        publishState({
          state: 'reconnecting',
          sessionId: null,
          lastError: `reconnect #${attempt} in ${delayMs}ms`,
        });
      },
    });

    _client = new WsClient({
      url: wsUrl,
      token,
      reconnectManager: _reconnect,
      onStateChange: (state) => {
        publishState({
          state,
          sessionId: _client.sessionId || null,
          lastError: state === 'connected' ? null : undefined,
        });
        if (state === 'connected') {
          try { _client.startHeartbeat(15000); } catch { /* ignore */ }
          // Let background flush fill_debug outbox that queued while offline
          try {
            if (typeof root.__ccOnWssConnected === 'function') root.__ccOnWssConnected();
          } catch { /* ignore */ }
        }
      },
      onError: (err) => {
        publishState({
          state: _client ? _client.state : 'suspended',
          sessionId: null,
          lastError: (err && err.message) || String(err),
        });
      },
      onMessage: (msg) => {
        if (msg && msg.type === 'browser_task') {
          runBrowserTask(msg);
          return;
        }
        if (msg && msg.type === 'error') {
          publishState({
            state: _client ? _client.state : 'suspended',
            lastError: msg.message || msg.code || 'server error',
          });
        }
      },
    });

    publishState({ state: 'connecting', sessionId: null, lastError: null });
    _client.connect();
    return _client;
  }

  /**
   * Ensure WSS is up for current chrome.storage credentials.
   */
  async function ensureWssFromStorage() {
    const data = await chrome.storage.local.get(['accessToken', 'backendUrl']);
    if (!data.accessToken || !data.backendUrl) {
      disconnectWss('no credentials');
      return { ok: false, error: 'no_credentials' };
    }
    const wsUrl = deriveWsUrl(data.backendUrl);
    if (!wsUrl) {
      publishState({ state: 'error', lastError: 'bad backendUrl' });
      return { ok: false, error: 'bad_backend_url' };
    }
    const client = ensureClient(wsUrl, data.accessToken);
    return { ok: !!client, url: wsUrl, state: client ? client.state : 'error' };
  }

  function disconnectWss(reason) {
    if (_client) {
      try { _client.disconnect(); } catch { /* ignore */ }
      _client = null;
    }
    _lastToken = null;
    publishState({ state: 'disconnected', sessionId: null, lastError: reason || null });
  }

  function getClient() {
    return _client;
  }

  async function getState() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] || { state: 'disconnected' };
  }

  /** Send fill debug event if connected. Returns message id or null. */
  function sendFillDebug(event, payload) {
    if (!_client || _client.state !== 'connected') return null;
    try {
      const raw = payload || {};
      // Avoid clobbering envelope fields (type/id/v/event) on the wire frame
      const {
        event: _ev,
        type: _ty,
        id: _id,
        v: _v,
        seq: _seq,
        ...rest
      } = raw;
      return _client.sendFillDebugEvent(event, rest);
    } catch (e) {
      console.warn('[CC][wss] fill_debug send failed:', e.message);
      publishState({
        state: 'suspended',
        sessionId: null,
        lastError: e.message || 'send failed',
      });
      try {
        if (_client && typeof _client.connect === 'function') _client.connect();
      } catch { /* ignore */ }
      return null;
    }
  }

  /** Stage C — request sequential fill mapping over WSS. */
  async function requestFillPlan(payload, timeoutMs) {
    await ensureWssFromStorage();
    if (!_client || _client.state !== 'connected') {
      throw new Error('wss_not_connected');
    }
    return _client.request('fill_request', payload || {}, timeoutMs || 20000);
  }

  /** Stage C — persist fill session over WSS. */
  async function postFillSession(payload, timeoutMs) {
    await ensureWssFromStorage();
    if (!_client || _client.state !== 'connected') {
      throw new Error('wss_not_connected');
    }
    return _client.request('fill_session', payload || {}, timeoutMs || 15000);
  }

  /** List profiles over WSS (UI). */
  async function requestProfilesList(timeoutMs) {
    await ensureWssFromStorage();
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (_client && _client.state === 'connected') break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!_client || _client.state !== 'connected') {
      throw new Error('wss_not_connected');
    }
    return _client.request('profiles_list', {}, timeoutMs || 15000);
  }

  root.CcWssSession = {
    STORAGE_KEY,
    deriveWsUrl,
    ensureWssFromStorage,
    disconnectWss,
    getClient,
    getState,
    sendFillDebug,
    requestFillPlan,
    postFillSession,
    requestProfilesList,
    isConnected: () => !(!_client || _client.state !== 'connected'),
    publishState,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
