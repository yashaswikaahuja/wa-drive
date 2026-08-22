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
