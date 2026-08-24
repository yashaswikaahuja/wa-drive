/**
 * WSS outbound bridge — injected by extension-service at boot.
 * Packages must not import the app (`extension-service/src/ws/server.js`).
 */
let _send = null;

/** @param {(sessionId: string, message: object) => boolean|void} fn */
export function setWsSend(fn) {
  if (typeof fn !== 'function') throw new TypeError('setWsSend requires a function');
  _send = fn;
}

export function send(sessionId, message) {
  if (!_send) {
    console.warn('[svc-runtime] WSS send not configured — dropping message', message?.type);
    return false;
  }
  return _send(sessionId, message);
}
