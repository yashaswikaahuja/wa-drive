import { Funnel as FunnelIcon } from '@phosphor-icons/react';
import type { Funnel } from '../api';
import { fmt } from '../lib/format';

const STEPS: { key: keyof Funnel; label: string }[] = [
  { key: 'signedUp', label: 'Signed up' },
  { key: 'connected', label: 'WhatsApp' },
  { key: 'activated', label: 'Activated' },
  { key: 'weeklyActive', label: 'Weekly active' },
  { key: 'paying', label: 'Paying' },
];

export function FunnelWidget({ f }: { f: Funnel }) {
  const top = Math.max(f.signedUp, 1);
  return (
    <section className="card" style={{ padding: '18px 20px', marginBottom: 16 }} aria-label="Activation funnel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'hsl(var(--marigold) / 0.1)', display: 'grid', placeItems: 'center' }}>
          <FunnelIcon size={16} weight="duotone" style={{ color: 'hsl(var(--marigold-deep))' }} />
        </div>
        <div>
          <h2 className="display" style={{ fontSize: 15, fontWeight: 700 }}>Activation Funnel</h2>
          <span className="muted" style={{ fontSize: 11 }}>signup → connected → activated → weekly-active → paying</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {STEPS.map((s, i) => {
          const v = f[s.key];
          const pctOfTop = Math.round((v / top) * 100);
          const prev = i === 0 ? v : f[STEPS[i - 1].key];
          const step = i === 0 ? 100 : prev > 0 ? Math.round((v / prev) * 100) : 0;
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="muted" style={{ width: 90, textAlign: 'right', flexShrink: 0, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</span>
              <div style={{ flex: 1, position: 'relative', background: 'hsl(var(--border-soft))', borderRadius: 6, height: 28, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${Math.max(pctOfTop, 2)}%`, background: i === 0 ? 'hsl(var(--marigold) / 0.4)' : 'hsl(var(--marigold) / 0.25)', borderRadius: 6, transition: 'width 300ms ease' }} />
                <span style={{ position: 'absolute', left: 10, lineHeight: '28px', fontSize: 13, fontWeight: 700, color: 'hsl(var(--ink))' }}>{fmt(v)}</span>
              </div>
              <span className="muted num" style={{ width: 56, fontSize: 11, textAlign: 'right', flexShrink: 0 }}>
                {i === 0 ? `${pctOfTop}%` : `${step}% ↓`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
