import { requireAuth } from '../credentials.js';
import { authMe } from '../api.js';
import { credentialsPath, CLI_VERSION } from '../config.js';
import type { CliFlags } from '../types.js';

export async function cmdWhoami(flags: CliFlags): Promise<void> {
  const auth = await requireAuth(flags);
  let me;
  try {
    me = await authMe(auth.apiBase, auth.accessToken);
  } catch (e: any) {
    throw new Error(`${e.message}\n  Token may be expired — run: cyb login`);
  }
  console.log(`cyb v${CLI_VERSION}`);
  console.log(`API        ${auth.apiBase}`);
  console.log(`Auth       ${auth.source}`);
  console.log(`Creds      ${credentialsPath()}`);
  console.log(`User       ${me.name || '—'}  <${me.email || me.phone || me.id}>`);
  console.log(`User id    ${me.id}`);
  console.log(`Workspace  ${me.workspace_id || me.workspaceId || '—'}`);
  console.log(`Role       ${me.role || '—'}`);
  console.log(`Status     ${me.status || '—'}`);
}
