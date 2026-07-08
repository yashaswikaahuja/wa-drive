import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { OAuth2Client as GoogleOAuth2Client } from 'google-auth-library';
import { pool, auditLog, logActivity } from '../../db.js';
import { GOOGLE_CLIENT_ID, JWT_REFRESH_SECRET, SIGNUP_CODE, EMAIL_VERIFY, PHONE_VERIFY, OTP_TTL_MS } from '../../config.js';
import { authMiddleware, signAccessToken, signRefreshToken } from '../../middleware/auth.js';
import { genCode, hashCode, sendEmailOtp, sendPhoneOtp, sendWelcomeEmail } from '../../services/verification.js';
import { createAccount, loginLimiter, setRefreshCookie, clearRefreshCookie, readRefreshCookie } from './service.js';
import { captureIpLocation } from '../../services/geoip.js';
import { reverseGeocode } from '../../services/geocode.js';
import verifyRouter from './verify.routes.js';

const router = Router();
// Signup-OTP + post-login contact verification endpoints (mounted on the same /api/auth path).
router.use(verifyRouter);

// Google is server-verified (low brute-force risk); key by IP with a higher cap for multi-operator cafes.
const googleLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, message: { error: 'Too many attempts, try again later' } });
// Refresh is automated (fires on access-token expiry) and now single-flight on the client, so it's
// legitimately more frequent than login — a more generous cap that still blocks abuse.
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: { error: 'Too many refresh attempts, try again later' } });
const googleAuthClient = new GoogleOAuth2Client(GOOGLE_CLIENT_ID);

// Public: lets the sign-up form know whether an invite code and/or contact verification is required.
router.get('/signup-config', (_req, res) => res.json({ requiresInvite: !!SIGNUP_CODE, verifyEmail: EMAIL_VERIFY, verifyPhone: PHONE_VERIFY }));

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

    let isNewSignup = false;
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
        isNewSignup = true;
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    }

    if (userRow.status && userRow.status !== 'active')
      return res.status(403).json({ error: 'Account not active' });

    // Google verified this email — mark it (no-op if column not migrated yet). No OTP needed.
    await pool.query('UPDATE users SET email_verified=true WHERE id=$1 AND email_verified=false', [userRow.id]).catch(() => {});
    // First-time Google signup → greet instead of verifying (best-effort; no-op if SES off).
    if (isNewSignup) sendWelcomeEmail(emailLc, userRow.name || name).catch(() => {});
    if (isNewSignup) logActivity(userRow.workspace_id, 'workspace.signed_up', { via: 'google' }, userRow.id);

    const tokenPayload = { userId: userRow.id, workspaceId: userRow.workspace_id, role: userRow.role };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query("INSERT INTO auth_sessions (user_id, refresh_token, expires_at) VALUES ($1,$2,$3)", [userRow.id, refreshToken, expiresAt]);
    setRefreshCookie(res, refreshToken);
    res.json({ ok: true, accessToken, refreshToken, user: { id: userRow.id, workspaceId: userRow.workspace_id, email, name: userRow.name || name, role: userRow.role } });
  } catch (e: any) {
    console.error('[Auth] Google login error:', e.message);
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

router.post('/register', loginLimiter, async (req, res) => {
  let { email, phone, password, name, location } = req.body || {};
  if (SIGNUP_CODE && req.body.inviteCode !== SIGNUP_CODE) return res.status(403).json({ error: 'A valid invite code is required to sign up' });
  if (!password || (!email && !phone)) return res.status(400).json({ error: 'email/phone and password required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  email = email ? String(email).trim().toLowerCase() : null;
  phone = phone ? String(phone).trim() : null;
  name = name ? String(name).trim() : null;
  location = location ? (String(location).trim().slice(0, 200) || null) : null;
  try {
    // Reject already-registered contacts up front (clear error; don't send an OTP to a taken contact).
    const dup = await pool.query(
      "SELECT 1 FROM users WHERE deleted_at IS NULL AND ((email IS NOT NULL AND lower(email)=$1) OR (phone IS NOT NULL AND phone=$2)) LIMIT 1",
      [email, phone]
    );
    if (dup.rows.length) return res.status(409).json({ error: 'Email or phone already registered' });

    const needEmail = EMAIL_VERIFY && !!email;
    const needPhone = PHONE_VERIFY && !!phone;
    const hash = await bcrypt.hash(password, 12);

    // No verification configured → create immediately (unchanged behavior).
    if (!needEmail && !needPhone) {
      try {
        const out = await createAccount({ email, phone, name, passwordHash: hash, location });
        captureIpLocation(req, out.user.workspaceId).catch(() => {});
        setRefreshCookie(res, out.refreshToken);
        return res.json({ ok: true, ...out });
      } catch (e: any) {
        if (e.code === '23505') return res.status(409).json({ error: 'Email or phone already registered' });
        throw e;
      }
    }

    // Verification required → stash a pending signup and send the code(s). No account yet.
    const emailCode = needEmail ? genCode() : null;
    const phoneCode = needPhone ? genCode() : null;
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const { rows } = await pool.query(
      `INSERT INTO pending_signups (email, phone, name, password_hash, email_code_hash, phone_code_hash, email_verified, phone_verified, expires_at, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [email, phone, name, hash, emailCode ? hashCode(emailCode) : null, phoneCode ? hashCode(phoneCode) : null, !needEmail, !needPhone, expiresAt, location]
    );
    const pendingId = rows[0].id;
    try {
      if (needEmail) await sendEmailOtp(email!, emailCode!);
      if (needPhone) await sendPhoneOtp(phone!, phoneCode!);
    } catch (e: any) {
      await pool.query('DELETE FROM pending_signups WHERE id=$1', [pendingId]).catch(() => {});
      return res.status(502).json({ error: e.message || 'Could not send verification code' });
    }
    return res.json({ ok: true, pending: true, pendingId, needsEmail: needEmail, needsPhone: needPhone });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Add/change the caller's own email or phone. Resets that channel's verified flag so it must be
// re-verified. Globally unique (409 on clash). Keeps at least one contact on the account.
router.patch('/contact', authMiddleware, async (req: any, res) => {
  const b = req.body || {};
  const hasEmail = Object.prototype.hasOwnProperty.call(b, 'email');
  const hasPhone = Object.prototype.hasOwnProperty.call(b, 'phone');
  if (!hasEmail && !hasPhone) return res.status(400).json({ error: 'email or phone required' });
  const email = hasEmail ? (b.email ? String(b.email).trim().toLowerCase() : null) : undefined;
  const phone = hasPhone ? (b.phone ? String(b.phone).trim() : null) : undefined;
  if (email !== undefined && email && !email.includes('@')) return res.status(400).json({ error: 'Enter a valid email' });
  if (phone !== undefined && phone && phone.replace(/[^0-9]/g, '').length < 10) return res.status(400).json({ error: 'Enter a valid phone number' });
  try {
    const cur = (await pool.query('SELECT email, phone FROM users WHERE id=$1', [req.user.userId])).rows[0];
    if (!cur) return res.status(404).json({ error: 'User not found' });
    const nextEmail = email !== undefined ? email : cur.email;
    const nextPhone = phone !== undefined ? phone : cur.phone;
    if (!nextEmail && !nextPhone) return res.status(400).json({ error: 'Keep at least an email or phone on your account' });
    const sets: string[] = []; const params: any[] = []; let i = 1;
    if (email !== undefined) { sets.push(`email=$${i++}`); params.push(email); }
    if (phone !== undefined) { sets.push(`phone=$${i++}`); params.push(phone); }
    params.push(req.user.userId);
    await pool.query(`UPDATE users SET ${sets.join(', ')}, updated_at=now() WHERE id=$${i}`, params);
    // Changed contact must be re-verified (no-op if the column isn't migrated yet).
    if (email !== undefined) await pool.query('UPDATE users SET email_verified=false WHERE id=$1', [req.user.userId]).catch(() => {});
    if (phone !== undefined) await pool.query('UPDATE users SET phone_verified=false WHERE id=$1', [req.user.userId]).catch(() => {});
    await auditLog(req.user.workspaceId, req.user.userId, 'contact_update', 'user', req.user.userId, { email: hasEmail, phone: hasPhone });
    res.json({ ok: true, email: nextEmail, phone: nextPhone });
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'That email or phone is already in use' });
    res.status(500).json({ error: e.message });
  }
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
    // Owner-panel activity signal (best-effort; column added in migration 007).
    pool.query('UPDATE workspaces SET last_active_at = now() WHERE id = $1', [user.workspace_id]).catch(() => {});
    // Tier-2 location capture (best-effort, only if the café has no location yet).
    captureIpLocation(req, user.workspace_id).catch(() => {});
    setRefreshCookie(res, refreshToken);
    res.json({ ok: true, accessToken, refreshToken, user: { id: user.id, workspaceId: user.workspace_id, name: user.name, role: user.role } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/refresh', refreshLimiter, async (req, res) => {
  // Web sends the token via the HttpOnly cookie; the extension sends it in the body. Cookie wins.
  const refreshToken = readRefreshCookie(req) ?? req.body?.refreshToken;
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
    setRefreshCookie(res, newRefreshToken);
    res.json({ ok: true, accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (e) { return res.status(401).json({ error: 'Invalid refresh token' }); }
});

router.post('/logout', authMiddleware, async (req: any, res) => {
  try {
    await pool.query("UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [req.user.userId]);
    await auditLog(req.user.workspaceId, req.user.userId, 'logout', 'user', req.user.userId, null);
    clearRefreshCookie(res);
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

// Caller's café (workspace) location. GET to check, PATCH to set — used to prompt existing
// operators whose café has no location yet (surfaced in the owner panel).
router.get('/workspace', authMiddleware, async (req: any, res) => {
  try {
    const w = (await pool.query('SELECT id, name, location, lat, lng, location_source FROM workspaces WHERE id = $1', [req.user.workspaceId])).rows[0];
    if (!w) return res.status(404).json({ error: 'Workspace not found' });
    res.json({ id: w.id, name: w.name, location: w.location || null, lat: w.lat, lng: w.lng, source: w.location_source || null });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Location waterfall write. Accepts { location, lat, lng, source } where source ∈ gps|manual|ip.
// UPGRADE rule: gps(3) > manual(2) > ip(1) — a write is ignored if it would DOWNGRADE the
// current source (so a stale IP value can't overwrite a precise GPS/manual one).
const LOC_RANK: Record<string, number> = { gps: 3, manual: 2, ip: 1 };
router.patch('/workspace', authMiddleware, async (req: any, res) => {
  const b = req.body || {};
  const source = LOC_RANK[b.source] ? b.source : 'manual';
  let location = b.location == null || String(b.location).trim() === '' ? null : String(b.location).trim().slice(0, 200);
  const lat = typeof b.lat === 'number' && isFinite(b.lat) ? b.lat : null;
  const lng = typeof b.lng === 'number' && isFinite(b.lng) ? b.lng : null;
  // For a GPS capture, resolve the address server-side (reliable, browser-independent). Fall back to
  // whatever the client sent, then to a coordinate string, so we always store something.
  if (source === 'gps' && lat != null && lng != null) {
    const addr = await reverseGeocode(lat, lng);
    location = addr || location || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
  try {
    const cur = (await pool.query('SELECT location_source FROM workspaces WHERE id = $1', [req.user.workspaceId])).rows[0];
    const curRank = LOC_RANK[cur?.location_source] || 0;
    if (LOC_RANK[source] < curRank) return res.json({ ok: true, skipped: 'lower-priority source' });
    await pool.query(
      'UPDATE workspaces SET location = $1, lat = $2, lng = $3, location_source = $4, updated_at = now() WHERE id = $5',
      [location, lat, lng, source, req.user.workspaceId]
    );
    res.json({ ok: true, location, lat, lng, source });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
