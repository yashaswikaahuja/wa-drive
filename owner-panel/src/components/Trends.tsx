import type { Trends } from '../api';
import { fmt } from '../lib/format';

/** North-Star: Weekly Active Cafés trend + WAU/MAU stickiness + signup cohort retention heatmap. */
export function TrendsPanel({ t }: { t: Trends }) {
  const peak = Math.max(1, ...t.wauSeries.map(w => w.active));
  const cur = t.wauSeries[t.wauSeries.length - 1]?.active ?? 0;
  return (
    <section className="card" style={{ padding: 16, marginBottom: 16 }} aria-label="Engagement trends">
      <div className="row between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="display" style={{ fontSize: 16 }}>
          Weekly Active Cafés <span className="muted" style={{ fontSize: 12 }}>· North Star</span>
        </h2>
        <div className="row" style={{ gap: 18 }}>
          <div><span className="num" style={{ fontWeight: 700, fontSize: 18 }}>{fmt(cur)}</span> <span className="muted" style={{ fontSize: 12 }}>this week</span></div>
          <div><span className="num" style={{ fontWeight: 700, fontSize: 18 }}>{t.stickiness.ratio}%</span> <span className="muted" style={{ fontSize: 12 }}>stickiness</span></div>
        </div>
      </div>

      <div className="row" style={{ gap: 6, alignItems: 'flex-end', height: 78 }}>
        {t.wauSeries.map((w, i) => {
          const last = i === t.wauSeries.length - 1;
          return (
            <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span className="num" style={{ fontSize: 11 }}>{w.active}</span>
              <div title={w.week} style={{
                width: '100%', height: `${Math.round((w.active / peak) * 54) + 2}px`, borderRadius: 4,
                background: last ? 'hsl(var(--marigold-deep))' : 'hsl(var(--marigold) / 0.5)',
              }} />
            </div>
          );
        })}
      </div>
      <div className="row" style={{ gap: 6, marginTop: 4 }}>
        {t.wauSeries.map(w => <div key={w.week} className="muted" style={{ flex: 1, textAlign: 'center', fontSize: 10 }}>{w.week.slice(5)}</div>)}
      </div>

      {t.cohorts.length > 0 && (
        <>
          <div className="label section__title" style={{ margin: '18px 0 8px' }}>
            Signup cohort retention <span className="muted" style={{ fontSize: 11 }}>· % active N months after signup</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cohort</th><th className="num">Size</th>
                  {Array.from({ length: 6 }).map((_, k) => <th key={k} className="num">M{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {t.cohorts.map(c => (
                  <tr key={c.cohort}>
                    <td style={{ fontSize: 13 }}>{c.cohort}</td>
                    <td className="num">{fmt(c.size)}</td>
                    {c.retention.map((r, k) => (
                      <td key={k} className="num" style={{
                        fontSize: 12,
                        background: r == null ? 'transparent' : `hsl(var(--good) / ${Math.max(r, 3) / 150})`,
                        color: r != null && r >= 60 ? '#fff' : undefined,
                      }}>
                        {r == null ? '·' : `${r}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
