import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { OWNER_KEY } from '../../config.js';

/**
 * Network gate (primary). The owner listener is bound to the tailscale interface and the public LB
 * never proxies it, but we ALSO reject any peer that isn't on the tailnet CGNAT range
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

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Credential gate (defense-in-depth). Requires the shared OWNER_KEY, supplied as:
 *   • x-owner-key: <key>
 *   • Authorization: Bearer <key>
 *   • Authorization: Basic base64(anything:<key>)   ← lets a browser prompt natively
 * Constant-time compared to avoid timing leaks.
 */
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!OWNER_KEY) return res.status(503).json({ error: 'Owner access not configured' });
  const h = req.headers.authorization || '';
  let provided = '';
  if (req.headers['x-owner-key']) provided = String(req.headers['x-owner-key']);
  else if (h.startsWith('Bearer ')) provided = h.slice(7);
  else if (h.startsWith('Basic ')) {
    try { provided = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':').slice(1).join(':'); } catch { /* ignore */ }
  }
  if (!provided || !safeEqual(provided, OWNER_KEY)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="CyberControl Owner"');
    return res.status(401).json({ error: 'Invalid owner key' });
  }
  next();
}
