/**
 * Tier-2 of the location waterfall: silent, consent-free, coarse IP → city.
 * Uses the free ip-api.com (no key). Best-effort — never throws, never blocks auth.
 * Only ever fills a workspace's location when it's still EMPTY (a GPS/manual value always wins).
 */
import { pool } from '../db.js';

/** Extract the real public client IP from the proxy chain (Cloud LB → nginx → backend). */
export function clientIp(req: any): string | null {
  const xff = String(req?.headers?.['x-forwarded-for'] || '');
  const candidates = xff.split(',').map(s => s.trim()).filter(Boolean);
  if (req?.socket?.remoteAddress) candidates.push(String(req.socket.remoteAddress));
  for (const raw of candidates) {
    const ip = raw.replace('::ffff:', '');
    if (isPublic(ip)) return ip;
  }
  return null;
}

function isPublic(ip: string): boolean {
  if (!ip) return false;
  if (ip === '127.0.0.1' || ip === '::1') return false;
  if (/^10\./.test(ip)) return false;
  if (/^192\.168\./.test(ip)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return false;
  if (/^169\.254\./.test(ip)) return false;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return false; // tailnet CGNAT
  if (/^(fe80|fc|fd)/i.test(ip)) return false;                            // link-local / ULA
  return true;
}

/** Coarse city lookup for an IP. Returns e.g. "Patna, Bihar" or null. */
export async function ipCity(ip: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName`, { signal: ctrl.signal });
    clearTimeout(t);
    const j: any = await r.json();
    if (j?.status !== 'success') return null;
    return [j.city, j.regionName].filter(Boolean).join(', ') || null;
  } catch { return null; }
}

/** Fire-and-forget: if the workspace has no location yet, stamp a coarse IP city (tier 2). */
export async function captureIpLocation(req: any, workspaceId: string): Promise<void> {
  try {
    const cur = (await pool.query('SELECT location FROM workspaces WHERE id = $1', [workspaceId])).rows[0];
    if (!cur || cur.location) return;                 // already have something better → leave it
    const ip = clientIp(req);
    if (!ip) return;
    const city = await ipCity(ip);
    if (!city) return;
    // Guard again with `location IS NULL` so a concurrent GPS/manual write is never clobbered.
    await pool.query(
      "UPDATE workspaces SET location = $1, location_source = 'ip', detected_ip = $2, updated_at = now() WHERE id = $3 AND location IS NULL",
      [city, ip, workspaceId]
    );
  } catch { /* best-effort — location is a nice-to-have, never break auth */ }
}
