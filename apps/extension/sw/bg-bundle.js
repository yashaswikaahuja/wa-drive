/**
 * AUTO-GENERATED — do not edit.
 * Source: @cc/background
 * Rebuild: pnpm --filter cybercontrol-extension build
 */

/* ==== auth/src/auth.js ==== */
/**
 * cc-background/auth — Authentication and trust guards for the service worker.
 *
 * Public API (on globalThis):
 *   isLegacyClientFillAllowed()  => Promise<boolean>
 *   legacyClientFillDenied(pathName) => { ok, code, error }
 *   ccSenderOrigin(sender)       => string
 *   ccIsTrustedFrontend(sender)  => boolean
 *   CC_TRUSTED_FRONTEND_ORIGINS  => string[]
 *   CC_TRUSTED_ONLY_TYPES        => object
 */

// Local Vite defaults. Prod app origin comes from injectable globals so this package
// is not locked to one company domain:
//   __CC_APP_ORIGIN / __CC_PUBLIC_DOMAIN / __CC_TRUSTED_FRONTEND_ORIGINS
function resolveTrustedFrontendOrigins() {
  if (Array.isArray(globalThis.__CC_TRUSTED_FRONTEND_ORIGINS) && globalThis.__CC_TRUSTED_FRONTEND_ORIGINS.length) {
    return globalThis.__CC_TRUSTED_FRONTEND_ORIGINS.slice();
  }
  const origins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  try {
    if (typeof globalThis.__CC_APP_ORIGIN === 'string' && globalThis.__CC_APP_ORIGIN) {
      origins.unshift(String(globalThis.__CC_APP_ORIGIN).replace(/\/$/, ''));
    } else if (typeof globalThis.__CC_PUBLIC_DOMAIN === 'string' && globalThis.__CC_PUBLIC_DOMAIN) {
      origins.unshift('https://app.' + String(globalThis.__CC_PUBLIC_DOMAIN).replace(/^\./, ''));
    }
  } catch (_) { /* ignore */ }
  return origins;
}
const CC_TRUSTED_FRONTEND_ORIGINS = resolveTrustedFrontendOrigins();

const CC_TRUSTED_ONLY_TYPES = { CONNECT: 1, OPEN_AND_DISPATCH: 1, DISPATCH_JOB_DIRECT: 1 };

/** Phase 4.1: always false — legacy paths permanently disabled. */
async function isLegacyClientFillAllowed() {
  return false;
}

function legacyClientFillDenied(pathName) {
  if (typeof CcLegacyFillGate !== 'undefined' && CcLegacyFillGate.legacyClientFillDenied) {
    return CcLegacyFillGate.legacyClientFillDenied(pathName);
  }
  return {
    ok: false,
    code: 'legacy_client_fill_disabled',
    error: (pathName || 'legacy client fill') + ' is disabled (Phase 0). Use side-panel Fill.',
  };
}

function ccSenderOrigin(sender) {
  if (!sender) return '';
  if (sender.origin) return sender.origin;
  try { return sender.url ? new URL(sender.url).origin : ''; } catch (e) { return ''; }
}

function ccIsTrustedFrontend(sender) {
  return CC_TRUSTED_FRONTEND_ORIGINS.indexOf(ccSenderOrigin(sender)) !== -1;
}

// Expose as globals for service worker scope
globalThis.CC_TRUSTED_FRONTEND_ORIGINS = CC_TRUSTED_FRONTEND_ORIGINS;
globalThis.CC_TRUSTED_ONLY_TYPES       = CC_TRUSTED_ONLY_TYPES;
globalThis.isLegacyClientFillAllowed   = isLegacyClientFillAllowed;
globalThis.legacyClientFillDenied      = legacyClientFillDenied;
globalThis.ccSenderOrigin              = ccSenderOrigin;
globalThis.ccIsTrustedFrontend         = ccIsTrustedFrontend;

/* ==== label-utils/src/label-utils.js ==== */
/**
 * cc-background/label-utils — Label normalisation and semantic alias resolution
 * for the service worker (background.js).
 *
 * NOTE: Keep in sync with packages/cc-shared/src/label-utils.js
 * (page-context version). The SW cannot importScripts page-context
 * scripts so this is a separate copy.
 *
 * Public API (on globalThis):
 * BG_SEMANTIC_ALIASES   — object
 *   normalizeLabel(label)     => string
 *   getSemanticKey(label)     => string
 *   getSemanticKeyResolved(label) => Promise<string>
 *   calcConfidence(fills, corrections) => number
 */

const BG_SEMANTIC_ALIASES = {
  'full name': 'name', 'candidate name': 'name', 'applicant name': 'name',
  'student name': 'name', 'name of candidate': 'name', 'name of applicant': 'name',
  'candidates name': 'name', 'applicants name': 'name',
  'date of birth': 'dob', 'birth date': 'dob', 'dob': 'dob', 'date of birth ddmmyyyy': 'dob',
  "fathers name": 'father_name', 'father name': 'father_name', "fathers husbands name": 'father_name',
  "mothers name": 'mother_name', 'mother name': 'mother_name',
  'aadhaar no': 'aadhaar_number', 'aadhaar number': 'aadhaar_number', 'aadhar no': 'aadhaar_number',
  'pan no': 'pan_number', 'pan number': 'pan_number', 'pan card': 'pan_number',
  'mobile no': 'mobile', 'mobile number': 'mobile', 'phone no': 'mobile', 'contact no': 'mobile',
  'email id': 'email', 'email address': 'email',
  'permanent address': 'address', 'residential address': 'address', 'correspondence address': 'address',
  'pin code': 'pincode', 'postal code': 'pincode', 'pincode': 'pincode',
  'state name': 'state', 'district name': 'district',
};

function normalizeLabel(label) {
  return (label || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function getSemanticKey(label) {
  const n = normalizeLabel(label);
  return BG_SEMANTIC_ALIASES[n] || n;
}

async function getSemanticKeyResolved(label) {
  const n = normalizeLabel(label);
  if (BG_SEMANTIC_ALIASES[n]) return BG_SEMANTIC_ALIASES[n];
  // Check cached server aliases (variant→canonical lookup)
  if (typeof ccKnowledgeSync !== 'undefined') {
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

// Expose as globals for service worker scope
globalThis.BG_SEMANTIC_ALIASES = BG_SEMANTIC_ALIASES;
globalThis.normalizeLabel           = normalizeLabel;
globalThis.getSemanticKey           = getSemanticKey;
globalThis.getSemanticKeyResolved   = getSemanticKeyResolved;
globalThis.calcConfidence           = calcConfidence;

/* ==== wss-manager/src/wss-manager.js ==== */
/**
 * cc-background/wss-manager — WSS message handler dispatcher for the service worker.
 *
 * Handles: GET_WSS_STATE, ENSURE_WSS, FILL_DEBUG,
 *          WSS_FILL_REQUEST, WSS_FILL_SESSION, WSS_PROFILES_LIST
 *
 * Public API (on globalThis):
 *   handleWssMessage(msg, sendResponse) => boolean  (true = async)
 */

function handleWssMessage(msg, sendResponse) {
  if (msg.type === 'GET_WSS_STATE') {
    if (typeof CcWssSession !== 'undefined' && CcWssSession.getState) {
      CcWssSession.getState()
        .then((st) => sendResponse({ ok: true, wss: st }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }
    sendResponse({ ok: false, error: 'wss_session_missing' });
    return true;
  }

  if (msg.type === 'ENSURE_WSS') {
    ccEnsureWss('ENSURE_WSS')
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'FILL_DEBUG') {
    forwardFillDebug(msg);
    sendResponse({ ok: true, forwarded: true });
    return true;
  }

  if (msg.type === 'WSS_FILL_REQUEST') {
    (async () => {
      try {
        await ccEnsureWss('WSS_FILL_REQUEST');
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          const st = CcWssSession?.getClient?.()?.state;
          if (st === 'connected') break;
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!CcWssSession?.requestFillPlan) throw new Error('wss_session_missing');
        if (CcWssSession.getClient?.()?.state !== 'connected') throw new Error('wss_not_connected');
        const resp = await CcWssSession.requestFillPlan({
          formKey: msg.formKey,
          semanticFormKey: msg.semanticFormKey || msg.formKey,
          hostname: msg.hostname,
          fields: msg.fields || [],
          profile: msg.profile || {},
          profileId: msg.profileId || null,
        }, 25000);
        if (resp?.type === 'error') throw new Error(resp.message || resp.code || 'fill_request_error');
        sendResponse({ ok: true, plan: resp, transport: 'wss' });
      } catch (e) {
        console.warn('[CC] WSS_FILL_REQUEST failed:', e.message);
        sendResponse({ ok: false, error: e.message || String(e), transport: 'wss_failed' });
      }
    })();
    return true;
  }

  if (msg.type === 'WSS_FILL_SESSION') {
    (async () => {
      try {
        await ccEnsureWss('WSS_FILL_SESSION');
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          if (CcWssSession?.getClient?.()?.state === 'connected') break;
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!CcWssSession?.postFillSession) throw new Error('wss_session_missing');
        const resp = await CcWssSession.postFillSession({
          hostname: msg.hostname,
          url: msg.url,
          semanticFormKey: msg.semanticFormKey || msg.formKey,
          formKey: msg.formKey,
          runtimeVersion: msg.runtimeVersion,
          totalFilled: msg.totalFilled,
          totalFailed: msg.totalFailed,
          totalSkipped: msg.totalSkipped,
          records: msg.records || [],
        }, 20000);
        if (resp?.type === 'error') throw new Error(resp.message || resp.code || 'fill_session_error');
        sendResponse({ ok: true, id: resp.id, transport: 'wss' });
      } catch (e) {
        console.warn('[CC] WSS_FILL_SESSION failed:', e.message);
        sendResponse({ ok: false, error: e.message || String(e), transport: 'wss_failed' });
      }
    })();
    return true;
  }

  if (msg.type === 'WSS_PROFILES_LIST') {
    (async () => {
      try {
        await ccEnsureWss('WSS_PROFILES_LIST');
        if (!CcWssSession?.requestProfilesList) throw new Error('wss_session_missing');
        const resp = await CcWssSession.requestProfilesList(15000);
        if (resp?.type === 'error') throw new Error(resp.message || resp.code || 'profiles_list_error');
        const profiles = Array.isArray(resp.profiles) ? resp.profiles : [];
        sendResponse({ ok: true, profiles, transport: 'wss', count: profiles.length });
      } catch (e) {
        console.warn('[CC] WSS_PROFILES_LIST failed:', e.message);
        sendResponse({ ok: false, error: e.message || String(e), transport: 'wss_failed' });
      }
    })();
    return true;
  }

  return false; // not a WSS message
}

globalThis.handleWssMessage = handleWssMessage;

/* ==== bridge/src/bridge.js ==== */
/**
 * cc-background/bridge — Frontend bridge: port handler, handleBridgeMessage,
 * and onMessageExternal for the service worker.
 *
 * Depends on globals from cc-background/auth: CC_TRUSTED_ONLY_TYPES,
 * ccIsTrustedFrontend, isLegacyClientFillAllowed, legacyClientFillDenied.
 * Calls: ccEnsureWss, runJobDispatch (must be loaded before this).
 */

// â”€â”€ Long-lived port â€” keeps SW alive and bridges postMessage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Content script connects a port on load. This keeps SW alive (no 30s timeout).
// Messages from the page are forwarded through the port.
const _pendingPortMessages = new Map(); // reqId -> resolve

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'cc_bridge') return;
  let connected = true;
  const portTrusted = ccIsTrustedFrontend(port.sender);
  port.onDisconnect.addListener(() => { connected = false; });
  port.onMessage.addListener((msg) => {
    const { _reqId, ...payload } = msg;
    handleBridgeMessage(payload, (response) => {
      if (connected) {
        try { port.postMessage({ _cc_reply: true, _reqId, response }); }
        catch (e) { /* port already disconnected */ }
      }
    }, portTrusted);
  });
});

function handleBridgeMessage(msg, sendResponse, trusted) {
  // SEC-003: defense-in-depth â€” auth/state-mutating messages require a trusted sender.
  if (CC_TRUSTED_ONLY_TYPES[msg.type] && !trusted) {
    sendResponse({ ok: false, error: 'untrusted sender' });
    return;
  }
  if (msg.type === 'CONNECT') {
    const { token, refreshToken, user, backendUrl } = msg;
    if (!token || !backendUrl) { sendResponse({ ok: false, error: 'missing token or backendUrl' }); return; }
    chrome.storage.local.set({ accessToken: token, refreshToken: refreshToken || null, user: user || null, backendUrl }, () => {
      ccEnsureWss('CONNECT');
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    });
    return;
  }
  if (msg.type === 'PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return;
  }
  if (msg.type === 'OPEN_AND_DISPATCH') {
    const { envelope, formUrl } = msg;
    if (!envelope || !formUrl) { sendResponse({ ok: false, error: 'missing envelope or formUrl' }); return; }
    // Phase 0 (CYB-85): gated â€” async so port handler can reply after storage check.
    isLegacyClientFillAllowed().then((allowed) => {
      if (!allowed) {
        sendResponse(legacyClientFillDenied('OPEN_AND_DISPATCH'));
        return;
      }
      chrome.tabs.create({ url: formUrl, active: true }, (tab) => {
        if (!tab?.id) { sendResponse({ ok: false, error: 'failed to open tab' }); return; }
        chrome.storage.local.set({ _cc_pending_job: { envelope, tabId: tab.id, ts: Date.now() } });
        sendResponse({ ok: true, tabId: tab.id });
      });
    }).catch((e) => sendResponse({ ok: false, error: e.message || 'legacy gate failed' }));
    return;
  }
  sendResponse({ ok: false, error: 'unknown type: ' + msg.type });
}

// â”€â”€ Frontend Bridge: zero-config auth handshake â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Frontend sends { type: 'CONNECT', token, refreshToken, user, backendUrl }
// Extension stores credentials so it can act on behalf of the operator without popup config.
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  // SEC-003: auth/state-mutating external messages require a trusted origin.
  if (CC_TRUSTED_ONLY_TYPES[msg.type] && !ccIsTrustedFrontend(sender)) {
    sendResponse({ ok: false, error: 'untrusted sender' });
    return true;
  }
  if (msg.type === 'CONNECT') {
    const { token, refreshToken, user, backendUrl } = msg;
    if (!token || !backendUrl) { sendResponse({ ok: false, error: 'missing token or backendUrl' }); return; }
    chrome.storage.local.set({
      accessToken: token,
      refreshToken: refreshToken || null,
      user: user || null,
      backendUrl,
    }, () => {
      ccEnsureWss('CONNECT_EXTERNAL');
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    });
    return true;
  }
  if (msg.type === 'PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return true;
  }
  if (msg.type === 'DISPATCH_JOB_DIRECT') {
    // Frontend sends dispatch envelope directly + tabId (the form tab to operate on)
    // Phase 0 (CYB-85): gated â€” not cafÃ© product path.
    const { envelope, tabId } = msg;
    if (!envelope || !tabId) { sendResponse({ ok: false, error: 'missing envelope or tabId' }); return true; }
    isLegacyClientFillAllowed().then((allowed) => {
      if (!allowed) {
        const denied = legacyClientFillDenied('DISPATCH_JOB_DIRECT');
        console.warn('[CC]', denied.error);
        sendResponse(denied);
        return;
      }
      sendResponse({ ok: true, accepted: true });
      runJobDispatch(envelope, tabId).catch(e => console.error('[CC] direct dispatch error:', e));
    }).catch((e) => sendResponse({ ok: false, error: e.message || 'legacy gate failed' }));
    return true;
  }
  if (msg.type === 'OPEN_AND_DISPATCH') {
    // Persist job to storage BEFORE opening tab so it survives SW termination.
    // content.js sends CONTENT_READY when the page is ready; background picks up
    // the pending job from storage and dispatches it then.
    // Phase 0 (CYB-85): gated.
    const { envelope, formUrl } = msg;
    if (!envelope || !formUrl) { sendResponse({ ok: false, error: 'missing envelope or formUrl' }); return true; }
    isLegacyClientFillAllowed().then((allowed) => {
      if (!allowed) {
        sendResponse(legacyClientFillDenied('OPEN_AND_DISPATCH'));
        return;
      }
      chrome.tabs.create({ url: formUrl, active: true }, (tab) => {
        if (!tab?.id) { sendResponse({ ok: false, error: 'failed to open tab' }); return; }
        // Persist â€” survives SW death between tab.create and page load
        chrome.storage.local.set({ _cc_pending_job: { envelope, tabId: tab.id, ts: Date.now() } });
        sendResponse({ ok: true, tabId: tab.id });
      });
    }).catch((e) => sendResponse({ ok: false, error: e.message || 'legacy gate failed' }));
    return true;
  }
  if (msg.type === 'CONTENT_READY') {
    // content.js fires this when it's injected and ready to receive DISPATCH_JOB.
    // Pick up any pending job for this tab and dispatch it now.
    const tabId = sender?.tab?.id;
    if (!tabId) { sendResponse({ ok: true }); return true; }
    chrome.storage.local.get('_cc_pending_job', ({ _cc_pending_job: job }) => {
      if (!job || job.tabId !== tabId) { sendResponse({ ok: true }); return; }
      // Job is for this tab â€” clear it; only dispatch if legacy path allowed.
      chrome.storage.local.remove('_cc_pending_job');
      isLegacyClientFillAllowed().then((allowed) => {
        if (!allowed) {
          console.warn('[CC] CONTENT_READY: dropping pending job â€” legacy client fill disabled');
          sendResponse(legacyClientFillDenied('CONTENT_READY pending job'));
          return;
        }
        console.log('[CC] CONTENT_READY: dispatching pending job to tab', tabId);
        runJobDispatch(job.envelope, tabId).catch(e => console.error('[CC] pending dispatch error:', e));
        sendResponse({ ok: true, dispatching: true });
      }).catch((e) => sendResponse({ ok: false, error: e.message || 'legacy gate failed' }));
    });
    return true;
  }
    sendResponse({ ok: false, error: 'unknown message type' });
  return true;
});

/* ==== job-dispatch/src/job-dispatch.js ==== */
/**
 * cc-background/job-dispatch — Job dispatch runner for the service worker.
 *
 * Depends on: ccKnowledgeSync, CC_TRUSTED_ONLY_TYPES, isLegacyClientFillAllowed,
 *             legacyClientFillDenied (from cc-background/auth)
 *
 * Public API (on globalThis):
 *   runJobDispatch(envelope, tabId) => Promise<void>
 */

// â”€â”€ Phase A: Job Dispatch Runner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Extension stays dumb: receives envelope, runs deterministic runtime, reports terminal result.
// No knowledge of jobs/customers/mappings/tenancy.
async function runJobDispatch(envelope, tabId) {
  // Defense in depth: even if a caller bypasses message handlers, refuse unless opted in.
  if (!(await isLegacyClientFillAllowed())) {
    const denied = legacyClientFillDenied('runJobDispatch');
    console.warn('[CC]', denied.error);
    return;
  }
  const { jobId, sessionId, payload } = envelope;
  const profile = payload?.profile || {};
  const { backendUrl, accessToken } = await chrome.storage.local.get(['backendUrl', 'accessToken']);
  if (!backendUrl || !accessToken) { console.error('[CC] DISPATCH_JOB: not authenticated'); return; }

  // Helper: report progress to backend
  async function reportProgress(body) {
    try {
      await fetch(backendUrl + '/jobs/' + jobId + '/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
        body: JSON.stringify({ sessionId, ...body }),
      });
    } catch (e) { console.warn('[CC] progress report failed:', e.message); }
  }

  // Inject runtime + run autofill pipeline (reuse existing executor)
  try {
    // Inject cached server field mappings into page for mapper.js to pick up
    if (typeof ccKnowledgeSync !== 'undefined') {
      const cachedMappings = await ccKnowledgeSync.getCachedFieldMappings();
      const cachedDerivRules = await ccKnowledgeSync.getCachedDerivationRules();
      if (cachedMappings.length > 0 || cachedDerivRules.length > 0) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (mappings, derivRules) => {
            if (mappings.length) window._ccServerFieldMappings = mappings;
            if (derivRules.length) window._ccServerDerivationRules = derivRules;
          },
          args: [cachedMappings, cachedDerivRules],
        });
      }
    }
    await chrome.scripting.executeScript({ target: { tabId }, files: ['shared-bundle.js', 'autofill/plugins-bundle.js', 'drivers-bundle.js', 'autofill/extractor-bundle.js', 'autofill/mapper-bundle.js', 'autofill/executor-bundle.js'] });

    const result = await chrome.scripting.executeScript({
      target: { tabId },
      args: [profile, backendUrl, accessToken],
      func: async (prof, bUrl, aToken) => {
        const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aToken };
        const { formFields, formKey, semanticFormKey } = extractFormFieldsWithFingerprint();
        if (!formFields.length) return { ok: false, error: 'no fields detected' };
        const pk = semanticFormKey || formKey;
        // Try saved mappings first
        let saved = null;
        try { const r = await fetch(bUrl + '/mappings/' + pk, { headers }); const d = await r.json(); if (d && typeof d === 'object' && Object.keys(d).length > 0) saved = d; } catch {}
        let mapping = {}, fbs = {};
        const gsk = l => (l || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
        if (saved) {
          for (const f of formFields) {
            const sk = gsk(f.label); const s = saved[sk];
            if (s && s.profileKey && prof[s.profileKey]) {
              mapping[f.selector] = { value: prof[s.profileKey], type: f.type };
              fbs[f.selector] = { label: f.label, semanticKey: sk, profileKey: s.profileKey, source: 'saved' };
            }
          }
        }
        // Fuzzy fill remaining
        const um = formFields.filter(f => !mapping[f.selector]);
        if (um.length > 0) {
          const fz = fuzzyMatch(um, prof);
          for (const [s, v] of Object.entries(fz)) { mapping[s] = v; const ff = formFields.find(x => x.selector === s); if (ff) fbs[s] = { label: ff.label, source: 'fuzzy' }; }
        }
        // Adapters
        let adp = {};
        try { const r = await fetch(bUrl + '/adapters/' + location.hostname, { headers }); adp = await r.json(); } catch {}
        // Run executor (returns total filled)
        const filled = await fillFormFieldsSequential(mapping, fbs, adp);
        const records = Array.isArray(window.__ccFillRecords) ? window.__ccFillRecords : [];
        const failed = records.filter(r => r.result === 'skipped' || r.result === 'failed' || r.result === 'reset').length;
        // Sync mappings â€” labels, types, order, options (same as popup path)
        try {
          const updates = {};
          for (let i = 0; i < formFields.length; i++) {
            const f = formFields[i];
            const sk = gsk(f.label);
            if (!sk || sk.length < 2) continue;
            const info = fbs[f.selector];
            const profileKey = info?.profileKey || (mapping[f.selector] ? Object.entries(prof).find(([,v]) => v === mapping[f.selector].value)?.[0] : null) || null;
            const wasFilled = records.some(r => r.selector === f.selector && r.result === 'filled');
            updates[sk] = { profileKey, label: f.label, type: f.type, order: i, options: f.options || null, delta: { fills: wasFilled ? 1 : 0, corrections: 0 } };
          }
          if (Object.keys(updates).length > 0) {
            await fetch(bUrl + '/mappings/' + pk, {
              method: 'POST', headers,
              body: JSON.stringify({ updates, meta: { hostname: location.hostname, title: document.title.slice(0, 80), lastSeen: new Date().toISOString().slice(0, 10), syncVersion: 2 } }),
            });
          }
        } catch (e) { console.warn('[CC] bg mapping sync failed:', e.message); }
        return { ok: true, filled: filled || 0, failed, fields: Object.keys(mapping).length, records, primaryKey: pk };
      },
    });

    const r = result?.[0]?.result || { ok: false };
    if (r.ok) {
      // Report final state â€” runtime done, transition to needs_review
      await reportProgress({
        totalFilled: r.filled,
        totalFailed: r.failed,
        records: r.records || [],
        status: 'needs_review',
      });
      console.log('[CC] DISPATCH_JOB completed: filled=' + r.filled + ' failed=' + r.failed);
    } else {
      await reportProgress({ status: 'failed', failReason: r.error || 'execution failed' });
      console.error('[CC] DISPATCH_JOB failed:', r.error);
    }
  } catch (e) {
    await reportProgress({ status: 'failed', failReason: e.message });
    console.error('[CC] DISPATCH_JOB exception:', e);
  }
}






chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  // T4: (re)open WSS when credentials appear or rotate
  if (changes.accessToken || changes.backendUrl) {
    if (changes.accessToken?.newValue === undefined && changes.backendUrl?.newValue === undefined) {
      // both cleared
    }
    const tokenGone = changes.accessToken && changes.accessToken.newValue == null;
    if (tokenGone && typeof CcWssSession !== 'undefined') {
      CcWssSession.disconnectWss('logout');
    } else {
      ccEnsureWss('storage_credentials');
    }
  }
  if (!changes._cc_teach_job?.newValue) return;
  const job = changes._cc_teach_job.newValue;
  // Deduplicate: same timestamp = same job, ignore
  if (job.ts === _lastTeachTs) return;
  if (_teachRunning) return;
  _lastTeachTs = job.ts;
  console.log('[CC] SW teach job received:', job.hostname, job.fields?.length, 'fields, tabId:', job.tabId);
  chrome.storage.local.set({_cc_teach_debug: 'received:' + job.hostname + ':' + job.fields?.length + ':tab:' + job.tabId});
  // If tabId is missing, find the tab by hostname (resolved inside runTeachSession which is async)
  chrome.storage.local.remove('_cc_teach_job');
  runTeachSession(job).catch(console.error);
});

// Keep service worker alive during long teach sessions (SW dies after 30s idle)
function startKeepalive() {
  if (_keepaliveInterval) return;
  _keepaliveInterval = setInterval(() => chrome.storage.local.set({ _sw_ping: Date.now() }), 20000);
}
function stopKeepalive() {
  clearInterval(_keepaliveInterval);
  _keepaliveInterval = null;
}

/* ==== teach/src/teach.js ==== */
/**
 * cc-background/teach — Teach session orchestrator for the service worker.
 *
 * Depends on: chrome.scripting, chrome.tabs, chrome.storage
 * Calls: notifyPopup (internal), ccEnsureWss (from wss-bridge)
 *
 * Public API (on globalThis):
 *   runTeachSession(job)    => Promise<void>
 *   startKeepalive()        => void
 *   stopKeepalive()         => void
 */

var _keepaliveInterval = null; // keepalive interval — local to teach


async function runTeachSession({ tabId, fields, backendUrl, hostname, llmKey, groqKey, llmBaseUrl, llmModel }) {
  // Prefer llmKey; groqKey kept as compat alias from older callers
  llmKey = llmKey || groqKey || '';
  _teachRunning = true;
  startKeepalive();
  // Resolve tabId if missing
  if (!tabId || tabId === 0) {
    try {
      const foundTabs = await chrome.tabs.query({url: '*://' + hostname + '/*'});
      if (foundTabs.length > 0) { tabId = foundTabs[0].id; console.log('[CC] resolved tabId from hostname:', tabId); }
    } catch(e) { console.warn('[CC] tab query failed:', e.message); }
  }
  if (!tabId) { console.error('[CC] no tabId, aborting teach'); _teachRunning = false; stopKeepalive(); return; }
  // Native <select> and radio are handled by executor directly — only teach custom dropdowns
  const TEACHABLE_TYPES = ['ng-dropdown', 'mat-select', 'mat-radio'];
  const teachable = fields.filter(f => TEACHABLE_TYPES.includes(f.type));

  if (teachable.length === 0) {
    notifyPopup({ type: 'TEACH_PROGRESS', status: 'No interactive fields need teaching.', done: true });
    return;
  }

  for (const field of teachable) {
    const label = normalizeFieldLabel(field.label);
    notifyPopup({ type: 'TEACH_PROGRESS', status: `🤖 Auto-teaching "${label}" with AI...`, done: false });

    // Try LLM auto-teach first
    if (llmKey) {
      const profileValue = field.profileValue || '';
      const autoSuccess = await llmAutoTeach(tabId, { ...field, profileValue }, llmKey, backendUrl, hostname, llmBaseUrl, llmModel);
      if (autoSuccess) {
        notifyPopup({ type: 'TEACH_PROGRESS', status: `✓ AI learned "${label}" automatically!`, done: false });
        await sleep(800);
        continue;
      }
      console.log('[CC] LLM auto-teach failed, falling back to manual');
    }

    notifyPopup({ type: 'TEACH_PROGRESS', status: `âš  Teach: "${label}" â€” click the dropdown, then select a value`, done: false });

    // Clear any stale result before injecting
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => { sessionStorage.removeItem('_cc_teach_result'); sessionStorage.removeItem('_cc_teach_active'); },
    }).catch(() => {});

    // AI-assisted: if no known adapter, ask the LLM to identify the dropdown component
    let fieldWithHint = { ...field };
    if (llmKey && !field.componentClass) {
      try {
        const domSnap = await chrome.scripting.executeScript({
          target: { tabId },
          func: (lbl) => {
            // Collect outer HTML of elements that look like custom dropdowns near the label
            const snippets = [];
            document.querySelectorAll('div,span,ul,ng-select,app-dropdown,[class*=select],[class*=dropdown],[class*=picker]').forEach(el => {
              if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
              const text = el.textContent.slice(0, 100);
              if (text.toLowerCase().includes(lbl.toLowerCase().slice(0, 10))) {
                snippets.push(el.outerHTML.slice(0, 300));
              }
            });
            return snippets.slice(0, 5).join('\n---\n');
          },
          args: [field.label],
        }).catch(() => [{ result: '' }]);
        const domText = domSnap?.[0]?.result || '';
        if (domText) {
          const aiRes = await fetch(llmBaseUrl || 'https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + llmKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: llmModel || 'meta-llama/llama-3.3-70b-instruct',
              messages: [{ role: 'user', content: 'Identify the dropdown component class and trigger selector from these HTML snippets near field "' + field.label + '". Reply ONLY as JSON: {"componentClass":"...","triggerSelector":"..."}. Snippets: ' + domText }],
              max_tokens: 80,
            }),
          }).then(r => r.json()).catch(() => null);
          const txt = aiRes?.choices?.[0]?.message?.content || '';
          const m = txt.match(/\{[^}]+\}/);
          if (m) {
            try {
              const hint = JSON.parse(m[0]);
              if (hint.componentClass) fieldWithHint = { ...field, componentClass: hint.componentClass, aiTrigger: hint.triggerSelector };
              console.log('[CC] AI hint:', JSON.stringify(hint));
            } catch {}
          }
        }
      } catch (e) { console.warn('[CC] AI identify failed:', e.message); }
    }

    console.log('[CC] injecting teachOneField into tabId:', tabId, 'field:', fieldWithHint.label);
    const injectResult = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: teachOneField,
      args: [fieldWithHint],
    }).then(r => { console.log('[CC] inject OK, result:', r?.[0]?.result); return r; })
      .catch(e => {
        console.error('[CC] teachOneField inject failed:', e.message);
        chrome.storage.local.set({_cc_teach_debug: 'inject failed: '+e.message});
        notifyPopup({ type: 'TEACH_PROGRESS', status: 'Inject error: '+e.message, done: true });
        return null;
      });
    if (!injectResult) { _teachRunning = false; stopKeepalive(); return; }

    // Poll sessionStorage for result (up to 45s) â€” background stays alive
    const adapter = await pollTeachResult(tabId, 45000);
    console.log('[CC] pollTeachResult returned:', JSON.stringify(adapter));
    // Always clear page teach state after poll (timeout or success)
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => { sessionStorage.removeItem('_cc_teach_active'); sessionStorage.removeItem('_cc_teach_result'); },
    }).catch(() => {});

    if (!adapter) {
      notifyPopup({ type: 'TEACH_PROGRESS', status: `âš  Skipped "${label}" (timeout)`, done: false });
      continue;
    }
    if (adapter.error) {
      notifyPopup({ type: 'TEACH_PROGRESS', status: `âš  "${label}": ${adapter.error}`, done: false });
      continue;
    }

    const saveUrl = `${backendUrl}/adapters/${hostname}`;
    console.log('[CC] saving adapter to:', saveUrl, 'adapter:', JSON.stringify(adapter).slice(0,200));
    const saveRes = await fetch(saveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adapter),
    }).catch(e => { console.error('[CC] fetch failed:', e.message); return { ok: false, _err: e.message }; });
    console.log('[CC] save response:', saveRes?.ok, saveRes?.status);

    if (saveRes?.ok) {
      notifyPopup({ type: 'TEACH_PROGRESS', status: `âœ“ Learned "${label}"`, done: false });
    } else {
      const errText = await saveRes?.text?.().catch(() => 'network error') ?? 'network error';
      notifyPopup({ type: 'TEACH_PROGRESS', status: `âš  Save failed for "${label}": ${errText}`, done: false });
    }

    await sleep(600);
  }

  stopKeepalive();
  _teachRunning = false;
  notifyPopup({ type: 'TEACH_PROGRESS', status: 'Teaching complete! Adapters saved.', done: true });
}


// â”€â”€ llmAutoTeach â€” tries to fill a custom dropdown using Groq AI â”€â”€
async function llmAutoTeach(tabId, field, llmKey, backendUrl, hostname, llmBaseUrl, llmModel) {
  try {
    // Step 1: Get DOM snapshot of the component (closed state)
    const snap1 = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      func: (f) => {
        const compClass = f.componentClass || 'ng-dropdown';
        const root = document.querySelectorAll('div.' + compClass)[f.domIndex ?? 0]
          || document.querySelector('[class*="dropdown"],[class*="select"],[class*="picker"]');
        if (!root) return null;
        root.scrollIntoView({ block: 'center' });
        return { html: root.outerHTML.slice(0, 1500), rect: JSON.stringify(root.getBoundingClientRect()) };
      },
      args: [field],
    }).catch(() => null);
    const closedHtml = snap1?.[0]?.result?.html;
    if (!closedHtml) return false;

    // Step 2: Ask Groq to identify trigger selector from closed state
    const prompt1 = `You are analyzing a custom dropdown component in a government form.
Field label: "${field.label}"
Profile value to select: "${field.profileValue || ''}"
Component HTML (closed state):
${closedHtml}

Reply with ONLY valid JSON (no markdown):
{"triggerSelector":"CSS selector to click to open dropdown","componentClass":"root element class name"}`;

    const r1 = await fetch(llmBaseUrl || 'https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + llmKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: llmModel || 'meta-llama/llama-3.3-70b-instruct', messages: [{ role: 'user', content: prompt1 }], max_tokens: 100 }),
    }).then(r => r.json()).catch(() => null);

    const txt1 = r1?.choices?.[0]?.message?.content?.trim() || '';
    const m1 = txt1.match(/\{[^}]+\}/);
    if (!m1) return false;
    let hint;
    try { hint = JSON.parse(m1[0]); } catch { return false; }
    // Reject garbage selectors from Groq
    if (!hint.triggerSelector || ['#','select','input','label','.','*'].includes(hint.triggerSelector) || hint.triggerSelector.length < 2) return false;
    console.log('[CC] Groq identified trigger:', hint.triggerSelector);

    // Step 3: Click trigger to open dropdown
    await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      func: (sel) => { document.querySelector(sel)?.click(); },
      args: [hint.triggerSelector],
    }).catch(() => {});
    await sleep(800);

    // Step 4: Snapshot open state (options visible)
    const snap2 = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      func: (f, trigSel) => {
        const compClass = f.componentClass || 'ng-dropdown';
        const root = document.querySelectorAll('div.' + compClass)[f.domIndex ?? 0];
        // Also capture any newly added overlay/dropdown list
        const overlay = Array.from(document.querySelectorAll('ul,div[class*="dropdown-list"],div[class*="options"],div[class*="menu"]'))
          .find(el => el.offsetParent !== null && el.querySelectorAll('li,[class*="option"]').length > 0);
        return {
          rootHtml: root?.outerHTML?.slice(0, 800) || '',
          overlayHtml: overlay?.outerHTML?.slice(0, 1200) || '',
        };
      },
      args: [field, hint.triggerSelector],
    }).catch(() => null);
    const openState = snap2?.[0]?.result;
    if (!openState) return false;

    // Step 5: Ask Groq to identify option selector and which option to click
    const prompt2 = `Custom dropdown is now open. Select the option matching "${field.profileValue || field.label}".
Root HTML: ${openState.rootHtml}
Options overlay HTML: ${openState.overlayHtml}

Reply with ONLY valid JSON:
{"optionSelector":"CSS selector for each option li/div","optionText":"exact text of option to click","verifySelector":"CSS selector showing selected value after close"}`;

    const r2 = await fetch(llmBaseUrl || 'https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + llmKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: llmModel || 'meta-llama/llama-3.3-70b-instruct', messages: [{ role: 'user', content: prompt2 }], max_tokens: 150 }),
    }).then(r => r.json()).catch(() => null);

    const txt2 = r2?.choices?.[0]?.message?.content?.trim() || '';
    const m2 = txt2.match(/\{[^}]+\}/s);
    if (!m2) return false;
    let hint2;
    try { hint2 = JSON.parse(m2[0]); } catch { return false; }
    console.log('[CC] Groq identified option:', hint2.optionText, 'selector:', hint2.optionSelector);

    // Step 6: Click the matching option
    const clicked = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      func: (optSel, optText) => {
        const opts = Array.from(document.querySelectorAll(optSel));
        const opt = opts.find(o => o.textContent.trim() === optText) || opts.find(o => o.textContent.trim().includes(optText.slice(0, 10)));
        if (opt) { opt.click(); return opt.textContent.trim(); }
        return null;
      },
      args: [hint2.optionSelector || 'li', hint2.optionText || ''],
    }).catch(() => null);
    const clickedText = clicked?.[0]?.result;
    if (!clickedText) return false;
    console.log('[CC] Groq clicked option:', clickedText);
    await sleep(600);

    // Step 7: Verify value changed
    const verified = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      func: (verifySel, expected) => {
        const el = document.querySelector(verifySel);
        return el ? el.textContent.trim() : null;
      },
      args: [hint2.verifySelector || hint.triggerSelector, clickedText],
    }).catch(() => null);
    const verifiedText = verified?.[0]?.result;
    console.log('[CC] Groq verify:', verifiedText);

    // Step 8: Save adapter
    const adapter = {
      componentClass: hint.componentClass || field.componentClass || 'ng-dropdown',
      triggerSelector: hint.triggerSelector,
      optionSelector: hint2.optionSelector || 'li',
      verifySelector: hint2.verifySelector || hint.triggerSelector,
      optionsContainer: '',
      learnedBy: 'llm',
    };
    await fetch(`${backendUrl}/adapters/${hostname}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adapter),
    }).catch(() => {});
    console.log('[CC] Groq auto-teach saved adapter for', hostname);
    return true;
  } catch(e) {
    console.warn('[CC] llmAutoTeach error:', e.message);
    return false;
  }
}

// â”€â”€ teachOneField â€” runs in PAGE context (injected via executeScript func:) â”€â”€
function teachOneField(field) {
  // Only one teach session at a time on the page
  if (sessionStorage.getItem('_cc_teach_active') === '1') return;
  sessionStorage.removeItem('_cc_teach_result');
  sessionStorage.setItem('_cc_teach_active', '1');

  let root = null;
  const compClass = field.componentClass || 'ng-dropdown';
  // Use domIndex if available (precise, handles duplicate labels)
  if (typeof field.domIndex === 'number') {
    root = document.querySelectorAll(`div.${compClass}`)[field.domIndex] || null;
    // Fallback: try generic dropdown selectors at same index
    if (!root) {
      const allDropdowns = Array.from(document.querySelectorAll(
        `div.${compClass},[class*=dropdown],[class*=select],[class*=picker]`
      )).filter(el => el.tagName !== 'SELECT' && el.tagName !== 'INPUT');
      root = allDropdowns[field.domIndex] || null;
    }
  }
  if (!root && field.selector && !field.selector.startsWith('form-field-')) {
    root = document.querySelector(field.selector);
  }
  if (!root) {
    const baseLabel = field.label.replace(/\s*\(\d+\)$/, '').replace(/[\n*]/g,'').trim().slice(0,15);
    document.querySelectorAll(`div.${compClass}, mat-select, [role=combobox]`).forEach(el => {
      const lbl = el.querySelector('.label, mat-label, label')?.textContent?.trim() || el.getAttribute('aria-label') || '';
      if (lbl && baseLabel && lbl.includes(baseLabel)) root = el;
    });
  }

  // Click-to-identify mode: root still null â€” ask user to click the component
  if (!root) {
    const _host = document.createElement('div');
    _host.style.cssText = 'position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);pointer-events:none;background:#7c3aed;color:white;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:bold;font-family:sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.7);white-space:nowrap;border:2px solid #a855f7;';
    _host.textContent = `âš  Click the dropdown for ${field.label} to identify it`;
    document.body.appendChild(_host);
    function _onIdentify(e) {
      let el = e.target;
      let found = null;
      for (let i = 0; i < 8 && el && el !== document.body; i++) {
        const cls = (el.className || '').toLowerCase();
        if (el.tagName !== 'SELECT' && el.tagName !== 'INPUT' &&
            (cls.includes('dropdown') || cls.includes('select') || cls.includes('picker') ||
             cls.includes('combo') || el.querySelector('li,[class*="option"]'))) {
          found = el; break;
        }
        el = el.parentElement;
      }
      root = found || e.target.closest('div') || e.target;
      document.removeEventListener('click', _onIdentify, true);
      try { document.body.removeChild(_host); } catch {}
      _runTeach(root);
    }
    document.addEventListener('click', _onIdentify, true);
    setTimeout(() => {
      document.removeEventListener('click', _onIdentify, true);
      try { document.body.removeChild(_host); } catch {}
      sessionStorage.removeItem('_cc_teach_active');
    }, 30000);
    return;
  }

  let triggerSelector = field.aiTrigger || '.value-area'; // declared here to avoid TDZ in _runTeach
  let triggerCaptured = false;
  _runTeach(root);
  function _runTeach(root) {

  // Snapshot the full root text at start â€” works on any site
  // We detect change by comparing full text, not relying on specific child selectors
  const labelText = (root.querySelector('.label, label, mat-label')?.textContent || '').trim();
  const getDisplayText = () => {
    // ng-select: value shown in .ng-value, placeholder in .ng-placeholder
    const ngValue = root.querySelector('.ng-value-label,.ng-value .ng-star-inserted,.ng-value');
    if (ngValue) return ngValue.textContent.trim();
    // Known value-display selectors
    const el = root.querySelector('.select-type') || root.querySelector('.value-area') ||
                root.querySelector('[class*="selection__rendered"]') || root.querySelector('[class*="filter-option"]') ||
                root.querySelector('[class*="chosen-single"] span') || root.querySelector('.p-dropdown-label') ||
                root.querySelector('[class*="selectmenu-text"]') || root.querySelector('[class*="selected-value"]') ||
                root.querySelector('[class*="trigger"] span:first-child') ||
                root.querySelector('[class*="select-value"] span') || root.querySelector('[class*="mat-select-value"] span');
    if (el) return el.textContent.trim();
    // Clone root, strip option lists and placeholders, get remaining text
    // For mat-select: check mat-select-value span directly
    const matVal = root.querySelector('.mat-select-value-text,.mat-mdc-select-value-text');
    if (matVal) return matVal.textContent.trim();
    const clone = root.cloneNode(true);
    clone.querySelectorAll('ul,ol,[class*="options"],[class*="dropdown-list"],[class*="drop-list"],[class*="menu"],[class*="items"]').forEach(e => e.remove());
    // Remove placeholder only if it has placeholder class (not value class)
    clone.querySelectorAll('[class*="placeholder"]:not([class*="value"])').forEach(e => e.remove());
    return clone.textContent.replace(labelText, '').trim();
  };
  const initialValue = getDisplayText();
  // For verifySelector: find the element whose text changes after selection
  const verifySel = (() => {
    const el = root.querySelector('.select-type') || root.querySelector('.value-area');
    if (!el) return '';
    const cls = (el.className || '').trim().split(/\s+/).filter(c => c && !c.startsWith('ng-') && !c.startsWith('_ng'))[0];
    return cls ? '.' + cls : '';
  })();

  console.log('[CC] teachOneField: root=', root.className, 'initialValue=', JSON.stringify(initialValue), 'triggerSel=', triggerSelector);
  root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const origOutline = root.style.outline;
  const origBoxShadow = root.style.boxShadow;
  root.style.outline = '2px solid #dc2626';
  root.style.boxShadow = '0 0 0 4px rgba(220,38,38,0.3)';

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);pointer-events:none;background:#dc2626;color:white;padding:10px 24px;border-radius:6px;font-size:15px;font-weight:bold;font-family:sans-serif;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.7);border:2px solid #ff6b6b;';
  host.textContent = 'âš  Click the highlighted dropdown, then select a value';
  const badge = host;
  document.body.appendChild(host);

  const posInterval = setInterval(() => {}, 5000); // no-op, badge is fixed center-top

  // triggerSelector and triggerCaptured declared above _runTeach to avoid TDZ

  function cleanup() {
    clearInterval(posInterval);
    clearInterval(statePoller);
    _mo.disconnect();
    document.removeEventListener('click', onTriggerClick, true);
    try { document.body.removeChild(host); } catch {}
    root.style.outline = origOutline;
    root.style.boxShadow = origBoxShadow;
    sessionStorage.removeItem('_cc_teach_active');
  }

  // Capture trigger click â€” works even if click is on child outside root bounds
  function onTriggerClick(e) {
    if (triggerCaptured) return;
    // Accept click anywhere near the root (within 200px) or inside it
    const rr = root.getBoundingClientRect();
    const inArea = e.clientX >= rr.left - 20 && e.clientX <= rr.right + 20 &&
                   e.clientY >= rr.top - 20 && e.clientY <= rr.bottom + 200;
    if (!inArea) return;
    const el = e.target;
    const cls = (el.className || '').trim().split(/\s+/).filter(c => c && !c.startsWith('ng-') && !c.startsWith('_ng'))[0];
    if (cls) triggerSelector = '.' + cls;
    triggerCaptured = true;
    badge.textContent = 'âš  Select an option from the list';
    document.removeEventListener('click', onTriggerClick, true);
  }
  document.addEventListener('click', onTriggerClick, true);

  // â”€â”€ Part 7: MutationObserver captures overlay subtree on trigger click â”€â”€
  let _teachOverlayRoot = null;
  const _teachAddedNodes = [];
  const _teachMo = new MutationObserver(mutations => {
    for (const m of mutations) {
      m.addedNodes.forEach(n => { if (n.nodeType === 1) _teachAddedNodes.push(n); });
    }
  });
  function isVisibleTeach(node) {
    const r = node.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(node);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }
  document.addEventListener('click', function _teachOverlayCapture(e) {
    const rr = root.getBoundingClientRect();
    const inArea = e.clientX >= rr.left - 20 && e.clientX <= rr.right + 20 &&
                   e.clientY >= rr.top - 20 && e.clientY <= rr.bottom + 200;
    if (!inArea) return;
    _teachAddedNodes.length = 0;
    _teachMo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      _teachMo.disconnect();
      for (const node of _teachAddedNodes) {
        if (!isVisibleTeach(node)) continue;
        const lis = Array.from(node.querySelectorAll('li')).filter(o => isVisibleTeach(o));
        if (lis.length > 0) { _teachOverlayRoot = node; break; }
      }
      console.log('[CC] teach overlay root:', _teachOverlayRoot ? _teachOverlayRoot.tagName + '.' + _teachOverlayRoot.className.slice(0,40) : 'none');
    }, 1000);
    document.removeEventListener('click', _teachOverlayCapture, true);
  }, true);

  // Use both MutationObserver (immediate) and polling (fallback) for change detection
  let _domChanged = false;
  const _mo = new MutationObserver(() => { _domChanged = true; });
  _mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });

  let statePoller = setInterval(() => {
    if (!_domChanged && getDisplayText() === initialValue) return; // nothing changed yet
    const currentValue = getDisplayText();
    const placeholder = /^(select|choose|--|please|select option|none|pick|-+)/i;
    if (currentValue && currentValue !== initialValue && !placeholder.test(currentValue)) {
      clearInterval(statePoller);
      _teachMo.disconnect();
      cleanup();

      let optionSelector = 'li';
      let containerSel = '';
      const searchRoot = _teachOverlayRoot || document;
      searchRoot.querySelectorAll('li, [class*="option"], [class*="item"]').forEach(el => {
        if (!isVisibleTeach(el) && el.offsetParent === null) return;
        if (el.textContent.trim() === currentValue) {
          const cls = (el.className || '').trim().split(/\s+/).filter(c => c && !c.startsWith('ng-') && !c.startsWith('_ng'))[0];
          optionSelector = cls ? (el.tagName.toLowerCase() + '.' + cls) : el.tagName.toLowerCase();
          if (_teachOverlayRoot) {
            const tag = _teachOverlayRoot.tagName.toLowerCase();
            const ccls = (_teachOverlayRoot.className || '').trim().split(/\s+/)[0] || '';
            containerSel = tag + (ccls ? '.' + ccls : '');
          } else {
            let c = el.parentElement;
            for (let i = 0; i < 6 && c && c !== document.body; i++) {
              const tag = c.tagName.toLowerCase();
              const ccls = (c.className || '').trim().split(/\s+/)[0] || '';
              if (tag === 'app-dropdown' || tag === 'ul' || ccls.includes('option') || ccls.includes('dropdown') || ccls.includes('list') || ccls.includes('menu')) {
                containerSel = tag + (ccls ? '.' + ccls : '');
                break;
              }
              c = c.parentElement;
            }
          }
        }
      });

      const result = {
        componentClass: root.className.trim().split(/\s+/)[0] || 'ng-dropdown',
        triggerSelector,
        optionsContainer: containerSel,
        optionSelector,
        verifySelector: verifySel,
        learnedValue: currentValue,
      };
      console.log('[CC] teachOneField result:', JSON.stringify(result));
      sessionStorage.setItem('_cc_teach_result', JSON.stringify(result));
    }
  }, 200);

  setTimeout(() => { cleanup(); }, 45000);
  } // end _runTeach
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function pollTeachResult(tabId, timeout) {
  return new Promise(resolve => {
    let elapsed = 0;
    const interval = setInterval(async () => {
      elapsed += 500;
      const r = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
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

/* ==== composer/src/composer.js ==== */
/**
 * cc-background/composer — Service worker entry point wiring.
 * Event listeners and bootstrap. Must be LAST in bg-bundle.js.
 */

console.log('[CC] bg-bundle loaded v' + (chrome.runtime.getManifest?.().version || '?'));

let _teachRunning = false;
let _lastTeachTs  = 0;

if (typeof ccKnowledgeSync !== 'undefined') ccKnowledgeSync.startPeriodicSync();
if (typeof ccStartAuthRefreshTimers === 'function') ccStartAuthRefreshTimers();
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  ccEnsureWss('onInstalled');
});
chrome.runtime.onStartup.addListener(() => ccEnsureWss('onStartup'));

try { chrome.alarms.create('cc_wss_keepalive', { periodInMinutes: 1 }); } catch (e) {}
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cc_wss_keepalive') { ccEnsureWss('keepalive_alarm'); return; }
  if (alarm.name === 'cc_teach_wake') {
    const { _cc_teach_job: job } = await chrome.storage.local.get('_cc_teach_job');
    if (!job || job.ts === _lastTeachTs || _teachRunning) return;
    _lastTeachTs = job.ts;
    chrome.storage.local.remove('_cc_teach_job');
    runTeachSession(job).catch(console.error);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.accessToken || changes.backendUrl) {
    const tokenGone = changes.accessToken?.newValue == null;
    if (tokenGone && typeof CcWssSession !== 'undefined') CcWssSession.disconnectWss('logout');
    else ccEnsureWss('storage_credentials');
  }
  if (!changes._cc_teach_job?.newValue) return;
  const job = changes._cc_teach_job.newValue;
  if (job.ts === _lastTeachTs || _teachRunning) return;
  _lastTeachTs = job.ts;
  chrome.storage.local.set({ _cc_teach_debug: 'received:' + job.hostname + ':tab:' + job.tabId });
  chrome.storage.local.remove('_cc_teach_job');
  runTeachSession(job).catch(console.error);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const trusted = ccIsTrustedFrontend(sender);
  if (CC_TRUSTED_ONLY_TYPES[msg.type] && !trusted) {
    console.warn('[CC] rejected ' + msg.type + ' from untrusted:', ccSenderOrigin(sender));
    sendResponse({ ok: false, error: 'untrusted sender' }); return true;
  }
  if (msg.type === 'CONNECT' || msg.type === 'PING' || msg.type === 'OPEN_AND_DISPATCH') {
    handleBridgeMessage(msg, sendResponse, trusted); return true;
  }
  if (msg.type === 'TEACH_JOB') {
    const job = msg.job;
    if (sender?.tab?.id && (!job.tabId || job.tabId === 0)) job.tabId = sender.tab.id;
    if (job.ts === _lastTeachTs || _teachRunning) { sendResponse({ ok: false }); return; }
    _lastTeachTs = job.ts; sendResponse({ ok: true });
    runTeachSession(job).catch(console.error);
  }
  if (msg.type === 'AUTOFILL_TRIGGER') {
    chrome.storage.local.set({ _cc_float_trigger: { profileId: msg.profileId, tabId: sender?.tab?.id, ts: Date.now() } });
    chrome.action.openPopup().catch(() => {});
    sendResponse({ ok: true, status: 'popup triggered' }); return true;
  }
  if (msg.type === 'GET_TAB_ID') { sendResponse({ tabId: sender?.tab?.id }); return true; }
  if (msg.type === 'DISPATCH_JOB') {
    const env = msg.envelope || msg;
    if (!env.jobId || !env.sessionId) { sendResponse({ ok: false, error: 'missing jobId/sessionId' }); return true; }
    if (env.executionType !== 'form_filling') { sendResponse({ ok: false, error: 'unsupported executionType' }); return true; }
    const tabId = sender?.tab?.id;
    if (!tabId) { sendResponse({ ok: false, error: 'no tab' }); return true; }
    isLegacyClientFillAllowed().then((allowed) => {
      if (!allowed) { sendResponse(legacyClientFillDenied('DISPATCH_JOB')); return; }
      sendResponse({ ok: true, accepted: true });
      runJobDispatch(env, tabId).catch(e => console.error('[CC] DISPATCH_JOB error:', e));
    }).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (typeof handleWssMessage === 'function') {
    if (handleWssMessage(msg, sendResponse)) return true;
  }
  return true;
});
