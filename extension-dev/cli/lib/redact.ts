const SENSITIVE_KEY = /token|password|authorization|secret|credential|accessToken|refreshToken/i;

export function redactDeep(value, depth = 0) {
  if (depth > 30) return '[max-depth]';
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.length > 40 && /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\./.test(value)) {
      return '[redacted-jwt]';
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(k)) out[k] = '[redacted]';
      else out[k] = redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}
