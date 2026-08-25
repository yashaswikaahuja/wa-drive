/**
 * CLI device authorization (browser login for `cyb login`).
 *
 * Flow (same shape as GitHub CLI / device OAuth):
 *   1. CLI  POST /api/auth/cli/device  → device_code + user_code + verification_uri
 *   2. CLI opens browser to verification_uri?user_code=…
 *   3. User signs in on that page (email/password)
 *   4. CLI polls GET /api/auth/cli/poll?device_code=… until access_token
 *
 * Codes live in Postgres (CREATE TABLE IF NOT EXISTS) so multi-instance API works.
 */
import { Router, type Router as ExpressRouter } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { pool, auditLog, signAccessToken, signRefreshToken } from '@cybercontrol/backend-core';
import { loginLimiter } from './service.js';

const router: ExpressRouter = Router();

const DEVICE_TTL_MS = 15 * 60 * 1000;
const POLL_INTERVAL_SEC = 3;

const deviceStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many device logins, try again later' },
});
const pollLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  message: { error: 'Too many polls' },
});

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS cli_device_codes (
          device_code   TEXT PRIMARY KEY,
          user_code     TEXT UNIQUE NOT NULL,
          status        TEXT NOT NULL DEFAULT 'pending',
          user_id       UUID,
          workspace_id  UUID,
          access_token  TEXT,
          refresh_token TEXT,
          expires_at    TIMESTAMPTZ NOT NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS cli_device_codes_user_code_idx ON cli_device_codes (user_code);
        CREATE INDEX IF NOT EXISTS cli_device_codes_expires_idx ON cli_device_codes (expires_at);
      `)
      .then(() => undefined)
      .catch((e) => {
        tableReady = null;
        throw e;
      });
  }
  return tableReady;
}

function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Human-friendly code: ABCD-1234 */
function randomUserCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let raw = '';
  const buf = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) raw += alphabet[buf[i] % alphabet.length];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function publicApiBase(req: any): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const fromEnv = process.env.API_ORIGIN || process.env.PUBLIC_API_HOST || '';
  const host =
    (req.headers['x-forwarded-host'] as string) ||
    req.headers.host ||
    (fromEnv ? fromEnv.replace(/^https?:\/\//, '') : 'localhost:3000');
  return `${proto}://${host}/api`;
}

// ── 1) CLI starts a device session ──────────────────────────────────────────
router.post('/device', deviceStartLimiter, async (req, res) => {
  try {
    await ensureTable();
    // cleanup expired occasionally
    pool.query(`DELETE FROM cli_device_codes WHERE expires_at < now()`).catch(() => {});

    const device_code = randomToken(32);
    let user_code = randomUserCode();
    const expires_at = new Date(Date.now() + DEVICE_TTL_MS);
    const base = publicApiBase(req);
    const verification_uri = `${base}/auth/cli/authorize`;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await pool.query(
          `INSERT INTO cli_device_codes (device_code, user_code, status, expires_at)
           VALUES ($1,$2,'pending',$3)`,
          [device_code, user_code, expires_at]
        );
        break;
      } catch (e: any) {
        if (e?.code === '23505') {
          user_code = randomUserCode();
          continue;
        }
        throw e;
      }
    }

    res.json({
      ok: true,
      device_code,
      user_code,
      verification_uri,
      verification_uri_complete: `${verification_uri}?user_code=${encodeURIComponent(user_code)}`,
      expires_in: Math.floor(DEVICE_TTL_MS / 1000),
      interval: POLL_INTERVAL_SEC,
    });
  } catch (e: any) {
    console.error('[Auth/CLI] device start:', e.message);
    res.status(500).json({ error: e.message || 'device start failed' });
  }
});

// ── 2) CLI polls for completion ─────────────────────────────────────────────
router.get('/poll', pollLimiter, async (req, res) => {
  try {
    await ensureTable();
    const device_code = String(req.query.device_code || '');
    if (!device_code) return res.status(400).json({ error: 'device_code required' });

    const row = (
      await pool.query(
        `SELECT status, access_token, refresh_token, user_id, workspace_id, expires_at
         FROM cli_device_codes WHERE device_code = $1`,
        [device_code]
      )
    ).rows[0];

    if (!row) return res.status(404).json({ error: 'unknown_device_code', status: 'expired' });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await pool.query(`DELETE FROM cli_device_codes WHERE device_code = $1`, [device_code]);
      return res.json({ ok: true, status: 'expired' });
    }
    if (row.status === 'pending') {
      return res.json({ ok: true, status: 'pending', interval: POLL_INTERVAL_SEC });
    }
    if (row.status === 'approved' && row.access_token) {
      // one-shot: clear secrets after successful poll
      await pool.query(`DELETE FROM cli_device_codes WHERE device_code = $1`, [device_code]);
      const user = (
        await pool.query(
          `SELECT id, workspace_id, email, phone, name, role FROM users WHERE id = $1`,
          [row.user_id]
        )
      ).rows[0];
      return res.json({
        ok: true,
        status: 'approved',
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        user: user
          ? {
              id: user.id,
              workspaceId: user.workspace_id,
              email: user.email,
              phone: user.phone,
              name: user.name,
              role: user.role,
            }
          : { id: row.user_id, workspaceId: row.workspace_id },
      });
    }
    return res.json({ ok: true, status: row.status || 'pending' });
  } catch (e: any) {
    console.error('[Auth/CLI] poll:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 3) Browser page: enter credentials ──────────────────────────────────────
function authorizePageHtml(userCode: string, error: string | null, success: boolean): string {
  const code = escapeHtml(userCode || '');
  const err = error ? `<div class="err">${escapeHtml(error)}</div>` : '';
  if (success) {
    return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>CyberControl CLI — signed in</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0b1220;color:#e8eefc;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{background:#121a2b;border:1px solid #243049;border-radius:16px;padding:32px;max-width:420px;text-align:center}
  h1{font-size:1.25rem;margin:0 0 8px} p{color:#9db0d0;line-height:1.5}
  .ok{color:#4ade80;font-size:2rem}
</style></head><body><div class="card">
  <div class="ok">✓</div>
  <h1>CLI signed in</h1>
  <p>You can close this tab and return to the terminal.</p>
</div></body></html>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>CyberControl CLI login</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0b1220;color:#e8eefc;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
  .card{background:#121a2b;border:1px solid #243049;border-radius:16px;padding:28px;width:100%;max-width:400px;box-shadow:0 20px 50px rgba(0,0,0,.35)}
  h1{font-size:1.2rem;margin:0 0 4px} .sub{color:#9db0d0;font-size:.9rem;margin:0 0 20px;line-height:1.45}
  label{display:block;font-size:.8rem;color:#9db0d0;margin:12px 0 6px}
  input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#e8eefc;font-size:1rem}
  input:focus{outline:2px solid #3b82f6;border-color:transparent}
  .code{font-family:ui-monospace,monospace;letter-spacing:.12em;font-size:1.1rem;background:#0b1220;border:1px dashed #3b82f6;border-radius:10px;padding:10px;text-align:center;margin:8px 0 4px}
  button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:10px;background:#2563eb;color:white;font-weight:600;font-size:1rem;cursor:pointer}
  button:hover{background:#1d4ed8}
  .err{background:#3f1d1d;color:#fca5a5;border:1px solid #7f1d1d;border-radius:10px;padding:10px;margin-bottom:12px;font-size:.9rem}
  .brand{color:#60a5fa;font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px}
</style></head><body><div class="card">
  <div class="brand">CyberControl CLI</div>
  <h1>Authorize terminal</h1>
  <p class="sub">Sign in with your CyberControl operator account to connect the <code>cyb</code> CLI.</p>
  ${err}
  <form method="POST" action="/api/auth/cli/authorize">
    <label>Device code</label>
    <div class="code">${code || '—'}</div>
    <input type="hidden" name="user_code" value="${code}"/>
    <label for="email">Email or phone</label>
    <input id="email" name="email" type="text" autocomplete="username" required placeholder="you@cafe.com"/>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required/>
    <button type="submit">Authorize CLI</button>
  </form>
</div></body></html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

router.get('/authorize', async (req, res) => {
  const user_code = String(req.query.user_code || '').trim().toUpperCase();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(authorizePageHtml(user_code, null, false));
});

// form POST (application/x-www-form-urlencoded) + JSON for SPA later
router.post('/authorize', loginLimiter, async (req, res) => {
  const isForm = (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
  try {
    await ensureTable();
    const body = req.body || {};
    const user_code = String(body.user_code || '')
      .trim()
      .toUpperCase();
    const emailOrPhone = String(body.email || body.phone || body.login || '').trim();
    const password = String(body.password || '');
    if (!user_code || !emailOrPhone || !password) {
      if (isForm) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(400).send(authorizePageHtml(user_code, 'Email/phone and password required', false));
      }
      return res.status(400).json({ error: 'user_code, email/phone, password required' });
    }

    const row = (
      await pool.query(
        `SELECT device_code, status, expires_at FROM cli_device_codes WHERE user_code = $1`,
        [user_code]
      )
    ).rows[0];
    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      if (isForm) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(400).send(authorizePageHtml(user_code, 'Code expired or invalid. Run cyb login again.', false));
      }
      return res.status(400).json({ error: 'invalid_or_expired_code' });
    }
    if (row.status !== 'pending') {
      if (isForm) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(400).send(authorizePageHtml(user_code, 'This code was already used.', false));
      }
      return res.status(400).json({ error: 'already_used' });
    }

    const useEmail = emailOrPhone.includes('@');
    const value = useEmail ? emailOrPhone.toLowerCase() : emailOrPhone;
    const where = useEmail ? 'lower(email) = $1' : 'phone = $1';
    const user = (
      await pool.query(
        `SELECT id, workspace_id, password_hash, name, role, status, email, phone
         FROM users WHERE ${where} AND deleted_at IS NULL`,
        [value]
      )
    ).rows[0];
    if (!user || user.status !== 'active') {
      if (isForm) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(401).send(authorizePageHtml(user_code, 'Invalid credentials or inactive account', false));
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.password_hash) {
      if (isForm) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res
          .status(401)
          .send(authorizePageHtml(user_code, 'This account uses Google sign-in. Set a password in the web app, or use cyb login --token for now.', false));
      }
      return res.status(401).json({ error: 'password_not_set_use_token_or_set_password' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await auditLog(user.workspace_id, user.id, 'cli_login_failed', 'user', user.id, { via: 'device' });
      if (isForm) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(401).send(authorizePageHtml(user_code, 'Invalid credentials', false));
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload = { userId: user.id, workspaceId: user.workspace_id, role: user.role, sessionId: `cli-${Date.now()}` };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO auth_sessions (user_id, refresh_token, expires_at) VALUES ($1,$2,$3)`,
      [user.id, refreshToken, expiresAt]
    );
    await pool.query(
      `UPDATE cli_device_codes
       SET status='approved', user_id=$2, workspace_id=$3, access_token=$4, refresh_token=$5
       WHERE device_code=$1 AND status='pending'`,
      [row.device_code, user.id, user.workspace_id, accessToken, refreshToken]
    );
    await auditLog(user.workspace_id, user.id, 'cli_login', 'user', user.id, { via: 'device' });

    if (isForm) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(authorizePageHtml(user_code, null, true));
    }
    return res.json({ ok: true, status: 'approved' });
  } catch (e: any) {
    console.error('[Auth/CLI] authorize:', e.message);
    if (isForm) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(500).send(authorizePageHtml('', e.message || 'Server error', false));
    }
    res.status(500).json({ error: e.message });
  }
});

export default router;
