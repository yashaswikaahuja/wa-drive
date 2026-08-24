import { memStats } from './metrics.js';

export function createHeartbeat({ config, sessions, parent, startSession }) {
  const { WA_INSTANCE_NAME, WA_ACCEPT_THRESHOLD_PCT, HEARTBEAT_MS, pgPool } = config;
  const { sendHeartbeatPayload } = parent;

  async function sendHeartbeat() {
    if (!WA_INSTANCE_NAME) return;
    const { mem_pct } = memStats();
    const accepting = mem_pct < WA_ACCEPT_THRESHOLD_PCT;
    try {
      await sendHeartbeatPayload({
        instance: WA_INSTANCE_NAME,
        mem_pct,
        sessions: sessions.size,
        accepting,
      });
    } catch {
      /* hub unreachable → hub will mark us dead */
    }
  }

  async function resumeAssignedSessions() {
    if (!pgPool || !WA_INSTANCE_NAME) return;
    try {
      const { rows } = await pgPool.query(
        'SELECT workspace_id FROM wa_assignments WHERE instance=$1',
        [WA_INSTANCE_NAME],
      );
      console.log(
        `[WhatsApp Service] Resuming ${rows.length} assigned session(s) for ${WA_INSTANCE_NAME}`,
      );
      for (const r of rows) {
        startSession(r.workspace_id).catch((e) =>
          console.warn(`[resume] ${r.workspace_id.slice(0, 8)}: ${e.message}`),
        );
      }
    } catch (e) {
      console.warn(`[WhatsApp Service] resume skipped: ${e.message}`);
    }
  }

  function startHeartbeatLoop() {
    if (!WA_INSTANCE_NAME) return null;
    sendHeartbeat();
    return setInterval(sendHeartbeat, HEARTBEAT_MS);
  }

  return { sendHeartbeat, resumeAssignedSessions, startHeartbeatLoop };
}
