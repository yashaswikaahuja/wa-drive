const VERSION = '5.43';
let allProfiles = [];
let selectedProfile = null;

const profilesEl = document.getElementById('profiles');
const searchEl = document.getElementById('search');
const fillBtn = document.getElementById('fill-btn');
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

    // Inject all autofill scripts in ONE call — they must share the same scope
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [
        'autofill/plugins/interface.js',
        'autofill/plugins/cascade-select.js',
        'autofill/plugins/ng-dropdown.js',
        'autofill/plugins/button-click.js',
        'autofill/extractor.js',
        'autofill/mapper.js',
        'autofill/executor.js'
      ]
    });

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

        // Tag every record with its source (mapping / fuzzy / ai) — read from fbs by selector
        records = records.map(r => ({ ...r, source: r.source || (fbs[r.selector] && fbs[r.selector].source) || 'unknown' }));

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

init();
