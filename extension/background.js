// background.js — thin composer. All logic lives in packages/cc-bg-*/
// Edit source in packages/, rebuild with: pnpm build

// ── Imports ────────────────────────────────────────────────────────────────────
try { importScripts('knowledge-sync.js');       } catch (e) { console.warn('[CC] knowledge-sync load failed:', e.message); }
try { importScripts('shared-bundle.js');         } catch (e) { console.warn('[CC] shared-bundle load failed:', e.message); }
try { importScripts('sw/wss-bundle.js');         } catch (e) { console.warn('[CC] wss-bundle load failed:', e.message); }
try { importScripts('sw/wss-bridge.js');         } catch (e) { console.warn('[CC] wss-bridge load failed:', e.message); }
try { importScripts('sw/auth-refresh.js');       } catch (e) { console.warn('[CC] auth-refresh load failed:', e.message); }
try { importScripts('sw/background/bg-auth.js');            } catch (e) { console.warn('[CC] bg-auth load failed:', e.message); }
try { importScripts('sw/background/bg-label-utils.js');     } catch (e) { console.warn('[CC] bg-label-utils load failed:', e.message); }
try { importScripts('sw/background/bg-wss-manager.js');     } catch (e) { console.warn('[CC] bg-wss-manager load failed:', e.message); }
try { importScripts('sw/background/bg-bridge.js');          } catch (e) { console.warn('[CC] bg-bridge load failed:', e.message); }
try { importScripts('sw/background/bg-job-dispatch.js');    } catch (e) { console.warn('[CC] bg-job-dispatch load failed:', e.message); }
try { importScripts('sw/background/bg-teach.js');           } catch (e) { console.warn('[CC] bg-teach load failed:', e.message); }

console.log('[CC] background.js loaded v' + (chrome.runtime.getManifest?.().version || '?'));

// ── Shared teach state (referenced by onMessage + bg-teach) ───────────────────
let _teachRunning = false;
let _lastTeachTs  = 0;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
if (typeof ccKnowledgeSync !== 'undefined') ccKnowledgeSync.startPeriodicSync();
if (typeof ccStartAuthRefreshTimers === 'function') ccStartAuthRefreshTimers();

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// ── Lifecycle listeners ────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log('[CC] Extension installed/updated');
  if (chrome.sidePanel?.setPanelBehavior) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  ccEnsureWss('onInstalled');
});

chrome.runtime.onStartup.addListener(() => ccEnsureWss('onStartup'));

// ── Alarms ────────────────────────────────────────────────────────────────────
try { chrome.alarms.create('cc_wss_keepalive', { periodInMinutes: 1 }); } catch (e) { /* ignore */ }

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cc_wss_keepalive') { ccEnsureWss('keepalive_alarm'); return; }
  if (alarm.name === 'cc_teach_wake') {
    const { _cc_teach_job: job } = await chrome.storage.local.get('_cc_teach_job');
    if (!job || job.ts === _lastTeachTs || _teachRunning) return;
    _lastTeachTs = job.ts;
    chrome.storage.local.remove('_cc_teach_job');
    console.log('[CC] alarm woke SW for teach:', job.hostname);
    runTeachSession(job).catch(console.error);
  }
});

// ── Storage changes ────────────────────────────────────────────────────────────
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
  console.log('[CC] SW teach job received:', job.hostname, job.fields?.length, 'fields');
  chrome.storage.local.set({ _cc_teach_debug: 'received:' + job.hostname + ':tab:' + job.tabId });
  chrome.storage.local.remove('_cc_teach_job');
  runTeachSession(job).catch(console.error);
});

// ── Message router ─────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const trusted = ccIsTrustedFrontend(sender);

  // SEC-003: block auth-mutating messages from untrusted senders
  if (CC_TRUSTED_ONLY_TYPES[msg.type] && !trusted) {
    console.warn('[CC] rejected ' + msg.type + ' from untrusted:', ccSenderOrigin(sender));
    sendResponse({ ok: false, error: 'untrusted sender' });
    return true;
  }

  // Bridge: CONNECT / PING / OPEN_AND_DISPATCH
  if (msg.type === 'CONNECT' || msg.type === 'PING' || msg.type === 'OPEN_AND_DISPATCH') {
    handleBridgeMessage(msg, sendResponse, trusted);
    return true;
  }

  // Teach
  if (msg.type === 'TEACH_JOB') {
    const job = msg.job;
    if (sender?.tab?.id && (!job.tabId || job.tabId === 0)) job.tabId = sender.tab.id;
    if (job.ts === _lastTeachTs || _teachRunning) { sendResponse({ ok: false }); return; }
    _lastTeachTs = job.ts;
    sendResponse({ ok: true });
    runTeachSession(job).catch(console.error);
  }

  // Float trigger → open popup
  if (msg.type === 'AUTOFILL_TRIGGER') {
    chrome.storage.local.set({ _cc_float_trigger: { profileId: msg.profileId, tabId: sender?.tab?.id, ts: Date.now() } });
    chrome.action.openPopup().catch(() => {});
    sendResponse({ ok: true, status: 'popup triggered' });
    return true;
  }

  if (msg.type === 'GET_TAB_ID') {
    sendResponse({ tabId: sender?.tab?.id });
    return true;
  }

  // Job dispatch (legacy gated)
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

  // WSS handlers (cc-bg-wss-manager)
  if (typeof handleWssMessage === 'function') {
    if (handleWssMessage(msg, sendResponse)) return true;
  }

  return true;
});
