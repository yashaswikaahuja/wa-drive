/**
 * Browser sign-in for LLM apps that connect to POST /api/mcp.
 * OAuth 2.1 authorization code + PKCE, dynamic client registration,
 * and client-id metadata documents. The issued access token is the
 * same CyberControl JWT /api/auth/login already returns.
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/db.js';

const SCOPE = 'browser';

export function publicOrigin(req: any) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'api.cybercontrol.fun').split(',')[0].trim();
  let proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  if (host === 'api.cybercontrol.fun' || host.endsWith('.cybercontrol.fun')) proto = 'https';
  return `${proto}://${host}`;
}

export function pkceS256(verifier: string) {
  return crypto.createHash('sha256').update(String(verifier)).digest('base64url');
}

export function allowedRedirect(uri: string) {
  let parsed: URL;
  try { parsed = new URL(uri); } catch { return false; }
  if (parsed.username || parsed.password || parsed.hash) return false;
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol !== 'http:') return false;
  return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
}

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function randomId(prefix: string) {
  return prefix + crypto.randomBytes(24).toString('base64url');
}

let tablesReady: Promise<void> | null = null;
function ensureTables() {
  if (!tablesReady) {
    tablesReady = pool.query(`
      CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
        client_id TEXT PRIMARY KEY,
        client_name TEXT,
        redirect_uris JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
        code TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `).then(() => undefined).catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}

const metadataCache = new Map<string, { at: number, doc: any }>();

async function clientRedirects(clientId: string): Promise<{ name: string, redirects: string[] } | null> {
  if (clientId.startsWith('https://')) {
    const cached = metadataCache.get(clientId);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
      return { name: cached.doc.client_name || 'MCP client', redirects: cached.doc.redirect_uris || [] };
    }
    const res = await fetch(clientId, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const doc = await res.json();
    if (!doc || doc.client_id !== clientId || !Array.isArray(doc.redirect_uris)) return null;
    metadataCache.set(clientId, { at: Date.now(), doc });
    return { name: doc.client_name || 'MCP client', redirects: doc.redirect_uris.filter((u: any) => typeof u === 'string') };
  }
  await ensureTables();
  const found = await pool.query('SELECT client_name, redirect_uris FROM mcp_oauth_clients WHERE client_id = $1', [clientId]);
  if (!found.rows.length) return null;
  let uris = found.rows[0].redirect_uris;
  if (typeof uris === 'string') {
    try { uris = JSON.parse(uris); } catch { uris = []; }
  }
  return { name: found.rows[0].client_name || 'MCP client', redirects: Array.isArray(uris) ? uris : [] };
}

async function hubLogin(identity: string, password: string) {
  const body = identity.includes('@')
    ? { email: identity.trim().toLowerCase(), password }
    : { phone: identity.trim(), password };
  const targets = [
    (process.env.HUB_ORIGIN || 'http://backend:3000') + '/api/auth/login',
    (process.env.API_ORIGIN || 'https://api.cybercontrol.fun') + '/api/auth/login',
  ];
  let lastError = 'Could not reach sign-in';
  for (const url of targets) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.accessToken) return data;
      lastError = data.error || 'Email or password is wrong';
      if (res.status === 401 || res.status === 403) break;
    } catch (err: any) {
      lastError = err && err.message ? err.message : lastError;
    }
  }
  const error: any = new Error(lastError);
  error.status = 401;
  throw error;
}

function loginPage(fields: any, error: string) {
  const hidden = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'scope', 'resource']
    .map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(fields[name] || '')}">`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in to CyberControl</title>
  <style>
    body { margin: 0; font-family: Georgia, serif; background: #f4f0e8; color: #1c1915; }
    main { max-width: 26rem; margin: 8vh auto; padding: 2rem; background: #fffdf8; border: 1px solid #e4dccb; }
    h1 { font-size: 1.4rem; font-weight: 500; margin: 0 0 0.4rem; }
    p { color: #5c564c; line-height: 1.45; }
    label { display: block; margin: 1rem 0 0.3rem; font-size: 0.85rem; }
    input[type=text], input[type=password] { width: 100%; box-sizing: border-box; padding: 0.65rem 0.7rem; border: 1px solid #cfc4b0; background: #fff; font: inherit; }
    button, .cancel { margin-top: 1.2rem; }
    button { background: #1c1915; color: #fffdf8; border: 0; padding: 0.7rem 1rem; font: inherit; cursor: pointer; }
    .cancel { margin-left: 0.8rem; color: #5c564c; }
    .error { color: #8a2e2e; }
  </style>
</head>
<body>
  <main>
    <h1>Sign in to CyberControl</h1>
    <p>${escapeHtml(fields.client_name || 'An app')} is connecting to your browser tools. Use the email or phone and password for your CyberControl account.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <form method="POST" action="/api/mcp/oauth/authorize">
      ${hidden}
      <label for="identity">Email or phone</label>
      <input id="identity" name="identity" type="text" autocomplete="username" required value="${escapeHtml(fields.identity || '')}">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Continue</button>
      <a class="cancel" href="/api/mcp/oauth/authorize?cancel=1&amp;redirect_uri=${encodeURIComponent(fields.redirect_uri || '')}&amp;state=${encodeURIComponent(fields.state || '')}&amp;client_id=${encodeURIComponent(fields.client_id || '')}">Cancel</a>
    </form>
  </main>
</body>
</html>`;
}

function browserHome() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CyberControl MCP</title>
  <style>
    body { margin: 0; font-family: Georgia, serif; background: #f4f0e8; color: #1c1915; }
    main { max-width: 34rem; margin: 8vh auto; padding: 2rem; background: #fffdf8; border: 1px solid #e4dccb; }
    h1 { font-weight: 500; font-size: 1.6rem; }
    code { font-family: ui-monospace, monospace; font-size: 0.92rem; }
    p { line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>CyberControl browser tools</h1>
    <p>This address is an MCP server. Add <code>https://api.cybercontrol.fun/api/mcp</code> in the LLM app. The app opens this browser so you can sign in with your CyberControl account.</p>
    <p>A visit from the address bar does not sign you in. The app starts that step itself.</p>
  </main>
</body>
</html>`;
}

export function unauthorized(req: any, res: any, message: string) {
  const origin = publicOrigin(req);
  const metadata = `${origin}/.well-known/oauth-protected-resource/api/mcp`;
  res.setHeader('WWW-Authenticate', `Bearer realm="cybercontrol", resource_metadata="${metadata}", scope="${SCOPE}"`);
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate');
  return res.status(401).json({
    jsonrpc: '2.0',
    id: req.body && typeof req.body === 'object' && req.body.id !== undefined ? req.body.id : null,
    error: { code: -32001, message },
  });
}

export const discoveryRouter = Router();

function protectedResource(req: any, res: any) {
  const origin = publicOrigin(req);
  res.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
  });
}

discoveryRouter.use('/oauth-protected-resource', protectedResource);
discoveryRouter.get('/openid-configuration', authorizationServer);
discoveryRouter.use('/oauth-authorization-server', (req: any, res: any) => authorizationServer(req, res));

function authorizationServer(req: any, res: any) {
  const origin = publicOrigin(req);
  res.json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
    token_endpoint: `${origin}/api/mcp/oauth/token`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
    client_id_metadata_document_supported: true,
  });
}

export function mountOAuth(router: any) {
  router.get('/', (req: any, res: any) => {
    const accept = String(req.headers.accept || '');
    if (accept.includes('text/html')) {
      res.type('html').send(browserHome());
      return;
    }
    unauthorized(req, res, 'sign in required');
  });

  router.get('/oauth/authorize', async (req: any, res: any) => {
    try {
      if (req.query.cancel === '1') {
        const back = String(req.query.redirect_uri || '');
        const client = await clientRedirects(String(req.query.client_id || ''));
        if (client && client.redirects.includes(back) && allowedRedirect(back)) {
          const target = new URL(back);
          target.searchParams.set('error', 'access_denied');
          if (req.query.state) target.searchParams.set('state', String(req.query.state));
          res.redirect(target.toString());
          return;
        }
      }
      const fields = await authorizeFields(req.query || {});
      res.type('html').send(loginPage(fields, ''));
    } catch (err: any) {
      res.status(400).type('html').send(loginPage({ client_name: 'This app' }, err.message || 'This sign-in link is not valid'));
    }
  });

  router.post('/oauth/authorize', async (req: any, res: any) => {
    const body = req.body || {};
    let fields: any = body;
    try {
      fields = await authorizeFields(body);
      const identity = String(body.identity || '').trim();
      const password = String(body.password || '');
      if (!identity || !password) throw new Error('Email and password are required');
      const session = await hubLogin(identity, password);
      await ensureTables();
      const code = randomId('code_');
      await pool.query(
        `INSERT INTO mcp_oauth_codes (code, client_id, redirect_uri, code_challenge, access_token, refresh_token, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6, now() + interval '10 minutes')`,
        [code, fields.client_id, fields.redirect_uri, fields.code_challenge, session.accessToken, session.refreshToken || null]
      );
      const target = new URL(fields.redirect_uri);
      target.searchParams.set('code', code);
      if (fields.state) target.searchParams.set('state', fields.state);
      res.redirect(target.toString());
    } catch (err: any) {
      const status = err && err.message === 'This sign-in link is not valid' ? 400 : 401;
      res.status(status).type('html').send(loginPage(fields, err.message || 'Sign-in failed'));
    }
  });

  router.post('/oauth/register', async (req: any, res: any) => {
    try {
      const uris = req.body && req.body.redirect_uris;
      if (!Array.isArray(uris) || !uris.length || uris.some((uri) => !allowedRedirect(String(uri)))) {
        return res.status(400).json({ error: 'invalid_redirect_uri' });
      }
      await ensureTables();
      const clientId = randomId('mcp_');
      const name = String((req.body && req.body.client_name) || 'MCP client').slice(0, 120);
      await pool.query(
        'INSERT INTO mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES ($1,$2,$3::jsonb)',
        [clientId, name, JSON.stringify(uris)]
      );
      res.status(201).json({
        client_id: clientId,
        client_name: name,
        redirect_uris: uris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });
    } catch (err: any) {
      console.error('[mcp-oauth] register', err && err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  router.post('/oauth/token', async (req: any, res: any) => {
    const body = req.body || {};
    try {
    const grant = body.grant_type;
    if (grant === 'refresh_token') {
      const refreshToken = String(body.refresh_token || '');
      if (!refreshToken) return res.status(400).json({ error: 'invalid_grant' });
      const targets = [
        (process.env.HUB_ORIGIN || 'http://backend:3000') + '/api/auth/refresh',
        (process.env.API_ORIGIN || 'https://api.cybercontrol.fun') + '/api/auth/refresh',
      ];
      for (const url of targets) {
        try {
          const refreshed = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
            signal: AbortSignal.timeout(10000),
          });
          const data = await refreshed.json().catch(() => ({}));
          if (refreshed.ok && data.accessToken) {
            return res.json({
              access_token: data.accessToken,
              token_type: 'Bearer',
              expires_in: 86400,
              refresh_token: data.refreshToken || refreshToken,
              scope: SCOPE,
            });
          }
        } catch { /* try the public login next */ }
      }
      return res.status(400).json({ error: 'invalid_grant' });
    }
    if (grant !== 'authorization_code') return res.status(400).json({ error: 'unsupported_grant_type' });
    const code = String(body.code || '');
    const verifier = String(body.code_verifier || '');
    const redirectUri = String(body.redirect_uri || '');
    const clientId = String(body.client_id || '');
    if (!code || !verifier) return res.status(400).json({ error: 'invalid_grant' });
    await ensureTables();
    const found = await pool.query('SELECT * FROM mcp_oauth_codes WHERE code = $1', [code]);
    const row = found.rows[0];
    await pool.query('DELETE FROM mcp_oauth_codes WHERE code = $1', [code]);
    if (!row || new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'invalid_grant' });
    if (row.client_id !== clientId || row.redirect_uri !== redirectUri) return res.status(400).json({ error: 'invalid_grant' });
    if (pkceS256(verifier) !== row.code_challenge) return res.status(400).json({ error: 'invalid_grant' });
    res.json({
      access_token: row.access_token,
      token_type: 'Bearer',
      expires_in: 86400,
      refresh_token: row.refresh_token,
      scope: SCOPE,
    });
    } catch (err: any) {
      console.error('[mcp-oauth] token', err && err.message);
      if (!res.headersSent) res.status(500).json({ error: 'server_error' });
    }
  });
}

async function authorizeFields(input: any) {
  const clientId = String(input.client_id || '');
  const redirectUri = String(input.redirect_uri || '');
  const challenge = String(input.code_challenge || '');
  const method = String(input.code_challenge_method || '');
  if (!clientId || !redirectUri || !challenge) throw new Error('This sign-in link is not valid');
  if (method && method !== 'S256') throw new Error('This sign-in link is not valid');
  if (!allowedRedirect(redirectUri)) throw new Error('This sign-in link is not valid');
  const client = await clientRedirects(clientId);
  if (!client || !client.redirects.includes(redirectUri)) throw new Error('This sign-in link is not valid');
  return {
    client_id: clientId,
    client_name: client.name,
    redirect_uri: redirectUri,
    state: String(input.state || ''),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: String(input.scope || SCOPE),
    resource: String(input.resource || ''),
    identity: String(input.identity || ''),
  };
}

export const __test = { loginPage };
