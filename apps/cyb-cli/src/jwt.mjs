/** Best-effort JWT helpers (no signature verify). */

export function peekJwtClaims(token) {
  try {
    const mid = String(token || '').split('.')[1];
    if (!mid) return null;
    const json = Buffer.from(mid.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Seconds until exp; negative if already expired. null if unknown. */
export function jwtTtlSeconds(token) {
  const claims = peekJwtClaims(token);
  if (!claims?.exp) return null;
  return Number(claims.exp) - Math.floor(Date.now() / 1000);
}

export function isJwtExpired(token, skewSeconds = 30) {
  const ttl = jwtTtlSeconds(token);
  if (ttl == null) return false;
  return ttl <= skewSeconds;
}
