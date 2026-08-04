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
const siteIcon = document.getElementById('site-icon');
const siteName = document.getElementById('site-name');
const progressEl = document.getElementById('progress');
const progressText = document.getElementById('progress-text');
const progressInner = document.getElementById('progress-inner');
const resultsEl = document.getElementById('results');
document.getElementById('ver').textContent = 'v' + VERSION;

// Side panel stays open across tab switches — always resolve the active *page* tab
// (never chrome:// or the extension itself).
async function getActivePageTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  let tab = tabs[0];
  if (!tab?.url || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    tab = allTabs.find(t =>
      t.url &&
      !t.url.startsWith('chrome') &&
      !t.url.startsWith('edge://') &&
      !t.url.startsWith('about:') &&
      !t.url.startsWith('devtools:')
    ) || tab;
  }
  return tab || null;
}

// Paper-theme status colors (match frontend .pt-paper)
const CC = {
  warning: 'hsl(35 92% 38%)',
  danger: 'hsl(0 65% 45%)',
  success: 'hsl(158 60% 28%)',
  info: 'hsl(22 90% 42%)',
  muted: 'hsl(30 10% 40%)',
};

function showStatus(msg, color) {
  statusEl.textContent = msg;
  statusEl.style.color = color || CC.warning;
  statusEl.style.display = 'block';
  // Only auto-dismiss non-error messages
  if (color !== CC.danger && color !== '#ef4444') {
    setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
  }
}
statusEl?.addEventListener('click', () => { statusEl.style.display = 'none'; });

const KNOWN_SITES = {
  'ssc.nic.in': { icon: '🏛', name: 'SSC' },
  'ssc.gov.in': { icon: '🏛', name: 'SSC' },
  'rrbcdg.gov.in': { icon: '🚂', name: 'RRB' },
  'nta.ac.in': { icon: '📝', name: 'NTA' },
  'upsc.gov.in': { icon: '🏛', name: 'UPSC' },
  'passportindia.gov.in': { icon: '🛂', name: 'Passport Seva' },
  'digilocker.gov.in': { icon: '📁', name: 'DigiLocker' },
};

async function detectSite() {
  try {
    const tab = await getActivePageTab();
    if (!tab?.url || tab.url.startsWith('chrome') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      siteIcon.textContent = '🌐';
      siteName.textContent = 'No page detected';
      const conf = document.getElementById('site-confidence');
      if (conf) conf.style.display = 'none';
      return;
    }
    const url = new URL(tab.url);
    const host = url.hostname.replace('www.', '');
    const match = Object.entries(KNOWN_SITES).find(([k]) => host.includes(k));
    if (match) { siteIcon.textContent = match[1].icon; siteName.textContent = match[1].name + ' — ' + host; }
    else { siteIcon.textContent = '🌐'; siteName.textContent = host; }
    // Network-effect confidence badge: "filled 29× by operators · 100%"
    fetchConfidence(host);
  } catch { siteName.textContent = 'Unknown page'; }
}

// Keep site bar in sync while the side panel stays open
if (chrome.tabs?.onActivated) {
  chrome.tabs.onActivated.addListener(() => { detectSite(); });
}
if (chrome.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status === 'complete' || info.url) {
      chrome.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
        if (active?.id === tabId) detectSite();
      }).catch(() => {});
    }
  });
}

async function fetchConfidence(host) {
  const el = document.getElementById('site-confidence');
  if (!el) return;
  try {
    const data = await chrome.storage.local.get(['backendUrl', 'accessToken']);
    const r = await fetch(data.backendUrl + '/forms/confidence?hostname=' + encodeURIComponent(host), {
      headers: { Authorization: 'Bearer ' + data.accessToken },
    });
    if (!r.ok) return;
    const { fills, confidence } = await r.json();
    if (fills > 0) {
      el.textContent = `✓ filled ${fills}× by operators` + (confidence != null ? ` · ${confidence}% success` : '');
      el.style.display = 'block';
    } else {
      el.textContent = `First time on this form — I'll fill what I'm sure about`;
      el.style.color = 'hsl(30 10% 40%)';
      el.style.display = 'block';
    }
  } catch {}
}

function showProgress(text) {
  resultsEl.style.display = 'none';
  progressEl.style.display = 'block';
  progressText.textContent = text;
  progressInner.style.width = '30%';
}
function updateProgress(text, pct) {
  progressText.textContent = text;
  progressInner.style.width = pct + '%';
}
function hideProgress() { progressEl.style.display = 'none'; }

function showResults(filled, skipped, failed, records) {
  hideProgress();
  const total = filled + skipped + failed || 1;
  document.getElementById('r-filled').textContent = filled;
  document.getElementById('r-skipped').textContent = skipped;
  document.getElementById('r-failed').textContent = failed;
  const bar = document.getElementById('results-bar');
  bar.innerHTML = `<div class="filled" style="width:${filled/total*100}%"></div><div class="skipped" style="width:${skipped/total*100}%"></div><div class="failed" style="width:${failed/total*100}%"></div>`;
  // Show field names for skipped/failed
  const detailEl = document.getElementById('results-detail');
  const issues = (records || []).filter(r => r.result && r.result !== 'filled');
  if (issues.length) {
    detailEl.innerHTML = issues.slice(0, 8).map(r => {
      const color = r.result === 'unmapped' ? 'hsl(35 92% 38%)' : 'hsl(0 65% 45%)';
      const label = r.label || r.selector?.replace(/[#.\[\]]/g, '').slice(0, 20) || '?';
      return `<span class="field-tag" style="border-color:${color};color:${color}">${label}</span>`;
    }).join('') + (issues.length > 8 ? `<span class="field-tag" style="color:hsl(30 10% 40%)">+${issues.length-8} more</span>` : '');
    detailEl.style.display = 'flex';
  } else {
    detailEl.style.display = 'none';
  }

  // "Show, don't just do": list exactly what was filled (label → value) so operator trusts it
  const filledEl = document.getElementById('results-filled');
  if (filledEl) {
    const fr = window._lastFilledRecords || [];
    if (fr.length) {
      filledEl.innerHTML = `<div class="filled-toggle" id="filled-toggle">▸ See what was filled (${fr.length})</div>
        <div id="filled-list" style="display:none"></div>`;
      const listEl = filledEl.querySelector('#filled-list');
      listEl.innerHTML = fr.map(r => {
        const label = (r.label || r.selector || '').toString().replace(/[#.\[\]]/g, '').slice(0, 28);
        const val = (r.value != null ? String(r.value) : '').slice(0, 30);
        return `<div class="filled-row"><span class="fl-label">${label}</span><span class="fl-val">${val}</span><span class="fl-check">✓</span></div>`;
      }).join('');
      const toggle = filledEl.querySelector('#filled-toggle');
      toggle.onclick = () => {
        const open = listEl.style.display === 'block';
        listEl.style.display = open ? 'none' : 'block';
        toggle.textContent = (open ? '▸' : '▾') + ` See what was filled (${fr.length})`;
      };
      filledEl.style.display = 'block';
    } else {
      filledEl.style.display = 'none';
    }
  }
  // Show "Complete Profile" link if fields were skipped
  const cpLink = document.getElementById('complete-profile-link');
  if (skipped > 0 || failed > 0) {
    cpLink.style.display = 'block';
    cpLink.onclick = async () => {
      const data = await chrome.storage.local.get('backendUrl');
      const frontendUrl = (data.backendUrl || '').replace('/api', '').replace('api.', 'app.');
      const profileId = selectedProfile?.id;
      const phone = selectedProfile?.phone || selectedProfile?.primary_contact_phone || '';
      const url = frontendUrl + '/app/customers/' + encodeURIComponent(phone);
      chrome.tabs.create({ url });
    };
  } else {
    cpLink.style.display = 'none';
  }
  resultsEl.style.display = 'block';
}

function getPhone(p) { return p.phone || p.primary_contact_phone || ''; }

let focusIdx = -1;
let filteredProfiles = [];
let recentIds = [];

async function loadRecents() {
  const data = await chrome.storage.local.get('_cc_recents');
  recentIds = data._cc_recents || [];
}
async function saveRecent(profileId) {
  recentIds = [profileId, ...recentIds.filter(id => id !== profileId)].slice(0, 5);
  await chrome.storage.local.set({ _cc_recents: recentIds });
}

function renderProfiles(query) {
  const q = (query || '').toLowerCase().trim();
  let list = q
    ? allProfiles.filter(p => (p.name||'').toLowerCase().includes(q) || getPhone(p).includes(q))
    : allProfiles;

  // Sort recents to top when no search query
  if (!q && recentIds.length) {
    const recents = recentIds.map(id => list.find(p => p.id === id)).filter(Boolean);
    const rest = list.filter(p => !recentIds.includes(p.id));
    list = [...recents, ...rest];
  }
  filteredProfiles = list;

  if (!filteredProfiles.length) {
    profilesEl.innerHTML = `<div class="empty">${q ? 'No match for "'+q+'"' : 'No profiles found'}</div>`;
    focusIdx = -1;
    return;
  }

  // Auto-select single match
  if (filteredProfiles.length === 1 && q) {
    selectedProfile = filteredProfiles[0];
    focusIdx = 0;
    fillBtn.disabled = false;
    agentBtn.disabled = false;
  }

  const visibleList = filteredProfiles.slice(0, 20);
  const recentCount = !q ? recentIds.filter(id => allProfiles.some(x => x.id === id)).length : 0;
  profilesEl.innerHTML = visibleList.map((p, i) => {
    const initials = (p.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const isSelected = selectedProfile?.id === p.id;
    const isFocused = i === focusIdx;
    const phone = getPhone(p);
    let label = '';
    if (!q && i === 0 && recentCount > 0) label = '<div class="section-label">Recent</div>';
    if (!q && i === recentCount && recentCount > 0) label = '<div class="section-label">All</div>';
    return `${label}<div class="profile-item${isSelected?' selected':''}${isFocused?' focused':''}" data-id="${p.id}" data-idx="${i}">
      <div class="avatar">${initials}</div>
      <div>
        <div class="profile-name">${p.name || 'Unknown'}</div>
        <div class="profile-phone">📱 ${phone}</div>
      </div>
    </div>`;
  }).join('');

  profilesEl.querySelectorAll('.profile-item').forEach(el => {
    el.addEventListener('click', () => {
      selectProfile(el.dataset.id);
    });
  });
}

function selectProfile(id) {
  selectedProfile = allProfiles.find(p => p.id === id) || null;
  fillBtn.disabled = !selectedProfile;
  agentBtn.disabled = !selectedProfile;
  chrome.storage.session.set({ _cc_selected: id });
  // Pre-fetch full profile data
  if (selectedProfile) prefetchProfile(id);
  renderProfiles(searchEl.value);
}

let _prefetchedProfile = null;
async function prefetchProfile(id) {
  try {
    const data = await chrome.storage.local.get(['backendUrl', 'accessToken']);
    const r = await fetch(data.backendUrl + '/profiles/' + id, {
      headers: { Authorization: 'Bearer ' + data.accessToken }
    });
    if (r.ok) _prefetchedProfile = await r.json();
  } catch {}
}

// Keyboard navigation
searchEl.addEventListener('keydown', (e) => {
  const max = Math.min(filteredProfiles.length, 20);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    focusIdx = Math.min(focusIdx + 1, max - 1);
    renderProfiles(searchEl.value);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    focusIdx = Math.max(focusIdx - 1, 0);
    renderProfiles(searchEl.value);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedProfile && (focusIdx === -1 || filteredProfiles[focusIdx]?.id === selectedProfile.id)) {
      // Profile already selected — trigger fill
      fillBtn.click();
    } else if (focusIdx >= 0 && filteredProfiles[focusIdx]) {
      // Select the focused profile
      selectProfile(filteredProfiles[focusIdx].id);
      focusIdx = filteredProfiles.findIndex(p => p.id === selectedProfile?.id);
    } else if (filteredProfiles.length === 1) {
      selectProfile(filteredProfiles[0].id);
    }
  }
});

async function init() {
  document.getElementById('ver').textContent = 'v' + VERSION;
  detectSite();
  await loadRecents();

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
    // Restore last selected profile
    const sess = await chrome.storage.session.get('_cc_selected');
    if (sess._cc_selected) {
      selectedProfile = allProfiles.find(p => p.id === sess._cc_selected) || null;
      fillBtn.disabled = !selectedProfile;
      agentBtn.disabled = !selectedProfile;
    }
    renderProfiles('');
    searchEl.focus();
  } catch (e) {
    profilesEl.innerHTML = `<div class="empty">Failed to load profiles: ${e.message}</div>`;
  }
}

// Search
searchEl.addEventListener('input', () => { focusIdx = -1; renderProfiles(searchEl.value); });

// Fill form
let _lastFillTabId = null;
const undoBtn = document.getElementById('undo-btn');

// Required fields for govt forms
const REQUIRED_FIELDS = ['name', 'father_name', 'dob', 'gender', 'aadhaar_number', 'address', 'state', 'pincode'];

function getCompleteness(profile) {
  const data = profile?.data || profile || {};
  let filled = 0;
  const missing = [];
  for (const key of REQUIRED_FIELDS) {
    const val = data[key];
    const v = val && typeof val === 'object' ? val.value : val;
    if (v) filled++;
    else missing.push(key.replace(/_/g, ' '));
  }
  return { percent: Math.round(filled / REQUIRED_FIELDS.length * 100), missing };
}

fillBtn.addEventListener('click', async () => {
  if (!selectedProfile) return;

  // Show completeness warning if profile is incomplete
  const full = _prefetchedProfile?.id === selectedProfile.id ? _prefetchedProfile : selectedProfile;
  const { percent, missing } = getCompleteness(full);
  if (percent < 100 && missing.length > 0) {
    const warn = document.getElementById('completeness-warn');
    warn.innerHTML = `<span>⚠️ ${percent}% complete — will skip: ${missing.slice(0,3).join(', ')}${missing.length > 3 ? '...' : ''}</span><button id="fill-anyway">Fill anyway</button>`;
    warn.style.display = 'flex';
    await new Promise(resolve => {
      document.getElementById('fill-anyway').onclick = () => { warn.style.display = 'none'; resolve(); };
    });
  }

  fillBtn.disabled = true;
  fillBtn.innerHTML = '<span>Filling...</span>';
  resultsEl.style.display = 'none';
  undoBtn.style.display = 'none';
  showProgress('Preparing autofill scripts...');
  saveRecent(selectedProfile.id);

  try {
    const tab = await getActivePageTab();
    if (!tab?.id) { showStatus('No active tab', CC.danger); hideProgress(); return; }
    if (!tab.url || tab.url.startsWith('chrome') || tab.url.startsWith('edge://')) {
      showStatus('Open a form page first', CC.danger); hideProgress(); return;
    }
    _lastFillTabId = tab.id;

    // Capture pre-fill values for undo
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const snapshot = {};
        document.querySelectorAll('input, select, textarea').forEach(el => {
          const key = el.id || el.name || el.getAttribute('formcontrolname');
          if (key) snapshot[key] = { selector: el.id ? '#'+el.id : `[name="${el.name}"]`, value: el.value, type: el.type };
        });
        document.body.setAttribute('data-cc-undo', JSON.stringify(snapshot));
      }
    });

    // Use pre-fetched profile (or fetch if not ready)
    const data = await chrome.storage.local.get(['backendUrl', 'accessToken']);
    let fullProfile = _prefetchedProfile?.id === selectedProfile.id ? _prefetchedProfile : selectedProfile;
    if (fullProfile === selectedProfile) {
      try {
        const fr = await fetch(data.backendUrl + '/profiles/' + selectedProfile.id, {
          headers: { Authorization: 'Bearer ' + data.accessToken },
        });
        if (fr.ok) fullProfile = await fr.json();
      } catch (e) { console.warn('[CC] full profile fetch failed:', e.message); }
    }
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
    // Shared modules are listed FIRST so they're available when callers run.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [
          'shared/option-match.js',
          'shared/dom-utils.js',
          'shared/network-idle.js',
          'shared/llm-client.js',
          'shared/select-apply.js',
          'shared/semantic-aliases.js',
          'models/ir.js',
          'capabilities/registry.js',
          'runtime/resolver.js',
          'runtime/runner.js',
          'autofill/plugins/interface.js',
          'autofill/plugins/cascade-select.js',
          'autofill/plugins/ng-dropdown.js',
          'autofill/plugins/button-click.js',
          'autofill/plugins/keystroke-input.js',
          'runtime/plugin-bridge.js',
          'drivers/dispatch.js',
          'drivers/dom.js',
          'drivers/input.js',
          'drivers/select.js',
          'drivers/interaction.js',
          'autofill/extractor.js',
          'autofill/rule-engine.js',
          'autofill/derive.js',
          'autofill/ai-resolve.js',
          'autofill/mapper.js',
          'autofill/executor.js'
        ]
      });
    } catch (e) {
      showStatus('Failed to load autofill scripts: ' + e.message, CC.danger);
      hideProgress();
      return;
    }

    updateProgress('Mapping fields to profile...', 50);
    // Get LLM key from backend settings (OpenRouter or Groq)
    let groqKey = '', llmBaseUrl = 'https://api.groq.com/openai/v1/chat/completions', llmModel = 'llama-3.3-70b-versatile';
    try {
      const gRes = await fetch(data.backendUrl + '/settings/groq-key', { headers: { 'Authorization': 'Bearer ' + data.accessToken } });
      if (gRes.ok) { const gd = await gRes.json(); groqKey = gd.key || ''; llmBaseUrl = gd.baseUrl || llmBaseUrl; llmModel = gd.model || llmModel; }
    } catch {}
    updateProgress('Filling form fields...', 70);
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
        })(), selectedProfile.id || '', data.backendUrl, data.accessToken, groqKey, llmBaseUrl, llmModel],
      func: async (profile, profileId, backendUrl, accessToken, groqKey, llmBaseUrl, llmModel) => {
        const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken };
        // ── Pass 0: derive implied values (highest qualification, aliases, age,
        // eligibility flags). Deterministic, free; never overwrites real data.
        try {
          if (typeof ccDeriveProfile === 'function') {
            const before = Object.keys(profile).length;
            profile = ccDeriveProfile(profile);
            console.log('[CC] derived keys:', (profile._derived || []).join(', ') || 'none', `(${before}→${Object.keys(profile).length})`);
          }
        } catch (e) { console.warn('[CC] derive failed:', e.message); }
        // ── Load semantic aliases from service (for runner target resolution) ──
        try {
          if (window.ccSemanticAliases && window.ccSemanticAliases.load) {
            await window.ccSemanticAliases.load(backendUrl, accessToken);
            const st = window.ccSemanticAliases.status();
            console.log('[CC] Semantic aliases:', st.source, '(' + st.count + ' keys)');
          }
        } catch (e) { console.warn('[CC] Alias load skipped:', e.message); }

        const { formFields, semanticFormKey } = extractFormFieldsWithFingerprint();
        // Stash backend URL + token + formkey + profileId on document.body so executor's
        // post-fill correction observer can authenticate its POSTs and link to profile
        try {
          document.body.setAttribute('data-cc-backend', backendUrl);
          document.body.setAttribute('data-cc-token', accessToken);
          document.body.setAttribute('data-cc-formkey', semanticFormKey || '');
          document.body.setAttribute('data-cc-profile-id', profileId || '');
          document.body.setAttribute('data-cc-llm-url', llmBaseUrl || '');
          document.body.setAttribute('data-cc-llm-model', llmModel || '');
          document.body.setAttribute('data-cc-llm-key', groqKey || '');
        } catch {}
        if (!formFields.length) return { ok: false, error: 'No form fields detected' };

        // Try saved mappings (rule-aware: fillMode / rules / constant / conditions)
        let mapping = {}, fbs = {};
        const directChecks = [];    // radio/checkbox toggles (executor value-strategies don't set .checked)
        const handled = new Set();  // formField selectors resolved via saved rules
        let translations = {};
        try { const tr = await fetch(backendUrl + '/mappings/translations', { headers }); translations = (await tr.json()) || {}; } catch {}
        try {
          const r = await fetch(backendUrl + '/mappings/' + semanticFormKey, { headers });
          const saved = await r.json();
          if (saved && typeof saved === 'object') {
            const norm = l => (l||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
            for (const f of formFields) {
              const sk = norm(f.label); const s = saved[sk];
              if (!s) continue;
              const act = (typeof ccEvaluateField === 'function') ? ccEvaluateField(s, f, profile, translations)
                : (s.profileKey && profile[s.profileKey] ? { kind: 'value', value: String(profile[s.profileKey]) } : { kind: 'skip' });
              if (!act || act.kind === 'skip') continue;
              const grp = (typeof ccTypeGroup === 'function') ? ccTypeGroup(f.type) : 'text';
              const setFbs = () => { fbs[f.selector] = { label: f.label, profileKey: s.profileKey, source: 'mapping' }; handled.add(f.selector); };
              if (act.kind === 'value') {
                mapping[f.selector] = { value: act.value, type: f.type };
                setFbs();
              } else if (act.kind === 'option') {
                if (grp === 'radio' && Array.isArray(f.optionSelectors)) {
                  const idx = (f.options || []).indexOf(act.option);
                  const optSel = idx >= 0 ? f.optionSelectors[idx] : null;
                  if (optSel) directChecks.push({ selector: optSel, check: true, label: f.label, profileKey: s.profileKey });
                } else {
                  mapping[f.selector] = { value: act.option, type: f.type };  // dropdown: executor selects by option text
                }
                setFbs();
              } else if (act.kind === 'check') {
                if (act.check) directChecks.push({ selector: f.selector, check: true, label: f.label, profileKey: s.profileKey });
                setFbs();
              } else if (act.kind === 'checkOptions') {
                const sels = f.optionSelectors || [];
                for (const optText of act.options) {
                  const idx = (f.options || []).indexOf(optText);
                  const optSel = idx >= 0 ? sels[idx] : null;
                  if (optSel) directChecks.push({ selector: optSel, check: true, label: f.label, profileKey: s.profileKey });
                }
                setFbs();
              }
            }
          }
        } catch {}

        // Fuzzy fill remaining (skip fields already resolved by rules)
        const unmapped = formFields.filter(f => !mapping[f.selector] && !handled.has(f.selector));
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
        // Exclude radio/checkbox — those are handled by the rule engine, not key-mapping.
        const unmappedAI = formFields.filter(f => {
          if (mapping[f.selector] || handled.has(f.selector)) return false;
          const g = (typeof ccTypeGroup === 'function') ? ccTypeGroup(f.type) : 'text';
          return g !== 'radio' && g !== 'checkbox';
        });
        if (unmappedAI.length > 0 && groqKey) {
          try {
            const aiPromise = aiMatch(unmappedAI, profile, groqKey, llmBaseUrl, llmModel);
            const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('AI timeout')), 10000));
            const aiMapping = await Promise.race([aiPromise, timeout]);
            for (const [sel, val] of Object.entries(aiMapping)) {
              if (!mapping[sel]) { mapping[sel] = val; fbs[sel] = { label: 'ai', source: 'ai' }; }
            }
          } catch(e) { console.warn('[CC] aiMatch skipped:', e.message); }
        }

        // ── Option validation: demote dropdown/radio fills whose value doesn't
        // match any available option. Better to leave them for the AI resolver
        // (which sees the OPTIONS list) than to send an unmatchable value to the
        // executor where it will timeout with "no-matching-option". ──────────
        for (const f of formFields) {
          if (!mapping[f.selector]) continue;
          const grp = (typeof ccTypeGroup === 'function') ? ccTypeGroup(f.type) : 'text';
          if (grp !== 'dropdown' && grp !== 'radio') continue;
          const val = String(mapping[f.selector].value || '').toLowerCase().trim();
          if (!val) continue;
          const src = fbs[f.selector]?.source || '';
          if (f.options && f.options.length) {
            // Has pre-captured options: validate against them
            const matched = f.options.some(o => {
              const on = o.toLowerCase().trim();
              return on === val || on.includes(val) || val.includes(on);
            });
            if (!matched) {
              console.log('[CC] demoted unmatched dropdown:', f.label, '→', mapping[f.selector].value);
              delete mapping[f.selector]; delete fbs[f.selector];
            }
          } else if (src !== 'mapping' && src !== 'manual') {
            // Ng-dropdown without pre-captured options: ONLY trust saved mappings
            // (they were verified by a previous successful fill). Fuzzy/AI-key
            // guesses haven't been validated against real options and will likely
            // timeout in the executor. Let the AI resolver handle with reasoning.
            console.log('[CC] demoted unverified ng-dropdown:', f.label, '→', mapping[f.selector].value, '(source:', src, ')');
            delete mapping[f.selector]; delete fbs[f.selector];
          }
        }

        // ── Final pass: AI resolves VALUES for fields still blank ──────────────
        // Direct + derived + fuzzy + aiMatch have run. Anything left is either a
        // form-specific question or needs reasoning over the profile (e.g. which
        // dropdown option fits). One batched call; option values are validated
        // against the field's real options so nothing unusable gets filled.
        const stillBlank = formFields.filter(f =>
          !mapping[f.selector] && !handled.has(f.selector) &&
          f.type !== 'checkbox-agreement' &&
          !/captcha|otp|password|verification code/i.test(f.label || '')
        );
        if (stillBlank.length > 0 && groqKey && typeof ccAiResolveValues === 'function') {
          try {
            const pending = stillBlank.map(f => ({
              selector: f.selector, label: f.label, type: f.type,
              options: f.options || null, placeholder: f.placeholder || '',
            }));
            const rPromise = ccAiResolveValues(pending, profile, groqKey, llmBaseUrl, llmModel);
            const rTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('ai-resolve timeout')), 15000));
            const resolved = await Promise.race([rPromise, rTimeout]);
            let n = 0;
            for (const [sel, info] of Object.entries(resolved)) {
              if (mapping[sel]) continue;
              const f = formFields.find(x => x.selector === sel);
              if (!f) continue;
              const grp = (typeof ccTypeGroup === 'function') ? ccTypeGroup(f.type) : 'text';
              // Radio → click the matching option directly; others go through executor
              if (grp === 'radio' && Array.isArray(f.optionSelectors)) {
                const oi = (f.options || []).indexOf(info.value);
                if (oi >= 0 && f.optionSelectors[oi]) {
                  directChecks.push({ selector: f.optionSelectors[oi], check: true, label: f.label, profileKey: null });
                  handled.add(f.selector); n++;
                }
              } else {
                mapping[sel] = { value: info.value, type: f.type };
                fbs[sel] = { label: f.label, source: 'ai-resolve' };
                n++;
              }
            }
            if (n) console.log('[CC] ai-resolve filled', n, 'residual field(s)');
          } catch (e) { console.warn('[CC] ai-resolve skipped:', e.message); }
        }
        // ── Executor is the PRIMARY fill engine (proven sequential logic) ──
        // It handles: DOM-order fill, scroll-into-view, keystroke simulation,
        // waitForOptions (cascade), waitForNetworkIdle, DWR re-apply,
        // ng-dropdown plugin, verifyValue, and 200ms inter-field delay.
        const filled = await fillFormFieldsSequential(mapping, fbs, adp, formFields);

        // Apply radio/checkbox selections directly
        const directRecords = [];
        for (const dc of directChecks) {
          try {
            const el = document.querySelector(dc.selector);
            if (!el) { directRecords.push({ selector: dc.selector, value: dc.check ? 'checked' : 'unchecked', type: 'toggle', result: 'skipped', failReason: 'not-found', source: 'mapping', label: dc.label }); continue; }
            if (el.checked !== !!dc.check) el.click();
            el.dispatchEvent(new Event('change', { bubbles: true }));
            fbs[dc.selector] = { label: dc.label, profileKey: dc.profileKey, source: 'mapping' };
            directRecords.push({ selector: dc.selector, value: 'checked', type: 'toggle', result: 'filled', source: 'mapping', label: dc.label });
          } catch { /* skip */ }
        }

        // ── Runner produces Observation from executor's records (Phase 1.7) ──
        // This gives protocol-compliant output without replacing the executor's
        // proven fill logic.
        let runnerObservation = null;
        try {
          if (window.ccRunner && window.ccResolver) {
            const extractResult = extractFormFieldsWithFingerprint();
            const elements = formFields.map(f => document.querySelector(f.selector));
            window.ccResolver.setPageContext(extractResult.pageModel, elements);

            // Build Observation from executor's _ccRecords
            let executorRecords = [];
            try { executorRecords = JSON.parse(document.body.getAttribute('data-cc-records') || '[]'); } catch {}

            runnerObservation = {
              plan_id: 'executor_fill_' + Date.now(),
              session_id: semanticFormKey || 'unknown',
              protocol_version: 2,
              execution_path: executorRecords.map((r, i) => ({
                node_id: 'field_' + i,
                status: r.result === 'filled' ? 'success' : 'failed',
                actual_value: r.actualValue || r.value || null,
                error: r.failReason || null,
                duration_ms: r.durationMs || 0,
              })),
              checkpoints_reached: [],
              corrections: [],
              human_interactions: [],
              page_state: {
                url: window.location.href,
                navigated: false,
                form_submitted: false,
                fields_snapshot: null,
              },
            };
            const succeeded = runnerObservation.execution_path.filter(e => e.status === 'success').length;
            console.log('[CC] Observation:', succeeded, '/', runnerObservation.execution_path.length, 'fields filled');
          }
        } catch (e) { console.warn('[CC] Observation build error:', e.message); }

        // Read structured records the executor flushed to document.body
        let records = [];
        try { records = JSON.parse(document.body.getAttribute('data-cc-records') || '[]'); } catch {}
        records = records.concat(directRecords);

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

        // Build mapping sync data — POSTed from popup context (more reliable than in-page fetch)
        let syncUpdates = {};
        try {
          const norm = l => (l||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
          for (let i = 0; i < formFields.length; i++) {
            const f = formFields[i];
            const sk = norm(f.label);
            if (!sk || sk.length < 2) continue;
            const fbsInfo = fbs[f.selector];
            const profileKey = fbsInfo?.profileKey || (mapping[f.selector] ? Object.entries(profile).find(([,v]) => v === mapping[f.selector].value)?.[0] : null) || null;
            const wasFilled = records.some(r => r.selector === f.selector && r.result === 'filled');
            syncUpdates[sk] = {
              profileKey,
              label: f.label,
              type: f.type,
              order: i,
              options: f.options || null,
              delta: { fills: wasFilled ? 1 : 0, corrections: 0 },
            };
          }
        } catch (e) { console.warn('[CC] mapping sync build failed:', e.message); }

        return { ok: true, filled, totalDetected, totalMapped, totalFilled, totalFailed, totalUnmapped, recordCount: records.length, records: records.filter(r => r.result !== 'filled').slice(0, 10), filledRecords: records.filter(r => r.result === 'filled').slice(0, 25), syncUpdates, syncFormKey: semanticFormKey, syncTitle: document.title.slice(0, 80), syncHost: location.hostname };
      }
    });

    const r = result?.[0]?.result;
    // Sync mappings from popup context (reliable — not dependent on in-page fetch/CSP)
    if (r?.ok && r.syncUpdates && Object.keys(r.syncUpdates).length > 0 && r.syncFormKey) {
      try {
        await fetch(data.backendUrl + '/mappings/' + r.syncFormKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + data.accessToken },
          body: JSON.stringify({ updates: r.syncUpdates, meta: { hostname: r.syncHost, title: r.syncTitle, lastSeen: new Date().toISOString().slice(0, 10), syncVersion: 2 } }),
        });
      } catch (e) { console.warn('[CC] mapping sync POST failed:', e.message); }
    }
    if (r?.ok) {
      const skipped = r.totalUnmapped || 0;
      const failed = r.totalFailed || 0;
      window._lastFilledRecords = r.filledRecords || [];
      showResults(r.totalFilled || 0, skipped, failed, r.records);
      undoBtn.style.display = 'block';
    } else {
      hideProgress();
      showStatus(r?.error || 'Fill failed', CC.danger);
    }
  } catch (e) {
    hideProgress();
    showStatus('Error: ' + e.message, CC.danger);
  } finally {
    fillBtn.disabled = false;
    fillBtn.innerHTML = '⚡ Fill Form';
  }
});

// Undo fill
undoBtn.addEventListener('click', async () => {
  if (!_lastFillTabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: _lastFillTabId },
      func: () => {
        const snapshot = JSON.parse(document.body.getAttribute('data-cc-undo') || '{}');
        for (const [key, info] of Object.entries(snapshot)) {
          const el = document.querySelector(info.selector);
          if (el) { el.value = info.value; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }
        }
      }
    });
    undoBtn.style.display = 'none';
    resultsEl.style.display = 'none';
    showStatus('↩ Fill undone', CC.success);
  } catch (e) { showStatus('Undo failed: ' + e.message, CC.danger); }
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
  // Side panel stays open (ChatGPT-style) — do not window.close()
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
  showStatus('Snapshotting page + planning…', CC.info);

  try {
    const data = await chrome.storage.local.get(['accessToken', 'backendUrl']);
    const tab = await getActivePageTab();
    if (!tab?.id) throw new Error('No active page tab');
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

    // Fetch FULL profile detail (list endpoint only returns summary {id,name,phone})
    let fullProfile = selectedProfile;
    try {
      const detailRes = await fetch(data.backendUrl + '/profiles/' + selectedProfile.id, {
        headers: { 'Authorization': 'Bearer ' + data.accessToken },
      });
      if (detailRes.ok) {
        const detail = await detailRes.json();
        fullProfile = typeof detail === 'string' ? JSON.parse(detail) : detail;
      }
    } catch (e) {}

    // Flatten data — strip metadata keys
    const META_KEYS = new Set(['id', 'displayLabel', 'displayName', 'relationship', 'createdAt', 'updatedAt', 'workspaceId', 'createdBy', 'updatedBy', 'documentId', 'confirmedAt', 'confirmedBy', 'source', 'confidence']);
    const flatProfile = {};
    const raw = fullProfile.data || fullProfile;
    for (const [k, v] of Object.entries(raw)) {
      if (META_KEYS.has(k)) continue;
      flatProfile[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
    }
    if (fullProfile.name) flatProfile.name = flatProfile.name || fullProfile.name;
    if (fullProfile.phone) flatProfile.phone = flatProfile.phone || fullProfile.phone;

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
      let pretty = '';
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.status === 413) pretty = 'Form too big for one prompt — try again on a shorter section';
        else if (parsed.status === 429) pretty = 'AI rate-limited — wait 30s and retry';
        else if (parsed.status === 400) pretty = 'AI rejected schema — extension version mismatch?';
        else pretty = parsed.error || errBody.slice(0, 100);
      } catch (e) { pretty = errBody.slice(0, 120); }
      throw new Error('plan ' + planRes.status + ': ' + pretty);
    }
    const plan = await planRes.json();

    if (!plan.actions || plan.actions.length === 0) {
      showStatus('Agent returned 0 actions. Check console for raw response.', CC.warning);
      console.log('[CC agent] empty plan, raw:', plan);
      agentBtn.disabled = false;
      agentBtn.textContent = '🤖';
      return;
    }

    _pendingPlan = { plan, snapshot: pageData.snapshot, tab, profile: flatProfile };
    renderPlan(plan.actions);
    agentPanel.style.display = 'block';
    showStatus(`Agent proposed ${plan.actions.length} actions (${plan.durationMs}ms, ${plan.model}). Review + execute.`, CC.success);
  } catch (e) {
    showStatus('Agent error: ' + e.message, CC.danger);
    console.error('[CC agent]', e);
  } finally {
    agentBtn.disabled = false;
    agentBtn.textContent = '🤖';
  }
});

function renderPlan(actions) {
  agentActionsEl.innerHTML = actions.map((a, i) => {
    const args = JSON.stringify(a.args).slice(0, 80);
    return `<div class="agent-step">
      <span class="n">${i + 1}.</span>
      <span class="name">${a.name}</span>
      <span class="args">${args}</span>
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
  showStatus('Executing ' + plan.actions.length + ' actions…', CC.info);

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
    showStatus(`Done: ${okCount}/${execResult.steps.length} actions succeeded`, execResult.ok ? CC.success : CC.warning);

    // Render per-step results inline so operator sees what happened
    agentActionsEl.innerHTML = plan.actions.map((a, i) => {
      const r = execResult.steps[i];
      const ok = r && r.ok;
      const color = ok ? 'hsl(158 60% 28%)' : 'hsl(0 65% 45%)';
      const summary = r?.error || (r?.result ? JSON.stringify(r.result).slice(0, 80) : '?');
      const args = JSON.stringify(a.args).slice(0, 60);
      return `<div class="agent-step">
        <span style="color:${color}">${ok ? '✓' : '✗'}</span>
        <span class="name">${a.name}</span>
        <span class="args">${args}</span>
        <div class="n" style="padding-left:16px;font-size:10px;margin-top:2px">${summary}</div>
      </div>`;
    }).join('');

    // Snapshot after for trace
    const [{ result: snapAfter }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => (await cc.do({ name: 'dom.snapshot', args: {} })).result,
    });

    // Persist trace (best-effort) — also pass profile + formKey so server can
    // learn (formKey, label) -> profileKey mappings from successful fills.
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
        profile: _pendingPlan?.profile || null,
        formKey: plan.formKey || null,
      }),
    }).catch(e => console.warn('[CC agent] trace persist failed:', e));

    agentExecuteBtn.textContent = '✓ Done';
    setTimeout(() => { agentExecuteBtn.textContent = '▶ Execute'; }, 3000);
    _pendingPlan = null;
  } catch (e) {
    showStatus('Execute error: ' + e.message, CC.danger);
    console.error('[CC agent execute]', e);
  } finally {
    agentExecuteBtn.disabled = false;
    agentExecuteBtn.textContent = '▶ Execute';
  }
});

init();
