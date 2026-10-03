/**
 * WSS outbound bridge factory — injected by extension-service at boot.
 * Packages must not import the app (`extension-service/src/ws/server.js`).
 */
export function createWsBridge(name: string) {
  let _send: ((sessionId: string, message: object) => boolean | void) | null = null;

  function setWsSend(fn: (sessionId: string, message: object) => boolean | void) {
    if (typeof fn !== 'function') throw new TypeError('setWsSend requires a function');
    _send = fn;
  }

  function send(sessionId: string, message: object) {
    if (!_send) {
      console.warn(`[${name}] WSS send not configured — dropping message`, (message as { type?: string })?.type);
      return false;
    }
    return _send(sessionId, message);
  }

  return { setWsSend, send };
}
