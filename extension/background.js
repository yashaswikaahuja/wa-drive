// Background service worker — owns teach session lifecycle
// Stays alive independent of popup open/closed state

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_TEACH') {
    runTeachSession(msg).catch(console.error);
    sendResponse({ ok: true });
  }
  return false;
});

async function runTeachSession({ tabId, fields, backendUrl, hostname }) {
  const TEACHABLE_TYPES = ['ng-dropdown', 'mat-select', 'select', 'mat-radio'];
  const teachable = fields.filter(f => TEACHABLE_TYPES.includes(f.type));

  if (teachable.length === 0) {
    notifyPopup({ type: 'TEACH_PROGRESS', status: 'No interactive fields need teaching.', done: true });
    return;
  }

  for (const field of teachable) {
    const label = normalizeFieldLabel(field.label);
    notifyPopup({ type: 'TEACH_PROGRESS', status: `⚠ Teach: "${label}" — click the dropdown, then select a value`, done: false });

    // Inject teachOneField into page (fire-and-forget — it writes to sessionStorage)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['runtime/teach-runtime.js'],
    }).catch(() => {});

    // Then call the function with the field arg
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (f) => { if (typeof teachOneField === 'function') teachOneField(f); },
      args: [field],
    }).catch(() => {});

    // Poll sessionStorage for result (up to 45s) — background stays alive
    const adapter = await pollTeachResult(tabId, 45000);

    if (!adapter) {
      notifyPopup({ type: 'TEACH_PROGRESS', status: `⚠ Skipped "${label}" (timeout or no verify element)`, done: false });
      continue;
    }
    if (adapter.error) {
      notifyPopup({ type: 'TEACH_PROGRESS', status: `⚠ "${label}": ${adapter.error}`, done: false });
      continue;
    }

    // Save to backend
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

  notifyPopup({ type: 'TEACH_PROGRESS', status: 'Teaching complete! Adapters saved.', done: true });
}

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
      if (result || elapsed >= timeout) {
        clearInterval(interval);
        resolve(result || null);
      }
    }, 500);
  });
}

function notifyPopup(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {}); // popup may be closed — ignore
}

function normalizeFieldLabel(label) {
  return (label || '').replace(/\n/g, ' ').replace(/^\d+\.\s*/, '').replace(/^[a-z]\.\s*/i, '').replace(/\*$/, '').trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
