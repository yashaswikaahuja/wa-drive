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
const siteIcon = document.getElementById("site-icon");
const siteName = document.getElementById("site-name");
const progressEl = document.getElementById("progress");
const progressText = document.getElementById("progress-text");
const progressInner = document.getElementById("progress-inner");
const resultsEl = document.getElementById("results");
const versionEl = document.getElementById("ver");
versionEl.textContent = "v" + VERSION;
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
    agentBtn.title = "Legacy Agent disabled (Phase 0). Use Fill Form.";
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
const KNOWN_SITES = {
  "ssc.nic.in": { icon: "\u{1F3DB}", name: "SSC" },
  "ssc.gov.in": { icon: "\u{1F3DB}", name: "SSC" },
  "rrbcdg.gov.in": { icon: "\u{1F682}", name: "RRB" },
  "nta.ac.in": { icon: "\u{1F4DD}", name: "NTA" },
  "upsc.gov.in": { icon: "\u{1F3DB}", name: "UPSC" },
  "passportindia.gov.in": { icon: "\u{1F6C2}", name: "Passport Seva" },
  "digilocker.gov.in": { icon: "\u{1F4C1}", name: "DigiLocker" }
};
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
async function detectSite() {
  try {
    const tab = await getActivePageTab();
    let host = null;
    try {
      if (tab == null ? void 0 : tab.url) host = new URL(tab.url).hostname.replace(/^www\./, "");
    } catch (e) {
    }
    clearStaleFillSummary((tab == null ? void 0 : tab.id) || null, host);
    if (!(tab == null ? void 0 : tab.url) || tab.url.startsWith("chrome") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
      siteIcon.textContent = "\u{1F310}";
      siteName.textContent = "No page detected";
      const conf = document.getElementById("site-confidence");
      if (conf) conf.style.display = "none";
      return;
    }
    if (!host) {
      try {
        host = new URL(tab.url).hostname.replace(/^www\./, "");
      } catch (e) {
      }
    }
    const match = Object.entries(KNOWN_SITES).find(([k]) => host.includes(k));
    if (match) {
      siteIcon.textContent = match[1].icon;
      siteName.textContent = match[1].name + " \u2014 " + host;
    } else {
      siteIcon.textContent = "\u{1F310}";
      siteName.textContent = host;
    }
    fetchConfidence(host);
  } catch (e) {
    siteName.textContent = "Unknown page";
  }
}
if ((_a = chrome.tabs) == null ? void 0 : _a.onActivated) {
  chrome.tabs.onActivated.addListener(() => {
    detectSite();
  });
}
if ((_b = chrome.tabs) == null ? void 0 : _b.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status === "complete" || info.url) {
      chrome.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
        if ((active == null ? void 0 : active.id) === tabId) detectSite();
      }).catch(() => {
      });
    }
  });
}
async function fetchConfidence(host) {
  const el = document.getElementById("site-confidence");
  if (!el) return;
  try {
    const data = await chrome.storage.local.get(["backendUrl", "accessToken"]);
    const r = await fetch(data.backendUrl + "/forms/confidence?hostname=" + encodeURIComponent(host), {
      headers: { Authorization: "Bearer " + data.accessToken }
    });
    if (!r.ok) return;
    const { fills, confidence } = await r.json();
    if (fills > 0) {
      el.textContent = `\u2713 filled ${fills}\xD7 by operators` + (confidence != null ? ` \xB7 ${confidence}% success` : "");
      el.style.display = "block";
    } else {
      el.textContent = `First time on this form \u2014 I'll fill what I'm sure about`;
      el.style.color = "hsl(30 10% 40%)";
      el.style.display = "block";
    }
  } catch (e) {
  }
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
    profilesEl.innerHTML = `<div class="empty">${q ? 'No match for "' + q + '"' : "No profiles found"}</div>`;
    focusIdx = -1;
    return;
  }
  if (filteredProfiles.length === 1 && q) {
    selectedProfile = filteredProfiles[0];
    focusIdx = 0;
    fillBtn.disabled = false;
    applyAgentVisibility();
  }
  const visibleList = filteredProfiles.slice(0, 20);
  const recentCount = !q ? recentIds.filter((id) => allProfiles.some((x) => x.id === id)).length : 0;
  profilesEl.innerHTML = visibleList.map((p, i) => {
    const initials = (p.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const isSelected = (selectedProfile == null ? void 0 : selectedProfile.id) === p.id;
    const isFocused = i === focusIdx;
    const phone = getPhone(p);
    let label = "";
    if (!q && i === 0 && recentCount > 0) label = '<div class="section-label">Recent</div>';
    if (!q && i === recentCount && recentCount > 0) label = '<div class="section-label">All</div>';
    return `${label}<div class="profile-item${isSelected ? " selected" : ""}${isFocused ? " focused" : ""}" data-id="${p.id}" data-idx="${i}">
      <div class="avatar">${initials}</div>
      <div>
        <div class="profile-name">${p.name || "Unknown"}</div>
        <div class="profile-phone">\u{1F4F1} ${phone}</div>
      </div>
    </div>`;
  }).join("");
  profilesEl.querySelectorAll(".profile-item").forEach((el) => {
    el.addEventListener("click", () => {
      selectProfile(el.dataset.id);
    });
  });
}
function selectProfile(id) {
  selectedProfile = allProfiles.find((p) => p.id === id) || null;
  fillBtn.disabled = !selectedProfile;
  applyAgentVisibility();
  chrome.storage.session.set({ _cc_selected: id });
  if (selectedProfile) prefetchProfile(id);
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
  }
});
function applyWssPresence(wss, fallbackName) {
  if (!connDot || !connText) return;
  const state = wss && wss.state || "disconnected";
  connDot.classList.remove("green", "amber");
  if (state === "connected") {
    connDot.classList.add("green");
    connText.textContent = "WSS \xB7 " + (fallbackName || "live");
    connText.title = wss.sessionId ? "session " + wss.sessionId : "WebSocket connected";
  } else if (state === "connecting" || state === "reconnecting") {
    connDot.classList.add("amber");
    connText.textContent = state === "connecting" ? "WSS connecting\u2026" : "WSS reconnecting\u2026";
    connText.title = wss && wss.lastError || state;
  } else if (state === "suspended") {
    connText.textContent = "WSS suspended";
    connText.title = wss && wss.lastError || "server unavailable";
  } else if (fallbackName) {
    connText.textContent = fallbackName + " \xB7 no WSS";
    connText.title = wss && wss.lastError || "WebSocket not connected";
  } else {
    connText.textContent = "WSS off";
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
  const name = (connText.textContent || "").split("\xB7")[0].trim();
  applyWssPresence(changes.ccWssState.newValue, name && !/^WSS|Not |Token|Offline/i.test(name) ? name : null);
});
async function init() {
  document.getElementById("ver").textContent = "v" + VERSION;
  detectSite();
  await loadRecents();
  const data = await chrome.storage.local.get(["accessToken", "backendUrl", "user"]);
  if (!data.accessToken || !data.backendUrl) {
    connText.textContent = "Not connected";
    profilesEl.innerHTML = '<div class="empty">Login to CyberControl first</div>';
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
    } else {
      connText.textContent = "Token expired";
      profilesEl.innerHTML = '<div class="empty">Please login again</div>';
      return;
    }
  } catch (e) {
    connText.textContent = "Offline?";
  }
  await refreshWssPresence(operatorName);
  await loadProfilesHttps(data);
}
async function loadProfilesHttps(data) {
  const creds = data || await chrome.storage.local.get(["accessToken", "backendUrl"]);
  if (!creds.accessToken || !creds.backendUrl) {
    profilesEl.innerHTML = '<div class="empty">Login to CyberControl first</div>';
    return;
  }
  profilesEl.innerHTML = '<div class="empty">Loading profiles (WSS)\u2026</div>';
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
    profilesEl.innerHTML = '<div class="empty">WSS busy \u2014 loading profiles (HTTPS)\u2026</div>';
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
      profilesEl.innerHTML = `<div class="empty">Failed to load profiles: ${e2.message}<br><button id="retry-profiles" style="margin-top:8px">Retry</button></div>`;
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
  if (!allProfiles.length) {
    profilesEl.innerHTML = `<div class="empty">No profiles in this workspace (${transport}).<br><span class="pt-muted" style="font-size:11px">Re-login as the caf\xE9 account that owns customers, or add profiles in the app.</span><br><button id="retry-profiles" style="margin-top:8px">Retry</button></div>`;
    const btn = document.getElementById("retry-profiles");
    if (btn) btn.onclick = () => loadProfilesHttps();
    return;
  }
  renderProfiles("");
  searchEl.focus();
  console.log("[CC] profiles loaded via", transport, allProfiles.length);
}
searchEl.addEventListener("input", () => {
  focusIdx = -1;
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
  fillBtn.innerHTML = "<span>Filling...</span>";
  resultsEl.style.display = "none";
  undoBtn.style.display = "none";
  showProgress("Preparing...");
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
        document.querySelectorAll("input, select, textarea").forEach((el) => {
          const key = el.id || el.name || el.getAttribute("formcontrolname");
          if (key) snapshot[key] = { value: el.value, type: el.type };
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
    fillBtn.disabled = false;
    fillBtn.innerHTML = "Fill Form";
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
document.getElementById("open-btn").addEventListener("click", async () => {
  var _a2;
  const data = await chrome.storage.local.get("backendUrl");
  const frontendUrl = ((_a2 = data.backendUrl) == null ? void 0 : _a2.includes("localhost:3000")) ? "http://localhost:5173" : (data.backendUrl || "").replace("/api", "");
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => {
    var _a3;
    return (_a3 = t.url) == null ? void 0 : _a3.startsWith(frontendUrl);
  });
  if (existing) {
    chrome.tabs.update(existing.id, { active: true });
    chrome.windows.update(existing.windowId, { focused: true });
  } else chrome.tabs.create({ url: frontendUrl || "http://localhost:5173" });
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
