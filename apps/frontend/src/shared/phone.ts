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

/**
 * Display formatting for Indian café phones (91… / 0… / bare 10).
 * Falls back to the original string when digits are not a phone.
 */
export function formatPhoneDisplay(p: string): string {
  const d = phoneDigits(p);
  if (!d) return String(p || '');
  // +91 90066 15450
  if (d.length === 12 && d.startsWith('91')) {
    return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  }
  if (d.length === 13 && d.startsWith('910')) {
    return `+91 ${d.slice(3, 8)} ${d.slice(8)}`;
  }
  if (d.length === 11 && d.startsWith('0')) {
    return `+91 ${d.slice(1, 6)} ${d.slice(6)}`;
  }
  if (d.length === 10) {
    return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  }
  if (d.length >= 10 && d.length <= 15) return `+${d}`;
  return String(p || d);
}
