import { useEffect, useRef, useState } from 'react';
import { ApiError, fetchWorkspace, patchLocation } from '../api';
import type { Config, WorkspaceDetail } from '../api';
import { relativeTime, fmt } from '../lib/format';
import { mapsUrl } from '../lib/format';
import { SourceBadge } from './SourceBadge';

interface Props { cfg: Config; id: string; onClose: () => void; onLocationSaved?: (id: string, location: string | null) => void; }

export function WorkspaceDrawer({ cfg, id, onClose, onLocationSaved }: Props) {
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState('');
  const [loc, setLoc] = useState('');
  const [savingLoc, setSavingLoc] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    setDetail(null); setError(''); setLocMsg('');
    fetchWorkspace(cfg, id)
      .then(d => { if (alive) { setDetail(d); setLoc(d.workspace.location || ''); } })
      .catch((e: ApiError) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [cfg, id]);

  const primary = detail && (detail.operators.find(o => o.role === 'admin') || detail.operators[0]);

  const saveLoc = async () => {
    setSavingLoc(true); setLocMsg('');
    const value = loc.trim() || null;
    try {
      await patchLocation(cfg, id, value);
      setLocMsg('Saved');
      onLocationSaved?.(id, value);
    } catch (e) { setLocMsg((e as ApiError).message); }
    finally { setSavingLoc(false); }
  };

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const w = detail?.workspace;

  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Cybercafé detail">
        <header className="drawer__head row between">
          <div>
            <h2 className="display" style={{ fontSize: 18, fontWeight: 700 }}>{w?.name || 'Cybercafé'}</h2>
            <div className="label">{detail ? `${fmt(detail.operators.length)} operators` : 'loading…'}</div>
          </div>
          <button ref={closeRef} className="iconbtn" onClick={onClose} aria-label="Close">×</button>
        </header>

        {error ? (
          <div className="drawer__body"><p className="banner" role="alert">{error}</p></div>
        ) : !detail ? (
          <div className="drawer__body">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}
          </div>
        ) : (
          <div className="drawer__body">
            <section>
              <div className="label section__title" style={{ marginBottom: 8 }}>Overview</div>
              <div className="kv">
                <div><div className="k">Plan</div><div className="v">{w!.plan}</div></div>
                <div><div className="k">Status</div><div className="v">{w!.status}</div></div>
                <div><div className="k">Joined</div><div className="v">{relativeTime(w!.createdAt)}</div></div>
                <div><div className="k">Last active</div><div className="v">{relativeTime(w!.lastActiveAt)}</div></div>
                <div><div className="k">Email</div><div className="v" style={{ fontWeight: 500, fontSize: 13 }}>{primary?.email || '—'}</div></div>
                <div><div className="k">Phone</div><div className="v" style={{ fontWeight: 500, fontSize: 13 }}>{primary?.phone || '—'}</div></div>
              </div>
            </section>

            <section>
              <div className="label section__title" style={{ marginBottom: 8 }}>
                Location <SourceBadge source={w!.locationSource} />
                {w!.lat != null && w!.lng != null && (
                  <a href={mapsUrl(w!.lat, w!.lng)} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, marginLeft: 8, color: 'hsl(var(--marigold-deep))' }}>Open in Google Maps ↗</a>
                )}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <input className="input grow" value={loc} onChange={e => { setLoc(e.target.value); setLocMsg(''); }}
                  placeholder="City / area (e.g. Patna, Boring Road)" aria-label="Location" maxLength={200} />
                <button className="btn btn--primary" onClick={saveLoc}
                  disabled={savingLoc || loc.trim() === (w!.location || '')}>{savingLoc ? 'Saving…' : 'Save'}</button>
              </div>
              {locMsg && <p className="muted" style={{ fontSize: 12, marginTop: 6, color: locMsg === 'Saved' ? 'hsl(var(--good))' : 'hsl(var(--danger))' }}>{locMsg}</p>}
            </section>

            <section>
              <div className="label section__title" style={{ marginBottom: 8 }}>Files processed</div>
              <div className="kv">
                <div><div className="k">Total</div><div className="v">{fmt(detail.files.total)}</div></div>
                <div><div className="k">Last upload</div><div className="v">{relativeTime(detail.files.lastUpload)}</div></div>
                <div><div className="k">Last 7 days</div><div className="v">{fmt(detail.files.last7)}</div></div>
                <div><div className="k">Last 30 days</div><div className="v">{fmt(detail.files.last30)}</div></div>
              </div>
            </section>

            <section>
              <div className="label section__title" style={{ marginBottom: 8 }}>WhatsApp {detail.whatsapp.length > 0 && `(${detail.whatsapp.length})`}</div>
              {detail.whatsapp.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>No WhatsApp session.</p>
              ) : detail.whatsapp.map((s, i) => (
                <div key={i} className="row" style={{ gap: 8, padding: '6px 0' }}>
                  <span className={`dot ${s.status === 'connected' ? 'dot--on' : 'dot--off'}`} aria-hidden />
                  <span style={{ fontWeight: 600 }}>{s.phoneNumber || '—'}</span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {s.status}{s.connectedAt ? ` · ${relativeTime(s.connectedAt)}` : ''}
                  </span>
                </div>
              ))}
            </section>

            <section>
              <div className="label section__title" style={{ marginBottom: 8 }}>Operators</div>
              <div className="table-wrap card">
                <table>
                  <thead><tr><th>Name</th><th>Contact</th><th>Role</th><th>Status</th></tr></thead>
                  <tbody>
                    {detail.operators.map(o => (
                      <tr key={o.id}>
                        <td style={{ fontWeight: 600 }}>{o.name || '—'}</td>
                        <td style={{ fontSize: 13 }}>{o.email || o.phone || '—'}</td>
                        <td style={{ fontSize: 13 }}>{o.role}</td>
                        <td style={{ fontSize: 13 }}>{o.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
