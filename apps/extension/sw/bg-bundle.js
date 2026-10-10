/**
 * AUTO-GENERATED — do not edit.
 * Source: @cc/background
 * Rebuild: pnpm --filter cybercontrol-extension build
 */
if (globalThis["__CC_BG_BUNDLE_LOADED"]) { /* already loaded */ }
else {
globalThis["__CC_BG_BUNDLE_LOADED"] = true;

/* ==== auth/src/auth.ts ==== */
var DEFAULT_PUBLIC_DOMAIN = "cybercontrol.fun";
function resolveTrustedFrontendOrigins() {
  if (Array.isArray(globalThis.__CC_TRUSTED_FRONTEND_ORIGINS) && globalThis.__CC_TRUSTED_FRONTEND_ORIGINS.length) {
    return globalThis.__CC_TRUSTED_FRONTEND_ORIGINS.slice();
  }
  var origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ];
  try {
    if (typeof globalThis.__CC_APP_ORIGIN === "string" && globalThis.__CC_APP_ORIGIN) {
      origins.unshift(String(globalThis.__CC_APP_ORIGIN).replace(/\/$/, ""));
    } else {
      var pubDomain = typeof globalThis.__CC_PUBLIC_DOMAIN === "string" && globalThis.__CC_PUBLIC_DOMAIN ? String(globalThis.__CC_PUBLIC_DOMAIN).replace(/^\./, "") : DEFAULT_PUBLIC_DOMAIN;
      origins.unshift("https://app." + pubDomain);
    }
  } catch (_) {
  }
  return origins;
}
var CC_TRUSTED_FRONTEND_ORIGINS = resolveTrustedFrontendOrigins();
var CC_TRUSTED_ONLY_TYPES = { CONNECT: 1, OPEN_AND_DISPATCH: 1, DISPATCH_JOB_DIRECT: 1 };
async function isLegacyClientFillAllowed() {
  return false;
}
function legacyClientFillDenied(pathName) {
  if (typeof CcLegacyFillGate !== "undefined" && CcLegacyFillGate.legacyClientFillDenied) {
    return CcLegacyFillGate.legacyClientFillDenied(pathName);
  }
  return {
    ok: false,
    code: "legacy_client_fill_disabled",
    error: (pathName || "legacy client fill") + " is disabled (Phase 0). Use side-panel Fill."
  };
}
function ccSenderOrigin(sender) {
  if (!sender) return "";
  if (sender.origin) return sender.origin;
  try {
    return sender.url ? new URL(sender.url).origin : "";
  } catch (e) {
    return "";
  }
}
function ccIsTrustedFrontend(sender) {
  return CC_TRUSTED_FRONTEND_ORIGINS.indexOf(ccSenderOrigin(sender)) !== -1;
}
globalThis.CC_TRUSTED_FRONTEND_ORIGINS = CC_TRUSTED_FRONTEND_ORIGINS;
globalThis.CC_TRUSTED_ONLY_TYPES = CC_TRUSTED_ONLY_TYPES;
globalThis.isLegacyClientFillAllowed = isLegacyClientFillAllowed;
globalThis.legacyClientFillDenied = legacyClientFillDenied;
globalThis.ccSenderOrigin = ccSenderOrigin;
globalThis.ccIsTrustedFrontend = ccIsTrustedFrontend;

/* ==== label-utils/src/label-utils.ts ==== */
const BG_SEMANTIC_ALIASES = {
  "full name": "name",
  "candidate name": "name",
  "applicant name": "name",
  "student name": "name",
  "name of candidate": "name",
  "name of applicant": "name",
  "candidates name": "name",
  "applicants name": "name",
  "date of birth": "dob",
  "birth date": "dob",
  "dob": "dob",
  "date of birth ddmmyyyy": "dob",
  "fathers name": "father_name",
  "father name": "father_name",
  "fathers husbands name": "father_name",
  "mothers name": "mother_name",
  "mother name": "mother_name",
  "aadhaar no": "aadhaar_number",
  "aadhaar number": "aadhaar_number",
  "aadhar no": "aadhaar_number",
  "pan no": "pan_number",
  "pan number": "pan_number",
  "pan card": "pan_number",
  "mobile no": "mobile",
  "mobile number": "mobile",
  "phone no": "mobile",
  "contact no": "mobile",
  "email id": "email",
  "email address": "email",
  "permanent address": "address",
  "residential address": "address",
  "correspondence address": "address",
  "pin code": "pincode",
  "postal code": "pincode",
  "pincode": "pincode",
  "state name": "state",
  "district name": "district"
};
function normalizeLabel(label) {
  return (label || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}
function getSemanticKey(label) {
  const n = normalizeLabel(label);
  return BG_SEMANTIC_ALIASES[n] || n;
}
async function getSemanticKeyResolved(label) {
  const n = normalizeLabel(label);
  if (BG_SEMANTIC_ALIASES[n]) return BG_SEMANTIC_ALIASES[n];
  if (typeof ccKnowledgeSync !== "undefined") {
    const aliases = await ccKnowledgeSync.getCachedAliases();
    for (const [canonical, variants] of Object.entries(aliases)) {
      if (variants.includes(n) || variants.includes(label)) return canonical;
    }
  }
  return n;
}
function calcConfidence(fills, corrections) {
  if (fills + corrections === 0) return 0.5;
  return fills / (fills + corrections * 3);
}
globalThis.BG_SEMANTIC_ALIASES = BG_SEMANTIC_ALIASES;
globalThis.normalizeLabel = normalizeLabel;
globalThis.getSemanticKey = getSemanticKey;
globalThis.getSemanticKeyResolved = getSemanticKeyResolved;
globalThis.calcConfidence = calcConfidence;

/* ==== wss-manager/src/wss-manager.ts ==== */
function handleWssMessage(msg, sendResponse) {
  if (msg.type === "GET_WSS_STATE") {
    if (typeof CcWssSession !== "undefined" && CcWssSession.getState) {
      CcWssSession.getState().then((st) => sendResponse({ ok: true, wss: st })).catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }
    sendResponse({ ok: false, error: "wss_session_missing" });
    return true;
  }
  if (msg.type === "ENSURE_WSS") {
    ccEnsureWss("ENSURE_WSS").then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === "FILL_DEBUG") {
    forwardFillDebug(msg);
    sendResponse({ ok: true, forwarded: true });
    return true;
  }
  if (msg.type === "WSS_FILL_REQUEST") {
    (async () => {
      var _a, _b, _c, _d;
      try {
        await ccEnsureWss("WSS_FILL_REQUEST");
        const deadline = Date.now() + 8e3;
        while (Date.now() < deadline) {
          const st = (_b = (_a = CcWssSession == null ? void 0 : CcWssSession.getClient) == null ? void 0 : _a.call(CcWssSession)) == null ? void 0 : _b.state;
          if (st === "connected") break;
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!(CcWssSession == null ? void 0 : CcWssSession.requestFillPlan)) throw new Error("wss_session_missing");
        if (((_d = (_c = CcWssSession.getClient) == null ? void 0 : _c.call(CcWssSession)) == null ? void 0 : _d.state) !== "connected") throw new Error("wss_not_connected");
        const resp = await CcWssSession.requestFillPlan({
          formKey: msg.formKey,
          semanticFormKey: msg.semanticFormKey || msg.formKey,
          hostname: msg.hostname,
          fields: msg.fields || [],
          profile: msg.profile || {},
          profileId: msg.profileId || null
        }, 25e3);
        if ((resp == null ? void 0 : resp.type) === "error") throw new Error(resp.message || resp.code || "fill_request_error");
        sendResponse({ ok: true, plan: resp, transport: "wss" });
      } catch (e) {
        console.warn("[CC] WSS_FILL_REQUEST failed:", e.message);
        sendResponse({ ok: false, error: e.message || String(e), transport: "wss_failed" });
      }
    })();
    return true;
  }
  if (msg.type === "WSS_FILL_SESSION") {
    (async () => {
      var _a, _b;
      try {
        await ccEnsureWss("WSS_FILL_SESSION");
        const deadline = Date.now() + 5e3;
        while (Date.now() < deadline) {
          if (((_b = (_a = CcWssSession == null ? void 0 : CcWssSession.getClient) == null ? void 0 : _a.call(CcWssSession)) == null ? void 0 : _b.state) === "connected") break;
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!(CcWssSession == null ? void 0 : CcWssSession.postFillSession)) throw new Error("wss_session_missing");
        const resp = await CcWssSession.postFillSession({
          hostname: msg.hostname,
          url: msg.url,
          semanticFormKey: msg.semanticFormKey || msg.formKey,
          formKey: msg.formKey,
          runtimeVersion: msg.runtimeVersion,
          totalFilled: msg.totalFilled,
          totalFailed: msg.totalFailed,
          totalSkipped: msg.totalSkipped,
          records: msg.records || []
        }, 2e4);
        if ((resp == null ? void 0 : resp.type) === "error") throw new Error(resp.message || resp.code || "fill_session_error");
        sendResponse({ ok: true, id: resp.id, transport: "wss" });
      } catch (e) {
        console.warn("[CC] WSS_FILL_SESSION failed:", e.message);
        sendResponse({ ok: false, error: e.message || String(e), transport: "wss_failed" });
      }
    })();
    return true;
  }
  if (msg.type === "WSS_PROFILES_LIST") {
    (async () => {
      try {
        await ccEnsureWss("WSS_PROFILES_LIST");
        if (!(CcWssSession == null ? void 0 : CcWssSession.requestProfilesList)) throw new Error("wss_session_missing");
        const resp = await CcWssSession.requestProfilesList(15e3);
        if ((resp == null ? void 0 : resp.type) === "error") throw new Error(resp.message || resp.code || "profiles_list_error");
        const profiles = Array.isArray(resp.profiles) ? resp.profiles : [];
        sendResponse({ ok: true, profiles, transport: "wss", count: profiles.length });
      } catch (e) {
        console.warn("[CC] WSS_PROFILES_LIST failed:", e.message);
        sendResponse({ ok: false, error: e.message || String(e), transport: "wss_failed" });
      }
    })();
    return true;
  }
  return false;
}
globalThis.handleWssMessage = handleWssMessage;

/* ==== bridge/src/bridge.ts ==== */
const _pendingPortMessages = /* @__PURE__ */ new Map();
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "cc_bridge") return;
  let connected = true;
  const portTrusted = ccIsTrustedFrontend(port.sender);
  port.onDisconnect.addListener(() => {
    connected = false;
  });
  port.onMessage.addListener((msg) => {
    const { _reqId, ...payload } = msg;
    handleBridgeMessage(payload, (response) => {
      if (connected) {
        try {
          port.postMessage({ _cc_reply: true, _reqId, response });
        } catch (e) {
        }
      }
    }, portTrusted);
  });
});
function handleBridgeMessage(msg, sendResponse, trusted) {
  if (CC_TRUSTED_ONLY_TYPES[msg.type] && !trusted) {
    sendResponse({ ok: false, error: "untrusted sender" });
    return;
  }
  if (msg.type === "CONNECT") {
    const { token, refreshToken, user, backendUrl } = msg;
    if (!token || !backendUrl) {
      sendResponse({ ok: false, error: "missing token or backendUrl" });
      return;
    }
    chrome.storage.local.set({ accessToken: token, refreshToken: refreshToken || null, user: user || null, backendUrl }, () => {
      ccEnsureWss("CONNECT");
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    });
    return;
  }
  if (msg.type === "PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return;
  }
  if (msg.type === "OPEN_AND_DISPATCH") {
    const { envelope, formUrl } = msg;
    if (!envelope || !formUrl) {
      sendResponse({ ok: false, error: "missing envelope or formUrl" });
      return;
    }
    isLegacyClientFillAllowed().then((allowed) => {
      if (!allowed) {
        sendResponse(legacyClientFillDenied("OPEN_AND_DISPATCH"));
        return;
      }
      chrome.tabs.create({ url: formUrl, active: true }, (tab) => {
        if (!(tab == null ? void 0 : tab.id)) {
          sendResponse({ ok: false, error: "failed to open tab" });
          return;
        }
        chrome.storage.local.set({ _cc_pending_job: { envelope, tabId: tab.id, ts: Date.now() } });
        sendResponse({ ok: true, tabId: tab.id });
      });
    }).catch((e) => sendResponse({ ok: false, error: e.message || "legacy gate failed" }));
    return;
  }
  sendResponse({ ok: false, error: "unknown type: " + msg.type });
}
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  var _a;
  if (CC_TRUSTED_ONLY_TYPES[msg.type] && !ccIsTrustedFrontend(sender)) {
    sendResponse({ ok: false, error: "untrusted sender" });
    return true;
  }
  if (msg.type === "CONNECT") {
    const { token, refreshToken, user, backendUrl } = msg;
    if (!token || !backendUrl) {
      sendResponse({ ok: false, error: "missing token or backendUrl" });
      return;
    }
    chrome.storage.local.set({
      accessToken: token,
      refreshToken: refreshToken || null,
      user: user || null,
      backendUrl
    }, () => {
      ccEnsureWss("CONNECT_EXTERNAL");
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    });
    return true;
  }
  if (msg.type === "PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return true;
  }
  if (msg.type === "DISPATCH_JOB_DIRECT") {
    const { envelope, tabId } = msg;
    if (!envelope || !tabId) {
      sendResponse({ ok: false, error: "missing envelope or tabId" });
      return true;
    }
    isLegacyClientFillAllowed().then((allowed) => {
      if (!allowed) {
        const denied = legacyClientFillDenied("DISPATCH_JOB_DIRECT");
        console.warn("[CC]", denied.error);
        sendResponse(denied);
        return;
      }
      sendResponse({ ok: true, accepted: true });
      runJobDispatch(envelope, tabId).catch((e) => console.error("[CC] direct dispatch error:", e));
    }).catch((e) => sendResponse({ ok: false, error: e.message || "legacy gate failed" }));
    return true;
  }
  if (msg.type === "OPEN_AND_DISPATCH") {
    const { envelope, formUrl } = msg;
    if (!envelope || !formUrl) {
      sendResponse({ ok: false, error: "missing envelope or formUrl" });
      return true;
    }
    isLegacyClientFillAllowed().then((allowed) => {
      if (!allowed) {
        sendResponse(legacyClientFillDenied("OPEN_AND_DISPATCH"));
        return;
      }
      chrome.tabs.create({ url: formUrl, active: true }, (tab) => {
        if (!(tab == null ? void 0 : tab.id)) {
          sendResponse({ ok: false, error: "failed to open tab" });
          return;
        }
        chrome.storage.local.set({ _cc_pending_job: { envelope, tabId: tab.id, ts: Date.now() } });
        sendResponse({ ok: true, tabId: tab.id });
      });
    }).catch((e) => sendResponse({ ok: false, error: e.message || "legacy gate failed" }));
    return true;
  }
  if (msg.type === "CONTENT_READY") {
    const tabId = (_a = sender == null ? void 0 : sender.tab) == null ? void 0 : _a.id;
    if (!tabId) {
      sendResponse({ ok: true });
      return true;
    }
    chrome.storage.local.get("_cc_pending_job", ({ _cc_pending_job: job }) => {
      if (!job || job.tabId !== tabId) {
        sendResponse({ ok: true });
        return;
      }
      chrome.storage.local.remove("_cc_pending_job");
      isLegacyClientFillAllowed().then((allowed) => {
        if (!allowed) {
          console.warn("[CC] CONTENT_READY: dropping pending job \xE2\u20AC\u201D legacy client fill disabled");
          sendResponse(legacyClientFillDenied("CONTENT_READY pending job"));
          return;
        }
        console.log("[CC] CONTENT_READY: dispatching pending job to tab", tabId);
        runJobDispatch(job.envelope, tabId).catch((e) => console.error("[CC] pending dispatch error:", e));
        sendResponse({ ok: true, dispatching: true });
      }).catch((e) => sendResponse({ ok: false, error: e.message || "legacy gate failed" }));
    });
    return true;
  }
  sendResponse({ ok: false, error: "unknown message type" });
  return true;
});

/* ==== job-dispatch/src/job-dispatch.ts ==== */
async function runJobDispatch(envelope, tabId) {
  var _a;
  if (!await isLegacyClientFillAllowed()) {
    const denied = legacyClientFillDenied("runJobDispatch");
    console.warn("[CC]", denied.error);
    return;
  }
  const { jobId, sessionId, payload } = envelope;
  const profile = (payload == null ? void 0 : payload.profile) || {};
  const { backendUrl, accessToken } = await chrome.storage.local.get(["backendUrl", "accessToken"]);
  if (!backendUrl || !accessToken) {
    console.error("[CC] DISPATCH_JOB: not authenticated");
    return;
  }
  async function reportProgress(body) {
    try {
      await fetch(backendUrl + "/jobs/" + jobId + "/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + accessToken },
        body: JSON.stringify({ sessionId, ...body })
      });
    } catch (e) {
      console.warn("[CC] progress report failed:", e.message);
    }
  }
  try {
    if (typeof ccKnowledgeSync !== "undefined") {
      const cachedMappings = await ccKnowledgeSync.getCachedFieldMappings();
      const cachedDerivRules = await ccKnowledgeSync.getCachedDerivationRules();
      if (cachedMappings.length > 0 || cachedDerivRules.length > 0) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (mappings, derivRules) => {
            if (mappings.length) window._ccServerFieldMappings = mappings;
            if (derivRules.length) window._ccServerDerivationRules = derivRules;
          },
          args: [cachedMappings, cachedDerivRules]
        });
      }
    }
    await chrome.scripting.executeScript({ target: { tabId }, files: ["shared-bundle.js", "autofill/plugins-bundle.js", "drivers-bundle.js", "autofill/extractor-bundle.js", "autofill/mapper-bundle.js", "autofill/executor-bundle.js"] });
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      args: [profile, backendUrl, accessToken],
      func: async (prof, bUrl, aToken) => {
        var _a2, _b, _c;
        const headers = { "Content-Type": "application/json", "Authorization": "Bearer " + aToken };
        const { formFields, formKey, semanticFormKey } = extractFormFieldsWithFingerprint();
        if (!formFields.length) return { ok: false, error: "no fields detected" };
        const pk = semanticFormKey || formKey;
        let saved = null;
        try {
          const r2 = await fetch(bUrl + "/mappings/" + pk, { headers });
          const d = await r2.json();
          if (d && typeof d === "object" && Object.keys(d).length > 0) saved = d;
        } catch (e) {
        }
        let mapping = {}, fbs = {};
        const gsk = (l) => (l || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
        const partish = (f) => {
          const lbl = String(f.label || "").trim();
          const blob = `${f.label || ""} ${f.name || ""} ${f.id || ""}`.toLowerCase();
          if (/^dd$|^day$|^mm$|^month$|^yyyy$|^year$/i.test(lbl)) return true;
          if (/last\s*4|last\s*digits|dob_?day|dob_?month|dob_?year/i.test(blob)) return true;
          const ml = Number(f.maxLength || f.maxlength || 0);
          return ml > 0 && ml <= 4;
        };
        const compound = (k) => /^(dob|phone|mobile|email|email_id|name|aadhaar_number)$/i.test(String(k || ""));
        const atomOf = (k) => {
          const e = prof[k];
          if (e == null) return null;
          const v = typeof e === "object" && e && "value" in e ? e.value : e;
          return v == null || String(v).trim() === "" ? null : String(v).trim();
        };
        if (saved) {
          for (const f of formFields) {
            const sk = gsk(f.label);
            const s = saved[sk];
            if (!s || !s.profileKey) continue;
            const atom = atomOf(s.profileKey);
            if (!atom) continue;
            const rel = s.relation && s.relation.kind ? s.relation : null;
            if ((!rel || rel.kind === "unknown") && partish(f) && compound(s.profileKey)) continue;
            if (rel && rel.kind === "last_n" && rel.n) {
              mapping[f.selector] = { value: atom.slice(-Number(rel.n)), type: f.type, profileKey: s.profileKey, relation: rel };
            } else if (rel && rel.kind === "first_n" && rel.n) {
              mapping[f.selector] = { value: atom.slice(0, Number(rel.n)), type: f.type, profileKey: s.profileKey, relation: rel };
            } else if (rel && rel.kind === "date_part" && rel.part) {
              const m = String(atom).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/) || String(atom).match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
              if (!m) continue;
              const parts = m[1].length === 4 ? { year: m[1], month: m[2].padStart(2, "0"), day: m[3].padStart(2, "0") } : { day: m[1].padStart(2, "0"), month: m[2].padStart(2, "0"), year: m[3] };
              mapping[f.selector] = { value: parts[rel.part], type: f.type, profileKey: s.profileKey, relation: rel };
            } else if (!rel || rel.kind === "identity") {
              if (partish(f) && compound(s.profileKey)) continue;
              mapping[f.selector] = { value: atom, type: f.type, profileKey: s.profileKey, relation: rel || { kind: "identity" } };
            } else {
              continue;
            }
            fbs[f.selector] = { label: f.label, semanticKey: sk, profileKey: s.profileKey, relation: mapping[f.selector].relation, source: "saved" };
          }
        }
        const um = formFields.filter((f) => !mapping[f.selector]);
        if (um.length > 0) {
          const fz = fuzzyMatch(um, prof);
          for (const [s, v] of Object.entries(fz)) {
            mapping[s] = v;
            const ff = formFields.find((x) => x.selector === s);
            if (ff) fbs[s] = { label: ff.label, source: "fuzzy" };
          }
        }
        let adp = {};
        try {
          const r2 = await fetch(bUrl + "/adapters/" + location.hostname, { headers });
          adp = await r2.json();
        } catch (e) {
        }
        const filled = await fillFormFieldsSequential(mapping, fbs, adp);
        const records = Array.isArray(window.__ccFillRecords) ? window.__ccFillRecords : [];
        const failed = records.filter((r2) => r2.result === "skipped" || r2.result === "failed" || r2.result === "reset").length;
        try {
          const updates = {};
          for (let i = 0; i < formFields.length; i++) {
            const f = formFields[i];
            const sk = gsk(f.label);
            if (!sk || sk.length < 2) continue;
            const info = fbs[f.selector];
            const profileKey = (info == null ? void 0 : info.profileKey) || ((_a2 = mapping[f.selector]) == null ? void 0 : _a2.profileKey) || (mapping[f.selector] ? (_b = Object.entries(prof).find(([, v]) => v === mapping[f.selector].value)) == null ? void 0 : _b[0] : null) || null;
            const wasFilled = records.some((r2) => r2.selector === f.selector && r2.result === "filled");
            const relation = (info == null ? void 0 : info.relation) || ((_c = mapping[f.selector]) == null ? void 0 : _c.relation) || (profileKey ? { kind: partish(f) && compound(profileKey) ? "unknown" : "identity" } : { kind: "unknown" });
            updates[sk] = { profileKey, relation, label: f.label, type: f.type, order: i, options: f.options || null, delta: { fills: wasFilled ? 1 : 0, corrections: 0 } };
          }
          if (Object.keys(updates).length > 0) {
            await fetch(bUrl + "/mappings/" + pk, {
              method: "POST",
              headers,
              body: JSON.stringify({ updates, meta: { hostname: location.hostname, title: document.title.slice(0, 80), lastSeen: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), syncVersion: 2 } })
            });
          }
        } catch (e) {
          console.warn("[CC] bg mapping sync failed:", e.message);
        }
        return { ok: true, filled: filled || 0, failed, fields: Object.keys(mapping).length, records, primaryKey: pk };
      }
    });
    const r = ((_a = result == null ? void 0 : result[0]) == null ? void 0 : _a.result) || { ok: false };
    if (r.ok) {
      await reportProgress({
        totalFilled: r.filled,
        totalFailed: r.failed,
        records: r.records || [],
        status: "needs_review"
      });
      console.log("[CC] DISPATCH_JOB completed: filled=" + r.filled + " failed=" + r.failed);
    } else {
      await reportProgress({ status: "failed", failReason: r.error || "execution failed" });
      console.error("[CC] DISPATCH_JOB failed:", r.error);
    }
  } catch (e) {
    await reportProgress({ status: "failed", failReason: e.message });
    console.error("[CC] DISPATCH_JOB exception:", e);
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  var _a, _b, _c, _d, _e;
  if (area !== "local") return;
  if (changes.accessToken || changes.backendUrl) {
    if (((_a = changes.accessToken) == null ? void 0 : _a.newValue) === void 0 && ((_b = changes.backendUrl) == null ? void 0 : _b.newValue) === void 0) {
    }
    const tokenGone = changes.accessToken && changes.accessToken.newValue == null;
    if (tokenGone && typeof CcWssSession !== "undefined") {
      CcWssSession.disconnectWss("logout");
    } else {
      ccEnsureWss("storage_credentials");
    }
  }
  if (!((_c = changes._cc_teach_job) == null ? void 0 : _c.newValue)) return;
  const job = changes._cc_teach_job.newValue;
  if (job.ts === _lastTeachTs) return;
  if (_teachRunning) return;
  _lastTeachTs = job.ts;
  console.log("[CC] SW teach job received:", job.hostname, (_d = job.fields) == null ? void 0 : _d.length, "fields, tabId:", job.tabId);
  chrome.storage.local.set({ _cc_teach_debug: "received:" + job.hostname + ":" + ((_e = job.fields) == null ? void 0 : _e.length) + ":tab:" + job.tabId });
  chrome.storage.local.remove("_cc_teach_job");
  runTeachSession(job).catch(console.error);
});
function startKeepalive() {
  if (_keepaliveInterval) return;
  _keepaliveInterval = setInterval(() => chrome.storage.local.set({ _sw_ping: Date.now() }), 2e4);
}
function stopKeepalive() {
  clearInterval(_keepaliveInterval);
  _keepaliveInterval = null;
}

/* ==== teach/src/teach.ts ==== */
var _keepaliveInterval = null;
async function runTeachSession({ tabId, fields, backendUrl, hostname, llmKey, groqKey, llmBaseUrl, llmModel }) {
  var _a, _b, _c, _d, _e, _f;
  llmKey = llmKey || groqKey || "";
  _teachRunning = true;
  startKeepalive();
  if (!tabId || tabId === 0) {
    try {
      const foundTabs = await chrome.tabs.query({ url: "*://" + hostname + "/*" });
      if (foundTabs.length > 0) {
        tabId = foundTabs[0].id;
        console.log("[CC] resolved tabId from hostname:", tabId);
      }
    } catch (e) {
      console.warn("[CC] tab query failed:", e.message);
    }
  }
  if (!tabId) {
    console.error("[CC] no tabId, aborting teach");
    _teachRunning = false;
    stopKeepalive();
    return;
  }
  const TEACHABLE_TYPES = ["ng-dropdown", "mat-select", "mat-radio"];
  const teachable = fields.filter((f) => TEACHABLE_TYPES.includes(f.type));
  if (teachable.length === 0) {
    notifyPopup({ type: "TEACH_PROGRESS", status: "No interactive fields need teaching.", done: true });
    return;
  }
  for (const field of teachable) {
    const label = normalizeFieldLabel(field.label);
    notifyPopup({ type: "TEACH_PROGRESS", status: `\u{1F916} Auto-teaching "${label}" with AI...`, done: false });
    if (llmKey) {
      const profileValue = field.profileValue || "";
      const autoSuccess = await llmAutoTeach(tabId, { ...field, profileValue }, llmKey, backendUrl, hostname, llmBaseUrl, llmModel);
      if (autoSuccess) {
        notifyPopup({ type: "TEACH_PROGRESS", status: `\u2713 AI learned "${label}" automatically!`, done: false });
        await sleep(800);
        continue;
      }
      console.log("[CC] LLM auto-teach failed, falling back to manual");
    }
    notifyPopup({ type: "TEACH_PROGRESS", status: `\xE2\u0161\xA0 Teach: "${label}" \xE2\u20AC\u201D click the dropdown, then select a value`, done: false });
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        sessionStorage.removeItem("_cc_teach_result");
        sessionStorage.removeItem("_cc_teach_active");
      }
    }).catch(() => {
    });
    let fieldWithHint = { ...field };
    if (llmKey && !field.componentClass) {
      try {
        const domSnap = await chrome.scripting.executeScript({
          target: { tabId },
          func: (lbl) => {
            const snippets = [];
            document.querySelectorAll("div,span,ul,ng-select,app-dropdown,[class*=select],[class*=dropdown],[class*=picker]").forEach((el) => {
              if (el.tagName === "SELECT" || el.tagName === "INPUT") return;
              const text = el.textContent.slice(0, 100);
              if (text.toLowerCase().includes(lbl.toLowerCase().slice(0, 10))) {
                snippets.push(el.outerHTML.slice(0, 300));
              }
            });
            return snippets.slice(0, 5).join("\n---\n");
          },
          args: [field.label]
        }).catch(() => [{ result: "" }]);
        const domText = ((_a = domSnap == null ? void 0 : domSnap[0]) == null ? void 0 : _a.result) || "";
        if (domText) {
          const aiRes = await fetch(llmBaseUrl || "https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": "Bearer " + llmKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: llmModel || "meta-llama/llama-3.3-70b-instruct",
              messages: [{ role: "user", content: 'Identify the dropdown component class and trigger selector from these HTML snippets near field "' + field.label + '". Reply ONLY as JSON: {"componentClass":"...","triggerSelector":"..."}. Snippets: ' + domText }],
              max_tokens: 80
            })
          }).then((r) => r.json()).catch(() => null);
          const txt = ((_d = (_c = (_b = aiRes == null ? void 0 : aiRes.choices) == null ? void 0 : _b[0]) == null ? void 0 : _c.message) == null ? void 0 : _d.content) || "";
          const m = txt.match(/\{[^}]+\}/);
          if (m) {
            try {
              const hint = JSON.parse(m[0]);
              if (hint.componentClass) fieldWithHint = { ...field, componentClass: hint.componentClass, aiTrigger: hint.triggerSelector };
              console.log("[CC] AI hint:", JSON.stringify(hint));
            } catch (e) {
            }
          }
        }
      } catch (e) {
        console.warn("[CC] AI identify failed:", e.message);
      }
    }
    console.log("[CC] injecting teachOneField into tabId:", tabId, "field:", fieldWithHint.label);
    const injectResult = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: teachOneField,
      args: [fieldWithHint]
    }).then((r) => {
      var _a2;
      console.log("[CC] inject OK, result:", (_a2 = r == null ? void 0 : r[0]) == null ? void 0 : _a2.result);
      return r;
    }).catch((e) => {
      console.error("[CC] teachOneField inject failed:", e.message);
      chrome.storage.local.set({ _cc_teach_debug: "inject failed: " + e.message });
      notifyPopup({ type: "TEACH_PROGRESS", status: "Inject error: " + e.message, done: true });
      return null;
    });
    if (!injectResult) {
      _teachRunning = false;
      stopKeepalive();
      return;
    }
    const adapter = await pollTeachResult(tabId, 45e3);
    console.log("[CC] pollTeachResult returned:", JSON.stringify(adapter));
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        sessionStorage.removeItem("_cc_teach_active");
        sessionStorage.removeItem("_cc_teach_result");
      }
    }).catch(() => {
    });
    if (!adapter) {
      notifyPopup({ type: "TEACH_PROGRESS", status: `\xE2\u0161\xA0 Skipped "${label}" (timeout)`, done: false });
      continue;
    }
    if (adapter.error) {
      notifyPopup({ type: "TEACH_PROGRESS", status: `\xE2\u0161\xA0 "${label}": ${adapter.error}`, done: false });
      continue;
    }
    const saveUrl = `${backendUrl}/adapters/${hostname}`;
    console.log("[CC] saving adapter to:", saveUrl, "adapter:", JSON.stringify(adapter).slice(0, 200));
    const saveRes = await fetch(saveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adapter)
    }).catch((e) => {
      console.error("[CC] fetch failed:", e.message);
      return { ok: false, _err: e.message };
    });
    console.log("[CC] save response:", saveRes == null ? void 0 : saveRes.ok, saveRes == null ? void 0 : saveRes.status);
    if (saveRes == null ? void 0 : saveRes.ok) {
      notifyPopup({ type: "TEACH_PROGRESS", status: `\xE2\u0153\u201C Learned "${label}"`, done: false });
    } else {
      const errText = (_f = await ((_e = saveRes == null ? void 0 : saveRes.text) == null ? void 0 : _e.call(saveRes).catch(() => "network error"))) != null ? _f : "network error";
      notifyPopup({ type: "TEACH_PROGRESS", status: `\xE2\u0161\xA0 Save failed for "${label}": ${errText}`, done: false });
    }
    await sleep(600);
  }
  stopKeepalive();
  _teachRunning = false;
  notifyPopup({ type: "TEACH_PROGRESS", status: "Teaching complete! Adapters saved.", done: true });
}
async function llmAutoTeach(tabId, field, llmKey, backendUrl, hostname, llmBaseUrl, llmModel) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
  try {
    const snap1 = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (f) => {
        var _a2;
        const compClass = f.componentClass || "ng-dropdown";
        const root = document.querySelectorAll("div." + compClass)[(_a2 = f.domIndex) != null ? _a2 : 0] || document.querySelector('[class*="dropdown"],[class*="select"],[class*="picker"]');
        if (!root) return null;
        root.scrollIntoView({ block: "center" });
        return { html: root.outerHTML.slice(0, 1500), rect: JSON.stringify(root.getBoundingClientRect()) };
      },
      args: [field]
    }).catch(() => null);
    const closedHtml = (_b = (_a = snap1 == null ? void 0 : snap1[0]) == null ? void 0 : _a.result) == null ? void 0 : _b.html;
    if (!closedHtml) return false;
    const prompt1 = `You are analyzing a custom dropdown component in a government form.
Field label: "${field.label}"
Profile value to select: "${field.profileValue || ""}"
Component HTML (closed state):
${closedHtml}

Reply with ONLY valid JSON (no markdown):
{"triggerSelector":"CSS selector to click to open dropdown","componentClass":"root element class name"}`;
    const r1 = await fetch(llmBaseUrl || "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + llmKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model: llmModel || "meta-llama/llama-3.3-70b-instruct", messages: [{ role: "user", content: prompt1 }], max_tokens: 100 })
    }).then((r) => r.json()).catch(() => null);
    const txt1 = ((_f = (_e = (_d = (_c = r1 == null ? void 0 : r1.choices) == null ? void 0 : _c[0]) == null ? void 0 : _d.message) == null ? void 0 : _e.content) == null ? void 0 : _f.trim()) || "";
    const m1 = txt1.match(/\{[^}]+\}/);
    if (!m1) return false;
    let hint;
    try {
      hint = JSON.parse(m1[0]);
    } catch (e) {
      return false;
    }
    if (!hint.triggerSelector || ["#", "select", "input", "label", ".", "*"].includes(hint.triggerSelector) || hint.triggerSelector.length < 2) return false;
    console.log("[CC] Groq identified trigger:", hint.triggerSelector);
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (sel) => {
        var _a2;
        (_a2 = document.querySelector(sel)) == null ? void 0 : _a2.click();
      },
      args: [hint.triggerSelector]
    }).catch(() => {
    });
    await sleep(800);
    const snap2 = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (f, trigSel) => {
        var _a2, _b2, _c2;
        const compClass = f.componentClass || "ng-dropdown";
        const root = document.querySelectorAll("div." + compClass)[(_a2 = f.domIndex) != null ? _a2 : 0];
        const overlay = Array.from(document.querySelectorAll('ul,div[class*="dropdown-list"],div[class*="options"],div[class*="menu"]')).find((el) => el.offsetParent !== null && el.querySelectorAll('li,[class*="option"]').length > 0);
        return {
          rootHtml: ((_b2 = root == null ? void 0 : root.outerHTML) == null ? void 0 : _b2.slice(0, 800)) || "",
          overlayHtml: ((_c2 = overlay == null ? void 0 : overlay.outerHTML) == null ? void 0 : _c2.slice(0, 1200)) || ""
        };
      },
      args: [field, hint.triggerSelector]
    }).catch(() => null);
    const openState = (_g = snap2 == null ? void 0 : snap2[0]) == null ? void 0 : _g.result;
    if (!openState) return false;
    const prompt2 = `Custom dropdown is now open. Select the option matching "${field.profileValue || field.label}".
Root HTML: ${openState.rootHtml}
Options overlay HTML: ${openState.overlayHtml}

Reply with ONLY valid JSON:
{"optionSelector":"CSS selector for each option li/div","optionText":"exact text of option to click","verifySelector":"CSS selector showing selected value after close"}`;
    const r2 = await fetch(llmBaseUrl || "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + llmKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model: llmModel || "meta-llama/llama-3.3-70b-instruct", messages: [{ role: "user", content: prompt2 }], max_tokens: 150 })
    }).then((r) => r.json()).catch(() => null);
    const txt2 = ((_k = (_j = (_i = (_h = r2 == null ? void 0 : r2.choices) == null ? void 0 : _h[0]) == null ? void 0 : _i.message) == null ? void 0 : _j.content) == null ? void 0 : _k.trim()) || "";
    const m2 = txt2.match(/\{[^}]+\}/s);
    if (!m2) return false;
    let hint2;
    try {
      hint2 = JSON.parse(m2[0]);
    } catch (e) {
      return false;
    }
    console.log("[CC] Groq identified option:", hint2.optionText, "selector:", hint2.optionSelector);
    const clicked = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (optSel, optText) => {
        const opts = Array.from(document.querySelectorAll(optSel));
        const opt = opts.find((o) => o.textContent.trim() === optText) || opts.find((o) => o.textContent.trim().includes(optText.slice(0, 10)));
        if (opt) {
          opt.click();
          return opt.textContent.trim();
        }
        return null;
      },
      args: [hint2.optionSelector || "li", hint2.optionText || ""]
    }).catch(() => null);
    const clickedText = (_l = clicked == null ? void 0 : clicked[0]) == null ? void 0 : _l.result;
    if (!clickedText) return false;
    console.log("[CC] Groq clicked option:", clickedText);
    await sleep(600);
    const verified = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (verifySel, expected) => {
        const el = document.querySelector(verifySel);
        return el ? el.textContent.trim() : null;
      },
      args: [hint2.verifySelector || hint.triggerSelector, clickedText]
    }).catch(() => null);
    const verifiedText = (_m = verified == null ? void 0 : verified[0]) == null ? void 0 : _m.result;
    console.log("[CC] Groq verify:", verifiedText);
    const adapter = {
      componentClass: hint.componentClass || field.componentClass || "ng-dropdown",
      triggerSelector: hint.triggerSelector,
      optionSelector: hint2.optionSelector || "li",
      verifySelector: hint2.verifySelector || hint.triggerSelector,
      optionsContainer: "",
      learnedBy: "llm"
    };
    await fetch(`${backendUrl}/adapters/${hostname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adapter)
    }).catch(() => {
    });
    console.log("[CC] Groq auto-teach saved adapter for", hostname);
    return true;
  } catch (e) {
    console.warn("[CC] llmAutoTeach error:", e.message);
    return false;
  }
}
function teachOneField(field) {
  if (sessionStorage.getItem("_cc_teach_active") === "1") return;
  sessionStorage.removeItem("_cc_teach_result");
  sessionStorage.setItem("_cc_teach_active", "1");
  let root = null;
  const compClass = field.componentClass || "ng-dropdown";
  if (typeof field.domIndex === "number") {
    root = document.querySelectorAll(`div.${compClass}`)[field.domIndex] || null;
    if (!root) {
      const allDropdowns = Array.from(document.querySelectorAll(
        `div.${compClass},[class*=dropdown],[class*=select],[class*=picker]`
      )).filter((el) => el.tagName !== "SELECT" && el.tagName !== "INPUT");
      root = allDropdowns[field.domIndex] || null;
    }
  }
  if (!root && field.selector && !field.selector.startsWith("form-field-")) {
    root = document.querySelector(field.selector);
  }
  if (!root) {
    const baseLabel = field.label.replace(/\s*\(\d+\)$/, "").replace(/[\n*]/g, "").trim().slice(0, 15);
    document.querySelectorAll(`div.${compClass}, mat-select, [role=combobox]`).forEach((el) => {
      var _a, _b;
      const lbl = ((_b = (_a = el.querySelector(".label, mat-label, label")) == null ? void 0 : _a.textContent) == null ? void 0 : _b.trim()) || el.getAttribute("aria-label") || "";
      if (lbl && baseLabel && lbl.includes(baseLabel)) root = el;
    });
  }
  if (!root) {
    let _onIdentify2 = function(e) {
      let el = e.target;
      let found = null;
      for (let i = 0; i < 8 && el && el !== document.body; i++) {
        const cls = (el.className || "").toLowerCase();
        if (el.tagName !== "SELECT" && el.tagName !== "INPUT" && (cls.includes("dropdown") || cls.includes("select") || cls.includes("picker") || cls.includes("combo") || el.querySelector('li,[class*="option"]'))) {
          found = el;
          break;
        }
        el = el.parentElement;
      }
      root = found || e.target.closest("div") || e.target;
      document.removeEventListener("click", _onIdentify2, true);
      try {
        document.body.removeChild(_host);
      } catch (e2) {
      }
      _runTeach(root);
    };
    var _onIdentify = _onIdentify2;
    const _host = document.createElement("div");
    _host.style.cssText = "position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);pointer-events:none;background:#7c3aed;color:white;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:bold;font-family:sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.7);white-space:nowrap;border:2px solid #a855f7;";
    _host.textContent = `\xE2\u0161\xA0 Click the dropdown for ${field.label} to identify it`;
    document.body.appendChild(_host);
    document.addEventListener("click", _onIdentify2, true);
    setTimeout(() => {
      document.removeEventListener("click", _onIdentify2, true);
      try {
        document.body.removeChild(_host);
      } catch (e) {
      }
      sessionStorage.removeItem("_cc_teach_active");
    }, 3e4);
    return;
  }
  let triggerSelector = field.aiTrigger || ".value-area";
  let triggerCaptured = false;
  _runTeach(root);
  function _runTeach(root2) {
    var _a;
    const labelText = (((_a = root2.querySelector(".label, label, mat-label")) == null ? void 0 : _a.textContent) || "").trim();
    const getDisplayText = () => {
      const ngValue = root2.querySelector(".ng-value-label,.ng-value .ng-star-inserted,.ng-value");
      if (ngValue) return ngValue.textContent.trim();
      const el = root2.querySelector(".select-type") || root2.querySelector(".value-area") || root2.querySelector('[class*="selection__rendered"]') || root2.querySelector('[class*="filter-option"]') || root2.querySelector('[class*="chosen-single"] span') || root2.querySelector(".p-dropdown-label") || root2.querySelector('[class*="selectmenu-text"]') || root2.querySelector('[class*="selected-value"]') || root2.querySelector('[class*="trigger"] span:first-child') || root2.querySelector('[class*="select-value"] span') || root2.querySelector('[class*="mat-select-value"] span');
      if (el) return el.textContent.trim();
      const matVal = root2.querySelector(".mat-select-value-text,.mat-mdc-select-value-text");
      if (matVal) return matVal.textContent.trim();
      const clone = root2.cloneNode(true);
      clone.querySelectorAll('ul,ol,[class*="options"],[class*="dropdown-list"],[class*="drop-list"],[class*="menu"],[class*="items"]').forEach((e) => e.remove());
      clone.querySelectorAll('[class*="placeholder"]:not([class*="value"])').forEach((e) => e.remove());
      return clone.textContent.replace(labelText, "").trim();
    };
    const initialValue = getDisplayText();
    const verifySel = (() => {
      const el = root2.querySelector(".select-type") || root2.querySelector(".value-area");
      if (!el) return "";
      const cls = (el.className || "").trim().split(/\s+/).filter((c) => c && !c.startsWith("ng-") && !c.startsWith("_ng"))[0];
      return cls ? "." + cls : "";
    })();
    console.log("[CC] teachOneField: root=", root2.className, "initialValue=", JSON.stringify(initialValue), "triggerSel=", triggerSelector);
    root2.scrollIntoView({ behavior: "smooth", block: "center" });
    const origOutline = root2.style.outline;
    const origBoxShadow = root2.style.boxShadow;
    root2.style.outline = "2px solid #dc2626";
    root2.style.boxShadow = "0 0 0 4px rgba(220,38,38,0.3)";
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);pointer-events:none;background:#dc2626;color:white;padding:10px 24px;border-radius:6px;font-size:15px;font-weight:bold;font-family:sans-serif;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.7);border:2px solid #ff6b6b;";
    host.textContent = "\xE2\u0161\xA0 Click the highlighted dropdown, then select a value";
    const badge = host;
    document.body.appendChild(host);
    const posInterval = setInterval(() => {
    }, 5e3);
    function cleanup() {
      clearInterval(posInterval);
      clearInterval(statePoller);
      _mo.disconnect();
      document.removeEventListener("click", onTriggerClick, true);
      try {
        document.body.removeChild(host);
      } catch (e) {
      }
      root2.style.outline = origOutline;
      root2.style.boxShadow = origBoxShadow;
      sessionStorage.removeItem("_cc_teach_active");
    }
    function onTriggerClick(e) {
      if (triggerCaptured) return;
      const rr = root2.getBoundingClientRect();
      const inArea = e.clientX >= rr.left - 20 && e.clientX <= rr.right + 20 && e.clientY >= rr.top - 20 && e.clientY <= rr.bottom + 200;
      if (!inArea) return;
      const el = e.target;
      const cls = (el.className || "").trim().split(/\s+/).filter((c) => c && !c.startsWith("ng-") && !c.startsWith("_ng"))[0];
      if (cls) triggerSelector = "." + cls;
      triggerCaptured = true;
      badge.textContent = "\xE2\u0161\xA0 Select an option from the list";
      document.removeEventListener("click", onTriggerClick, true);
    }
    document.addEventListener("click", onTriggerClick, true);
    let _teachOverlayRoot = null;
    const _teachAddedNodes = [];
    const _teachMo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1) _teachAddedNodes.push(n);
        });
      }
    });
    function isVisibleTeach(node) {
      const r = node.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const s = getComputedStyle(node);
      return s.display !== "none" && s.visibility !== "hidden";
    }
    document.addEventListener("click", function _teachOverlayCapture(e) {
      const rr = root2.getBoundingClientRect();
      const inArea = e.clientX >= rr.left - 20 && e.clientX <= rr.right + 20 && e.clientY >= rr.top - 20 && e.clientY <= rr.bottom + 200;
      if (!inArea) return;
      _teachAddedNodes.length = 0;
      _teachMo.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        _teachMo.disconnect();
        for (const node of _teachAddedNodes) {
          if (!isVisibleTeach(node)) continue;
          const lis = Array.from(node.querySelectorAll("li")).filter((o) => isVisibleTeach(o));
          if (lis.length > 0) {
            _teachOverlayRoot = node;
            break;
          }
        }
        console.log("[CC] teach overlay root:", _teachOverlayRoot ? _teachOverlayRoot.tagName + "." + _teachOverlayRoot.className.slice(0, 40) : "none");
      }, 1e3);
      document.removeEventListener("click", _teachOverlayCapture, true);
    }, true);
    let _domChanged = false;
    const _mo = new MutationObserver(() => {
      _domChanged = true;
    });
    _mo.observe(root2, { childList: true, subtree: true, characterData: true, attributes: true });
    let statePoller = setInterval(() => {
      if (!_domChanged && getDisplayText() === initialValue) return;
      const currentValue = getDisplayText();
      const placeholder = /^(select|choose|--|please|select option|none|pick|-+)/i;
      if (currentValue && currentValue !== initialValue && !placeholder.test(currentValue)) {
        clearInterval(statePoller);
        _teachMo.disconnect();
        cleanup();
        let optionSelector = "li";
        let containerSel = "";
        const searchRoot = _teachOverlayRoot || document;
        searchRoot.querySelectorAll('li, [class*="option"], [class*="item"]').forEach((el) => {
          if (!isVisibleTeach(el) && el.offsetParent === null) return;
          if (el.textContent.trim() === currentValue) {
            const cls = (el.className || "").trim().split(/\s+/).filter((c) => c && !c.startsWith("ng-") && !c.startsWith("_ng"))[0];
            optionSelector = cls ? el.tagName.toLowerCase() + "." + cls : el.tagName.toLowerCase();
            if (_teachOverlayRoot) {
              const tag = _teachOverlayRoot.tagName.toLowerCase();
              const ccls = (_teachOverlayRoot.className || "").trim().split(/\s+/)[0] || "";
              containerSel = tag + (ccls ? "." + ccls : "");
            } else {
              let c = el.parentElement;
              for (let i = 0; i < 6 && c && c !== document.body; i++) {
                const tag = c.tagName.toLowerCase();
                const ccls = (c.className || "").trim().split(/\s+/)[0] || "";
                if (tag === "app-dropdown" || tag === "ul" || ccls.includes("option") || ccls.includes("dropdown") || ccls.includes("list") || ccls.includes("menu")) {
                  containerSel = tag + (ccls ? "." + ccls : "");
                  break;
                }
                c = c.parentElement;
              }
            }
          }
        });
        const result = {
          componentClass: root2.className.trim().split(/\s+/)[0] || "ng-dropdown",
          triggerSelector,
          optionsContainer: containerSel,
          optionSelector,
          verifySelector: verifySel,
          learnedValue: currentValue
        };
        console.log("[CC] teachOneField result:", JSON.stringify(result));
        sessionStorage.setItem("_cc_teach_result", JSON.stringify(result));
      }
    }, 200);
    setTimeout(() => {
      cleanup();
    }, 45e3);
  }
}
function pollTeachResult(tabId, timeout) {
  return new Promise((resolve) => {
    let elapsed = 0;
    const interval = setInterval(async () => {
      var _a;
      elapsed += 500;
      const r = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: () => {
          const v = sessionStorage.getItem("_cc_teach_result");
          if (v) {
            sessionStorage.removeItem("_cc_teach_result");
            return JSON.parse(v);
          }
          return null;
        }
      }).catch(() => [{ result: null }]);
      const result = (_a = r == null ? void 0 : r[0]) == null ? void 0 : _a.result;
      if (result || elapsed >= timeout) {
        clearInterval(interval);
        resolve(result || null);
      }
    }, 500);
  });
}
function notifyPopup(msg) {
  chrome.storage.local.set({ _cc_teach_progress: msg }).catch(() => {
  });
}
function normalizeFieldLabel(label) {
  return (label || "").replace(/\n/g, " ").replace(/^\d+\.\s*/, "").replace(/^[a-z]\.\s*/i, "").replace(/\*$/, "").trim();
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ==== composer/src/composer.ts ==== */
var _a, _b, _c;
console.log("[CC] bg-bundle loaded v" + (((_b = (_a = chrome.runtime).getManifest) == null ? void 0 : _b.call(_a).version) || "?"));
let _teachRunning = false;
let _lastTeachTs = 0;
if (typeof ccKnowledgeSync !== "undefined") ccKnowledgeSync.startPeriodicSync();
if (typeof ccStartAuthRefreshTimers === "function") ccStartAuthRefreshTimers();
if ((_c = chrome.sidePanel) == null ? void 0 : _c.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  });
}
chrome.runtime.onInstalled.addListener(() => {
  var _a2;
  if ((_a2 = chrome.sidePanel) == null ? void 0 : _a2.setPanelBehavior) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  });
  ccEnsureWss("onInstalled");
});
chrome.runtime.onStartup.addListener(() => ccEnsureWss("onStartup"));
try {
  chrome.alarms.create("cc_wss_keepalive", { periodInMinutes: 1 });
} catch (e) {
}
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "cc_wss_keepalive") {
    ccEnsureWss("keepalive_alarm");
    return;
  }
  if (alarm.name === "cc_teach_wake") {
    const { _cc_teach_job: job } = await chrome.storage.local.get("_cc_teach_job");
    if (!job || job.ts === _lastTeachTs || _teachRunning) return;
    _lastTeachTs = job.ts;
    chrome.storage.local.remove("_cc_teach_job");
    runTeachSession(job).catch(console.error);
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  var _a2, _b2;
  if (area !== "local") return;
  if (changes.accessToken || changes.backendUrl) {
    const tokenGone = ((_a2 = changes.accessToken) == null ? void 0 : _a2.newValue) == null;
    if (tokenGone && typeof CcWssSession !== "undefined") CcWssSession.disconnectWss("logout");
    else ccEnsureWss("storage_credentials");
  }
  if (!((_b2 = changes._cc_teach_job) == null ? void 0 : _b2.newValue)) return;
  const job = changes._cc_teach_job.newValue;
  if (job.ts === _lastTeachTs || _teachRunning) return;
  _lastTeachTs = job.ts;
  chrome.storage.local.set({ _cc_teach_debug: "received:" + job.hostname + ":tab:" + job.tabId });
  chrome.storage.local.remove("_cc_teach_job");
  runTeachSession(job).catch(console.error);
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  var _a2, _b2, _c2, _d;
  const trusted = ccIsTrustedFrontend(sender);
  if (CC_TRUSTED_ONLY_TYPES[msg.type] && !trusted) {
    console.warn("[CC] rejected " + msg.type + " from untrusted:", ccSenderOrigin(sender));
    sendResponse({ ok: false, error: "untrusted sender" });
    return true;
  }
  if (msg.type === "CONNECT" || msg.type === "PING" || msg.type === "OPEN_AND_DISPATCH") {
    handleBridgeMessage(msg, sendResponse, trusted);
    return true;
  }
  if (msg.type === "TEACH_JOB") {
    const job = msg.job;
    if (((_a2 = sender == null ? void 0 : sender.tab) == null ? void 0 : _a2.id) && (!job.tabId || job.tabId === 0)) job.tabId = sender.tab.id;
    if (job.ts === _lastTeachTs || _teachRunning) {
      sendResponse({ ok: false });
      return;
    }
    _lastTeachTs = job.ts;
    sendResponse({ ok: true });
    runTeachSession(job).catch(console.error);
  }
  if (msg.type === "AUTOFILL_TRIGGER") {
    chrome.storage.local.set({ _cc_float_trigger: { profileId: msg.profileId, tabId: (_b2 = sender == null ? void 0 : sender.tab) == null ? void 0 : _b2.id, ts: Date.now() } });
    chrome.action.openPopup().catch(() => {
    });
    sendResponse({ ok: true, status: "popup triggered" });
    return true;
  }
  if (msg.type === "GET_TAB_ID") {
    sendResponse({ tabId: (_c2 = sender == null ? void 0 : sender.tab) == null ? void 0 : _c2.id });
    return true;
  }
  if (msg.type === "DISPATCH_JOB") {
    const env = msg.envelope || msg;
    if (!env.jobId || !env.sessionId) {
      sendResponse({ ok: false, error: "missing jobId/sessionId" });
      return true;
    }
    if (env.executionType !== "form_filling") {
      sendResponse({ ok: false, error: "unsupported executionType" });
      return true;
    }
    const tabId = (_d = sender == null ? void 0 : sender.tab) == null ? void 0 : _d.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "no tab" });
      return true;
    }
    isLegacyClientFillAllowed().then((allowed) => {
      if (!allowed) {
        sendResponse(legacyClientFillDenied("DISPATCH_JOB"));
        return;
      }
      sendResponse({ ok: true, accepted: true });
      runJobDispatch(env, tabId).catch((e) => console.error("[CC] DISPATCH_JOB error:", e));
    }).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (typeof handleWssMessage === "function") {
    if (handleWssMessage(msg, sendResponse)) return true;
  }
  return true;
});

}
