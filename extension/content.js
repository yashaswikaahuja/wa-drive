// Content script - floating autofill button + message listener
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'ping') sendResponse({ ok: true });
});

// ── Floating AutoFill Button ─────────────────────────────────────────────────
(function() {
  if (window._ccFloatingInit) return;
  window._ccFloatingInit = true;

  // ── Phase A: Job Dispatch Detection ────────────────────────────────────────
  // Frontend opens form URL with ?cc_job=<jobId>. Content script detects this and
  // signals background to fetch dispatch envelope and run the runtime.
  function checkJobDispatch() {
    try {
      const params = new URLSearchParams(window.location.search);
      const jobId = params.get('cc_job');
      if (!jobId) return;
      // Strip param so it doesn't fire twice on reload
      const url = new URL(window.location.href);
      url.searchParams.delete('cc_job');
      window.history.replaceState(null, '', url.toString());
      // Fetch envelope from backend, then send to background
      chrome.storage.local.get(['backendUrl', 'accessToken'], async ({ backendUrl, accessToken }) => {
        if (!backendUrl || !accessToken) { console.warn('[CC] cc_job param but not authenticated'); return; }
        try {
          const r = await fetch(backendUrl + '/jobs/' + jobId + '/dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
          });
          const d = await r.json();
          if (!d.ok || !d.dispatch) { console.error('[CC] dispatch failed:', d); return; }
          const envelope = { type: 'DISPATCH_JOB', version: '1.0', ...d.dispatch };
          // Wait briefly for page DOM to be ready
          setTimeout(() => {
            chrome.runtime.sendMessage(envelope, (resp) => {
              if (chrome.runtime.lastError) console.error('[CC] dispatch sendMessage failed:', chrome.runtime.lastError);
              else console.log('[CC] dispatch accepted:', resp);
            });
          }, 1500);
        } catch (e) { console.error('[CC] cc_job dispatch error:', e); }
      });
    } catch (e) { console.warn('[CC] checkJobDispatch failed:', e.message); }
  }
  checkJobDispatch();


  // Guard: check if extension context is still valid
  function isContextValid() {
    try { return !!chrome.runtime?.id; } catch { return false; }
  }
  function safeRemove() {
    const el = document.getElementById('cc-float-container');
    if (el) el.remove();
  }

  function countFormFields() {
    return Array.from(document.querySelectorAll('input,select,textarea')).filter(el =>
      el.offsetParent !== null && el.type !== 'hidden' && el.type !== 'submit' && el.type !== 'button'
    ).length;
  }

  function init() {
    if (countFormFields() < 2) return;
    injectButton();
  }

  function injectButton() {
    if (document.getElementById('cc-float-btn')) return;

    const container = document.createElement('div');
    container.id = 'cc-float-container';
    container.innerHTML = `
      <div id="cc-float-btn" style="position:fixed;bottom:20px;right:20px;z-index:2147483646;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#4a3f8a,#6c5ce7);box-shadow:0 4px 15px rgba(0,0,0,0.3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.2s;">
        <span style="font-size:20px;color:#fff;">⚡</span>
      </div>
      <div id="cc-float-panel" style="display:none;position:fixed;bottom:75px;right:20px;z-index:2147483646;width:280px;background:#1a1a3e;border:1px solid #4a3f8a;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,0.5);font-family:sans-serif;overflow:hidden;">
        <div style="padding:10px 12px;background:#2a2a5a;border-bottom:1px solid #4a3f8a;">
          <input id="cc-float-search" type="text" placeholder="Search profile..." style="width:100%;padding:6px 10px;border:1px solid #4a3f8a;border-radius:5px;background:#1a1a3e;color:#e2e0ff;font-size:12px;outline:none;">
        </div>
        <div id="cc-float-profiles" style="max-height:200px;overflow-y:auto;padding:6px;"></div>
        <div id="cc-float-status" style="padding:6px 12px;font-size:11px;color:#a0a0d0;display:none;"></div>
      </div>
    `;
    document.body.appendChild(container);

    const btn = document.getElementById('cc-float-btn');
    const panel = document.getElementById('cc-float-panel');
    const search = document.getElementById('cc-float-search');
    const profilesDiv = document.getElementById('cc-float-profiles');
    const statusDiv = document.getElementById('cc-float-status');
    let profiles = [];
    let selectedId = null;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const visible = panel.style.display !== 'none';
      panel.style.display = visible ? 'none' : 'block';
      if (!visible) loadProfiles();
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) panel.style.display = 'none';
    });

    async function loadProfiles() {
      if (!isContextValid()) { safeRemove(); return; }
      let backendUrl;
      try { ({ backendUrl } = await chrome.storage.local.get('backendUrl')); } catch { safeRemove(); return; }
      if (!backendUrl) { showStatus('Set backend URL in extension settings'); return; }
      try {
        const res = await fetch(`${backendUrl}/profiles`);
        profiles = await res.json();
        renderProfiles('');
      } catch { showStatus('Failed to load profiles'); }
    }

    function renderProfiles(query) {
      const q = query.toLowerCase();
      const filtered = profiles.filter(p => !q || (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q));
      profilesDiv.innerHTML = filtered.slice(0, 8).map(p => `
        <div class="cc-profile-item" data-phone="${p.phone}" style="padding:8px 10px;margin:3px 0;border-radius:6px;cursor:pointer;background:${selectedId === p.phone ? '#4a3f8a' : '#2a2a5a'};border:1px solid ${selectedId === p.phone ? '#6c5ce7' : '#3a3a6a'};">
          <div style="color:#fff;font-size:12px;font-weight:bold;">${p.name || 'Unknown'}</div>
          <div style="color:#a0a0d0;font-size:10px;">📱 ${p.phone} · ${Object.keys(p).length} fields</div>
        </div>
      `).join('') || '<div style="color:#666;font-size:11px;padding:10px;text-align:center;">No profiles found</div>';

      profilesDiv.querySelectorAll('.cc-profile-item').forEach(el => {
        el.addEventListener('click', () => {
          selectedId = el.dataset.phone;
          renderProfiles(search.value);
          triggerFill(selectedId);
        });
      });
    }

    search.addEventListener('input', () => renderProfiles(search.value));

    async function triggerFill(profileId) {
      if (!isContextValid()) { safeRemove(); return; }
      showStatus('⚡ Filling...');
      // Store selected profile and trigger autofill via background
      try {
        chrome.storage.local.set({ _cc_float_trigger: { profileId, ts: Date.now() } }, () => {
          if (chrome.runtime.lastError) { safeRemove(); return; }
          chrome.runtime.sendMessage({ type: 'AUTOFILL_TRIGGER', profileId, tabId: null }, (resp) => {
          if (resp?.ok) showStatus('✓ Filled ' + (resp.filled || '') + ' fields');
          else showStatus('⚠ ' + (resp?.error || 'Failed'));
          setTimeout(() => { panel.style.display = 'none'; statusDiv.style.display = 'none'; }, 3000);
          });
        });
      } catch { safeRemove(); }
    }

    function showStatus(msg) {
      statusDiv.textContent = msg;
      statusDiv.style.display = 'block';
    }
  }

  // Retry init until fields appear (Angular/SPA may render late)
  function tryInit() {
    if (document.getElementById('cc-float-btn')) return; // already injected
    if (countFormFields() >= 2) { injectButton(); return; }
  }
  // Check every 2s for up to 30s
  let attempts = 0;
  const retryInterval = setInterval(() => {
    tryInit();
    if (++attempts > 15 || document.getElementById('cc-float-btn')) clearInterval(retryInterval);
  }, 2000);
  // Also check on DOM mutations (SPA navigation)
  new MutationObserver(() => tryInit()).observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
