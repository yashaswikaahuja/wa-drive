/**
 * SW auth refresh — HTTPS /auth/me + /auth/refresh (token mint stays on hub).
 * Loaded via importScripts from background.js.
 */
/* global chrome, CcWssSession, ccEnsureWss */

async function validateAuth() {
  const { accessToken, refreshToken, backendUrl } = await chrome.storage.local.get([
    'accessToken',
    'refreshToken',
    'backendUrl',
  ]);
  if (!accessToken || !backendUrl) return;
  try {
    const res = await fetch(backendUrl + '/auth/me', {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    if (res.ok) {
      console.log('[CC] Auth valid');
      return;
    }
    if (refreshToken) {
      const rRes = await fetch(backendUrl + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (rRes.ok) {
        const data = await rRes.json();
        await chrome.storage.local.set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        });
        console.log('[CC] Auth refreshed');
        if (typeof ccEnsureWss === 'function') ccEnsureWss('auth_refreshed');
      } else {
        await chrome.storage.local.remove(['accessToken', 'refreshToken', 'user']);
        console.log('[CC] Auth expired, cleared');
        if (typeof CcWssSession !== 'undefined' && CcWssSession.disconnectWss) {
          CcWssSession.disconnectWss('auth_expired');
        }
      }
    }
  } catch (e) {
    console.log('[CC] Auth check failed:', e.message);
  }
}

function ccStartAuthRefreshTimers() {
  setTimeout(validateAuth, 5000);
  setInterval(validateAuth, 10 * 60 * 1000);
}
