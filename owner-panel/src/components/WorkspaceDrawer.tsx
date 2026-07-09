import { useEffect, useRef, useState } from 'react';
import { ApiError, fetchWorkspace, patchLocation, setWorkspaceStatus, deleteWorkspace } from '../api';
import type { Config, WorkspaceDetail } from '../api';
import { relativeTime, fmt } from '../lib/format';
import { mapsUrl } from '../lib/format';
import { SourceBadge } from './SourceBadge';

interface HealthHint { health: number; healthBand: string; healthFlags: string[]; }
interface Props { cfg: Config; id: string; onClose: () => void; hint?: HealthHint | null; onLocationSaved?: (id: string, location: string | null) => void; onStatusChanged?: (id: string, status: string) => void; onDeleted?: (id: string) => void; }

const BAND_COLOR: Record<string, string> = {
  healthy: 'hsl(var(--good))', watch: 'hsl(var(--marigold-deep))',
  'at-risk': 'hsl(var(--danger))', onboarding: 'hsl(var(--muted))',
};
const FLAG_LABEL: Record<string, string> = {
  'no-whatsapp': 'No WhatsApp connected',
  'no-drive': 'No Google Drive linked',
  'connected-no-files': 'Connected but no documents yet',
  cooling: 'Usage cooling down',
  dormant: 'Dormant (30+ days)',
};

// Human label for an activity event (Object.Action → readable line).
function activityLabel(action: string, p: Record<string, unknown> | null): string {
  const phone = p && typeof p.phone === 'string' ? p.phone : '';
  switch (action) {
    case 'workspace.signed_up': return p?.via === 'google' ? 'Signed up with Google' : 'Signed up';
    case 'whatsapp.connected': return `Connected WhatsApp${phone ? ' · ' + phone : ''}`;
    case 'whatsapp.disconnected': return 'WhatsApp disconnected';
    case 'drive.linked': return 'Linked Google Drive';
    case 'operator.added': return 'Added an operator';
    case 'file.first_processed': return 'Processed first document';
    case 'plan.changed': return `Plan changed${p?.plan ? ' to ' + p.plan : ''}`;
    default: return action.replace(/[._]/g, ' ');
  }
}

export function WorkspaceDrawer({ cfg, id, onClose, hint, onLocationSaved, onStatusChanged, onDeleted }: Props) {
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState('');
  const [loc, setLoc] = useState('');
  const [savingLoc, setSavingLoc] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  const [acctBusy, setAcctBusy] = useState(false);
  const [acctMsg, setAcctMsg] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [delConfirm, setDelConfirm] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  const doStatus = async (action: 'block' | 'unblock') => {
    if (action === 'block' && !window.confirm('Block this café? All its users are logged out and cannot sign in until you unblock it.')) return;
    setAcctBusy(true); setAcctMsg('');
    const status = action === 'block' ? 'suspended' : 'active';
    try {
      await setWorkspaceStatus(cfg, id, action);
      setDetail(d => d ? { ...d, workspace: { ...d.workspace, status } } : d);
      onStatusChanged?.(id, status);
    } catch (e) { setAcctMsg((e as ApiError).message); }
    finally { setAcctBusy(false); }
  };
  const doDelete = async () => {
    setAcctBusy(true); setAcctMsg('');
    try {
      await deleteWorkspace(cfg, id, delConfirm);
      onDeleted?.(id);
      onClose();
    } catch (e) { setAcctMsg((e as ApiError).message); }
    finally { setAcctBusy(false); }
  };

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

            {hint && (
              <section>
                <div className="label section__title" style={{ marginBottom: 8 }}>Health</div>
                <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: BAND_COLOR[hint.healthBand] || 'hsl(var(--muted))' }}>
                    {hint.healthBand === 'onboarding' ? '—' : hint.health}
                  </span>
                  <span className="pill" style={{ color: BAND_COLOR[hint.healthBand] || 'hsl(var(--muted))', borderColor: 'currentColor', fontSize: 12 }}>
                    {hint.healthBand === 'at-risk' ? 'at risk' : hint.healthBand}
                  </span>
                </div>
                {hint.healthFlags.length > 0 && (
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {hint.healthFlags.map(fl => (
                      <span key={fl} className="pill" style={{ fontSize: 11, color: 'hsl(var(--danger))', borderColor: 'hsl(var(--danger) / 0.3)' }}>
                        {FLAG_LABEL[fl] || fl}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section>
              <div className="label section__title" style={{ marginBottom: 8 }}>
                Activity{detail.activity.length > 0 && ` (${detail.activity.length})`}
              </div>
              {detail.activity.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>No activity recorded yet.</p>
              ) : (
                <div>
                  {detail.activity.map((e, i) => (
                    <div key={i} className="row between" style={{ padding: '5px 0' }}>
                      <span className="row" style={{ gap: 8, minWidth: 0 }}>
                        <span className="dot" style={{ background: 'hsl(var(--marigold-deep))', flexShrink: 0 }} aria-hidden />
                        <span style={{ fontSize: 13 }}>{activityLabel(e.action, e.properties)}</span>
                      </span>
                      <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{relativeTime(e.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
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
              <div className="label section__title" style={{ marginBottom: 8 }}>
                WhatsApp number{detail.whatsapp.length > 1 ? `s (${detail.whatsapp.length})` : ''}
              </div>
              {detail.whatsapp.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>Never connected.</p>
              ) : detail.whatsapp.map((s, i) => (
                <div key={i} className="row between" style={{ padding: '6px 0' }}>
                  <span className="row" style={{ gap: 8 }}>
                    <span className={`dot ${s.connected ? 'dot--on' : 'dot--off'}`} aria-hidden />
                    <span className="num" style={{ fontWeight: s.isCurrent ? 700 : 500 }}>{s.phoneNumber || '—'}</span>
                    {s.isCurrent
                      ? <span className="pill" style={{ fontSize: 11, color: s.connected ? 'hsl(var(--good))' : 'hsl(var(--muted))' }}>
                          {s.connected ? 'current · online' : 'current · offline'}</span>
                      : <span className="pill" style={{ fontSize: 11, color: 'hsl(var(--muted))' }}>past</span>}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>{relativeTime(s.lastConnectedAt)}</span>
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

            <section>
              <div className="label section__title" style={{ marginBottom: 8, color: 'hsl(var(--danger))' }}>Account controls</div>
              {w!.status === 'suspended' && (
                <p className="muted" style={{ fontSize: 12, marginBottom: 8, color: 'hsl(var(--danger))' }}>
                  Blocked — users cannot log in.
                </p>
              )}
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {w!.status === 'suspended'
                  ? <button className="btn" onClick={() => doStatus('unblock')} disabled={acctBusy}>Unblock</button>
                  : <button className="btn" onClick={() => doStatus('block')} disabled={acctBusy}>Block</button>}
                {!showDelete && (
                  <button className="btn" style={{ color: 'hsl(var(--danger))', borderColor: 'hsl(var(--danger) / 0.4)' }}
                    onClick={() => { setShowDelete(true); setAcctMsg(''); }} disabled={acctBusy}>Delete permanently…</button>
                )}
              </div>
              {showDelete && (
                <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: '1px solid hsl(var(--danger) / 0.4)', background: 'hsl(var(--danger) / 0.06)' }}>
                  <p style={{ fontSize: 13, marginBottom: 8 }}>
                    Permanently deletes <strong>{w!.name || 'this café'}</strong> and ALL its data
                    (documents, jobs, WhatsApp, operators). This cannot be undone. Type the café name to confirm:
                  </p>
                  <div className="row" style={{ gap: 8 }}>
                    <input className="input grow" value={delConfirm} onChange={e => setDelConfirm(e.target.value)}
                      placeholder={w!.name || 'café name'} aria-label="Type café name to confirm deletion" />
                    <button className="btn" style={{ background: 'hsl(var(--danger))', color: '#fff', borderColor: 'transparent' }}
                      disabled={acctBusy || delConfirm !== (w!.name || '')} onClick={doDelete}>
                      {acctBusy ? 'Deleting…' : 'Delete'}
                    </button>
                    <button className="btn" onClick={() => { setShowDelete(false); setDelConfirm(''); }} disabled={acctBusy}>Cancel</button>
                  </div>
                </div>
              )}
              {acctMsg && <p style={{ fontSize: 12, marginTop: 6, color: 'hsl(var(--danger))' }}>{acctMsg}</p>}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
