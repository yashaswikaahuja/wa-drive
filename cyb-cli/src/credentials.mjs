import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { configDir, credentialsPath, resolveApiBase } from './config.mjs';
import { isJwtExpired, peekJwtClaims, jwtTtlSeconds } from './jwt.mjs';
import { refreshTokens } from './api.mjs';

export function loadCredentials() {
  const path = credentialsPath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    if (!raw?.accessToken) return null;
    return raw;
  } catch {
    return null;
  }
}

export function saveCredentials({ accessToken, refreshToken, user, apiBase }) {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const path = credentialsPath();
  const payload = {
    accessToken,
    refreshToken: refreshToken || null,
    user: user || null,
    apiBase: (apiBase || resolveApiBase()).replace(/\/$/, ''),
    savedAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8');
  try {
    chmodSync(path, 0o600);
  } catch {
    /* windows */
  }
  return path;
}

export function clearCredentials() {
  const path = credentialsPath();
  if (existsSync(path)) unlinkSync(path);
  return path;
}

/**
 * Resolve auth. If access JWT is expired and refreshToken exists, try /auth/refresh.
 * Throws NOT_LOGGED_IN / TOKEN_EXPIRED with clear next steps.
 */
export async function requireAuth(flags = {}) {
  const apiBase = resolveApiBase(flags).replace(/\/$/, '');

  if (flags.token) {
    if (isJwtExpired(flags.token)) {
      const err = new Error(
        'Token expired (--token).\n' +
          '  Run:  cyb login\n' +
          '  Or paste a fresh JWT from the café app.'
      );
      err.code = 'TOKEN_EXPIRED';
      throw err;
    }
    return { apiBase, accessToken: flags.token, user: null, source: 'flag' };
  }

  if (process.env.CC_ACCESS_TOKEN || process.env.CYB_TOKEN || process.env.ACCESS_TOKEN) {
    const accessToken = (
      process.env.CYB_TOKEN ||
      process.env.CC_ACCESS_TOKEN ||
      process.env.ACCESS_TOKEN
    ).trim();
    if (isJwtExpired(accessToken)) {
      const err = new Error(
        'Token expired (env).\n' +
          '  Run:  cyb login\n' +
          '  Or set a fresh CYB_TOKEN / CC_ACCESS_TOKEN.'
      );
      err.code = 'TOKEN_EXPIRED';
      throw err;
    }
    return { apiBase, accessToken, user: null, source: 'env' };
  }

  const creds = loadCredentials();
  if (!creds?.accessToken) {
    const err = new Error(
      'Not logged in.\n' +
        '  Run:  cyb login\n' +
        '  Or:   cyb login --token <jwt>\n' +
        `  Creds: ${credentialsPath()}`
    );
    err.code = 'NOT_LOGGED_IN';
    throw err;
  }

  let accessToken = creds.accessToken;
  let refreshToken = creds.refreshToken || null;
  let user = creds.user || null;
  const resolvedApi = (creds.apiBase || apiBase).replace(/\/$/, '');

  if (isJwtExpired(accessToken)) {
    const ttl = jwtTtlSeconds(accessToken);
    const claims = peekJwtClaims(accessToken);
    console.warn(
      `Access token expired${ttl != null ? ` (${Math.abs(ttl)}s ago)` : ''}` +
        (claims?.workspaceId ? ` workspace=${claims.workspaceId}` : '')
    );
    if (refreshToken) {
      console.warn('Trying refresh…');
      try {
        const data = await refreshTokens(resolvedApi, refreshToken);
        if (data?.accessToken) {
          accessToken = data.accessToken;
          refreshToken = data.refreshToken || refreshToken;
          user = data.user || user;
          saveCredentials({
            accessToken,
            refreshToken,
            user,
            apiBase: resolvedApi,
          });
          console.warn('Token refreshed.\n');
        } else {
          const err = new Error(
            'Access token expired and refresh failed.\n' +
              '  Run:  cyb login\n' +
              `  Creds: ${credentialsPath()}`
          );
          err.code = 'TOKEN_EXPIRED';
          throw err;
        }
      } catch (e) {
        if (e.code === 'TOKEN_EXPIRED') throw e;
        const err = new Error(
          `Access token expired; refresh error: ${e.message}\n` +
            '  Run:  cyb login\n' +
            `  Creds: ${credentialsPath()}`
        );
        err.code = 'TOKEN_EXPIRED';
        throw err;
      }
    } else {
      const err = new Error(
        'Access token expired (no refresh token saved).\n' +
          '  Run:  cyb login\n' +
          `  Creds: ${credentialsPath()}`
      );
      err.code = 'TOKEN_EXPIRED';
      throw err;
    }
  }

  return {
    apiBase: resolvedApi,
    accessToken,
    refreshToken,
    user,
    source: 'file',
    claims: peekJwtClaims(accessToken),
  };
}

/** Sync wrapper kept for callers that cannot await — prefer requireAuth. */
export function requireAuthSync(flags = {}) {
  // Deprecated path: no refresh. Use async requireAuth.
  const apiBase = resolveApiBase(flags);
  if (flags.token) {
    return { apiBase, accessToken: flags.token, user: null, source: 'flag' };
  }
  if (process.env.CC_ACCESS_TOKEN || process.env.CYB_TOKEN || process.env.ACCESS_TOKEN) {
    return {
      apiBase,
      accessToken: (process.env.CYB_TOKEN || process.env.CC_ACCESS_TOKEN || process.env.ACCESS_TOKEN).trim(),
      user: null,
      source: 'env',
    };
  }
  const creds = loadCredentials();
  if (!creds?.accessToken) {
    const err = new Error(
      'Not logged in.\n' +
        '  Run:  cyb login\n' +
        '  Or:   cyb login --token <jwt>\n' +
        `  Creds: ${credentialsPath()}`
    );
    err.code = 'NOT_LOGGED_IN';
    throw err;
  }
  if (isJwtExpired(creds.accessToken)) {
    const err = new Error(
      'Access token expired.\n' +
        '  Run:  cyb login\n' +
        `  Creds: ${credentialsPath()}`
    );
    err.code = 'TOKEN_EXPIRED';
    throw err;
  }
  return {
    apiBase: (creds.apiBase || apiBase).replace(/\/$/, ''),
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken,
    user: creds.user,
    source: 'file',
  };
}
