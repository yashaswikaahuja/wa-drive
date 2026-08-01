/**
 * Proactive WA failover — runs every 60s on each backend instance.
 * Finds workspaces assigned to dead WA instances and reassigns them to healthy ones,
 * then triggers /sessions/start so they reconnect from DB-backed auth (no QR re-scan).
 *
 * Leader election: not needed — the reassignment uses an atomic UPDATE ... WHERE so
 * concurrent backends won't conflict (one wins the row, the other is a no-op).
 */
import { pool } from '../db.js';
import { WA_SECRET, WA_DEAD_AFTER_MS } from '../config.js';

const FAILOVER_INTERVAL_MS = 60_000; // check every 60s

async function runFailover() {
  try {
    // Find assignments pointing to instances that have NOT heartbeat within the dead window.
    const { rows: stale } = await pool.query(
      `SELECT a.workspace_id, a.instance AS dead_instance
       FROM wa_assignments a
       LEFT JOIN wa_instances i ON i.instance = a.instance
       WHERE i.instance IS NULL
          OR i.last_seen < now() - ($1::double precision * interval '1 millisecond')`,
      [WA_DEAD_AFTER_MS]
    );
    if (!stale.length) return;

    // Find healthy instances (recent heartbeat + accepting).
    const { rows: healthy } = await pool.query(
      `SELECT instance, mem_pct FROM wa_instances
       WHERE last_seen > now() - ($1::double precision * interval '1 millisecond')
         AND accepting = true
       ORDER BY mem_pct ASC`,
      [WA_DEAD_AFTER_MS]
    );
    if (!healthy.length) {
      // No healthy accepting instance — try any alive instance (best effort).
      const { rows: anyAlive } = await pool.query(
        `SELECT instance, mem_pct FROM wa_instances
         WHERE last_seen > now() - ($1::double precision * interval '1 millisecond')
         ORDER BY mem_pct ASC`,
        [WA_DEAD_AFTER_MS]
      );
      if (!anyAlive.length) return; // all down — nothing we can do
      healthy.push(...anyAlive);
    }

    // Round-robin across healthy instances (lowest mem first).
    let idx = 0;
    for (const { workspace_id, dead_instance } of stale) {
      const target = healthy[idx % healthy.length].instance;
      // Atomic: only update if still pointing at the dead instance (prevents race with user-triggered failover).
      const { rowCount } = await pool.query(
        `UPDATE wa_assignments SET instance = $1, assigned_at = now()
         WHERE workspace_id = $2 AND instance = $3`,
        [target, workspace_id, dead_instance]
      );
      if (rowCount) {
        console.log(`[Failover] ws=${workspace_id.slice(0, 8)}: ${dead_instance} (dead) → ${target}`);
        // Trigger session start on the new instance (best-effort, don't block).
        fetch(`http://${target}:3100/sessions/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
          body: JSON.stringify({ workspaceId: workspace_id }),
        }).catch(() => {});
      }
      idx++;
    }
  } catch (e: any) {
    // Don't crash the backend — just log and retry next interval.
    console.warn(`[Failover] error: ${e.message}`);
  }
}

export function scheduleWaFailover() {
  console.log(`[Failover] Proactive WA failover check every ${FAILOVER_INTERVAL_MS / 1000}s`);
  setInterval(runFailover, FAILOVER_INTERVAL_MS);
  // Run once immediately on startup (catches stale assignments from before a backend restart).
  setTimeout(runFailover, 5_000);
}
