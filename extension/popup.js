const CURRENT_VERSION = '5.33';

(async () => {
  document.getElementById('ver').textContent = 'v' + CURRENT_VERSION;
  try {
    const data = await chrome.storage.local.get(['accessToken', 'user', 'backendUrl']);
    if (data.accessToken && data.user && data.backendUrl) {
      // Verify token is still valid
      try {
        const res = await fetch(data.backendUrl + '/auth/me', {
          headers: { 'Authorization': 'Bearer ' + data.accessToken }
        });
        if (res.ok) {
          const user = await res.json();
          document.getElementById('conn-dot').classList.replace('red', 'green');
          document.getElementById('conn-text').textContent = 'Connected';
          document.getElementById('conn-detail').textContent =
            (user.name || user.email || 'Operator') + ' · ' + (user.role || 'operator');
          return;
        }
      } catch {}
    }
    // Not authenticated
    document.getElementById('conn-text').textContent = 'Not connected';
    document.getElementById('conn-detail').textContent = 'Login to CyberControl in your browser';
  } catch (e) {
    document.getElementById('conn-detail').textContent = 'Status check failed';
  }
})();
