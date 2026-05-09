console.log("[CC] background.js loaded v3.86");
// Background service worker — owns teach session, survives popup close

// Wake on storage change — more reliable than sendMessage for waking SW
let _teachRunning = false;
let _lastTeachTs = 0;
// Alarm-based wake — most reliable way to wake sleeping SW in MV3
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'cc_teach_wake') return;
  const data = await chrome.storage.local.get('_cc_teach_job');
  const job = data._cc_teach_job;
  if (!job) return;
  if (job.ts === _lastTeachTs || _teachRunning) return;
  _lastTeachTs = job.ts;
  chrome.storage.local.remove('_cc_teach_job');
  console.log('[CC] alarm woke SW for teach:', job.hostname);
  runTeachSession(job).catch(console.error);
});

// Also wake via message (more reliable than storage for sleeping SW)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TEACH_JOB') {
    const job = msg.job;
    // Use sender tab ID if job tabId is missing/invalid
    if (sender?.tab?.id && (!job.tabId || job.tabId === 0)) job.tabId = sender.tab.id;
    if (job.ts === _lastTeachTs || _teachRunning) { sendResponse({ ok: false }); return; }
    _lastTeachTs = job.ts;
    sendResponse({ ok: true });
    runTeachSession(job).catch(console.error);
  }
  if (msg.type === 'GET_TAB_ID') {
    sendResponse({ tabId: sender?.tab?.id });
  }
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!changes._cc_teach_job?.newValue) return;
  const job = changes._cc_teach_job.newValue;
  // Deduplicate: same timestamp = same job, ignore
  if (job.ts === _lastTeachTs) return;
  if (_teachRunning) return;
  _lastTeachTs = job.ts;
  console.log('[CC] SW teach job received:', job.hostname, job.fields?.length, 'fields, tabId:', job.tabId);
  chrome.storage.local.set({_cc_teach_debug: 'received:' + job.hostname + ':' + job.fields?.length + ':tab:' + job.tabId});
  // If tabId is missing, find the tab by hostname (resolved inside runTeachSession which is async)
  chrome.storage.local.remove('_cc_teach_job');
  runTeachSession(job).catch(console.error);
});

// Keep service worker alive during long teach sessions (SW dies after 30s idle)
let _keepaliveInterval = null;
function startKeepalive() {
  if (_keepaliveInterval) return;
  _keepaliveInterval = setInterval(() => chrome.storage.local.set({ _sw_ping: Date.now() }), 20000);
}
function stopKeepalive() {
  clearInterval(_keepaliveInterval);
  _keepaliveInterval = null;
}

async function runTeachSession({ tabId, fields, backendUrl, hostname, groqKey }) {
  _teachRunning = true;
  startKeepalive();
  // Resolve tabId if missing
  if (!tabId || tabId === 0) {
    try {
      const foundTabs = await chrome.tabs.query({url: '*://' + hostname + '/*'});
      if (foundTabs.length > 0) { tabId = foundTabs[0].id; console.log('[CC] resolved tabId from hostname:', tabId); }
    } catch(e) { console.warn('[CC] tab query failed:', e.message); }
  }
  if (!tabId) { console.error('[CC] no tabId, aborting teach'); _teachRunning = false; stopKeepalive(); return; }
  // Native <select> and radio are handled by executor directly — only teach custom dropdowns
  const TEACHABLE_TYPES = ['ng-dropdown', 'mat-select', 'mat-radio'];
  const teachable = fields.filter(f => TEACHABLE_TYPES.includes(f.type));

  if (teachable.length === 0) {
    notifyPopup({ type: 'TEACH_PROGRESS', status: 'No interactive fields need teaching.', done: true });
    return;
  }

  for (const field of teachable) {
    const label = normalizeFieldLabel(field.label);
    notifyPopup({ type: 'TEACH_PROGRESS', status: `⚠ Teach: "${label}" — click the dropdown, then select a value`, done: false });

    // Clear any stale result before injecting
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => { sessionStorage.removeItem('_cc_teach_result'); sessionStorage.removeItem('_cc_teach_active'); },
    }).catch(() => {});

    // AI-assisted: if no known adapter, ask Groq to identify the dropdown component
    let fieldWithHint = { ...field };
    if (groqKey && !field.componentClass) {
      try {
        const domSnap = await chrome.scripting.executeScript({
          target: { tabId },
          func: (lbl) => {
            // Collect outer HTML of elements that look like custom dropdowns near the label
            const snippets = [];
            document.querySelectorAll('div,span,ul,ng-select,app-dropdown,[class*=select],[class*=dropdown],[class*=picker]').forEach(el => {
              if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
              const text = el.textContent.slice(0, 100);
              if (text.toLowerCase().includes(lbl.toLowerCase().slice(0, 10))) {
                snippets.push(el.outerHTML.slice(0, 300));
              }
            });
            return snippets.slice(0, 5).join('\n---\n');
          },
          args: [field.label],
        }).catch(() => [{ result: '' }]);
        const domText = domSnap?.[0]?.result || '';
        if (domText) {
          const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + groqKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'meta-llama/llama-4-scout-17b-16e-instruct',
              messages: [{ role: 'user', content: 'Identify the dropdown component class and trigger selector from these HTML snippets near field "' + field.label + '". Reply ONLY as JSON: {"componentClass":"...","triggerSelector":"..."}. Snippets: ' + domText }],
              max_tokens: 80,
            }),
          }).then(r => r.json()).catch(() => null);
          const txt = aiRes?.choices?.[0]?.message?.content || '';
          const m = txt.match(/\{[^}]+\}/);
          if (m) {
            try {
              const hint = JSON.parse(m[0]);
              if (hint.componentClass) fieldWithHint = { ...field, componentClass: hint.componentClass, aiTrigger: hint.triggerSelector };
              console.log('[CC] AI hint:', JSON.stringify(hint));
            } catch {}
          }
        }
      } catch (e) { console.warn('[CC] AI identify failed:', e.message); }
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      func: teachOneField,
      args: [fieldWithHint],
    }).catch(e => {
      console.error('[CC] teachOneField inject failed:', e.message);
      chrome.storage.local.set({_cc_teach_debug: 'inject failed: '+e.message});
      notifyPopup({ type: 'TEACH_PROGRESS', status: 'Error: '+e.message, done: true });
    });

    // Poll sessionStorage for result (up to 45s) — background stays alive
    const adapter = await pollTeachResult(tabId, 45000);
    console.log('[CC] pollTeachResult returned:', JSON.stringify(adapter));

    if (!adapter) {
      notifyPopup({ type: 'TEACH_PROGRESS', status: `⚠ Skipped "${label}" (timeout)`, done: false });
      continue;
    }
    if (adapter.error) {
      notifyPopup({ type: 'TEACH_PROGRESS', status: `⚠ "${label}": ${adapter.error}`, done: false });
      continue;
    }

    const saveUrl = `${backendUrl}/adapters/${hostname}`;
    console.log('[CC] saving adapter to:', saveUrl, 'adapter:', JSON.stringify(adapter).slice(0,200));
    const saveRes = await fetch(saveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adapter),
    }).catch(e => { console.error('[CC] fetch failed:', e.message); return { ok: false, _err: e.message }; });
    console.log('[CC] save response:', saveRes?.ok, saveRes?.status);

    if (saveRes?.ok) {
      notifyPopup({ type: 'TEACH_PROGRESS', status: `✓ Learned "${label}"`, done: false });
    } else {
      const errText = await saveRes?.text?.().catch(() => 'network error') ?? 'network error';
      notifyPopup({ type: 'TEACH_PROGRESS', status: `⚠ Save failed for "${label}": ${errText}`, done: false });
    }

    await sleep(600);
  }

  stopKeepalive();
  _teachRunning = false;
  notifyPopup({ type: 'TEACH_PROGRESS', status: 'Teaching complete! Adapters saved.', done: true });
}

// ── teachOneField — runs in PAGE context (injected via executeScript func:) ──
function teachOneField(field) {
  // Only one teach session at a time on the page
  if (sessionStorage.getItem('_cc_teach_active') === '1') return;
  sessionStorage.removeItem('_cc_teach_result');
  sessionStorage.setItem('_cc_teach_active', '1');

  let root = null;
  const compClass = field.componentClass || 'ng-dropdown';
  // Use domIndex if available (precise, handles duplicate labels)
  if (typeof field.domIndex === 'number') {
    root = document.querySelectorAll(`div.${compClass}`)[field.domIndex] || null;
    // Fallback: try generic dropdown selectors at same index
    if (!root) {
      const allDropdowns = Array.from(document.querySelectorAll(
        `div.${compClass},[class*=dropdown],[class*=select],[class*=picker]`
      )).filter(el => el.tagName !== 'SELECT' && el.tagName !== 'INPUT');
      root = allDropdowns[field.domIndex] || null;
    }
  }
  if (!root && field.selector && !field.selector.startsWith('form-field-')) {
    root = document.querySelector(field.selector);
  }
  if (!root) {
    const baseLabel = field.label.replace(/\s*\(\d+\)$/, '').replace(/[\n*]/g,'').trim().slice(0,15);
    document.querySelectorAll(`div.${compClass}, mat-select, [role=combobox]`).forEach(el => {
      const lbl = el.querySelector('.label, mat-label, label')?.textContent?.trim() || el.getAttribute('aria-label') || '';
      if (lbl && baseLabel && lbl.includes(baseLabel)) root = el;
    });
  }

  // Click-to-identify mode: root still null — ask user to click the component
  if (!root) {
    const _host = document.createElement('div');
    _host.style.cssText = 'position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);pointer-events:none;background:#7c3aed;color:white;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:bold;font-family:sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.7);white-space:nowrap;border:2px solid #a855f7;';
    _host.textContent = `⚠ Click the dropdown for ${field.label} to identify it`;
    document.body.appendChild(_host);
    function _onIdentify(e) {
      let el = e.target;
      let found = null;
      for (let i = 0; i < 8 && el && el !== document.body; i++) {
        const cls = (el.className || '').toLowerCase();
        if (el.tagName !== 'SELECT' && el.tagName !== 'INPUT' &&
            (cls.includes('dropdown') || cls.includes('select') || cls.includes('picker') ||
             cls.includes('combo') || el.querySelector('li,[class*="option"]'))) {
          found = el; break;
        }
        el = el.parentElement;
      }
      root = found || e.target.closest('div') || e.target;
      document.removeEventListener('click', _onIdentify, true);
      try { document.body.removeChild(_host); } catch {}
      _runTeach(root);
    }
    document.addEventListener('click', _onIdentify, true);
    setTimeout(() => {
      document.removeEventListener('click', _onIdentify, true);
      try { document.body.removeChild(_host); } catch {}
      sessionStorage.removeItem('_cc_teach_active');
    }, 30000);
    return;
  }

  _runTeach(root);
  function _runTeach(root) {

  // Snapshot the full root text at start — works on any site
  // We detect change by comparing full text, not relying on specific child selectors
  const labelText = (root.querySelector('.label, label, mat-label')?.textContent || '').trim();
  const getDisplayText = () => {
    // ng-select: value shown in .ng-value, placeholder in .ng-placeholder
    const ngValue = root.querySelector('.ng-value-label,.ng-value .ng-star-inserted,.ng-value');
    if (ngValue) return ngValue.textContent.trim();
    // Known value-display selectors
    const el = root.querySelector('.select-type') || root.querySelector('.value-area') ||
                root.querySelector('[class*="selection__rendered"]') || root.querySelector('[class*="filter-option"]') ||
                root.querySelector('[class*="chosen-single"] span') || root.querySelector('.p-dropdown-label') ||
                root.querySelector('[class*="selectmenu-text"]') || root.querySelector('[class*="selected-value"]') ||
                root.querySelector('[class*="trigger"] span:first-child') ||
                root.querySelector('[class*="select-value"] span') || root.querySelector('[class*="mat-select-value"] span');
    if (el) return el.textContent.trim();
    // Clone root, strip option lists and placeholders, get remaining text
    // For mat-select: check mat-select-value span directly
    const matVal = root.querySelector('.mat-select-value-text,.mat-mdc-select-value-text');
    if (matVal) return matVal.textContent.trim();
    const clone = root.cloneNode(true);
    clone.querySelectorAll('ul,ol,[class*="options"],[class*="dropdown-list"],[class*="drop-list"],[class*="menu"],[class*="items"]').forEach(e => e.remove());
    // Remove placeholder only if it has placeholder class (not value class)
    clone.querySelectorAll('[class*="placeholder"]:not([class*="value"])').forEach(e => e.remove());
    return clone.textContent.replace(labelText, '').trim();
  };
  const initialValue = getDisplayText();
  // For verifySelector: find the element whose text changes after selection
  const verifySel = (() => {
    const el = root.querySelector('.select-type') || root.querySelector('.value-area');
    if (!el) return '';
    const cls = (el.className || '').trim().split(/\s+/).filter(c => c && !c.startsWith('ng-') && !c.startsWith('_ng'))[0];
    return cls ? '.' + cls : '';
  })();

  console.log('[CC] teachOneField: root=', root.className, 'initialValue=', JSON.stringify(initialValue), 'triggerSel=', triggerSelector);
  root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const origOutline = root.style.outline;
  const origBoxShadow = root.style.boxShadow;
  root.style.outline = '2px solid #dc2626';
  root.style.boxShadow = '0 0 0 4px rgba(220,38,38,0.3)';

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#dc2626;color:white;padding:5px 10px;border-radius:4px;font-size:12px;font-family:sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.5);';
  host.textContent = '⚠ Click this dropdown to open it';
  const badge = host;
  document.body.appendChild(host);

  function positionBadge() {
    const r = root.getBoundingClientRect();
    host.style.left = r.left + 'px';
    host.style.top = Math.max(4, r.top - 34) + 'px';
  }
  positionBadge();
  const posInterval = setInterval(positionBadge, 150);

  let triggerSelector = field.aiTrigger || '.value-area'; // use AI hint if available
  let triggerCaptured = false;

  function cleanup() {
    clearInterval(posInterval);
    clearInterval(statePoller);
    _mo.disconnect();
    document.removeEventListener('click', onTriggerClick, true);
    try { document.body.removeChild(host); } catch {}
    root.style.outline = origOutline;
    root.style.boxShadow = origBoxShadow;
    sessionStorage.removeItem('_cc_teach_active');
  }

  // Capture trigger click — works even if click is on child outside root bounds
  function onTriggerClick(e) {
    if (triggerCaptured) return;
    // Accept click anywhere near the root (within 200px) or inside it
    const rr = root.getBoundingClientRect();
    const inArea = e.clientX >= rr.left - 20 && e.clientX <= rr.right + 20 &&
                   e.clientY >= rr.top - 20 && e.clientY <= rr.bottom + 200;
    if (!inArea) return;
    const el = e.target;
    const cls = (el.className || '').trim().split(/\s+/).filter(c => c && !c.startsWith('ng-') && !c.startsWith('_ng'))[0];
    if (cls) triggerSelector = '.' + cls;
    triggerCaptured = true;
    badge.textContent = '⚠ Select an option from the list';
    document.removeEventListener('click', onTriggerClick, true);
  }
  document.addEventListener('click', onTriggerClick, true);

  // ── Part 7: MutationObserver captures overlay subtree on trigger click ──
  let _teachOverlayRoot = null;
  const _teachAddedNodes = [];
  const _teachMo = new MutationObserver(mutations => {
    for (const m of mutations) {
      m.addedNodes.forEach(n => { if (n.nodeType === 1) _teachAddedNodes.push(n); });
    }
  });
  function isVisibleTeach(node) {
    const r = node.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(node);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }
  document.addEventListener('click', function _teachOverlayCapture(e) {
    const rr = root.getBoundingClientRect();
    const inArea = e.clientX >= rr.left - 20 && e.clientX <= rr.right + 20 &&
                   e.clientY >= rr.top - 20 && e.clientY <= rr.bottom + 200;
    if (!inArea) return;
    _teachAddedNodes.length = 0;
    _teachMo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      _teachMo.disconnect();
      for (const node of _teachAddedNodes) {
        if (!isVisibleTeach(node)) continue;
        const lis = Array.from(node.querySelectorAll('li')).filter(o => isVisibleTeach(o));
        if (lis.length > 0) { _teachOverlayRoot = node; break; }
      }
      console.log('[CC] teach overlay root:', _teachOverlayRoot ? _teachOverlayRoot.tagName + '.' + _teachOverlayRoot.className.slice(0,40) : 'none');
    }, 1000);
    document.removeEventListener('click', _teachOverlayCapture, true);
  }, true);

  // Use both MutationObserver (immediate) and polling (fallback) for change detection
  let _domChanged = false;
  const _mo = new MutationObserver(() => { _domChanged = true; });
  _mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });

  let statePoller = setInterval(() => {
    if (!_domChanged && getDisplayText() === initialValue) return; // nothing changed yet
    const currentValue = getDisplayText();
    const placeholder = /^(select|choose|--|please|select option|none|pick|-+)/i;
    if (currentValue && currentValue !== initialValue && !placeholder.test(currentValue)) {
      clearInterval(statePoller);
      _teachMo.disconnect();
      cleanup();

      let optionSelector = 'li';
      let containerSel = '';
      const searchRoot = _teachOverlayRoot || document;
      searchRoot.querySelectorAll('li, [class*="option"], [class*="item"]').forEach(el => {
        if (!isVisibleTeach(el) && el.offsetParent === null) return;
        if (el.textContent.trim() === currentValue) {
          const cls = (el.className || '').trim().split(/\s+/).filter(c => c && !c.startsWith('ng-') && !c.startsWith('_ng'))[0];
          optionSelector = cls ? (el.tagName.toLowerCase() + '.' + cls) : el.tagName.toLowerCase();
          if (_teachOverlayRoot) {
            const tag = _teachOverlayRoot.tagName.toLowerCase();
            const ccls = (_teachOverlayRoot.className || '').trim().split(/\s+/)[0] || '';
            containerSel = tag + (ccls ? '.' + ccls : '');
          } else {
            let c = el.parentElement;
            for (let i = 0; i < 6 && c && c !== document.body; i++) {
              const tag = c.tagName.toLowerCase();
              const ccls = (c.className || '').trim().split(/\s+/)[0] || '';
              if (tag === 'app-dropdown' || tag === 'ul' || ccls.includes('option') || ccls.includes('dropdown') || ccls.includes('list') || ccls.includes('menu')) {
                containerSel = tag + (ccls ? '.' + ccls : '');
                break;
              }
              c = c.parentElement;
            }
          }
        }
      });

      const result = {
        componentClass: root.className.trim().split(/\s+/)[0] || 'ng-dropdown',
        triggerSelector,
        optionsContainer: containerSel,
        optionSelector,
        verifySelector: verifySel,
        learnedValue: currentValue,
      };
      console.log('[CC] teachOneField result:', JSON.stringify(result));
      sessionStorage.setItem('_cc_teach_result', JSON.stringify(result));
    }
  }, 200);

  setTimeout(() => { cleanup(); }, 45000);
  } // end _runTeach
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function pollTeachResult(tabId, timeout) {
  return new Promise(resolve => {
    let elapsed = 0;
    const interval = setInterval(async () => {
      elapsed += 500;
      const r = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const v = sessionStorage.getItem('_cc_teach_result');
          if (v) { sessionStorage.removeItem('_cc_teach_result'); return JSON.parse(v); }
          return null;
        },
      }).catch(() => [{ result: null }]);
      const result = r?.[0]?.result;
      if (result || elapsed >= timeout) { clearInterval(interval); resolve(result || null); }
    }, 500);
  });
}

function notifyPopup(msg) {
  chrome.storage.local.set({ _cc_teach_progress: msg }).catch(() => {});
}

function normalizeFieldLabel(label) {
  return (label || '').replace(/\n/g, ' ').replace(/^\d+\.\s*/, '').replace(/^[a-z]\.\s*/i, '').replace(/\*$/, '').trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
