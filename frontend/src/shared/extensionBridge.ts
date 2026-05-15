/**
 * Frontend ↔ Extension Bridge (postMessage-based)
 *
 * Works from ANY URL — no externally_connectable whitelist needed.
 * The content script in the extension relays window.postMessage → chrome.runtime.sendMessage.
 *
 * Flow:
 *   frontend → window.postMessage({ _cc: true, type, ...payload })
 *   content.js → chrome.runtime.sendMessage(background)
 *   background → response
 *   content.js → window.postMessage({ _cc_reply: true, _reqId, response })
 *   frontend → resolves promise
 */

let _reqCounter = 0;

function sendToExtension(msg: Record<string, unknown>, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve) => {
    const reqId = ++_reqCounter;
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({ ok: false, error: 'Extension not responding — ensure CyberControl extension is installed and enabled' });
    }, timeoutMs);

    function handler(event: MessageEvent) {
      if (!event.data?._cc_reply || event.data._reqId !== reqId) return;
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      if (event.data.err) resolve({ ok: false, error: event.data.err });
      else resolve(event.data.response ?? { ok: false });
    }

    window.addEventListener('message', handler);
    window.postMessage({ _cc: true, _reqId: reqId, ...msg }, '*');
  });
}

interface ConnectPayload {
  accessToken: string;
  refreshToken: string | null;
  user: any;
  backendUrl: string;
}

export const extensionBridge = {
  isAvailable(): boolean {
    // Extension is available if content script is injected (we can't know for sure
    // until we try, so always return true and let the timeout handle it)
    return true;
  },

  async ping(): Promise<{ ok: boolean; version?: string }> {
    return sendToExtension({ type: 'PING' }, 2000);
  },

  async connect(payload: ConnectPayload): Promise<{ ok: boolean; error?: string; version?: string }> {
    return sendToExtension({
      type: 'CONNECT',
      token: payload.accessToken,
      refreshToken: payload.refreshToken,
      user: payload.user,
      backendUrl: payload.backendUrl,
    });
  },

  async openAndDispatch(envelope: any, formUrl: string): Promise<{ ok: boolean; tabId?: number; error?: string }> {
    // Longer timeout — opening a tab takes time
    return sendToExtension({ type: 'OPEN_AND_DISPATCH', envelope, formUrl }, 8000);
  },
};
