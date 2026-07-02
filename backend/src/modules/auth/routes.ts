import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { OAuth2Client as GoogleOAuth2Client } from 'google-auth-library';
import { pool, auditLog } from '../../db.js';
import { GOOGLE_CLIENT_ID, JWT_REFRESH_SECRET, SIGNUP_CODE, EMAIL_VERIFY, PHONE_VERIFY, OTP_TTL_MS, OTP_MAX_ATTEMPTS } from '../../config.js';
import { authMiddleware, signAccessToken, signRefreshToken } from '../../middleware/auth.js';
import { genCode, hashCode, sendEmailOtp, sendPhoneOtp, sendWelcomeEmail } from '../../services/verification.js';

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

// Create workspace + admin user + first refresh session, and mint tokens. Shared by direct
// register (no verification configured) and verify-signup (after OTP). Throws 23505 on dup.
async function createAccount(opts: { email: string | null; phone: string | null; name: string | null; passwordHash: string }) {
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

router.post('/register', loginLimiter, async (req, res) => {
  let { email, phone, password, name } = req.body || {};
  if (SIGNUP_CODE && req.body.inviteCode !== SIGNUP_CODE) return res.status(403).json({ error: 'A valid invite code is required to sign up' });
  if (!password || (!email && !phone)) return res.status(400).json({ error: 'email/phone and password required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  email = email ? String(email).trim().toLowerCase() : null;
  phone = phone ? String(phone).trim() : null;
  name = name ? String(name).trim() : null;
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
        const out = await createAccount({ email, phone, name, passwordHash: hash });
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
      `INSERT INTO pending_signups (email, phone, name, password_hash, email_code_hash, phone_code_hash, email_verified, phone_verified, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [email, phone, name, hash, emailCode ? hashCode(emailCode) : null, phoneCode ? hashCode(phoneCode) : null, !needEmail, !needPhone, expiresAt]
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

// Verify signup OTP(s); on success create the real account and return tokens.
router.post('/verify-signup', loginLimiter, async (req, res) => {
  const { pendingId, emailCode, phoneCode } = req.body || {};
  if (!pendingId) return res.status(400).json({ error: 'pendingId required' });
  try {
    const p = (await pool.query('SELECT * FROM pending_signups WHERE id=$1', [pendingId])).rows[0];
    if (!p) return res.status(404).json({ error: 'Signup not found or already completed' });
    if (new Date(p.expires_at).getTime() < Date.now()) {
      await pool.query('DELETE FROM pending_signups WHERE id=$1', [pendingId]);
      return res.status(410).json({ error: 'Code expired — please sign up again' });
    }
    if (p.attempts >= OTP_MAX_ATTEMPTS) {
      await pool.query('DELETE FROM pending_signups WHERE id=$1', [pendingId]);
      return res.status(429).json({ error: 'Too many attempts — please sign up again' });
    }
    let emailOk = p.email_verified;
    let phoneOk = p.phone_verified;
    if (!emailOk && p.email_code_hash) emailOk = !!emailCode && hashCode(String(emailCode)) === p.email_code_hash;
    if (!phoneOk && p.phone_code_hash) phoneOk = !!phoneCode && hashCode(String(phoneCode)) === p.phone_code_hash;
    if (!emailOk || !phoneOk) {
      await pool.query('UPDATE pending_signups SET attempts = attempts + 1, email_verified=$2, phone_verified=$3 WHERE id=$1', [pendingId, emailOk, phoneOk]);
      return res.status(401).json({ error: 'Incorrect or missing code' });
    }
    let out;
    try {
      out = await createAccount({ email: p.email, phone: p.phone, name: p.name, passwordHash: p.password_hash });
    } catch (e: any) {
      if (e.code === '23505') { await pool.query('DELETE FROM pending_signups WHERE id=$1', [pendingId]); return res.status(409).json({ error: 'Email or phone already registered' }); }
      throw e;
    }
    await pool.query('DELETE FROM pending_signups WHERE id=$1', [pendingId]);
    // Record which contacts were verified at signup (no-op if the column isn't migrated yet).
    await pool.query('UPDATE users SET email_verified=$2, phone_verified=$3 WHERE id=$1',
      [out.user.id, EMAIL_VERIFY && !!p.email, PHONE_VERIFY && !!p.phone]).catch(() => {});
    return res.json({ ok: true, ...out });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Resend signup OTP(s) for the still-unverified channels (rate-limited).
router.post('/resend-otp', loginLimiter, async (req, res) => {
  const { pendingId } = req.body || {};
  if (!pendingId) return res.status(400).json({ error: 'pendingId required' });
  try {
    const p = (await pool.query('SELECT * FROM pending_signups WHERE id=$1', [pendingId])).rows[0];
    if (!p) return res.status(404).json({ error: 'Signup not found' });
    if (p.last_sent_at && Date.now() - new Date(p.last_sent_at).getTime() < 30_000)
      return res.status(429).json({ error: 'Please wait a moment before requesting a new code' });
    const emailCode = (!p.email_verified && p.email) ? genCode() : null;
    const phoneCode = (!p.phone_verified && p.phone) ? genCode() : null;
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await pool.query(
      `UPDATE pending_signups SET email_code_hash=COALESCE($2,email_code_hash), phone_code_hash=COALESCE($3,phone_code_hash),
       expires_at=$4, last_sent_at=now(), attempts=0 WHERE id=$1`,
      [pendingId, emailCode ? hashCode(emailCode) : null, phoneCode ? hashCode(phoneCode) : null, expiresAt]
    );
    try {
      if (emailCode) await sendEmailOtp(p.email, emailCode);
      if (phoneCode) await sendPhoneOtp(p.phone, phoneCode);
    } catch (e: any) { return res.status(502).json({ error: e.message || 'Could not resend code' }); }
    return res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Post-login contact verification (for existing/unverified accounts) ───────
// Returns the caller's verification state; falls back to "verified" if the columns
// aren't migrated yet so the UI never nags on a half-deployed backend.
router.get('/verify-status', authMiddleware, async (req: any, res) => {
  try {
    const u = (await pool.query('SELECT email, phone, email_verified, phone_verified FROM users WHERE id=$1', [req.user.userId])).rows[0];
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({
      email: u.email, phone: u.phone,
      emailVerified: !!u.email_verified, phoneVerified: !!u.phone_verified,
      canVerifyEmail: EMAIL_VERIFY, canVerifyPhone: PHONE_VERIFY,
    });
  } catch {
    res.json({ emailVerified: true, phoneVerified: true, canVerifyEmail: false, canVerifyPhone: false });
  }
});

router.post('/request-verify', authMiddleware, async (req: any, res) => {
  const channel = req.body?.channel;
  if (channel !== 'email' && channel !== 'phone') return res.status(400).json({ error: 'channel must be email or phone' });
  if (channel === 'email' && !EMAIL_VERIFY) return res.status(400).json({ error: 'Email verification not available' });
  if (channel === 'phone' && !PHONE_VERIFY) return res.status(400).json({ error: 'Phone verification not available' });
  try {
    const u = (await pool.query('SELECT email, phone, email_verified, phone_verified FROM users WHERE id=$1', [req.user.userId])).rows[0];
    if (!u) return res.status(404).json({ error: 'User not found' });
    const contact = channel === 'email' ? u.email : u.phone;
    const already = channel === 'email' ? u.email_verified : u.phone_verified;
    if (!contact) return res.status(400).json({ error: `No ${channel} on this account` });
    if (already) return res.status(400).json({ error: `Your ${channel} is already verified` });
    const ex = (await pool.query('SELECT last_sent_at FROM contact_otps WHERE user_id=$1 AND channel=$2', [req.user.userId, channel])).rows[0];
    if (ex?.last_sent_at && Date.now() - new Date(ex.last_sent_at).getTime() < 30_000)
      return res.status(429).json({ error: 'Please wait a moment before requesting a new code' });
    const code = genCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await pool.query(
      `INSERT INTO contact_otps (user_id, channel, code_hash, expires_at, attempts, last_sent_at)
       VALUES ($1,$2,$3,$4,0,now())
       ON CONFLICT (user_id, channel) DO UPDATE SET code_hash=EXCLUDED.code_hash, expires_at=EXCLUDED.expires_at, attempts=0, last_sent_at=now()`,
      [req.user.userId, channel, hashCode(code), expiresAt]
    );
    if (channel === 'email') await sendEmailOtp(contact, code); else await sendPhoneOtp(contact, code);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/confirm-verify', authMiddleware, async (req: any, res) => {
  const { channel, code } = req.body || {};
  if (channel !== 'email' && channel !== 'phone') return res.status(400).json({ error: 'channel must be email or phone' });
  try {
    const row = (await pool.query('SELECT code_hash, expires_at, attempts FROM contact_otps WHERE user_id=$1 AND channel=$2', [req.user.userId, channel])).rows[0];
    if (!row) return res.status(400).json({ error: 'Request a code first' });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await pool.query('DELETE FROM contact_otps WHERE user_id=$1 AND channel=$2', [req.user.userId, channel]);
      return res.status(410).json({ error: 'Code expired — request a new one' });
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      await pool.query('DELETE FROM contact_otps WHERE user_id=$1 AND channel=$2', [req.user.userId, channel]);
      return res.status(429).json({ error: 'Too many attempts — request a new code' });
    }
    if (!code || hashCode(String(code)) !== row.code_hash) {
      await pool.query('UPDATE contact_otps SET attempts=attempts+1 WHERE user_id=$1 AND channel=$2', [req.user.userId, channel]);
      return res.status(401).json({ error: 'Incorrect code' });
    }
    const col = channel === 'email' ? 'email_verified' : 'phone_verified';
    await pool.query(`UPDATE users SET ${col}=true WHERE id=$1`, [req.user.userId]);
    await pool.query('DELETE FROM contact_otps WHERE user_id=$1 AND channel=$2', [req.user.userId, channel]);
    res.json({ ok: true });
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
