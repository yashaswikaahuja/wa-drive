import { Users, CurrencyCircleDollar, UserPlus, TrendUp, Warning, Moon } from '@phosphor-icons/react';
import type { Metrics } from '../api';
import { fmt } from '../lib/format';

const STAT_CONFIG: { key: string; label: string; hint: (m: Metrics) => string; icon: typeof Users; accent?: boolean }[] = [
  { key: 'active30d', label: 'Active (30d)', hint: () => 'using it now', icon: TrendUp, accent: true },
  { key: 'paying', label: 'Paying', hint: () => 'on a paid plan', icon: CurrencyCircleDollar },
  { key: 'signups', label: 'Signups', hint: () => 'all live accounts', icon: Users },
  { key: 'newThisMonth', label: 'New · month', hint: (m) => `${fmt(m.newThisWeek)} this week`, icon: UserPlus },
  { key: 'churned', label: 'Churned', hint: (m) => `${m.signups + m.churned > 0 ? Math.round((m.churned / (m.signups + m.churned)) * 100) : 0}% churn`, icon: Warning },
  { key: 'dormant', label: 'Dormant', hint: () => 'no 30d activity', icon: Moon },
];

export function MetricsGrid({ m }: { m: Metrics }) {
  const values: Record<string, number> = { ...m, dormant: Math.max(m.signups - m.active30d, 0) };
  return (
    <section className="stats" aria-label="Customer metrics">
      {STAT_CONFIG.map(s => {
        const Icon = s.icon;
        return (
          <div key={s.key} className={`card stat${s.accent ? ' stat--accent' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: s.accent ? 'hsl(var(--marigold) / 0.12)' : 'hsl(var(--muted) / 0.08)', display: 'grid', placeItems: 'center' }}>
                <Icon size={15} weight="duotone" style={{ color: s.accent ? 'hsl(var(--marigold-deep))' : 'hsl(var(--muted))' }} />
              </div>
            </div>
            <div className="stat__value num">{fmt(values[s.key])}</div>
            <div className="stat__label label">{s.label}</div>
            <div className="stat__hint">{s.hint(m)}</div>
          </div>
        );
      })}
    </section>
  );
}

export function MetricsSkeleton() {
  return (
    <section className="stats" aria-busy="true" aria-label="Loading metrics">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card stat"><div className="skeleton" style={{ height: 28, width: 28, borderRadius: 7 }} /><div className="skeleton" style={{ height: 30, width: '50%', marginTop: 10 }} /><div className="skeleton" style={{ height: 11, width: '70%', marginTop: 8 }} /></div>
      ))}
    </section>
  );
}
