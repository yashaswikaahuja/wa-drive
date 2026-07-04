/**
 * Shared auth helpers used by both the core routes and the verification routes.
 */
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { pool, auditLog } from '../../db.js';
import { signAccessToken, signRefreshToken } from '../../middleware/auth.js';

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
export async function createAccount(opts: { email: string | null; phone: string | null; name: string | null; passwordHash: string }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ws = await client.query("INSERT INTO workspaces (name) VALUES ($1) RETURNING id", [opts.name || opts.email || opts.phone]);
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
