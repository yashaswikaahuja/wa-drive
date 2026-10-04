import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, chmodSync } from 'node:fs';
import { configDir, credentialsPath, resolveApiBase } from './config.js';
import { isJwtExpired, peekJwtClaims, jwtTtlSeconds } from './jwt.js';
import { refreshTokens } from './api.js';
import { AuthError, type AuthContext, type CliFlags, type StoredCredentials } from './types.js';

export function loadCredentials(): StoredCredentials | null {
  const path = credentialsPath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    if (!raw?.accessToken) return null;
    return raw as StoredCredentials;
  } catch {
    return null;
  }
}

export function saveCredentials({
  accessToken,
  refreshToken,
  user,
  apiBase,
}: {
  accessToken: string;
  refreshToken?: string | null;
  user?: Record<string, unknown> | null;
  apiBase?: string;
}): string {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const path = credentialsPath();
  const payload: StoredCredentials = {
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

export function clearCredentials(): string {
  const path = credentialsPath();
  if (existsSync(path)) unlinkSync(path);
  return path;
}

/**
 * Resolve auth. If access JWT is expired and refreshToken exists, try /auth/refresh.
 * Throws NOT_LOGGED_IN / TOKEN_EXPIRED with clear next steps.
 */
export async function requireAuth(flags: Partial<CliFlags> = {}): Promise<AuthContext> {
  const apiBase = resolveApiBase(flags).replace(/\/$/, '');

  if (flags.token) {
    if (isJwtExpired(flags.token)) {
      throw new AuthError(
        'Token expired (--token).\n' +
          '  Run:  cyb login\n' +
          '  Or paste a fresh JWT from the café app.',
        'TOKEN_EXPIRED'
      );
    }
    return { apiBase, accessToken: flags.token, user: null, source: 'flag' };
  }

  if (process.env.CC_ACCESS_TOKEN || process.env.CYB_TOKEN || process.env.ACCESS_TOKEN) {
    const accessToken = (
      process.env.CYB_TOKEN ||
      process.env.CC_ACCESS_TOKEN ||
      process.env.ACCESS_TOKEN ||
      ''
    ).trim();
    if (isJwtExpired(accessToken)) {
      throw new AuthError(
        'Token expired (env).\n' +
          '  Run:  cyb login\n' +
          '  Or set a fresh CYB_TOKEN / CC_ACCESS_TOKEN.',
        'TOKEN_EXPIRED'
      );
    }
    return { apiBase, accessToken, user: null, source: 'env' };
  }

  const creds = loadCredentials();
  if (!creds?.accessToken) {
    throw new AuthError(
      'Not logged in.\n' +
        '  Run:  cyb login\n' +
        '  Or:   cyb login --token <jwt>\n' +
        `  Creds: ${credentialsPath()}`,
      'NOT_LOGGED_IN'
    );
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
          throw new AuthError(
            'Access token expired and refresh failed.\n' +
              '  Run:  cyb login\n' +
              `  Creds: ${credentialsPath()}`,
            'TOKEN_EXPIRED'
          );
        }
      } catch (e: any) {
        if (e.code === 'TOKEN_EXPIRED') throw e;
        throw new AuthError(
          `Access token expired; refresh error: ${e.message}\n` +
            '  Run:  cyb login\n' +
            `  Creds: ${credentialsPath()}`,
          'TOKEN_EXPIRED'
        );
      }
    } else {
      throw new AuthError(
        'Access token expired (no refresh token saved).\n' +
          '  Run:  cyb login\n' +
          `  Creds: ${credentialsPath()}`,
        'TOKEN_EXPIRED'
      );
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
export function requireAuthSync(flags: Partial<CliFlags> = {}): AuthContext {
  // Deprecated path: no refresh. Use async requireAuth.
  const apiBase = resolveApiBase(flags);
  if (flags.token) {
    return { apiBase, accessToken: flags.token, user: null, source: 'flag' };
  }
  if (process.env.CC_ACCESS_TOKEN || process.env.CYB_TOKEN || process.env.ACCESS_TOKEN) {
    return {
      apiBase,
      accessToken: (process.env.CYB_TOKEN || process.env.CC_ACCESS_TOKEN || process.env.ACCESS_TOKEN || '').trim(),
      user: null,
      source: 'env',
    };
  }
  const creds = loadCredentials();
  if (!creds?.accessToken) {
    throw new AuthError(
      'Not logged in.\n' +
        '  Run:  cyb login\n' +
        '  Or:   cyb login --token <jwt>\n' +
        `  Creds: ${credentialsPath()}`,
      'NOT_LOGGED_IN'
    );
  }
  if (isJwtExpired(creds.accessToken)) {
    throw new AuthError(
      'Access token expired.\n' +
        '  Run:  cyb login\n' +
        `  Creds: ${credentialsPath()}`,
      'TOKEN_EXPIRED'
    );
  }
  return {
    apiBase: (creds.apiBase || apiBase).replace(/\/$/, ''),
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken,
    user: creds.user,
    source: 'file',
  };
}
