import type { Metrics } from '../api';
import { fmt } from '../lib/format';

interface StatProps { label: string; value: number; hint?: string; accent?: boolean; }

function Stat({ label, value, hint, accent }: StatProps) {
  return (
    <div className={`card stat${accent ? ' stat--accent' : ''}`}>
      <div className="stat__value num">{fmt(value)}</div>
      <div className="stat__label label">{label}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

export function MetricsGrid({ m }: { m: Metrics }) {
  const churnRate = m.signups + m.churned > 0
    ? Math.round((m.churned / (m.signups + m.churned)) * 100)
    : 0;
  return (
    <section className="stats" aria-label="Customer metrics">
      <Stat label="Active (30d)" value={m.active30d} accent hint="using it now" />
      <Stat label="Paying" value={m.paying} hint="on a paid plan" />
      <Stat label="Signups" value={m.signups} hint="all live accounts" />
      <Stat label="New · month" value={m.newThisMonth} hint={`${fmt(m.newThisWeek)} this week`} />
      <Stat label="Churned" value={m.churned} hint={`${churnRate}% churn`} />
      <Stat label="Dormant" value={Math.max(m.signups - m.active30d, 0)} hint="no 30d activity" />
    </section>
  );
}

export function MetricsSkeleton() {
  return (
    <section className="stats" aria-busy="true" aria-label="Loading metrics">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card stat"><div className="skeleton" style={{ height: 30, width: '60%' }} /><div className="skeleton" style={{ height: 11, width: '80%', marginTop: 10 }} /></div>
      ))}
    </section>
  );
}
