/**
 * Shared auth helpers used by both the core routes and the verification routes.
 */
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { pool, auditLog } from '../../db.js';
import { signAccessToken, signRefreshToken } from '../../middleware/auth.js';

// ── HttpOnly refresh cookie (web) ────────────────────────────────────────────
// The web app moves its refresh token out of JS-readable localStorage into this cookie.
// The extension is unaffected (keeps token-in-storage + body refresh). /refresh accepts the
// token from EITHER the cookie (web) OR the body (extension). See deploy/docs/AUTH-COOKIE-MIGRATION.md.
export const REFRESH_COOKIE = 'cc_refresh';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  domain: '.cybercontrol.fun',   // shared registrable domain → sent on app.→api. XHR
  path: '/api/auth',             // scope: only the auth endpoints ever receive it
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export function setRefreshCookie(res: Response, token: string): void {
  try { res.cookie(REFRESH_COOKIE, token, COOKIE_OPTS); } catch { /* non-prod host: body token still works */ }
}
export function clearRefreshCookie(res: Response): void {
  try { res.clearCookie(REFRESH_COOKIE, { domain: COOKIE_OPTS.domain, path: COOKIE_OPTS.path }); } catch { /* ignore */ }
}
// Manual Cookie-header parse (avoids a cookie-parser dependency).
export function readRefreshCookie(req: Request): string | null {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === REFRESH_COOKIE) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

// Login/register: key per (IP + account) so a cybercafe's shared NAT IP with many operators isn't
// collectively locked out, while brute-force against a single account stays capped at 20/15min.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, try again later' },
  keyGenerator: (req) => `${ipKeyGenerator(req.ip || '')}:${String(req.body?.email || req.body?.phone || '').toLowerCase()}`,
});

// Create workspace + admin user + first refresh session, and mint tokens. Shared by direct
// register (no verification configured) and verify-signup (after OTP). Throws 23505 on dup.
export async function createAccount(opts: { email: string | null; phone: string | null; name: string | null; passwordHash: string; location?: string | null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ws = await client.query("INSERT INTO workspaces (name, location) VALUES ($1,$2) RETURNING id", [opts.name || opts.email || opts.phone, opts.location ?? null]);
    const workspaceId = ws.rows[0].id;
    const u = await client.query(
      "INSERT INTO users (workspace_id, email, phone, password_hash, name, role) VALUES ($1,$2,$3,$4,$5,'admin') RETURNING id",
      [workspaceId, opts.email, opts.phone, opts.passwordHash, opts.name]
    );
    const userId = u.rows[0].id;
    await client.query('COMMIT');
    const payload = { userId, workspaceId, role: 'admin' };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query("INSERT INTO auth_sessions (user_id, refresh_token, expires_at) VALUES ($1,$2,$3)", [userId, refreshToken, expiresAt]);
    await auditLog(workspaceId, userId, 'register', 'user', userId, { email: opts.email, phone: opts.phone });
    return { accessToken, refreshToken, user: { id: userId, workspaceId, email: opts.email, phone: opts.phone, name: opts.name, role: 'admin' } };
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
