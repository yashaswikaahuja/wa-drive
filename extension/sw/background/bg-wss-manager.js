/** AUTO-GENERATED — source: packages/cc-background/wss-manager/src/wss-manager.js */
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
