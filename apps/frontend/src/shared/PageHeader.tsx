import type { ReactNode } from 'react';

/**
 * Consistent page header: title (+ optional subtitle) with an optional
 * actions slot on the right. Stacks on mobile, row on sm+.
 */
export default function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'hsl(var(--pt-ink))' }}>{title}</h1>
        {subtitle && <p className="text-sm pt-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
