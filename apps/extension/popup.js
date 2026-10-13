// Generated from popup.ts — edit popup.ts, then pnpm build.
var _a, _b;
const VERSION = chrome.runtime.getManifest().version;
let allProfiles = [];
let selectedProfile = null;
let allowLegacyClientFill = false;
let _extBuildInfo = null;
let _lastFillTabId = null;
let _lastFillHost = null;
const profilesEl = document.getElementById("profiles");
const searchEl = document.getElementById("search");
const fillBtn = document.getElementById("fill-btn");
const modeSelect = document.getElementById("mode-select");
const agentBtn = document.getElementById("agent-btn");
const agentPanel = document.getElementById("agent-panel");
const agentActionsEl = document.getElementById("agent-actions");
const agentExecuteBtn = document.getElementById("agent-execute");
const agentCancelBtn = document.getElementById("agent-cancel");
const statusEl = document.getElementById("status");
const connDot = document.getElementById("conn-dot");
const connText = document.getElementById("conn-text");
const progressEl = document.getElementById("progress");
const progressText = document.getElementById("progress-text");
const progressInner = document.getElementById("progress-inner");
const resultsEl = document.getElementById("results");
const versionEl = document.getElementById("ver");
const searchClear = document.getElementById("search-clear");
const listCountEl = document.getElementById("list-count");
const listHintEl = document.getElementById("list-hint");
const fillHintEl = document.getElementById("fill-hint");
const FILL_BTN_LABEL = "Fill this form";
versionEl.textContent = "v" + VERSION;
const HUB_FALLBACK = "https://app.cybercontrol.fun";
function escapeHtml(value) {
  return String(value != null ? value : "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function initialsFor(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}
function updateFillHint() {
  if (!fillHintEl || !fillBtn) return;
  if (selectedProfile) {
    const name = selectedProfile.name || "customer";
    fillHintEl.textContent = `Ready to fill for ${name}`;
    fillHintEl.classList.add("ready");
    fillBtn.title = `Fill the open form for ${name}`;
  } else {
    fillHintEl.textContent = "Select a customer to fill the open form";
    fillHintEl.classList.remove("ready");
    fillBtn.title = "Select a customer first";
  }
}
function updateSearchClear() {
  if (!searchClear || !searchEl) return;
  searchClear.classList.toggle("visible", !!String(searchEl.value || "").trim());
}
function clearSelection() {
  selectedProfile = null;
  fillBtn.disabled = true;
  applyAgentVisibility();
  chrome.storage.session.remove("_cc_selected").catch(() => {
  });
  updateFillHint();
  renderProfiles((searchEl == null ? void 0 : searchEl.value) || "");
}
function clearSearch() {
  if (!searchEl) return;
  searchEl.value = "";
  focusIdx = -1;
  updateSearchClear();
  renderProfiles("");
  searchEl.focus();
}
async function openHub(path) {
  var _a2;
  const data = await chrome.storage.local.get("backendUrl");
  let frontendUrl = HUB_FALLBACK;
  if ((_a2 = data.backendUrl) == null ? void 0 : _a2.includes("localhost:3000")) frontendUrl = "http://localhost:5173";
  else if (data.backendUrl) frontendUrl = String(data.backendUrl).replace(/\/api\/?$/, "") || HUB_FALLBACK;
  const url = path ? frontendUrl.replace(/\/$/, "") + path : frontendUrl;
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => {
    var _a3;
    return (_a3 = t.url) == null ? void 0 : _a3.startsWith(frontendUrl);
  });
  if (existing) {
    chrome.tabs.update(existing.id, { active: true, url: path ? url : void 0 });
    chrome.windows.update(existing.windowId, { focused: true });
  } else {
    chrome.tabs.create({ url });
  }
}
function setLocked(locked) {
  document.body.classList.toggle("is-locked", !!locked);
}
function showLoginEmpty(title, detail) {
  setLocked(true);
  profilesEl.innerHTML = `<div class="empty"><div class="empty-title">${title}</div><div>${detail}</div><button type="button" class="primary" id="open-login-btn">Open CyberControl Hub</button></div>`;
  const btn = document.getElementById("open-login-btn");
  if (btn) btn.onclick = () => openHub("/login");
}
function shortSha(s) {
  if (!s || s === "development") return s || "dev";
  return String(s).slice(0, 7);
}
function applyAgentVisibility() {
  if (!agentBtn) return;
  if (allowLegacyClientFill) {
    agentBtn.style.display = "";
    agentBtn.title = "AI Agent (legacy \u2014 owner opt-in)";
    agentBtn.disabled = !selectedProfile;
  } else {
    agentBtn.style.display = "none";
    agentBtn.disabled = true;
    agentBtn.title = "Legacy Agent disabled (Phase 0). Use Fill this form.";
    if (agentPanel) agentPanel.style.display = "none";
  }
}
async function refreshLegacyFillGate() {
  allowLegacyClientFill = false;
  applyAgentVisibility();
}
function renderVersionLine(extCommit, svcCommit) {
  const extShort = shortSha(extCommit || "development");
  let text = `v${VERSION} @ ${extShort}`;
  let title = `Extension ${VERSION}, build ${extCommit || "development"}`;
  if (_extBuildInfo == null ? void 0 : _extBuildInfo.built_at) title += `, ${_extBuildInfo.built_at}`;
  if (svcCommit) {
    const svcShort = shortSha(svcCommit);
    text += ` \xB7 svc ${svcShort}`;
    title += ` | extension-service ${svcCommit}`;
    const bothReal = extCommit && svcCommit && extCommit !== "development" && svcCommit !== "development";
    if (bothReal && String(extCommit).slice(0, 7) !== String(svcCommit).slice(0, 7)) {
      text += " \u26A0 mismatch";
      title += " \u2014 DEPLOY LOCK: extension zip commit should match extension-service BUILD_SHA. See deploy/docs/EXTENSION-DEPLOY-LOCK.md";
      versionEl.style.color = "hsl(0 65% 42%)";
    } else {
      versionEl.style.color = "";
    }
  }
  versionEl.textContent = text;
  versionEl.title = title;
}
async function loadDeployProvenance() {
  try {
    const response = await fetch(chrome.runtime.getURL("build-info.json"));
    _extBuildInfo = response.ok ? await response.json() : null;
  } catch (e) {
    _extBuildInfo = null;
  }
  const extCommit = (_extBuildInfo == null ? void 0 : _extBuildInfo.commit) || "development";
  renderVersionLine(extCommit, null);
  try {
    const { backendUrl } = await chrome.storage.local.get("backendUrl");
    if (!backendUrl) return;
    const healthUrl = String(backendUrl).replace(/\/?$/, "") + "/extension/health";
    const hr = await fetch(healthUrl);
    if (!hr.ok) return;
    const body = await hr.json();
    if (body == null ? void 0 : body.commit) renderVersionLine(extCommit, body.commit);
  } catch (e) {
  }
}
refreshLegacyFillGate();
loadDeployProvenance();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.allowLegacyClientFill) refreshLegacyFillGate();
});
async function getActivePageTab() {
  const isPageUrl = (u) => !!u && !u.startsWith("chrome-extension://") && !u.startsWith("chrome://") && !u.startsWith("edge://") && !u.startsWith("about:") && !u.startsWith("devtools:");
  let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  let tab = tabs.find((t) => isPageUrl(t.url)) || tabs[0];
  if (!isPageUrl(tab == null ? void 0 : tab.url)) {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs.find((t) => isPageUrl(t.url)) || tabs[0];
  }
  if (!isPageUrl(tab == null ? void 0 : tab.url)) {
    const allTabs = await chrome.tabs.query({ lastFocusedWindow: true });
    tab = allTabs.find((t) => t.active && isPageUrl(t.url)) || allTabs.find((t) => isPageUrl(t.url)) || tab;
  }
  if (!isPageUrl(tab == null ? void 0 : tab.url)) {
    const any = await chrome.tabs.query({});
    tab = any.find((t) => t.active && isPageUrl(t.url)) || any.find((t) => isPageUrl(t.url)) || tab;
  }
  return tab || null;
}
const CC = {
  warning: "hsl(35 92% 38%)",
  danger: "hsl(0 65% 45%)",
  success: "hsl(158 60% 28%)",
  info: "hsl(22 90% 42%)",
  muted: "hsl(30 10% 40%)"
};
function showStatus(msg, color) {
  statusEl.textContent = msg;
  statusEl.style.color = color || CC.warning;
  statusEl.style.display = "block";
  if (color !== CC.danger) {
    setTimeout(() => {
      statusEl.style.display = "none";
    }, 4e3);
  }
}
statusEl == null ? void 0 : statusEl.addEventListener("click", () => {
  statusEl.style.display = "none";
});
function clearStaleFillSummary(activeTabId, activeHost) {
  if (!_lastFillTabId && !_lastFillHost) return;
  const sameTab = activeTabId && activeTabId === _lastFillTabId;
  const sameHost = activeHost && _lastFillHost && activeHost === _lastFillHost;
  if (sameTab && sameHost) return;
  _lastFillTabId = null;
  _lastFillHost = null;
  window._lastFilledRecords = [];
  if (resultsEl) resultsEl.style.display = "none";
  if (typeof undoBtn !== "undefined" && undoBtn) undoBtn.style.display = "none";
  const detailEl = document.getElementById("results-detail");
  if (detailEl) {
    detailEl.innerHTML = "";
    detailEl.style.display = "none";
  }
  const filledEl = document.getElementById("results-filled");
  if (filledEl) {
    filledEl.innerHTML = "";
    filledEl.style.display = "none";
  }
}
async function syncActivePage() {
  try {
    const tab = await getActivePageTab();
    let host = null;
    try {
      if (tab == null ? void 0 : tab.url) host = new URL(tab.url).hostname.replace(/^www\./, "");
    } catch (e) {
    }
    clearStaleFillSummary((tab == null ? void 0 : tab.id) || null, host);
  } catch (e) {
  }
}
if ((_a = chrome.tabs) == null ? void 0 : _a.onActivated) {
  chrome.tabs.onActivated.addListener(() => {
    syncActivePage();
  });
}
if ((_b = chrome.tabs) == null ? void 0 : _b.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === "complete" || info.url) {
      chrome.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
        if ((active == null ? void 0 : active.id) === tabId) syncActivePage();
      }).catch(() => {
      });
    }
  });
}
function showProgress(text) {
  resultsEl.style.display = "none";
  progressEl.style.display = "block";
  progressText.textContent = text;
  progressInner.style.width = "30%";
}
function updateProgress(text, pct) {
  progressText.textContent = text;
  progressInner.style.width = pct + "%";
}
function hideProgress() {
  progressEl.style.display = "none";
}
function showResults(filled, skipped, failed, records) {
  hideProgress();
  const total = filled + skipped + failed || 1;
  document.getElementById("r-filled").textContent = filled;
  document.getElementById("r-skipped").textContent = skipped;
  document.getElementById("r-failed").textContent = failed;
  const bar = document.getElementById("results-bar");
  bar.innerHTML = `<div class="filled" style="width:${filled / total * 100}%"></div><div class="skipped" style="width:${skipped / total * 100}%"></div><div class="failed" style="width:${failed / total * 100}%"></div>`;
  const detailEl = document.getElementById("results-detail");
  const issues = (records || []).filter((r) => r.result && r.result !== "filled");
  if (issues.length) {
    detailEl.innerHTML = issues.slice(0, 8).map((r) => {
      var _a2;
      const color = r.result === "unmapped" ? "hsl(35 92% 38%)" : "hsl(0 65% 45%)";
      const label = r.label || ((_a2 = r.selector) == null ? void 0 : _a2.replace(/[#.\[\]]/g, "").slice(0, 20)) || "?";
      return `<span class="field-tag" style="border-color:${color};color:${color}">${label}</span>`;
    }).join("") + (issues.length > 8 ? `<span class="field-tag" style="color:hsl(30 10% 40%)">+${issues.length - 8} more</span>` : "");
    detailEl.style.display = "flex";
  } else {
    detailEl.style.display = "none";
  }
  const filledEl = document.getElementById("results-filled");
  if (filledEl) {
    const fr = window._lastFilledRecords || [];
    if (fr.length) {
      filledEl.innerHTML = `<div class="filled-toggle" id="filled-toggle">\u25B8 See what was filled (${fr.length})</div>
        <div id="filled-list" style="display:none"></div>`;
      const listEl = filledEl.querySelector("#filled-list");
      listEl.innerHTML = fr.map((r) => {
        const label = (r.label || r.selector || "").toString().replace(/[#.\[\]]/g, "").slice(0, 28);
        const val = (r.value != null ? String(r.value) : "").slice(0, 30);
        return `<div class="filled-row"><span class="fl-label">${label}</span><span class="fl-val">${val}</span><span class="fl-check">\u2713</span></div>`;
      }).join("");
      const toggle = filledEl.querySelector("#filled-toggle");
      toggle.onclick = () => {
        const open = listEl.style.display === "block";
        listEl.style.display = open ? "none" : "block";
        toggle.textContent = (open ? "\u25B8" : "\u25BE") + ` See what was filled (${fr.length})`;
      };
      filledEl.style.display = "block";
    } else {
      filledEl.style.display = "none";
    }
  }
  const cpLink = document.getElementById("complete-profile-link");
  if (skipped > 0 || failed > 0) {
    cpLink.style.display = "block";
    cpLink.onclick = async () => {
      const data = await chrome.storage.local.get("backendUrl");
      const frontendUrl = (data.backendUrl || "").replace("/api", "").replace("api.", "app.");
      const profileId = selectedProfile == null ? void 0 : selectedProfile.id;
      const phone = (selectedProfile == null ? void 0 : selectedProfile.phone) || (selectedProfile == null ? void 0 : selectedProfile.primary_contact_phone) || "";
      const url = frontendUrl + "/app/customers/" + encodeURIComponent(phone);
      chrome.tabs.create({ url });
    };
  } else {
    cpLink.style.display = "none";
  }
  resultsEl.style.display = "block";
}
function getPhone(p) {
  return p.phone || p.primary_contact_phone || "";
}
let focusIdx = -1;
let filteredProfiles = [];
let recentIds = [];
async function loadRecents() {
  const data = await chrome.storage.local.get("_cc_recents");
  recentIds = data._cc_recents || [];
}
async function saveRecent(profileId) {
  recentIds = [profileId, ...recentIds.filter((id) => id !== profileId)].slice(0, 5);
  await chrome.storage.local.set({ _cc_recents: recentIds });
}
function badgeHtmlFor(profile) {
  const { percent } = getCompleteness(profile);
  const data = (profile == null ? void 0 : profile.data) || profile || {};
  const hasSignal = REQUIRED_FIELDS.some((key) => {
    const val = data[key];
    const v = val && typeof val === "object" ? val.value : val;
    return !!v;
  }) || percent > 0 && ((profile == null ? void 0 : profile.data) || (profile == null ? void 0 : profile.aadhaar_number) || (profile == null ? void 0 : profile.father_name));
  if (!hasSignal && percent === 0) return "";
  const cls = percent >= 85 ? "ok" : percent >= 50 ? "warn" : "low";
  return `<span class="profile-badge ${cls}" title="Profile ${percent}% ready for common govt fields">${percent}%</span>`;
}
function updateListMeta(query, visibleCount, totalFiltered) {
  if (listCountEl) {
    if (!allProfiles.length) {
      listCountEl.textContent = "";
    } else if (query) {
      listCountEl.textContent = totalFiltered > visibleCount ? `${visibleCount} of ${totalFiltered} matches` : `${totalFiltered} match${totalFiltered === 1 ? "" : "es"}`;
    } else {
      listCountEl.textContent = totalFiltered > visibleCount ? `Showing ${visibleCount} of ${allProfiles.length}` : `${allProfiles.length} customer${allProfiles.length === 1 ? "" : "s"}`;
    }
  }
  if (listHintEl) {
    if (selectedProfile) {
      listHintEl.textContent = "Enter to fill \xB7 Esc to clear";
    } else if (totalFiltered > 0) {
      listHintEl.textContent = "\u2191\u2193 to move \xB7 Enter to select";
    } else {
      listHintEl.textContent = "";
    }
  }
}
function renderProfiles(query) {
  const q = (query || "").toLowerCase().trim();
  let list = q ? allProfiles.filter((p) => (p.name || "").toLowerCase().includes(q) || getPhone(p).includes(q)) : allProfiles;
  if (!q && recentIds.length) {
    const recents = recentIds.map((id) => list.find((p) => p.id === id)).filter(Boolean);
    const rest = list.filter((p) => !recentIds.includes(p.id));
    list = [...recents, ...rest];
  }
  filteredProfiles = list;
  if (!filteredProfiles.length) {
    profilesEl.innerHTML = q ? `<div class="empty"><div class="empty-title">No match</div>No customer matches \u201C${escapeHtml(query)}\u201D. Try phone digits or another name.</div>` : `<div class="empty"><div class="empty-title">No customers yet</div>Add customers in CyberControl Hub for this caf\xE9, then come back here.</div>`;
    focusIdx = -1;
    updateListMeta(q, 0, 0);
    return;
  }
  if (filteredProfiles.length === 1 && q) {
    selectedProfile = filteredProfiles[0];
    focusIdx = 0;
    fillBtn.disabled = false;
    applyAgentVisibility();
    updateFillHint();
  }
  const visibleList = filteredProfiles.slice(0, 20);
  const recentCount = !q ? recentIds.filter((id) => allProfiles.some((x) => x.id === id)).length : 0;
  updateListMeta(q, visibleList.length, filteredProfiles.length);
  profilesEl.innerHTML = visibleList.map((p, i) => {
    const initials = escapeHtml(initialsFor(p.name));
    const isSelected = (selectedProfile == null ? void 0 : selectedProfile.id) === p.id;
    const isFocused = i === focusIdx;
    const phone = getPhone(p);
    const name = escapeHtml(p.name || "Unknown");
    const phoneLabel = phone ? `\u{1F4F1} ${escapeHtml(phone)}` : "No phone on file";
    const badge = badgeHtmlFor(p);
    let label = "";
    if (!q && i === 0 && recentCount > 0) label = '<div class="section-label">Recent</div>';
    if (!q && i === recentCount && recentCount > 0) label = '<div class="section-label">All customers</div>';
    return `${label}<div class="profile-item${isSelected ? " selected" : ""}${isFocused ? " focused" : ""}" data-id="${escapeHtml(p.id)}" data-idx="${i}" role="option" aria-selected="${isSelected}">
      <div class="avatar">${initials}</div>
      <div class="profile-body">
        <div class="profile-name-row">
          <div class="profile-name">${name}</div>
          ${badge}
        </div>
        <div class="profile-phone">${phoneLabel}</div>
      </div>
      <div class="profile-check" aria-hidden="true">\u2713</div>
    </div>`;
  }).join("");
  profilesEl.querySelectorAll(".profile-item").forEach((el) => {
    el.addEventListener("click", () => {
      selectProfile(el.dataset.id);
    });
  });
  const focused = profilesEl.querySelector(".profile-item.focused") || profilesEl.querySelector(".profile-item.selected");
  if (focused && typeof focused.scrollIntoView === "function") {
    focused.scrollIntoView({ block: "nearest" });
  }
}
function selectProfile(id) {
  selectedProfile = allProfiles.find((p) => p.id === id) || null;
  fillBtn.disabled = !selectedProfile;
  applyAgentVisibility();
  if (selectedProfile) {
    chrome.storage.session.set({ _cc_selected: id });
    prefetchProfile(id);
  } else {
    chrome.storage.session.remove("_cc_selected").catch(() => {
    });
  }
  updateFillHint();
  renderProfiles(searchEl.value);
}
let _prefetchedProfile = null;
async function prefetchProfile(id) {
  try {
    const data = await chrome.storage.local.get(["backendUrl", "accessToken"]);
    const r = await fetch(data.backendUrl + "/profiles/" + id, {
      headers: { Authorization: "Bearer " + data.accessToken }
    });
    if (r.ok) _prefetchedProfile = await r.json();
  } catch (e) {
  }
}
searchEl.addEventListener("keydown", (e) => {
  var _a2;
  const max = Math.min(filteredProfiles.length, 20);
  if (e.key === "ArrowDown") {
    e.preventDefault();
    focusIdx = Math.min(focusIdx + 1, max - 1);
    renderProfiles(searchEl.value);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    focusIdx = Math.max(focusIdx - 1, 0);
    renderProfiles(searchEl.value);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (selectedProfile && (focusIdx === -1 || ((_a2 = filteredProfiles[focusIdx]) == null ? void 0 : _a2.id) === selectedProfile.id)) {
      fillBtn.click();
    } else if (focusIdx >= 0 && filteredProfiles[focusIdx]) {
      selectProfile(filteredProfiles[focusIdx].id);
      focusIdx = filteredProfiles.findIndex((p) => p.id === (selectedProfile == null ? void 0 : selectedProfile.id));
    } else if (filteredProfiles.length === 1) {
      selectProfile(filteredProfiles[0].id);
    }
  } else if (e.key === "Escape") {
    e.preventDefault();
    if (String(searchEl.value || "").trim()) {
      clearSearch();
    } else if (selectedProfile) {
      clearSelection();
    }
  }
});
searchClear == null ? void 0 : searchClear.addEventListener("click", (e) => {
  e.preventDefault();
  clearSearch();
});
function applyWssPresence(wss, fallbackName) {
  if (!connDot || !connText) return;
  const state = wss && wss.state || "disconnected";
  connDot.classList.remove("green", "amber");
  if (state === "connected") {
    connDot.classList.add("green");
    connText.textContent = fallbackName || "Connected";
    connText.title = wss.sessionId ? "Live \xB7 session " + wss.sessionId : "Live connection";
  } else if (state === "connecting" || state === "reconnecting") {
    connDot.classList.add("amber");
    connText.textContent = state === "connecting" ? "Connecting\u2026" : "Reconnecting\u2026";
    connText.title = wss && wss.lastError || state;
  } else if (state === "suspended") {
    connText.textContent = "Server busy";
    connText.title = wss && wss.lastError || "server unavailable";
  } else if (fallbackName) {
    connDot.classList.add("amber");
    connText.textContent = fallbackName;
    connText.title = wss && wss.lastError || "Signed in \u2014 live link reconnecting";
  } else {
    connText.textContent = "Offline";
    connText.title = "Not connected to CyberControl";
  }
}
async function refreshWssPresence(fallbackName) {
  try {
    const st = await chrome.storage.local.get("ccWssState");
    applyWssPresence(st.ccWssState, fallbackName);
    chrome.runtime.sendMessage({ type: "ENSURE_WSS" }, () => {
      void chrome.runtime.lastError;
    });
  } catch (e) {
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.ccWssState) return;
  const name = (connText.textContent || "").trim();
  const keepName = name && !/^(Checking|Connecting|Reconnecting|Connected|Offline|Server busy|Signed out|Session expired|Not connected)/i.test(
    name
  );
  applyWssPresence(changes.ccWssState.newValue, keepName ? name : null);
});
async function init() {
  document.getElementById("ver").textContent = "v" + VERSION;
  updateFillHint();
  syncActivePage();
  await loadRecents();
  const data = await chrome.storage.local.get(["accessToken", "backendUrl", "user"]);
  if (!data.accessToken || !data.backendUrl) {
    connText.textContent = "Signed out";
    showLoginEmpty("Sign in required", "Open CyberControl Hub and sign in as the caf\xE9 account, then reopen this panel.");
    return;
  }
  let operatorName = null;
  try {
    const r = await fetch(data.backendUrl + "/auth/me", {
      headers: { "Authorization": "Bearer " + data.accessToken }
    });
    if (r.ok) {
      const user = await r.json();
      operatorName = (user.name || user.email || "Operator").split(" ")[0];
      connDot.classList.add("green");
      connText.textContent = operatorName;
      setLocked(false);
    } else {
      connText.textContent = "Session expired";
      showLoginEmpty("Session expired", "Sign in again in CyberControl Hub, then reopen this panel.");
      return;
    }
  } catch (e) {
    connText.textContent = "Offline";
    setLocked(false);
  }
  await refreshWssPresence(operatorName);
  await loadProfilesHttps(data);
}
async function loadProfilesHttps(data) {
  const creds = data || await chrome.storage.local.get(["accessToken", "backendUrl"]);
  if (!creds.accessToken || !creds.backendUrl) {
    showLoginEmpty("Sign in required", "Open CyberControl Hub and sign in as the caf\xE9 account, then reopen this panel.");
    return;
  }
  profilesEl.innerHTML = '<div class="empty"><div class="empty-title">Loading customers\u2026</div>Getting your caf\xE9 list ready.</div>';
  if (listCountEl) listCountEl.textContent = "";
  if (listHintEl) listHintEl.textContent = "";
  let profiles = null;
  let transport = "wss";
  try {
    const wssResp = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, error: "wss_profiles_timeout" }), 12e3);
      chrome.runtime.sendMessage({ type: "WSS_PROFILES_LIST" }, (resp) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(resp || { ok: false, error: "no_response" });
      });
    });
    if ((wssResp == null ? void 0 : wssResp.ok) && Array.isArray(wssResp.profiles)) {
      profiles = wssResp.profiles;
      transport = "wss";
    } else {
      throw new Error((wssResp == null ? void 0 : wssResp.error) || "wss_profiles_failed");
    }
  } catch (e) {
    console.warn("[CC] WSS profiles failed, HTTPS fallback:", e.message);
    transport = "https-fallback";
    profilesEl.innerHTML = '<div class="empty"><div class="empty-title">Still loading\u2026</div>Connection busy \u2014 trying another path.</div>';
    try {
      const r = await fetch(String(creds.backendUrl).replace(/\/$/, "") + "/profiles", {
        headers: { Authorization: "Bearer " + creds.accessToken }
      });
      const text = await r.text();
      let body;
      try {
        body = text ? JSON.parse(text) : [];
      } catch (e2) {
        throw new Error("Bad JSON from /profiles (HTTP " + r.status + ")");
      }
      if (!r.ok) throw new Error(body && body.error || "HTTP " + r.status);
      profiles = Array.isArray(body) ? body : body && body.profiles || [];
    } catch (e2) {
      console.error("[CC] loadProfiles", e2);
      profilesEl.innerHTML = `<div class="empty"><div class="empty-title">Couldn\u2019t load customers</div>Check your connection, then retry.<br><span class="pt-muted" style="font-size:11px">${escapeHtml(e2.message)}</span><br><button type="button" id="retry-profiles">Retry</button></div>`;
      const btn = document.getElementById("retry-profiles");
      if (btn) btn.onclick = () => loadProfilesHttps();
      return;
    }
  }
  allProfiles = profiles || [];
  const sess = await chrome.storage.session.get("_cc_selected");
  if (sess._cc_selected) {
    selectedProfile = allProfiles.find((p) => p.id === sess._cc_selected) || null;
    fillBtn.disabled = !selectedProfile;
    applyAgentVisibility();
  }
  updateFillHint();
  if (!allProfiles.length) {
    profilesEl.innerHTML = `<div class="empty"><div class="empty-title">No customers yet</div>Open Hub, add customers for this caf\xE9, then tap Retry.<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button type="button" id="retry-profiles">Retry</button><button type="button" class="primary" id="open-hub-customers">Open Hub</button></div></div>`;
    const btn = document.getElementById("retry-profiles");
    if (btn) btn.onclick = () => loadProfilesHttps();
    const hubBtn = document.getElementById("open-hub-customers");
    if (hubBtn) hubBtn.onclick = () => openHub("/");
    return;
  }
  renderProfiles("");
  searchEl.focus();
  console.log("[CC] profiles loaded via", transport, allProfiles.length);
}
searchEl.addEventListener("input", () => {
  focusIdx = -1;
  updateSearchClear();
  renderProfiles(searchEl.value);
});
const undoBtn = document.getElementById("undo-btn");
const REQUIRED_FIELDS = ["name", "father_name", "dob", "gender", "aadhaar_number", "address", "state", "pincode"];
function getCompleteness(profile) {
  const data = (profile == null ? void 0 : profile.data) || profile || {};
  let filled = 0;
  const missing = [];
  for (const key of REQUIRED_FIELDS) {
    const val = data[key];
    const v = val && typeof val === "object" ? val.value : val;
    if (v) filled++;
    else missing.push(key.replace(/_/g, " "));
  }
  return { percent: Math.round(filled / REQUIRED_FIELDS.length * 100), missing };
}
updateSearchClear();
updateFillHint();
fillBtn.addEventListener("click", async () => {
  var _a2;
  if (!selectedProfile) return;
  const full = (_prefetchedProfile == null ? void 0 : _prefetchedProfile.id) === selectedProfile.id ? _prefetchedProfile : selectedProfile;
  const { percent, missing } = getCompleteness(full);
  if (percent < 100 && missing.length > 0) {
    const warn = document.getElementById("completeness-warn");
    warn.innerHTML = `<span>\u26A0\uFE0F ${percent}% complete \u2014 will skip: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "..." : ""}</span><button id="fill-anyway">Fill anyway</button>`;
    warn.style.display = "flex";
    await new Promise((resolve) => {
      document.getElementById("fill-anyway").onclick = () => {
        warn.style.display = "none";
        resolve();
      };
    });
  }
  fillBtn.disabled = true;
  fillBtn.innerHTML = "<span>Filling\u2026</span>";
  resultsEl.style.display = "none";
  undoBtn.style.display = "none";
  showProgress("Preparing\u2026");
  saveRecent(selectedProfile.id);
  try {
    const tab = await getActivePageTab();
    if (!(tab == null ? void 0 : tab.id)) {
      showStatus("No active tab", CC.danger);
      hideProgress();
      return;
    }
    if (!tab.url || tab.url.startsWith("chrome") || tab.url.startsWith("edge://")) {
      showStatus("Open a form page first", CC.danger);
      hideProgress();
      return;
    }
    _lastFillTabId = tab.id;
    try {
      _lastFillHost = new URL(tab.url).hostname.replace(/^www\./, "");
    } catch (e) {
      _lastFillHost = null;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const snapshot = {};
        document.querySelectorAll("input, select, textarea").forEach((el, idx) => {
          const key = el.id || el.name || el.getAttribute("formcontrolname") || `anon_${idx}`;
          let selector = "";
          if (el.id) selector = `#${CSS.escape(el.id)}`;
          else if (el.name) selector = `[name="${CSS.escape(el.name)}"]`;
          else if (el.getAttribute("formcontrolname")) {
            selector = `[formcontrolname="${CSS.escape(el.getAttribute("formcontrolname"))}"]`;
          }
          snapshot[key] = { value: el.value, type: el.type, selector };
        });
        window.__ccUndoSnapshot = snapshot;
      }
    });
    const data = await chrome.storage.local.get(["backendUrl", "accessToken"]);
    let fullProfile = (_prefetchedProfile == null ? void 0 : _prefetchedProfile.id) === selectedProfile.id ? _prefetchedProfile : selectedProfile;
    if (fullProfile === selectedProfile) {
      try {
        const fr = await fetch(data.backendUrl + "/profiles/" + selectedProfile.id, {
          headers: { Authorization: "Bearer " + data.accessToken }
        });
        if (fr.ok) fullProfile = await fr.json();
      } catch (e) {
        console.warn("[CC] full profile fetch failed:", e.message);
      }
    }
    selectedProfile = fullProfile;
    if (!((_a2 = globalThis.CcFillOrchestrator) == null ? void 0 : _a2.runProductFill)) {
      showStatus("Fill orchestrator not loaded", CC.danger);
      hideProgress();
      return;
    }
    const fillOut = await globalThis.CcFillOrchestrator.runProductFill({
      tabId: tab.id,
      profile: selectedProfile,
      backendUrl: data.backendUrl,
      accessToken: data.accessToken,
      runtimeVersion: VERSION,
      executionPreference: modeSelect ? modeSelect.value : "AUTO",
      onProgress: (text, pct) => updateProgress(text, pct)
    });
    const filled = fillOut.filled || 0;
    const failed = fillOut.failed || 0;
    const skipped = fillOut.skipped || 0;
    const records = fillOut.records || [];
    window._lastFilledRecords = records.filter((r) => r.result === "filled");
    showResults(filled, skipped, failed, records.filter((r) => r.result !== "filled"));
    undoBtn.style.display = filled > 0 ? "block" : "none";
    const statusColor = !fillOut.ok || failed ? CC.danger : fillOut.observationError ? CC.danger : CC.success;
    const errApi = globalThis.CcRuntimeErrors;
    let statusMsg = fillOut.operatorMessage || ((errApi == null ? void 0 : errApi.operatorMessageFor) ? errApi.operatorMessageFor(fillOut.error, null) : fillOut.error || "Fill finished");
    if (errApi == null ? void 0 : errApi.sanitizeOperatorDetail) {
      const sanitized = errApi.sanitizeOperatorDetail(statusMsg);
      if (sanitized) statusMsg = fillOut.operatorMessage || sanitized;
    }
    showStatus(statusMsg, statusColor);
  } catch (e) {
    const errApi = globalThis.CcRuntimeErrors;
    const msg = (errApi == null ? void 0 : errApi.operatorMessageFor) ? errApi.operatorMessageFor("gateway_error", null) : "Something went wrong while filling.";
    showStatus(msg, CC.danger);
  } finally {
    fillBtn.disabled = !selectedProfile;
    fillBtn.innerHTML = FILL_BTN_LABEL;
    hideProgress();
  }
});
undoBtn.addEventListener("click", async () => {
  if (!_lastFillTabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: _lastFillTabId },
      func: () => {
        const snapshot = window.__ccUndoSnapshot || {};
        for (const [key, info] of Object.entries(snapshot)) {
          const el = document.querySelector(info.selector);
          if (el) {
            el.value = info.value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }
    });
    undoBtn.style.display = "none";
    resultsEl.style.display = "none";
    showStatus("\u21A9 Fill undone", CC.success);
  } catch (e) {
    showStatus("Undo failed: " + e.message, CC.danger);
  }
});
document.getElementById("open-btn").addEventListener("click", () => {
  openHub("/");
});
let _pendingPlan = null;
async function injectDriversInto(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      files: ["autofill/plugins/network-monitor.js"]
    });
  } catch (e) {
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [
      "autofill/plugins/interface.js",
      "autofill/plugins/cascade-select.js",
      "autofill/plugins/ng-dropdown.js",
      "autofill/plugins/button-click.js",
      "autofill/plugins/keystroke-input.js",
      "drivers/dispatch.js",
      "drivers/dom.js",
      "drivers/input.js",
      "drivers/select.js",
      "drivers/interaction.js"
    ]
  });
}
agentBtn.addEventListener("click", async () => {
  if (!selectedProfile) return;
  await refreshLegacyFillGate();
  if (!allowLegacyClientFill) {
    showStatus("Legacy Agent disabled. Use Fill Form (side panel).", CC.warning);
    return;
  }
  agentBtn.disabled = true;
  agentBtn.textContent = "\u{1F916} ...";
  showStatus("Snapshotting page + planning\u2026", CC.info);
  try {
    const data = await chrome.storage.local.get(["accessToken", "backendUrl"]);
    const tab = await getActivePageTab();
    if (!(tab == null ? void 0 : tab.id)) throw new Error("No active page tab");
    await injectDriversInto(tab.id);
    const [{ result: pageData }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        if (typeof cc === "undefined") return { error: "drivers not injected" };
        const snap = await cc.do({ name: "dom.snapshot", args: { kinds: ["input", "select", "textarea", "button", "checkbox", "radio"], limit: 200 } });
        const drivers = cc.listDrivers();
        return { snapshot: snap.result, drivers };
      }
    });
    if (pageData.error) throw new Error(pageData.error);
    let fullProfile = selectedProfile;
    try {
      const detailRes = await fetch(data.backendUrl + "/profiles/" + selectedProfile.id, {
        headers: { "Authorization": "Bearer " + data.accessToken }
      });
      if (detailRes.ok) {
        const detail = await detailRes.json();
        fullProfile = typeof detail === "string" ? JSON.parse(detail) : detail;
      }
    } catch (e) {
    }
    const META_KEYS = /* @__PURE__ */ new Set(["id", "displayLabel", "displayName", "relationship", "createdAt", "updatedAt", "workspaceId", "createdBy", "updatedBy", "documentId", "confirmedAt", "confirmedBy", "source", "confidence"]);
    const flatProfile = {};
    const raw = fullProfile.data || fullProfile;
    for (const [k, v] of Object.entries(raw)) {
      if (META_KEYS.has(k)) continue;
      flatProfile[k] = v && typeof v === "object" && "value" in v ? v.value : v;
    }
    if (fullProfile.name) flatProfile.name = flatProfile.name || fullProfile.name;
    if (fullProfile.phone) flatProfile.phone = flatProfile.phone || fullProfile.phone;
    const goal = `Fill the form on ${pageData.snapshot.url} for the customer profile. Skip submit/continue buttons.`;
    const planRes = await fetch(data.backendUrl + "/agent/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + data.accessToken },
      body: JSON.stringify({
        goal,
        snapshot: pageData.snapshot,
        drivers: pageData.drivers,
        profile: flatProfile,
        profileId: selectedProfile.id,
        hostname: new URL(tab.url).hostname
      })
    });
    if (!planRes.ok) {
      const errBody = await planRes.text();
      let pretty = "";
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.status === 413) pretty = "Form too big for one prompt \u2014 try again on a shorter section";
        else if (parsed.status === 429) pretty = "AI rate-limited \u2014 wait 30s and retry";
        else if (parsed.status === 400) pretty = "AI rejected schema \u2014 extension version mismatch?";
        else pretty = parsed.error || errBody.slice(0, 100);
      } catch (e) {
        pretty = errBody.slice(0, 120);
      }
      throw new Error("plan " + planRes.status + ": " + pretty);
    }
    const plan = await planRes.json();
    if (!plan.actions || plan.actions.length === 0) {
      showStatus("Agent returned 0 actions. Check console for raw response.", CC.warning);
      console.log("[CC agent] empty plan, raw:", plan);
      agentBtn.textContent = "\u{1F916}";
      applyAgentVisibility();
      return;
    }
    _pendingPlan = { plan, snapshot: pageData.snapshot, tab, profile: flatProfile };
    renderPlan(plan.actions);
    agentPanel.style.display = "block";
    showStatus(`Agent proposed ${plan.actions.length} actions (${plan.durationMs}ms, ${plan.model}). Review + execute.`, CC.success);
  } catch (e) {
    showStatus("Agent error: " + e.message, CC.danger);
    console.error("[CC agent]", e);
  } finally {
    agentBtn.textContent = "\u{1F916}";
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
  }).join("");
}
agentCancelBtn.addEventListener("click", () => {
  agentPanel.style.display = "none";
  _pendingPlan = null;
});
agentExecuteBtn.addEventListener("click", async () => {
  if (!_pendingPlan) return;
  const { plan, snapshot, tab } = _pendingPlan;
  agentExecuteBtn.disabled = true;
  agentExecuteBtn.textContent = "...";
  showStatus("Executing " + plan.actions.length + " actions\u2026", CC.info);
  try {
    const data = await chrome.storage.local.get(["accessToken", "backendUrl"]);
    const [{ result: execResult }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [plan.actions],
      func: async (actions) => {
        if (typeof cc === "undefined") return { error: "drivers not loaded" };
        return await cc.run(actions);
      }
    });
    if (execResult.error) throw new Error(execResult.error);
    const okCount = execResult.steps.filter((s) => s.ok).length;
    showStatus(`Done: ${okCount}/${execResult.steps.length} actions succeeded`, execResult.ok ? CC.success : CC.warning);
    agentActionsEl.innerHTML = plan.actions.map((a, i) => {
      const r = execResult.steps[i];
      const ok = r && r.ok;
      const color = ok ? "hsl(158 60% 28%)" : "hsl(0 65% 45%)";
      const summary = (r == null ? void 0 : r.error) || ((r == null ? void 0 : r.result) ? JSON.stringify(r.result).slice(0, 80) : "?");
      const args = JSON.stringify(a.args).slice(0, 60);
      return `<div class="agent-step">
        <span style="color:${color}">${ok ? "\u2713" : "\u2717"}</span>
        <span class="name">${a.name}</span>
        <span class="args">${args}</span>
        <div class="n" style="padding-left:16px;font-size:10px;margin-top:2px">${summary}</div>
      </div>`;
    }).join("");
    const [{ result: snapAfter }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => (await cc.do({ name: "dom.snapshot", args: {} })).result
    });
    fetch(data.backendUrl + "/agent/trace", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + data.accessToken },
      body: JSON.stringify({
        goal: "agent execute",
        plan,
        results: execResult,
        snapshotBefore: snapshot,
        snapshotAfter: snapAfter,
        profileId: selectedProfile == null ? void 0 : selectedProfile.id,
        profile: (_pendingPlan == null ? void 0 : _pendingPlan.profile) || null,
        formKey: plan.formKey || null
      })
    }).catch((e) => console.warn("[CC agent] trace persist failed:", e));
    agentExecuteBtn.textContent = "\u2713 Done";
    setTimeout(() => {
      agentExecuteBtn.textContent = "\u25B6 Execute";
    }, 3e3);
    _pendingPlan = null;
  } catch (e) {
    showStatus("Execute error: " + e.message, CC.danger);
    console.error("[CC agent execute]", e);
  } finally {
    agentExecuteBtn.disabled = false;
    agentExecuteBtn.textContent = "\u25B6 Execute";
  }
});
init();
