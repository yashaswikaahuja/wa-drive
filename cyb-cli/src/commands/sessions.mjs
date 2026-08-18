import { requireAuth } from '../credentials.mjs';
import { listSessions, getSession } from '../api.mjs';
import { formatSessionListLine, reportFromSession } from '../report.mjs';

export async function cmdSessions(flags) {
  const auth = await requireAuth(flags);
  const limit = flags.limit || 20;
  console.log(`API ${auth.apiBase}  (limit=${limit})\n`);
  const rows = await listSessions(auth.apiBase, auth.accessToken, { limit });
  if (!rows.length) {
    console.log('(no sessions)');
    return;
  }
  for (const s of rows) {
    let full = s;
    // enrich when list is thin
    if (!s.records || !(s.runtimeVersion || s.runtime_version)) {
      try {
        full = await getSession(auth.apiBase, auth.accessToken, s.id);
      } catch {
        full = s;
      }
    }
    console.log(formatSessionListLine(full));
    console.log('');
  }
  console.log(`Detail:  cyb session <id>`);
}

export async function cmdSession(flags) {
  const auth = await requireAuth(flags);
  const id = flags.id || flags._[0];
  if (!id) throw new Error('Usage: cyb session <session-uuid>');
  const session = await getSession(auth.apiBase, auth.accessToken, id);
  const { lines } = reportFromSession(session);
  console.log(lines.join('\n'));
}
