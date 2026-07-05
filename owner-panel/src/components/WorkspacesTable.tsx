import type { Workspace } from '../api';
import { relativeTime, isDormant, fmt } from '../lib/format';

type Sort = 'last_active' | 'created' | 'files';

interface Props {
  rows: Workspace[];
  q: string;
  onQ: (v: string) => void;
  sort: Sort;
  onSort: (s: Sort) => void;
}

export function WorkspacesTable({ rows, q, onQ, sort, onSort }: Props) {
  return (
    <section className="card" aria-label="Cybercafés">
      <div className="row between" style={{ padding: '14px 16px', flexWrap: 'wrap', gap: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <h2 className="display" style={{ fontSize: 16 }}>Cybercafés</h2>
          <span className="muted num" style={{ fontSize: 13 }}>{fmt(rows.length)}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input" type="search" value={q} onChange={e => onQ(e.target.value)}
            placeholder="Search name…" aria-label="Search cybercafés" style={{ width: 200 }}
          />
          <label className="label" htmlFor="sort">Sort</label>
          <select id="sort" className="input" value={sort} onChange={e => onSort(e.target.value as Sort)} style={{ width: 'auto' }}>
            <option value="last_active">Last active</option>
            <option value="created">Newest</option>
            <option value="files">Most files</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="state">
          <h3>No cybercafés{q ? ' match' : ' yet'}</h3>
          <p className="muted" style={{ marginTop: 4 }}>{q ? 'Try a different search.' : 'Signups will appear here.'}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Café</th><th>Plan</th><th>Ops</th><th>WhatsApp</th>
                <th className="num">Files</th><th>Last active</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(w => (
                <tr key={w.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{w.name || 'Untitled'}</div>
                    <div className="muted" style={{ fontSize: 12 }}>joined {relativeTime(w.createdAt)}</div>
                  </td>
                  <td>{w.plan !== 'free'
                    ? <span className="pill pill--paid">{w.plan}</span>
                    : <span className="muted" style={{ fontSize: 13 }}>free</span>}
                  </td>
                  <td className="num">{fmt(w.operators)}</td>
                  <td>
                    <span className="row" style={{ gap: 7 }}>
                      <span className={`dot ${w.whatsappConnected ? 'dot--on' : 'dot--off'}`} aria-hidden />
                      <span style={{ fontSize: 13 }}>{w.whatsappConnected ? 'Connected' : 'Off'}</span>
                    </span>
                  </td>
                  <td className="num">{fmt(w.files)}</td>
                  <td style={{ color: isDormant(w.lastActiveAt) ? 'hsl(var(--muted))' : undefined, fontSize: 13 }}>
                    {relativeTime(w.lastActiveAt)}
                  </td>
                  <td>
                    {w.status === 'churned'
                      ? <span className="pill pill--churned">churned</span>
                      : isDormant(w.lastActiveAt)
                        ? <span className="pill" style={{ color: 'hsl(var(--muted))' }}>dormant</span>
                        : <span className="pill" style={{ color: 'hsl(var(--good))', borderColor: 'hsl(var(--good) / 0.3)' }}>active</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function TableSkeleton() {
  return (
    <section className="card" style={{ padding: 16 }} aria-busy="true" aria-label="Loading cybercafés">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8 }} />
      ))}
    </section>
  );
}
