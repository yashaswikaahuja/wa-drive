console.log("[CC] background.js loaded v3.61");
// Background service worker — owns teach session, survives popup close

// Wake on storage change — more reliable than sendMessage for waking SW
let _teachRunning = false;
let _lastTeachTs = 0;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!changes._cc_teach_job?.newValue) return;
  const job = changes._cc_teach_job.newValue;
  // Deduplicate: same timestamp = same job, ignore
  if (job.ts === _lastTeachTs) return;
  if (_teachRunning) return;
  _lastTeachTs = job.ts;
  console.log('[CC] SW teach job received:', job.hostname, job.fields?.length, 'fields');
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

async function runTeachSession({ tabId, fields, backendUrl, hostname }) {
  _teachRunning = true;
  startKeepalive();
  const TEACHABLE_TYPES = ['ng-dropdown', 'mat-select', 'select', 'mat-radio'];
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

    await chrome.scripting.executeScript({
      target: { tabId },
      func: teachOneField,
      args: [field],
    }).catch(e => console.error('[CC] teachOneField inject failed:', e.message));

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
  // Use domIndex if available (precise, handles duplicate labels)
  if (typeof field.domIndex === 'number') {
    root = document.querySelectorAll('div.ng-dropdown')[field.domIndex] || null;
  }
  if (!root && field.selector && !field.selector.startsWith('form-field-')) {
    root = document.querySelector(field.selector);
  }
  if (!root) {
    const baseLabel = field.label.replace(/\s*\(\d+\)$/, '').replace(/[\n*]/g,'').trim().slice(0,15);
    document.querySelectorAll('div.ng-dropdown, mat-select, [role="combobox"]').forEach(el => {
      const lbl = el.querySelector('.label, mat-label, label')?.textContent?.trim() || el.getAttribute('aria-label') || '';
      if (lbl && baseLabel && lbl.includes(baseLabel)) root = el;
    });
  }
  if (!root) { sessionStorage.removeItem('_cc_teach_active'); return; }

  // Try specific selectors first, fall back to any child element or root itself
  const verifyEl = root.querySelector('.select-type') ||
                   root.querySelector('[class*="selected"]') ||
                   root.querySelector('[class*="value"]') ||
                   root.querySelector('.value-area') ||
                   root.querySelector('span, div > span, .label ~ *') ||
                   root;

  const verifySel = verifyEl !== root
    ? ('.' + (verifyEl.className || '').trim().split(/\s+/).filter(c => c && !c.startsWith('ng-') && !c.startsWith('_ng'))[0] || '.select-type')
    : '';
  // Snapshot initial text — exclude the label text to avoid false positives
  const labelText = (root.querySelector('.label')?.textContent || '').trim();
  const getRootValue = () => root.textContent.replace(labelText, '').trim();
  const initialValue = verifyEl !== root ? verifyEl.textContent.trim() : getRootValue();

  console.log('[CC] teachOneField: root=', root.className, 'verifyEl=', verifyEl === root ? 'root' : verifyEl.className, 'initialValue=', initialValue);
  root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const origOutline = root.style.outline;
  const origBoxShadow = root.style.boxShadow;
  root.style.outline = '2px solid #dc2626';
  root.style.boxShadow = '0 0 0 4px rgba(220,38,38,0.3)';

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;top:0;left:0;';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const badge = document.createElement('div');
  badge.style.cssText = 'background:#dc2626;color:white;padding:5px 10px;border-radius:4px;font-size:12px;font-family:sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.5);';
  badge.textContent = '⚠ Click this dropdown to open it';
  shadow.appendChild(badge);

  function positionBadge() {
    const r = root.getBoundingClientRect();
    host.style.left = r.left + 'px';
    host.style.top = Math.max(4, r.top - 34) + 'px';
  }
  positionBadge();
  const posInterval = setInterval(positionBadge, 150);

  let triggerSelector = '.value-area'; // default fallback
  let triggerCaptured = false;

  function cleanup() {
    clearInterval(posInterval);
    clearInterval(statePoller);
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

  // State poller: re-query on each tick — Angular replaces DOM nodes on value change
  let statePoller = setInterval(() => {
    const liveEl = root.querySelector('.select-type') ||
                   root.querySelector('[class*="selected"]') ||
                   root.querySelector('.value-area');
    const currentValue = liveEl ? liveEl.textContent.trim() : getRootValue();
    const placeholder = /^(select|choose|--|please|select option)/i;
    if (currentValue && currentValue !== initialValue && !placeholder.test(currentValue)) {
      clearInterval(statePoller);
      cleanup();

      let optionSelector = 'li';
      let containerSel = '';
      // Search visible option elements — include app-dropdown children
      document.querySelectorAll('li, [class*="option"], [class*="item"], app-dropdown li').forEach(el => {
        if (el.offsetParent === null) return; // skip hidden
        if (el.textContent.trim() === currentValue) {
          const cls = (el.className || '').trim().split(/\s+/).filter(c => c && !c.startsWith('ng-') && !c.startsWith('_ng'))[0];
          optionSelector = cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
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
