import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { configDir, credentialsPath, resolveApiBase } from './config.mjs';

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

export function requireAuth(flags = {}) {
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
  return {
    apiBase: (creds.apiBase || apiBase).replace(/\/$/, ''),
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken,
    user: creds.user,
    source: 'file',
  };
}
