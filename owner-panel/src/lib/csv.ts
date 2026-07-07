import type { Workspace } from '../api';

const COLS: (keyof Workspace)[] = [
  'name', 'email', 'phone', 'location', 'plan', 'status', 'operators', 'whatsappConnected', 'whatsappNumber', 'files', 'createdAt', 'lastActiveAt',
];

function esc(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV from the currently shown (filtered) rows and trigger a download. */
export function exportWorkspacesCsv(rows: Workspace[]) {
  const lines = [COLS.join(',')];
  for (const r of rows) lines.push(COLS.map(c => esc(r[c])).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cybercafes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
