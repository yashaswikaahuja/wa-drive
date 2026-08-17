import { resolveApiBase, credentialsPath, CLI_VERSION, configDir } from '../config.mjs';
import { loadCredentials } from '../credentials.mjs';
import { apiRequest, authMe } from '../api.mjs';

export async function cmdStatus(flags) {
  const apiBase = resolveApiBase(flags);
  const creds = loadCredentials();
  console.log(`cyb v${CLI_VERSION}`);
  console.log(`API        ${apiBase}`);
  console.log(`Config     ${configDir()}`);
  console.log(`Creds file ${credentialsPath()}`);
  console.log(`Logged in  ${creds?.accessToken ? 'yes' : 'no'}`);
  if (creds?.user) {
    console.log(`Saved user ${creds.user.email || creds.user.name || creds.user.id || '—'}`);
  }

  // health — extension-service health if present
  try {
    const h = await apiRequest(apiBase, '/extension/health', { timeoutMs: 10000 });
    console.log(`Health     HTTP ${h.status} ${h.ok ? 'ok' : 'fail'}`);
  } catch (e) {
    console.log(`Health     ${e.message.slice(0, 120)}`);
  }

  // device login page present? (GET authorize — no device_code created)
  try {
    const d = await apiRequest(apiBase, '/auth/cli/authorize', { timeoutMs: 10000 });
    const ready = d.ok && (d.status === 200) && String(d.text || '').includes('CyberControl CLI');
    console.log(
      `CLI auth   ${ready ? 'browser device-flow ready' : `HTTP ${d.status} (use cyb login --email or --token until /auth/cli deployed)`}`
    );
  } catch (e) {
    console.log(`CLI auth   unreachable (${e.message.slice(0, 80)})`);
  }

  if (creds?.accessToken) {
    try {
      const me = await authMe(creds.apiBase || apiBase, creds.accessToken);
      console.log(`Whoami     ${me.email || me.name || me.id}  role=${me.role}`);
    } catch (e) {
      console.log(`Whoami     token invalid — run cyb login  (${e.message.slice(0, 60)})`);
    }
  }
}
