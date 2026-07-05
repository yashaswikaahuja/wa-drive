import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, OWNER_EMAILS } from '../../config.js';

/**
 * Network gate (defense-in-depth). The owner listener is bound to the tailscale interface and the
 * public LB never proxies it, but we ALSO reject any peer that isn't on the tailnet CGNAT range
 * (100.64.0.0/10) or loopback — so even a misconfigured port publish can't leak the owner API.
 */
export function tailnetOnly(req: Request, res: Response, next: NextFunction) {
  const raw = (req.socket.remoteAddress || '').replace('::ffff:', '');
  const isLoopback = raw === '127.0.0.1' || raw === '::1';
  // 100.64.0.0/10  → first octet 100, second octet 64–127.
  const m = raw.match(/^100\.(\d+)\./);
  const isTailnet = !!m && Number(m[1]) >= 64 && Number(m[1]) <= 127;
  if (isLoopback || isTailnet) return next();
  return res.status(403).json({ error: 'Forbidden: off-tailnet' });
}

/**
 * Identity gate. Requires a valid access-token JWT whose user's email is in OWNER_EMAILS.
 * The JWT payload carries only userId, so we resolve the email from the DB (owner traffic is tiny).
 */
export function requireOwner(req: any, res: Response, next: NextFunction) {
  if (!OWNER_EMAILS.length) return res.status(503).json({ error: 'Owner access not configured' });
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  let decoded: any;
  try { decoded = jwt.verify(header.slice(7), JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }

  req.pool.query('SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL', [decoded.userId])
    .then((r: any) => {
      const email = (r.rows[0]?.email || '').toLowerCase();
      if (!email || !OWNER_EMAILS.includes(email)) return res.status(403).json({ error: 'Not an owner' });
      req.owner = { userId: decoded.userId, email };
      next();
    })
    .catch((e: any) => res.status(500).json({ error: e.message }));
}
