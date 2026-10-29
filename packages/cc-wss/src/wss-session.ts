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
    return {
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
  }

  async function fillFormPage(incoming) {
    if (typeof fillFormFieldsSequential !== 'function') return { ok: false, error: 'executor_not_loaded' };
    var mapping = {};
    var fbs = {};
    var list = Array.isArray(incoming) ? incoming : [];
    var skip = /captcha|otp|password|cvv|card number|\bpin\b/i;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f || !f.selector || f.value == null || String(f.value) === '') continue;
      var label = f.visualLabel || f.label || '';
      if (skip.test(label) || skip.test(f.selector)) continue;
      if (/^(button|submit|reset|image|file)$/i.test(f.type || '')) continue;
      mapping[f.selector] = { value: String(f.value), type: f.type || 'text', label: label, visualLabel: label };
      fbs[f.selector] = { label: label, visualLabel: label, source: 'operator' };
    }
    await fillFormFieldsSequential(mapping, fbs, {}, list);
    var records = [];
    try {
      var raw = document.body && document.body.getAttribute('data-cc-records');
      if (raw) records = JSON.parse(raw);
    } catch (e) { /* records stay empty */ }
    if (!records.length && Array.isArray((window as any).__ccFillRecords)) records = (window as any).__ccFillRecords;
    function count(name) {
      return records.filter(function (r) { return r && r.result === name; }).length;
    }
    return {
      ok: true,
      url: location.href,
      filled: count('filled'),
      skipped: count('skipped') + count('waiting_human'),
      failed: count('failed') + count('error'),
      records: records.map(function (r) {
        return {
          selector: r.selector || '',
          label: r.label || '',
          result: r.result || '',
          failReason: r.failReason || '',
          plannedValue: r.plannedValue != null ? r.plannedValue : r.value,
          actualValue: r.actualValue != null ? r.actualValue : (r.actual != null ? r.actual : ''),
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

  async function runPageTask(taskId, tabId, func, args) {
    var tab = await pickTaskTab(tabId);
    if (!tab || !tab.id) {
      replyBrowserTask(taskId, { ok: false, error: 'no_tab' });
      return;
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: kernelScripts() });
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: func,
        args: args || [],
      });
      var page = results && results[0] && results[0].result;
      replyBrowserTask(taskId, Object.assign({ ok: false, tabId: tab.id, url: tab.url || null }, page || { error: 'no_result' }));
    } catch (e) {
      replyBrowserTask(taskId, { ok: false, tabId: tab.id, error: (e && e.message) || 'page_task_failed' });
    }
  }

  async function clickByText(spec) {
    var want = String((spec && spec.text) || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!want) return { ok: false, error: 'text required' };
    var extra = want === 'search trains' ? ['search'] : [];
    var wants = [want].concat(extra);
    var nodes = document.querySelectorAll('button, a, input[type="submit"], input[type="button"], [role="button"], .search_btn');
    var partial = null;
    var partialLabel = '';
    for (var n = 0; n < wants.length; n++) {
      var needle = wants[n];
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var label = (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
        var norm = label.toLowerCase();
        if (!norm) continue;
        if (norm === needle) {
          el.click();
          await new Promise(function (r) { setTimeout(r, 800); });
          return { ok: true, url: location.href, clicked: label.slice(0, 80) };
        }
        if (!partial && norm.indexOf(needle) !== -1) {
          partial = el;
          partialLabel = label;
        }
      }
      if (partial) break;
    }
    if (!partial) return { ok: false, error: 'not_found', url: location.href };
    partial.click();
    await new Promise(function (r) { setTimeout(r, 800); });
    return { ok: true, url: location.href, clicked: partialLabel.slice(0, 80) };
  }

  async function runClick(taskId, tabId, text) {
    var tab = await pickTaskTab(tabId);
    if (!tab || !tab.id) {
      replyBrowserTask(taskId, { ok: false, error: 'no_tab' });
      return;
    }
    try {
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: clickByText,
        args: [{ text: text }],
      });
      var page = results && results[0] && results[0].result;
      replyBrowserTask(taskId, Object.assign({ ok: false, tabId: tab.id, url: tab.url || null }, page || { error: 'no_result' }));
    } catch (e) {
      replyBrowserTask(taskId, { ok: false, tabId: tab.id, error: (e && e.message) || 'click_failed' });
    }
  }

  function runBrowserTask(msg) {
    if (!msg || !msg.task) {
      replyBrowserTask(msg && msg.taskId, { ok: false, error: 'unknown task' });
      return;
    }
    if (msg.task === 'click') {
      runClick(msg.taskId, msg.tabId, msg.text || '');
      return;
    }
    if (msg.task === 'read_form') {
      runPageTask(msg.taskId, msg.tabId, readFormPage, []);
      return;
    }
    if (msg.task === 'fill_form') {
      runPageTask(msg.taskId, msg.tabId, fillFormPage, [Array.isArray(msg.fields) ? msg.fields : []]);
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
    chrome.tabs.create({ url: url, active: true }, function (tab) {
      if (chrome.runtime.lastError || !tab) {
        replyBrowserTask(msg.taskId, { ok: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'failed to open tab' });
        return;
      }
      replyBrowserTask(msg.taskId, { ok: true, tabId: tab.id, url: tab.pendingUrl || tab.url || url });
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
