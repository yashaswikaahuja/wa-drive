/**
 * Daily health monitor — the "proactive" part of the customer-success playbook.
 * Sweeps every live café, computes its health, and when one DROPS to at-risk (from a healthier,
 * activated band) it sends the owner a single WhatsApp digest. Runs on a cron; a per-day DB
 * leader election prevents duplicate alerts across the two backend instances.
 */
import cron from 'node-cron';
import { pool, OWNER_ALERT_PHONE, BRAND_NAME } from '@cybercontrol/backend-core';
import { computeHealth } from './cafeHealth.js';
import { notifyWhatsApp } from '@cybercontrol/backend-communications';

const ALERT_COOLDOWN_MS = 7 * 24 * 3600 * 1000; // don't re-alert the same café within a week

const SIGNALS_SQL = `
  SELECT w.id, w.name, w.created_at AS "createdAt",
    (SELECT max(uploaded_at) FROM drive_files df WHERE df.workspace_id = w.id) AS "lastUpload",
    (SELECT count(*) FROM drive_files df WHERE df.workspace_id = w.id AND df.uploaded_at > now() - interval '7 days')  AS "filesLast7",
    (SELECT count(*) FROM drive_files df WHERE df.workspace_id = w.id AND df.uploaded_at > now() - interval '14 days' AND df.uploaded_at <= now() - interval '7 days') AS "filesPrev7",
    (SELECT count(*) FROM drive_files df WHERE df.workspace_id = w.id AND df.uploaded_at > now() - interval '30 days') AS "filesLast30",
    EXISTS(SELECT 1 FROM whatsapp_numbers wn WHERE wn.workspace_id = w.id AND wn.is_current AND wn.disconnected_at IS NULL) AS "whatsappConnected",
    EXISTS(SELECT 1 FROM workspace_secrets s WHERE s.workspace_id = w.id AND s.key = 'drive_refresh_token') AS "driveLinked",
    (SELECT count(*) FROM users u WHERE u.workspace_id = w.id AND u.deleted_at IS NULL) AS operators
  FROM workspaces w WHERE w.deleted_at IS NULL`;

const FLAG_TEXT: Record<string, string> = {
  'no-whatsapp': 'WhatsApp not connected',
  'no-drive': 'Drive not linked',
  'connected-no-files': 'no documents yet',
  cooling: 'usage cooling down',
  dormant: 'dormant 30+ days',
};

function buildDigest(drops: { name: string; score: number; flags: string[] }[]): string {
  const lines = drops.slice(0, 15).map(d => {
    const why = d.flags.map(f => FLAG_TEXT[f]).filter(Boolean).join(', ');
    return `• *${d.name || 'Unnamed café'}* (health ${d.score})${why ? ' — ' + why : ''}`;
  });
  const more = drops.length > 15 ? `\n…and ${drops.length - 15} more.` : '';
  return (
    `⚡ *${BRAND_NAME} — health alert*\n\n` +
    `${drops.length} café${drops.length > 1 ? 's' : ''} just dropped to *at-risk*:\n\n` +
    `${lines.join('\n')}${more}\n\n` +
    `Open the owner panel to review and reach out.`
  );
}

// opts.skipLeader → bypass the once-a-day guard (used by the manual owner endpoint).
export async function runHealthSweep(opts: { skipLeader?: boolean } = {}): Promise<{ checked: number; drops: number; alerted: boolean }> {
  if (!opts.skipLeader) {
    const won = (await pool.query(
      "INSERT INTO owner_monitor_runs(run_date) VALUES (current_date) ON CONFLICT DO NOTHING RETURNING run_date"
    )).rows.length > 0;
    if (!won) return { checked: 0, drops: 0, alerted: false }; // another instance is handling today
  }

  const { rows } = await pool.query(SIGNALS_SQL);
  const drops: { id: string; name: string; score: number; flags: string[] }[] = [];

  for (const r of rows) {
    const h = computeHealth({
      createdAt: r.createdAt, lastUpload: r.lastUpload,
      filesLast7: +r.filesLast7, filesPrev7: +r.filesPrev7, filesLast30: +r.filesLast30,
      whatsappConnected: !!r.whatsappConnected, driveLinked: !!r.driveLinked, operators: +r.operators,
    });
    const prev = (await pool.query(
      'SELECT band, alerted_at FROM workspace_health_state WHERE workspace_id = $1', [r.id]
    )).rows[0];
    // Alert only when an ACTIVATED café that was doing OK slips to at-risk (the churn signal).
    const droppedToRisk = h.band === 'at-risk' && (prev?.band === 'healthy' || prev?.band === 'watch');
    const cooled = !prev?.alerted_at || (Date.now() - new Date(prev.alerted_at).getTime() > ALERT_COOLDOWN_MS);
    if (droppedToRisk && cooled) drops.push({ id: r.id, name: r.name, score: h.score, flags: h.flags });

    await pool.query(
      `INSERT INTO workspace_health_state (workspace_id, band, score) VALUES ($1,$2,$3)
       ON CONFLICT (workspace_id) DO UPDATE SET band = $2, score = $3, updated_at = now()`,
      [r.id, h.band, h.score]
    );
  }

  let alerted = false;
  if (drops.length && OWNER_ALERT_PHONE) {
    try {
      await notifyWhatsApp(OWNER_ALERT_PHONE, buildDigest(drops));
      await pool.query('UPDATE workspace_health_state SET alerted_at = now() WHERE workspace_id = ANY($1)', [drops.map(d => d.id)]);
      alerted = true;
    } catch (e: any) {
      console.warn('[HealthMonitor] digest send failed:', e?.message);
    }
  }
  console.log(`[HealthMonitor] swept ${rows.length} cafés · ${drops.length} new at-risk · alerted=${alerted}`);
  return { checked: rows.length, drops: drops.length, alerted };
}

// Schedule the daily sweep (09:30 IST). Safe to call on every instance — the leader guard dedupes.
export function scheduleHealthMonitor(): void {
  cron.schedule('30 9 * * *', () => { runHealthSweep().catch(e => console.warn('[HealthMonitor]', e?.message)); },
    { timezone: 'Asia/Kolkata' });
  console.log('[HealthMonitor] scheduled daily at 09:30 IST');
}
