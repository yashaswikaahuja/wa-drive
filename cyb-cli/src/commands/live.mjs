import { requireAuth } from '../credentials.mjs';
import { listSessions, getSession, authMe } from '../api.mjs';
import { reportFromSession, formatSessionListLine } from '../report.mjs';

export async function cmdLive(flags) {
  const auth = requireAuth(flags);
  const pollMs = flags.pollMs || 3000;
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CYB LIVE — watch new operator fill sessions');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  API    ${auth.apiBase}`);
  console.log(`  Poll   every ${pollMs}ms`);
  console.log(`  Stop   Ctrl+C`);
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const me = await authMe(auth.apiBase, auth.accessToken);
    console.log(`Auth OK: ${me.email || me.name || me.id}\n`);
  } catch (e) {
    console.warn(`Auth check failed: ${e.message}\n`);
  }

  const seen = new Set();
  try {
    const existing = await listSessions(auth.apiBase, auth.accessToken, { limit: 50 });
    for (const s of existing) seen.add(s.id);
    console.log(`Seeded ${seen.size} existing sessions — waiting for NEW fills…\n`);
  } catch (e) {
    console.warn(`Seed failed: ${e.message}`);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const rows = await listSessions(auth.apiBase, auth.accessToken, { limit: 15 });
      for (const s of [...rows].reverse()) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        console.log(`\n>>> NEW SESSION`);
        try {
          const full = await getSession(auth.apiBase, auth.accessToken, s.id);
          console.log(formatSessionListLine(full));
          const { lines } = reportFromSession(full);
          console.log(lines.join('\n'));
        } catch (e) {
          console.error(`Failed to load ${s.id}: ${e.message}`);
        }
      }
    } catch (e) {
      console.warn(`[poll] ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
