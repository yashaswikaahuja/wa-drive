/**
 * Auth verification routes — signup OTP confirmation + post-login contact verification.
 * Mounted onto the same /api/auth router as the core auth routes (see routes.ts).
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { EMAIL_VERIFY, PHONE_VERIFY, OTP_TTL_MS, OTP_MAX_ATTEMPTS } from '../../config.js';
import { authMiddleware } from '../../middleware/auth.js';
import { genCode, hashCode, sendEmailOtp, sendPhoneOtp } from '../../services/verification.js';
import { createAccount, loginLimiter } from './service.js';

const router = Router();

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

export default router;
