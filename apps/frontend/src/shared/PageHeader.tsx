import type { ReactNode } from 'react';

/**
 * Consistent page header: display title (+ optional subtitle) with actions.
 * Stacks on mobile, row on sm+. Matches landing typography hierarchy.
 */
export default function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="pt-display text-[1.65rem] font-bold tracking-tight leading-tight" style={{ color: 'hsl(var(--ink))' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm mt-1.5 leading-relaxed max-w-xl" style={{ color: 'hsl(var(--pt-muted))' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0 flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
