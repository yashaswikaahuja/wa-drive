import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { OAuth2Client as GoogleOAuth2Client } from 'google-auth-library';
import { pool, auditLog } from '../../db.js';
import { GOOGLE_CLIENT_ID, JWT_REFRESH_SECRET } from '../../config.js';
import { authMiddleware, signAccessToken, signRefreshToken } from '../../middleware/auth.js';

const router = Router();
// Login/register: key per (IP + account) so a cybercafe's shared NAT IP with many operators isn't
// collectively locked out, while brute-force against a single account stays capped at 20/15min.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, try again later' },
  keyGenerator: (req) => `${ipKeyGenerator(req.ip || '')}:${String(req.body?.email || req.body?.phone || '').toLowerCase()}`,
});
// Google is server-verified (low brute-force risk); key by IP with a higher cap for multi-operator cafes.
const googleLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, message: { error: 'Too many attempts, try again later' } });
// Refresh is automated (fires on access-token expiry) and now single-flight on the client, so it's
// legitimately more frequent than login — a more generous cap that still blocks abuse.
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: { error: 'Too many refresh attempts, try again later' } });
const googleAuthClient = new GoogleOAuth2Client(GOOGLE_CLIENT_ID);

router.post('/google', googleLimiter, async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing credential' });
  try {
    const ticket = await googleAuthClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email) return res.status(400).json({ error: 'No email in Google token' });
    const { email, name, picture, sub: googleId } = payload;
    const emailLc = String(email).trim().toLowerCase();

    let userRow = (await pool.query(
      'SELECT id, workspace_id, name, role, status FROM users WHERE lower(email) = $1 AND deleted_at IS NULL', [emailLc]
    )).rows[0];

    if (!userRow) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ws = await client.query("INSERT INTO workspaces (name) VALUES ($1) RETURNING id", [name || emailLc]);
        const workspaceId = ws.rows[0].id;
        const u = await client.query(
          "INSERT INTO users (workspace_id, email, name, role, status, password_hash) VALUES ($1,$2,$3,'admin','active','') RETURNING id, workspace_id, name, role",
          [workspaceId, emailLc, name || emailLc]
        );
        await client.query('COMMIT');
        userRow = u.rows[0];
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    }

    if (userRow.status && userRow.status !== 'active')
      return res.status(403).json({ error: 'Account not active' });

    const tokenPayload = { userId: userRow.id, workspaceId: userRow.workspace_id, role: userRow.role };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query("INSERT INTO auth_sessions (user_id, refresh_token, expires_at) VALUES ($1,$2,$3)", [userRow.id, refreshToken, expiresAt]);
    res.json({ ok: true, accessToken, refreshToken, user: { id: userRow.id, workspaceId: userRow.workspace_id, email, name: userRow.name || name, role: userRow.role } });
  } catch (e: any) {
    console.error('[Auth] Google login error:', e.message);
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

router.post('/register', loginLimiter, async (req, res) => {
  const { email, phone, password, name } = req.body;
  if (!password || (!email && !phone)) return res.status(400).json({ error: 'email/phone and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const wsResult = await client.query("INSERT INTO workspaces (name) VALUES ($1) RETURNING id", [name || email || phone]);
      const workspaceId = wsResult.rows[0].id;
      const userResult = await client.query(
        "INSERT INTO users (workspace_id, email, phone, password_hash, name, role) VALUES ($1,$2,$3,$4,$5,'admin') RETURNING id",
        [workspaceId, email ? String(email).trim().toLowerCase() : null, phone ? String(phone).trim() : null, hash, name || null]
      );
      const userId = userResult.rows[0].id;
      await client.query('COMMIT');
      const payload = { userId, workspaceId, role: 'admin' };
      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await pool.query("INSERT INTO auth_sessions (user_id, refresh_token, expires_at) VALUES ($1,$2,$3) RETURNING id", [userId, refreshToken, expiresAt]);
      await auditLog(workspaceId, userId, 'register', 'user', userId, { email, phone });
      res.json({ ok: true, accessToken, refreshToken, user: { id: userId, workspaceId, email, phone, name, role: 'admin' } });
    } catch (e: any) {
      await client.query('ROLLBACK');
      if (e.code === '23505') return res.status(409).json({ error: 'Email or phone already registered' });
      throw e;
    } finally { client.release(); }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, phone, password } = req.body;
  if (!password || (!email && !phone)) return res.status(400).json({ error: 'email/phone and password required' });
  try {
    const useEmail = !!email;
    const value = useEmail ? String(email).trim().toLowerCase() : String(phone).trim();
    const where = useEmail ? 'lower(email) = $1' : 'phone = $1';
    const result = await pool.query(`SELECT id, workspace_id, password_hash, name, role, status FROM users WHERE ${where} AND deleted_at IS NULL`, [value]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    if (user.status !== 'active') return res.status(403).json({ error: 'Account not active' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await auditLog(user.workspace_id, user.id, 'login_failed', 'user', user.id, { field: useEmail ? 'email' : 'phone', value });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const payload = { userId: user.id, workspaceId: user.workspace_id, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query("INSERT INTO auth_sessions (user_id, refresh_token, expires_at) VALUES ($1,$2,$3) RETURNING id", [user.id, refreshToken, expiresAt]);
    await auditLog(user.workspace_id, user.id, 'login', 'user', user.id, { field: useEmail ? 'email' : 'phone' });
    res.json({ ok: true, accessToken, refreshToken, user: { id: user.id, workspaceId: user.workspace_id, name: user.name, role: user.role } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/refresh', refreshLimiter, async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
  try {
    const decoded: any = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    void decoded;
    const sessResult = await pool.query("SELECT id, user_id FROM auth_sessions WHERE refresh_token = $1 AND revoked_at IS NULL AND expires_at > now()", [refreshToken]);
    if (!sessResult.rows.length) return res.status(401).json({ error: 'Invalid or expired refresh token' });
    const sess = sessResult.rows[0];
    // Re-read the live user so role changes take effect and suspended/deleted users can't refresh.
    const userRow = (await pool.query(
      "SELECT id, workspace_id, role, status FROM users WHERE id = $1 AND deleted_at IS NULL", [sess.user_id]
    )).rows[0];
    if (!userRow || userRow.status !== 'active') {
      await pool.query("UPDATE auth_sessions SET revoked_at = now() WHERE id = $1", [sess.id]);
      return res.status(401).json({ error: 'Account not active' });
    }
    await pool.query("UPDATE auth_sessions SET revoked_at = now() WHERE id = $1", [sess.id]);
    const payload = { userId: userRow.id, workspaceId: userRow.workspace_id, role: userRow.role };
    const newAccessToken = signAccessToken(payload);
    const newRefreshToken = signRefreshToken(payload);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query("INSERT INTO auth_sessions (user_id, refresh_token, expires_at) VALUES ($1,$2,$3)", [userRow.id, newRefreshToken, expiresAt]);
    await auditLog(userRow.workspace_id, userRow.id, 'token_refresh', 'auth_session', sess.id, null);
    res.json({ ok: true, accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (e) { return res.status(401).json({ error: 'Invalid refresh token' }); }
});

router.post('/logout', authMiddleware, async (req: any, res) => {
  try {
    await pool.query("UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [req.user.userId]);
    await auditLog(req.user.workspaceId, req.user.userId, 'logout', 'user', req.user.userId, null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/me', authMiddleware, async (req: any, res) => {
  try {
    const result = await pool.query("SELECT id, workspace_id, email, phone, name, role, status, created_at FROM users WHERE id = $1", [req.user.userId]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
