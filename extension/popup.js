const VERSION = chrome.runtime.getManifest().version;
let allProfiles = [];
let selectedProfile = null;
/** Phase 0: café default hides Agent; owner may set chrome.storage.local.allowLegacyClientFill = true */
let allowLegacyClientFill = false;
let _extBuildInfo = null;

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
const versionEl = document.getElementById('ver');
versionEl.textContent = 'v' + VERSION;

function shortSha(s) {
  if (!s || s === 'development') return s || 'dev';
  return String(s).slice(0, 7);
}

function applyAgentVisibility() {
  if (!agentBtn) return;
  if (allowLegacyClientFill) {
    agentBtn.style.display = '';
    agentBtn.title = 'AI Agent (legacy — owner opt-in)';
    agentBtn.disabled = !selectedProfile;
  } else {
    agentBtn.style.display = 'none';
    agentBtn.disabled = true;
    agentBtn.title = 'Legacy Agent disabled (Phase 0). Use Fill Form.';
    if (agentPanel) agentPanel.style.display = 'none';
  }
}

async function refreshLegacyFillGate() {
  try {
    const data = await chrome.storage.local.get('allowLegacyClientFill');
    allowLegacyClientFill = data.allowLegacyClientFill === true;
  } catch {
    allowLegacyClientFill = false;
  }
  applyAgentVisibility();
}

function renderVersionLine(extCommit, svcCommit) {
  const extShort = shortSha(extCommit || 'development');
  let text = `v${VERSION} @ ${extShort}`;
  let title = `Extension ${VERSION}, build ${extCommit || 'development'}`;
  if (_extBuildInfo?.built_at) title += `, ${_extBuildInfo.built_at}`;
  if (svcCommit) {
    const svcShort = shortSha(svcCommit);
    text += ` · svc ${svcShort}`;
    title += ` | extension-service ${svcCommit}`;
    const bothReal =
      extCommit &&
      svcCommit &&
      extCommit !== 'development' &&
      svcCommit !== 'development';
    if (bothReal && String(extCommit).slice(0, 7) !== String(svcCommit).slice(0, 7)) {
      text += ' ⚠ mismatch';
      title +=
        ' — DEPLOY LOCK: extension zip commit should match extension-service BUILD_SHA. See deploy/docs/EXTENSION-DEPLOY-LOCK.md';
      versionEl.style.color = 'hsl(0 65% 42%)';
    } else {
      versionEl.style.color = '';
    }
  }
  versionEl.textContent = text;
  versionEl.title = title;
}

async function loadDeployProvenance() {
  try {
    const response = await fetch(chrome.runtime.getURL('build-info.json'));
    _extBuildInfo = response.ok ? await response.json() : null;
  } catch {
    _extBuildInfo = null;
  }
  const extCommit = _extBuildInfo?.commit || 'development';
  renderVersionLine(extCommit, null);

  try {
    const { backendUrl } = await chrome.storage.local.get('backendUrl');
    if (!backendUrl) return;
    // backendUrl is typically https://api…/api → health at /api/extension/health
    const healthUrl = String(backendUrl).replace(/\/?$/, '') + '/extension/health';
    const hr = await fetch(healthUrl);
    if (!hr.ok) return;
    const body = await hr.json();
    if (body?.commit) renderVersionLine(extCommit, body.commit);
  } catch {
    /* offline or older service without route */
  }
}

refreshLegacyFillGate();
loadDeployProvenance();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.allowLegacyClientFill) refreshLegacyFillGate();
});

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
  if (color !== CC.danger) {
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
    applyAgentVisibility();
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
  applyAgentVisibility();
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
      applyAgentVisibility();
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
  showProgress('Preparing...');
  saveRecent(selectedProfile.id);

  try {
    const tab = await getActivePageTab();
    if (!tab?.id) { showStatus('No active tab', CC.danger); hideProgress(); return; }
    if (!tab.url || tab.url.startsWith('chrome') || tab.url.startsWith('edge://')) {
      showStatus('Open a form page first', CC.danger); hideProgress(); return;
    }
    _lastFillTabId = tab.id;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const snapshot = {};
        document.querySelectorAll('input, select, textarea').forEach(el => {
          const key = el.id || el.name || el.getAttribute('formcontrolname');
          if (key) snapshot[key] = { value: el.value, type: el.type };
        });
        window.__ccUndoSnapshot = snapshot;
      }
    });

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

    // PRODUCT PATH (APE-P1-07): perceive → server plan → ActionPlanExecutor → EO
    // Must NOT call autofill/executor.js, mapper, or selector resolvers.
    // Scripts are IIFE-wrapped so re-inject is safe; skip when already present
    // to avoid needless work on repeated Fill in the same tab.
    updateProgress('Perceiving page structure...', 30);
    const PRODUCT_PATH_SCRIPTS = [
      'runtime/dom-gateway.js',
      'runtime/navigation-contract.js',
      'perception/visual-context.js',
      'perception/binding-registry.js',
      'perception/revision-manager.js',
      'perception/canonical-hash.js',
      'perception/privacy-filter.js',
      'perception/widget-classifier.js',
      'perception/adapters/index.js',
      'perception/node-factory.js',
      'perception/edge-factory.js',
      'perception/graph-invariants.js',
      'perception/context-discovery.js',
      'perception/snapshot-builder.js',
      'perception/validator.js',
      'perception/index.js',
      'runtime/action-plan-executor.js',
    ];
    const [loadedCheck] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!(
        globalThis.CcDomGateway
        && globalThis.CcBindingRegistry
        && globalThis.CcPerception
        && globalThis.CcActionPlanExecutor
      ),
    });
    if (!loadedCheck?.result) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: PRODUCT_PATH_SCRIPTS,
      });
    }

    // NAV-RR2-P2-05: seed operator destination-origin allowlist from chrome.storage.local
    // into the isolated world (never public IR). Key: navigationOriginAllowlist (string[]).
    try {
      const allowStore = await chrome.storage.local.get('navigationOriginAllowlist');
      const originAllowlist = Array.isArray(allowStore.navigationOriginAllowlist)
        ? allowStore.navigationOriginAllowlist.filter((x) => typeof x === 'string' && x.length > 0)
        : [];
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (list) => {
          if (globalThis.CcNavigationContract?.setOriginAllowlist) {
            globalThis.CcNavigationContract.setOriginAllowlist(list);
          } else {
            globalThis.__ccNavigationOriginAllowlist = Array.isArray(list) ? list : [];
          }
        },
        args: [originAllowlist],
      });
    } catch (e) {
      console.warn('[CC] navigation origin allowlist seed failed:', e.message);
    }

    const [percResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        try {
          if (typeof CcPerception === 'undefined') return { error: 'CcPerception not loaded' };
          if (typeof CcDomGateway === 'undefined') return { error: 'CcDomGateway not loaded' };
          if (typeof CcContextDiscovery !== 'undefined' && CcContextDiscovery.resetContextCounter) {
            CcContextDiscovery.resetContextCounter();
          }
          if (typeof CcNodeFactory !== 'undefined' && CcNodeFactory.resetNodeCounter) {
            CcNodeFactory.resetNodeCounter();
          }
          await CcPerception.initPerception({
            gateway: CcDomGateway,
            bindingRegistry: new CcBindingRegistry(),
            revisionManager: new CcRevisionManager(),
            privacyFilter: CcPrivacyFilter,
            widgetClassifier: CcWidgetClassifier,
            contextDiscovery: CcContextDiscovery,
            nodeFactory: CcNodeFactory,
            edgeFactory: CcEdgeFactory,
            canonicalHash: CcCanonicalHash,
            snapshotBuilder: CcSnapshotBuilder,
            validator: CcValidator,
            validatorOptions: { schema: null },
          });
          if (CcValidator && !CcValidator.isInitialized()) {
            await CcValidator.initValidator({ schema: null });
          }
          return await CcPerception.perceivePage({ mode: 'snapshot', includeGeometry: true });
        } catch (err) {
          return { error: err.message, stack: (err.stack || '').slice(0, 300) };
        }
      },
    });

    const pageSnapshot = percResult?.result;
    if (!pageSnapshot || pageSnapshot.kind !== 'page_snapshot') {
      const errDetail = pageSnapshot?.error || JSON.stringify(percResult).slice(0, 120);
      showStatus('Perception failed: ' + errDetail, CC.danger);
      hideProgress();
      return;
    }

    updateProgress('Server planning fill...', 55);
    const planResponse = await fetch(data.backendUrl + '/fill-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.accessToken },
      body: JSON.stringify({
        snapshot: pageSnapshot,
        profileId: selectedProfile.id,
        profile: (() => {
          const flat = {};
          const raw = selectedProfile.data || selectedProfile;
          for (const [k, v] of Object.entries(raw)) {
            flat[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
          }
          if (selectedProfile.name) flat.name = flat.name || selectedProfile.name;
          return flat;
        })(),
      }),
    });

    if (!planResponse.ok) {
      let errMsg = String(planResponse.status);
      try {
        const errBody = await planResponse.text();
        try {
          const errJson = JSON.parse(errBody);
          errMsg += ' - ' + (errJson.error || errJson.message || errBody.slice(0, 80));
        } catch {
          errMsg += ' - ' + (planResponse.statusText || 'Server error');
        }
      } catch { /* ignore */ }
      showStatus('Server plan failed: ' + errMsg, CC.danger);
      hideProgress();
      return;
    }

    const planBody = await planResponse.json();
    const plan = planBody.plan || planBody.action_plan || planBody;
    if (!plan || !plan.steps || plan.steps.length === 0) {
      showStatus('Empty plan from server (no mapped fields)', CC.warning);
      hideProgress();
      return;
    }

    updateProgress(`Executing ${plan.steps.length} steps...`, 70);
    const [execResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (actionPlan) => {
        if (!globalThis.CcActionPlanExecutor?.execute) {
          throw new Error('ActionPlan executor not loaded');
        }
        if (typeof globalThis.ccExecutor === 'function' || globalThis.__ccLegacyFillActive) {
          throw new Error('Legacy fill path must not run with ActionPlan v3');
        }
        return globalThis.CcActionPlanExecutor.execute(actionPlan);
      },
      args: [plan],
    });

    const executionObservation = execResult?.result;
    if (!executionObservation || executionObservation.kind !== 'execution_observation') {
      showStatus('Execution failed: invalid observation', CC.danger);
      hideProgress();
      return;
    }

    let observationError = null;
    try {
      const query = new URLSearchParams({
        plan_id: plan.plan_id || '',
        correlation_id: plan.correlation_id || '',
        runtimeVersion: VERSION,
      });
      const reportResponse = await fetch(data.backendUrl + '/fill-observation?' + query.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.accessToken },
        body: JSON.stringify(executionObservation),
      });
      if (!reportResponse.ok) observationError = 'HTTP ' + reportResponse.status;
    } catch (e) {
      observationError = e.message;
    }

    const stepResults = executionObservation.steps || [];
    const filled = stepResults.filter(r => r.status === 'succeeded').length;
    const failed = stepResults.filter(r => r.status === 'failed').length;
    const skipped = stepResults.filter(r => r.status === 'skipped').length;

    const resultByStep = new Map(stepResults.map(r => [r.step_id, r]));
    const records = (plan.steps || []).map(step => {
      const result = resultByStep.get(step.step_id);
      return {
        label: step.target?.node_id || step.step_id,
        result: result?.status === 'succeeded' ? 'filled' : (result?.status || 'skipped'),
        value: step.action?.value || '',
        source: 'server-plan',
      };
    });
    window._lastFilledRecords = records.filter(r => r.result === 'filled');
    showResults(filled, skipped, failed, records.filter(r => r.result !== 'filled'));
    undoBtn.style.display = filled > 0 ? 'block' : 'none';

    if (executionObservation.outcome === 'rejected' || executionObservation.outcome === 'aborted') {
      showStatus('Fill stopped: ' + (executionObservation.rejection_reason || 'plan rejected'), CC.danger);
    } else if (observationError) {
      showStatus('Fields changed, but session evidence was not saved: ' + observationError, CC.danger);
    } else {
      showStatus(`Fill complete: ${filled} ok, ${failed} failed, ${skipped} skipped`, failed ? CC.warning : CC.success);
    }
  } catch (e) {
    showStatus('Error: ' + e.message, CC.danger);
  } finally {
    fillBtn.disabled = false;
    fillBtn.innerHTML = 'Fill Form';
    hideProgress();
  }
});

// Undo fill
undoBtn.addEventListener('click', async () => {
  if (!_lastFillTabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: _lastFillTabId },
      func: () => {
        const snapshot = (window.__ccUndoSnapshot || {});
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
  // Phase 0 (CYB-85): Agent path is legacy client intelligence — off by default.
  await refreshLegacyFillGate();
  if (!allowLegacyClientFill) {
    showStatus('Legacy Agent disabled. Use Fill Form (side panel).', CC.warning);
    return;
  }
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
      agentBtn.textContent = '🤖';
      applyAgentVisibility();
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
    agentBtn.textContent = '🤖';
    applyAgentVisibility();
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
