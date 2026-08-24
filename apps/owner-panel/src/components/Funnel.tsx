import type { Funnel } from '../api';
import { fmt } from '../lib/format';

const STEPS: { key: keyof Funnel; label: string }[] = [
  { key: 'signedUp', label: 'Signed up' },
  { key: 'connected', label: 'WhatsApp' },
  { key: 'activated', label: 'Activated' },
  { key: 'weeklyActive', label: 'Weekly active' },
  { key: 'paying', label: 'Paying' },
];

/** Activation funnel: signup → connected → activated (1st file) → weekly-active → paying. */
export function FunnelWidget({ f }: { f: Funnel }) {
  const top = Math.max(f.signedUp, 1);
  return (
    <section className="card" style={{ padding: 16, marginBottom: 16 }} aria-label="Activation funnel">
      <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        <h2 className="display" style={{ fontSize: 16 }}>Activation funnel</h2>
        <span className="muted" style={{ fontSize: 12 }}>signup → connected → activated → weekly-active → paying</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STEPS.map((s, i) => {
          const v = f[s.key];
          const pctOfTop = Math.round((v / top) * 100);
          const prev = i === 0 ? v : f[STEPS[i - 1].key];
          const step = i === 0 ? 100 : prev > 0 ? Math.round((v / prev) * 100) : 0;
          return (
            <div key={s.key} className="row" style={{ gap: 10, alignItems: 'center' }}>
              <div className="label" style={{ width: 104, textAlign: 'right', flexShrink: 0 }}>{s.label}</div>
              <div style={{ flex: 1, position: 'relative', background: 'hsl(var(--muted) / 0.12)', borderRadius: 8, height: 26, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pctOfTop}%`, minWidth: 2, background: 'hsl(var(--marigold) / 0.35)', borderRight: '2px solid hsl(var(--marigold-deep))' }} />
                <span className="num" style={{ position: 'absolute', left: 10, lineHeight: '26px', fontSize: 13, fontWeight: 600 }}>{fmt(v)}</span>
              </div>
              <div className="muted num" style={{ width: 62, fontSize: 12, flexShrink: 0, textAlign: 'right' }}>
                {i === 0 ? `${pctOfTop}%` : `${step}% ↓`}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
