console.log("[CC] background.js loaded v3.45");
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

    await chrome.scripting.executeScript({
      target: { tabId },
      func: teachOneField,
      args: [field],
    }).catch(e => console.error('[CC] teachOneField inject failed:', e.message));

    // Poll sessionStorage for result (up to 45s) — background stays alive
    const adapter = await pollTeachResult(tabId, 45000);

    if (!adapter) {
      notifyPopup({ type: 'TEACH_PROGRESS', status: `⚠ Skipped "${label}" (timeout)`, done: false });
      continue;
    }
    if (adapter.error) {
      notifyPopup({ type: 'TEACH_PROGRESS', status: `⚠ "${label}": ${adapter.error}`, done: false });
      continue;
    }

    const saveRes = await fetch(`${backendUrl}/adapters/${hostname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adapter),
    }).catch(e => ({ ok: false, _err: e.message }));

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

  let triggerSelector = '';
  let phase = 1;

  function cleanup() {
    clearInterval(posInterval);
    clearInterval(statePoller);
    document.removeEventListener('click', onTriggerClick, true);
    try { document.body.removeChild(host); } catch {}
    root.style.outline = origOutline;
    root.style.boxShadow = origBoxShadow;
    sessionStorage.removeItem('_cc_teach_active');
  }

  function onTriggerClick(e) {
    if (!root.contains(e.target)) return;
    const el = e.target;
    const cls = (el.className || '').trim().split(/\s+/).filter(c => c && !c.startsWith('ng-') && !c.startsWith('_ng'))[0];
    triggerSelector = cls ? '.' + cls : (el.tagName.toLowerCase() + (el.getAttribute('role') ? `[role="${el.getAttribute('role')}"]` : ''));
    if (!triggerSelector) triggerSelector = '.value-area';
    badge.textContent = '⚠ Select an option from the list';
    phase = 2;
    document.removeEventListener('click', onTriggerClick, true);
  }
  document.addEventListener('click', onTriggerClick, true);

  let statePoller = setInterval(() => {
    if (phase !== 2) return;
    const currentValue = verifyEl !== root ? verifyEl.textContent.trim() : getRootValue();
    const placeholder = /^(select|choose|--|please|select option)/i;
    if (currentValue && currentValue !== initialValue && !placeholder.test(currentValue)) {
      clearInterval(statePoller);
      cleanup();

      let optionSelector = 'li';
      let containerSel = '';
      document.querySelectorAll('li, [class*="option"], [class*="item"]').forEach(el => {
        if (el.textContent.trim() === currentValue) {
          optionSelector = el.tagName.toLowerCase() + (el.className ? '.' + el.className.trim().split(/\s+/)[0] : '');
          let c = el.parentElement;
          for (let i = 0; i < 5 && c && c !== document.body; i++) {
            const cls = c.className || '';
            if (cls.includes('list') || cls.includes('option') || cls.includes('dropdown') || cls.includes('panel') || cls.includes('menu')) {
              containerSel = c.tagName.toLowerCase() + (c.className ? '.' + c.className.trim().split(/\s+/)[0] : '');
              break;
            }
            c = c.parentElement;
          }
        }
      });

      sessionStorage.setItem('_cc_teach_result', JSON.stringify({
        componentClass: root.className.trim().split(/\s+/)[0] || 'ng-dropdown',
        triggerSelector,
        optionsContainer: containerSel,
        optionSelector,
        verifySelector: verifySel,
        learnedValue: currentValue,
      }));
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
