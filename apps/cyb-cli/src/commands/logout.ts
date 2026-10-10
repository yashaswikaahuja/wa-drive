import { clearCredentials, loadCredentials } from '../credentials.js';
import { credentialsPath } from '../config.js';
import { apiRequest } from '../api.js';
import type { CliFlags } from '../types.js';

export async function cmdLogout(flags: CliFlags): Promise<void> {
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
