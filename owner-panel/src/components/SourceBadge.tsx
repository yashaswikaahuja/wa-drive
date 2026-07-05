import type { CSSProperties } from 'react';

// How a workspace's location was captured — drives a small accuracy badge.
const META: Record<string, { icon: string; label: string; color: string }> = {
  gps: { icon: '📍', label: 'GPS · precise', color: 'hsl(var(--good))' },
  manual: { icon: '✎', label: 'Manual', color: 'hsl(var(--ink-soft))' },
  ip: { icon: '🌐', label: 'IP · approximate', color: 'hsl(var(--muted))' },
};

export function SourceBadge({ source, style }: { source: string | null; style?: CSSProperties }) {
  if (!source || !META[source]) return null;
  const m = META[source];
  return (
    <span title={m.label} aria-label={m.label}
      style={{ fontSize: 11, marginLeft: 6, color: m.color, whiteSpace: 'nowrap', ...style }}>
      {m.icon} {source}
    </span>
  );
}
