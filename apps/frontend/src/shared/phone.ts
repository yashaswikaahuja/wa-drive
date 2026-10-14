/** Digits-only phone for compare / URL params. */
export function phoneDigits(p: string): string {
  return String(p || '').replace(/\D/g, '');
}

/**
 * Match café phones across 91 / 0 / bare-10 formats.
 * Prefer exact digit equality; then suffix match for ≥10 digits.
 */
export function phonesMatch(a: string, b: string): boolean {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const shorter = da.length <= db.length ? da : db;
  const longer = da.length <= db.length ? db : da;
  if (shorter.length < 10) return false;
  return longer.endsWith(shorter);
}
