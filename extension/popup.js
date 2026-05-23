const VERSION = chrome.runtime.getManifest().version;
let allProfiles = [];
let selectedProfile = null;

const profilesEl = document.getElementById('profiles');
const searchEl = document.getElementById('search');
const fillBtn = document.getElementById('fill-btn');
const agentBtn = document.getElementById('agent-btn');
const agentPanel = document.getElementById('agent-panel');
const agentActionsEl = document.getElementById('agent-actions');
const agentExecuteBtn = document.getElementById('agent-execute');
const agentCancelBtn = document.getElementById('agent-cancel');
const statusEl = document.getElementById('status');
const connDot = document.getElementById('conn-dot');
const connText = document.getElementById('conn-text');
document.getElementById('ver').textContent = 'v' + VERSION;

function showStatus(msg, color) {
  statusEl.textContent = msg;
  statusEl.style.color = color || '#f59e0b';
  statusEl.style.display = 'block';
  setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
}

function getPhone(p) { return p.phone || p.primary_contact_phone || ''; }

function renderProfiles(query) {
  const q = (query || '').toLowerCase().trim();
  const filtered = q
    ? allProfiles.filter(p => (p.name||'').toLowerCase().includes(q) || getPhone(p).includes(q))
    : allProfiles;

  if (!filtered.length) {
    profilesEl.innerHTML = `<div class="empty">${q ? 'No match for "'+q+'"' : 'No profiles found'}</div>`;
    return;
  }

  profilesEl.innerHTML = filtered.slice(0, 20).map(p => {
    const initials = (p.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const isSelected = selectedProfile?.id === p.id;
    const phone = getPhone(p);
    return `<div class="profile-item${isSelected?' selected':''}" data-id="${p.id}">
      <div class="avatar">${initials}</div>
      <div>
        <div class="profile-name">${p.name || 'Unknown'}</div>
        <div class="profile-phone">📱 ${phone}</div>
      </div>
    </div>`;
  }).join('');

  profilesEl.querySelectorAll('.profile-item').forEach(el => {
    el.addEventListener('click', () => {
      selectedProfile = allProfiles.find(p => p.id === el.dataset.id) || null;
      fillBtn.disabled = !selectedProfile;
      agentBtn.disabled = !selectedProfile;
      renderProfiles(searchEl.value);
    });
  });
}

async function init() {
  document.getElementById('ver').textContent = 'v' + VERSION;

  const data = await chrome.storage.local.get(['accessToken', 'backendUrl', 'user']);

  if (!data.accessToken || !data.backendUrl) {
    connText.textContent = 'Not connected';
    profilesEl.innerHTML = '<div class="empty">Login to CyberControl first</div>';
    return;
  }

  // Verify token
  try {
    const r = await fetch(data.backendUrl + '/auth/me', {
      headers: { 'Authorization': 'Bearer ' + data.accessToken }
    });
    if (r.ok) {
      const user = await r.json();
      connDot.classList.add('green');
      connText.textContent = (user.name || user.email || 'Operator').split(' ')[0];
    } else {
      connText.textContent = 'Token expired';
      profilesEl.innerHTML = '<div class="empty">Please login again</div>';
      return;
    }
  } catch {
    connText.textContent = 'Offline?';
  }

  // Load profiles
  try {
    const r = await fetch(data.backendUrl + '/profiles', {
      headers: { 'Authorization': 'Bearer ' + data.accessToken }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const profiles = await r.json();
    allProfiles = Array.isArray(profiles) ? profiles : [];
    renderProfiles('');
    searchEl.focus();
  } catch (e) {
    profilesEl.innerHTML = `<div class="empty">Failed to load profiles: ${e.message}</div>`;
  }
}

// Search
searchEl.addEventListener('input', () => renderProfiles(searchEl.value));

// Fill form
fillBtn.addEventListener('click', async () => {
  if (!selectedProfile) return;
  fillBtn.disabled = true;
  fillBtn.textContent = 'Filling...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { showStatus('No active tab', '#ef4444'); return; }

    // Fetch FULL profile (incl. data jsonb) — list endpoint only returns summary
    const data = await chrome.storage.local.get(['backendUrl', 'accessToken']);
    let fullProfile = selectedProfile;
    try {
      const fr = await fetch(data.backendUrl + '/profiles/' + selectedProfile.id, {
        headers: { Authorization: 'Bearer ' + data.accessToken },
      });
      if (fr.ok) fullProfile = await fr.json();
    } catch (e) { console.warn('[CC] full profile fetch failed:', e.message); }
    selectedProfile = fullProfile;

    // Inject the network monitor in PAGE world — wraps fetch + XMLHttpRequest
    // so the autofill executor can wait for AJAX idle instead of hardcoded delays.
    // Wrapped in try/catch — some pages (chrome://, sandboxed iframes, CSP-strict
    // sites) reject MAIN world injection; in those cases the executor falls back
    // to fixed delays via waitForNetworkIdle's 'monitor missing' path.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        files: ['autofill/plugins/network-monitor.js'],
      });
    } catch (e) {
      console.warn('[CC] network monitor injection failed (will use fallback delays):', e.message);
    }
    // Inject all autofill scripts in ONE call — they must share the same scope (ISOLATED world)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [
          'autofill/plugins/interface.js',
          'autofill/plugins/cascade-select.js',
          'autofill/plugins/ng-dropdown.js',
          'autofill/plugins/button-click.js',
          'autofill/plugins/keystroke-input.js',
          'drivers/dispatch.js',
          'drivers/dom.js',
          'drivers/input.js',
          'drivers/select.js',
          'drivers/interaction.js',
          'autofill/extractor.js',
          'autofill/mapper.js',
          'autofill/executor.js'
        ]
      });
    } catch (e) {
      showStatus('Failed to load autofill scripts: ' + e.message, '#ef4444');
      return;
    }

    // Get Groq key from backend settings
    let groqKey = '';
    try {
      const gRes = await fetch(data.backendUrl + '/settings/groq-key', { headers: { 'Authorization': 'Bearer ' + data.accessToken } });
      if (gRes.ok) { const gd = await gRes.json(); groqKey = gd.key || ''; }
    } catch {}
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [(() => {
          // Flatten provenance structure: {field: {value, source, ...}} → {field: value}
          const flat = {};
          const raw = selectedProfile.data || selectedProfile;
          for (const [k, v] of Object.entries(raw)) {
            flat[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
          }
          // Also include top-level fields
          if (selectedProfile.name) flat.name = flat.name || selectedProfile.name;
          return flat;
        })(), selectedProfile.id || '', data.backendUrl, data.accessToken, groqKey],
      func: async (profile, profileId, backendUrl, accessToken, groqKey) => {
        const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken };
        const { formFields, semanticFormKey } = extractFormFieldsWithFingerprint();
        // Stash backend URL + token + formkey + profileId on document.body so executor's
        // post-fill correction observer can authenticate its POSTs and link to profile
        try {
          document.body.setAttribute('data-cc-backend', backendUrl);
          document.body.setAttribute('data-cc-token', accessToken);
          document.body.setAttribute('data-cc-formkey', semanticFormKey || '');
          document.body.setAttribute('data-cc-profile-id', profileId || '');
        } catch {}
        if (!formFields.length) return { ok: false, error: 'No form fields detected' };

        // Try saved mappings
        let mapping = {}, fbs = {};
        try {
          const r = await fetch(backendUrl + '/mappings/' + semanticFormKey, { headers });
          const saved = await r.json();
          if (saved && typeof saved === 'object') {
            const norm = l => (l||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
            for (const f of formFields) {
              const sk = norm(f.label); const s = saved[sk];
              if (s?.profileKey && profile[s.profileKey]) {
                mapping[f.selector] = { value: profile[s.profileKey], type: f.type };
                fbs[f.selector] = { label: f.label, profileKey: s.profileKey, source: 'mapping' };
              }
            }
          }
        } catch {}

        // Fuzzy fill remaining
        const unmapped = formFields.filter(f => !mapping[f.selector]);
        if (unmapped.length) {
          const fz = fuzzyMatch(unmapped, profile);
          for (const [s,v] of Object.entries(fz)) {
            mapping[s] = v;
            const ff = formFields.find(x=>x.selector===s);
            if (ff) fbs[s] = { label: ff.label, source: 'fuzzy' };
          }
        }

        let adp = {};
        try { const r = await fetch(backendUrl+'/adapters/'+location.hostname,{headers}); adp=await r.json(); } catch {}

        // AI mapping for fields fuzzyMatch couldn't handle (with 10s timeout)
        const unmappedAI = formFields.filter(f => !mapping[f.selector]);
        if (unmappedAI.length > 0 && groqKey) {
          try {
            const aiPromise = aiMatch(unmappedAI, profile, groqKey);
            const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('AI timeout')), 10000));
            const aiMapping = await Promise.race([aiPromise, timeout]);
            for (const [sel, val] of Object.entries(aiMapping)) {
              if (!mapping[sel]) { mapping[sel] = val; fbs[sel] = { label: 'ai', source: 'ai' }; }
            }
          } catch(e) { console.warn('[CC] aiMatch skipped:', e.message); }
        }
        const filled = await fillFormFieldsSequential(mapping, fbs, adp, formFields);
        // Read structured records the executor flushed to document.body
        let records = [];
        try { records = JSON.parse(document.body.getAttribute('data-cc-records') || '[]'); } catch {}

        // Index formFields by selector for label lookup
        const fieldBySelector = {};
        for (const f of formFields) fieldBySelector[f.selector] = f;
        // Tag every record with its source (mapping / fuzzy / ai) AND the field's label
        records = records.map(r => ({
          ...r,
          source: r.source || (fbs[r.selector] && fbs[r.selector].source) || 'unknown',
          label: r.label || (fieldBySelector[r.selector] && fieldBySelector[r.selector].label) || (fbs[r.selector] && fbs[r.selector].label) || '',
        }));

        // Append "unmapped" records for fields the mapper couldn't find a value for —
        // makes admin Sessions page show WHY a field wasn't filled.
        const filledSelectors = new Set(records.map(r => r.selector));
        for (const f of formFields) {
          if (filledSelectors.has(f.selector)) continue;
          if (mapping[f.selector]) continue; // mapped but executor didn't report — handled below
          let reason = 'no-mapping';
          if (f.type === 'ng-dropdown' || f.type === 'mat-select' || f.type === 'select') reason = 'no-mapping-for-dropdown';
          if (f.type === 'radio' || f.type === 'checkbox' || f.type === 'mat-radio' || f.type === 'mat-checkbox') reason = 'no-mapping-for-' + f.type;
          records.push({
            selector: f.selector,
            label: f.label,
            type: f.type,
            value: null,
            result: 'unmapped',
            failReason: reason,
            strategy: 'planner',
            source: 'none',
            ts: Date.now(),
          });
        }

        const totalDetected = formFields.length;
        const totalMapped = Object.keys(mapping).length;
        const totalFilled = records.filter(r => r.result === 'filled').length;
        const totalSkipped = records.filter(r => r.result === 'skipped').length;
        const totalUnmapped = records.filter(r => r.result === 'unmapped').length;
        const totalFailed = records.filter(r => r.result && r.result !== 'filled' && r.result !== 'skipped' && r.result !== 'unmapped').length;

        // POST session record (workspace-scoped via the JWT)
        try {
          await fetch(backendUrl + '/sessions', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              hostname: location.hostname,
              semanticFormKey,
              runtimeVersion: (records[0] && records[0].rv) || null,
              totalFilled,
              totalFailed,
              records,
              // Diagnostics for admin UI
              meta: { totalDetected, totalMapped, totalSkipped, totalUnmapped },
            }),
          });
        } catch (e) { console.warn('[CC] session post failed:', e.message); }
        return { ok: true, filled, totalDetected, totalMapped, totalFilled, totalFailed, totalUnmapped, recordCount: records.length };
      }
    });

    const r = result?.[0]?.result;
    if (r?.ok) {
      showStatus(`✓ Filled ${r.filled} fields`, '#22c55e');
    } else {
      showStatus(r?.error || 'Fill failed', '#ef4444');
    }
  } catch (e) {
    showStatus('Error: ' + e.message, '#ef4444');
  } finally {
    fillBtn.disabled = false;
    fillBtn.textContent = '⚡ Fill Form';
  }
});

// Open CyberControl
document.getElementById('open-btn').addEventListener('click', async () => {
  const data = await chrome.storage.local.get('backendUrl');
  const frontendUrl = data.backendUrl?.includes('localhost:3000')
    ? 'http://localhost:5173'
    : (data.backendUrl || '').replace('/api','');
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(t => t.url?.startsWith(frontendUrl));
  if (existing) { chrome.tabs.update(existing.id, {active:true}); chrome.windows.update(existing.windowId,{focused:true}); }
  else chrome.tabs.create({ url: frontendUrl || 'http://localhost:5173' });
  window.close();
});

// ── AI Agent flow ─────────────────────────────────────────────────────────
// Plan-then-execute model: popup posts (goal + page snapshot + driver list)
// to /api/agent/plan, hub returns proposed actions, operator approves,
// popup runs cc.run(actions) in the active tab.
let _pendingPlan = null;

async function injectDriversInto(tabId) {
  // Inject network monitor in MAIN world (best-effort)
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: ['autofill/plugins/network-monitor.js'],
    });
  } catch (e) {}
  // Inject plugins + drivers in ISOLATED world
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [
      'autofill/plugins/interface.js',
      'autofill/plugins/cascade-select.js',
      'autofill/plugins/ng-dropdown.js',
      'autofill/plugins/button-click.js',
      'autofill/plugins/keystroke-input.js',
      'drivers/dispatch.js',
      'drivers/dom.js',
      'drivers/input.js',
      'drivers/select.js',
      'drivers/interaction.js',
    ],
  });
}

agentBtn.addEventListener('click', async () => {
  if (!selectedProfile) return;
  agentBtn.disabled = true;
  agentBtn.textContent = '🤖 ...';
  showStatus('Snapshotting page + planning…', '#3b82f6');

  try {
    const data = await chrome.storage.local.get(['accessToken', 'backendUrl']);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await injectDriversInto(tab.id);

    // Get snapshot + driver list from page via cc.do
    const [{ result: pageData }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        if (typeof cc === 'undefined') return { error: 'drivers not injected' };
        const snap = await cc.do({ name: 'dom.snapshot', args: { kinds: ['input', 'select', 'textarea', 'button', 'checkbox', 'radio'], limit: 200 } });
        const drivers = cc.listDrivers();
        return { snapshot: snap.result, drivers };
      },
    });
    if (pageData.error) throw new Error(pageData.error);

    // Flatten profile
    const flatProfile = {};
    const raw = selectedProfile.data || selectedProfile;
    for (const [k, v] of Object.entries(raw)) {
      flatProfile[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
    }
    if (selectedProfile.name) flatProfile.name = flatProfile.name || selectedProfile.name;
    if (selectedProfile.phone) flatProfile.phone = flatProfile.phone || selectedProfile.phone;

    const goal = `Fill the form on ${pageData.snapshot.url} for the customer profile. Skip submit/continue buttons.`;

    const planRes = await fetch(data.backendUrl + '/agent/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + data.accessToken },
      body: JSON.stringify({
        goal,
        snapshot: pageData.snapshot,
        drivers: pageData.drivers,
        profile: flatProfile,
        profileId: selectedProfile.id,
        hostname: new URL(tab.url).hostname,
      }),
    });
    if (!planRes.ok) {
      const errBody = await planRes.text();
      throw new Error('plan: ' + planRes.status + ' ' + errBody.slice(0, 100));
    }
    const plan = await planRes.json();

    if (!plan.actions || plan.actions.length === 0) {
      showStatus('Agent returned 0 actions. Check console for raw response.', '#f59e0b');
      console.log('[CC agent] empty plan, raw:', plan);
      agentBtn.disabled = false;
      agentBtn.textContent = '🤖';
      return;
    }

    _pendingPlan = { plan, snapshot: pageData.snapshot, tab };
    renderPlan(plan.actions);
    agentPanel.style.display = 'block';
    showStatus(`Agent proposed ${plan.actions.length} actions (${plan.durationMs}ms, ${plan.model}). Review + execute.`, '#10b981');
  } catch (e) {
    showStatus('Agent error: ' + e.message, '#ef4444');
    console.error('[CC agent]', e);
  } finally {
    agentBtn.disabled = false;
    agentBtn.textContent = '🤖';
  }
});

function renderPlan(actions) {
  agentActionsEl.innerHTML = actions.map((a, i) => {
    const args = JSON.stringify(a.args).slice(0, 80);
    return `<div style="font-size: 11px; padding: 4px 6px; border-bottom: 1px solid #222; font-family: monospace;">
      <span style="color: #888;">${i + 1}.</span>
      <span style="color: #3b82f6;">${a.name}</span>
      <span style="color: #ccc;">${args}</span>
    </div>`;
  }).join('');
}

agentCancelBtn.addEventListener('click', () => {
  agentPanel.style.display = 'none';
  _pendingPlan = null;
});

agentExecuteBtn.addEventListener('click', async () => {
  if (!_pendingPlan) return;
  const { plan, snapshot, tab } = _pendingPlan;
  agentExecuteBtn.disabled = true;
  agentExecuteBtn.textContent = '...';
  showStatus('Executing ' + plan.actions.length + ' actions…', '#3b82f6');

  try {
    const data = await chrome.storage.local.get(['accessToken', 'backendUrl']);
    // Execute in tab via cc.run
    const [{ result: execResult }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [plan.actions],
      func: async (actions) => {
        if (typeof cc === 'undefined') return { error: 'drivers not loaded' };
        return await cc.run(actions);
      },
    });

    if (execResult.error) throw new Error(execResult.error);

    const okCount = execResult.steps.filter(s => s.ok).length;
    showStatus(`Done: ${okCount}/${execResult.steps.length} actions succeeded`, execResult.ok ? '#10b981' : '#f59e0b');

    // Snapshot after for trace
    const [{ result: snapAfter }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => (await cc.do({ name: 'dom.snapshot', args: {} })).result,
    });

    // Persist trace (best-effort)
    fetch(data.backendUrl + '/agent/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + data.accessToken },
      body: JSON.stringify({
        goal: 'agent execute',
        plan,
        results: execResult,
        snapshotBefore: snapshot,
        snapshotAfter: snapAfter,
        profileId: selectedProfile?.id,
      }),
    }).catch(e => console.warn('[CC agent] trace persist failed:', e));

    agentPanel.style.display = 'none';
    _pendingPlan = null;
  } catch (e) {
    showStatus('Execute error: ' + e.message, '#ef4444');
    console.error('[CC agent execute]', e);
  } finally {
    agentExecuteBtn.disabled = false;
    agentExecuteBtn.textContent = '▶ Execute';
  }
});

init();
