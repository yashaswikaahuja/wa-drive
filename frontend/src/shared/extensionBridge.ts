/**
 * Frontend ↔ Extension Bridge
 * Auto-connects extension on login + token refresh. No popup config needed.
 */

const EXTENSION_ID = 'llphjmofhplaokidflpbpfjcalegabpo';

declare global {
  interface Window { chrome?: any; }
}

interface ConnectPayload {
  accessToken: string;
  refreshToken: string | null;
  user: any;
  backendUrl: string;
}

export const extensionBridge = {
  isAvailable(): boolean {
    return !!(window.chrome && window.chrome.runtime && window.chrome.runtime.sendMessage);
  },

  async ping(): Promise<{ ok: boolean; version?: string }> {
    if (!this.isAvailable()) return { ok: false };
    return new Promise((resolve) => {
      try {
        window.chrome.runtime.sendMessage(EXTENSION_ID, { type: 'PING' }, (resp: any) => {
          if (window.chrome.runtime.lastError) resolve({ ok: false });
          else resolve(resp || { ok: false });
        });
      } catch { resolve({ ok: false }); }
    });
  },

  async connect(payload: ConnectPayload): Promise<{ ok: boolean; error?: string; version?: string }> {
    if (!this.isAvailable()) return { ok: false, error: 'Chrome extension API not available' };
    return new Promise((resolve) => {
      try {
        window.chrome.runtime.sendMessage(EXTENSION_ID, {
          type: 'CONNECT',
          token: payload.accessToken,
          refreshToken: payload.refreshToken,
          user: payload.user,
          backendUrl: payload.backendUrl,
        }, (resp: any) => {
          if (window.chrome.runtime.lastError) resolve({ ok: false, error: window.chrome.runtime.lastError.message });
          else resolve(resp || { ok: false });
        });
      } catch (e: any) { resolve({ ok: false, error: e.message }); }
    });
  },

  async openAndDispatch(envelope: any, formUrl: string): Promise<{ ok: boolean; tabId?: number; error?: string }> {
    if (!this.isAvailable()) return { ok: false, error: 'Extension not available' };
    return new Promise((resolve) => {
      try {
        window.chrome.runtime.sendMessage(EXTENSION_ID, {
          type: 'OPEN_AND_DISPATCH',
          envelope,
          formUrl,
        }, (resp: any) => {
          if (window.chrome.runtime.lastError) resolve({ ok: false, error: window.chrome.runtime.lastError.message });
          else resolve(resp || { ok: false });
        });
      } catch (e: any) { resolve({ ok: false, error: e.message }); }
    });
  },
};
