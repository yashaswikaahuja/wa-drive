export function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// Dormant = no activity in 30 days.
export function isDormant(iso: string | null): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > 30 * 24 * 3600 * 1000;
}

export function fmt(n: number): string {
  return n.toLocaleString('en-IN');
}
