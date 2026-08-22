// Load knowledge sync client (must be first â€” other code references ccKnowledgeSync)
try { importScripts('knowledge-sync.js'); } catch (e) { console.warn('[CC] knowledge-sync.js load failed:', e.message); }
// Phase 0 (CYB-85): cafÃ© default blocks DISPATCH_JOB / Agent client mapping path
try { importScripts('shared-bundle.js'); } catch (e) { console.warn('[CC] shared-bundle load failed:', e.message); }
// T4 Stage A â€” WSS presence (auth after token mint)
try { importScripts('sw/wss-bundle.js'); } catch (e) { console.warn('[CC] wss-bundle load failed:', e.message); }
// SW facades (MIG-BG-01 lite) â€” keep background.js as thin composer
try { importScripts('sw/wss-bridge.js'); } catch (e) { console.warn('[CC] sw/wss-bridge load failed:', e.message); }
try { importScripts('sw/auth-refresh.js'); } catch (e) { console.warn('[CC] sw/auth-refresh load failed:', e.message); }

// #270 cc-bg-auth — auth guards (isLegacyClientFillAllowed, ccIsTrustedFrontend, etc.)
try { importScripts('sw/bg-auth.js'); } catch (e) { console.warn('[CC] bg-auth load failed:', e.message); }
// #271 cc-bg-label-utils — normalizeLabel, getSemanticKey, calcConfidence
try { importScripts('sw/bg-label-utils.js'); } catch (e) { console.warn('[CC] bg-label-utils load failed:', e.message); }
// #272 cc-bg-wss-manager — WSS message handler dispatcher
try { importScripts('sw/bg-wss-manager.js'); } catch (e) { console.warn('[CC] bg-wss-manager load failed:', e.message); }
// #273 cc-bg-bridge — port handler, handleBridgeMessage, onMessageExternal
try { importScripts('sw/bg-bridge.js'); } catch (e) { console.warn('[CC] bg-bridge load failed:', e.message); }
// #274 cc-bg-job-dispatch — runJobDispatch
try { importScripts('sw/bg-job-dispatch.js'); } catch (e) { console.warn('[CC] bg-job-dispatch load failed:', e.message); }
// #275 cc-bg-teach — runTeachSession, groqAutoTeach, teachOneField
try { importScripts('sw/bg-teach.js'); } catch (e) { console.warn('[CC] bg-teach load failed:', e.message); }


// â”€â”€ Knowledge Sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Start periodic knowledge sync (bootstrap on first run, delta after that).
// ccKnowledgeSync is defined in knowledge-sync.js (imported via manifest).
if (typeof ccKnowledgeSync !== 'undefined') {
  ccKnowledgeSync.startPeriodicSync();
}

// Side panel (ChatGPT-style right sidebar): toolbar icon opens the panel, not a dropdown popup.
// Requires sidePanel permission + side_panel.default_path in manifest; no action.default_popup.
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => {
    console.warn('[CC] setPanelBehavior failed:', e?.message || e);
  });
}

// Content script handles bridge via manifest injection â€” no manual injection needed
chrome.runtime.onInstalled.addListener(() => {
  console.log('[CC] Extension installed/updated');
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
  ccEnsureWss('onInstalled');
});

chrome.runtime.onStartup.addListener(() => {
  ccEnsureWss('onStartup');
});

// Alarm keeps SW warm enough to maintain / retry WSS (MV3)
try {
  chrome.alarms.create('cc_wss_keepalive', { periodInMinutes: 1 });
} catch (e) { /* ignore */ }
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'cc_wss_keepalive') return;
  ccEnsureWss('keepalive_alarm');
});

// SW stays alive via chrome.runtime.onMessage (wakes on demand)
// No keepalive alarm needed with sendMessage-based bridge

// Background service worker â€” owns teach session, survives popup close

// Wake on storage change â€” more reliable than sendMessage for waking SW
let _teachRunning = false;
let _lastTeachTs = 0;
// Alarm-based wake â€” most reliable way to wake sleeping SW in MV3
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'cc_teach_wake') return;
  const data = await chrome.storage.local.get('_cc_teach_job');
  const job = data._cc_teach_job;
  if (!job) return;
  if (job.ts === _lastTeachTs || _teachRunning) return;
  _lastTeachTs = job.ts;
  chrome.storage.local.remove('_cc_teach_job');
  console.log('[CC] alarm woke SW for teach:', job.hostname);
  runTeachSession(job).catch(console.error);
});

// HTTPS token validate/refresh (sw/auth-refresh.js)
if (typeof ccStartAuthRefreshTimers === 'function') ccStartAuthRefreshTimers();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // SEC-003: reject auth/state-mutating bridge messages from untrusted senders.
  const trusted = ccIsTrustedFrontend(sender);
  if (CC_TRUSTED_ONLY_TYPES[msg.type] && !trusted) {
    console.warn('[CC] rejected ' + msg.type + ' from untrusted sender:', ccSenderOrigin(sender));
    sendResponse({ ok: false, error: 'untrusted sender' });
    return true;
  }
  // Bridge messages from content script (CONNECT, PING, OPEN_AND_DISPATCH)
  if (msg.type === 'CONNECT' || msg.type === 'PING' || msg.type === 'OPEN_AND_DISPATCH') {
    handleBridgeMessage(msg, sendResponse, trusted);
    return true;
  }
  if (msg.type === 'TEACH_JOB') {
    const job = msg.job;
    // Use sender tab ID if job tabId is missing/invalid
    if (sender?.tab?.id && (!job.tabId || job.tabId === 0)) job.tabId = sender.tab.id;
    if (job.ts === _lastTeachTs || _teachRunning) { sendResponse({ ok: false }); return; }
    _lastTeachTs = job.ts;
    sendResponse({ ok: true });
    runTeachSession(job).catch(console.error);
  }
  if (msg.type === 'AUTOFILL_TRIGGER') {
    // Store trigger and open popup â€” popup handles the full pipeline
    const { profileId } = msg;
    const tabId = sender?.tab?.id;
    chrome.storage.local.set({ _cc_float_trigger: { profileId, tabId, ts: Date.now() } });
    // Open popup programmatically (Chrome 99+)
    chrome.action.openPopup().catch(() => {});
    sendResponse({ ok: true, status: 'popup triggered' });
    return true;
  }
  if (msg.type === 'GET_TAB_ID') {
    sendResponse({ tabId: sender?.tab?.id });
  }
  if (msg.type === 'DISPATCH_JOB') {
    // Phase A: extension receives dispatch envelope, runs runtime, reports back
    // Envelope: { type, version, jobId, sessionId, serviceType, executionType, payload }
    // Phase 0 (CYB-85): gated â€” cafÃ© default must use side-panel Fill only.
    const env = msg.envelope || msg;
    if (!env.jobId || !env.sessionId) { sendResponse({ ok: false, error: 'missing jobId/sessionId' }); return true; }
    if (env.executionType !== 'form_filling') { sendResponse({ ok: false, error: 'unsupported executionType: ' + env.executionType }); return true; }
    const tabId = sender?.tab?.id;
    if (!tabId) { sendResponse({ ok: false, error: 'no tab' }); return true; }
    isLegacyClientFillAllowed().then((allowed) => {
      if (!allowed) {
        const denied = legacyClientFillDenied('DISPATCH_JOB');
        console.warn('[CC]', denied.error);
        sendResponse(denied);
        return;
      }
      sendResponse({ ok: true, accepted: true });
      runJobDispatch(env, tabId).catch(e => console.error('[CC] DISPATCH_JOB error:', e));
    }).catch((e) => {
      sendResponse({ ok: false, error: e.message || 'legacy gate failed' });
    });
    return true;
  }

  // #272 cc-bg-wss-manager — WSS message handlers delegated to package
  if (typeof handleWssMessage === 'function') {
    const handled = handleWssMessage(msg, sendResponse);
    if (handled) return true;
  }

  return true;
});


