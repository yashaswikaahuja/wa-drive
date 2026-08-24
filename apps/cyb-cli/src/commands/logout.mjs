import { clearCredentials, loadCredentials } from '../credentials.mjs';
import { credentialsPath } from '../config.mjs';
import { apiRequest } from '../api.mjs';

export async function cmdLogout(flags) {
  const creds = loadCredentials();
  if (creds?.accessToken && creds?.apiBase && !flags.localOnly) {
    try {
      await apiRequest(creds.apiBase, '/auth/logout', {
        method: 'POST',
        token: creds.accessToken,
        body: {},
        timeoutMs: 10000,
      });
    } catch {
      /* offline logout still clears local */
    }
  }
  const path = clearCredentials();
  console.log(`Logged out. Removed ${path || credentialsPath()}`);
}
