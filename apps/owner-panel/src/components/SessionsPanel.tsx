import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Broadcast, ArrowClockwise } from '@phosphor-icons/react';
import type { Config, LearningSession } from '../api';
import { ApiError, fetchLearningSession, fetchLearningSessions } from '../api';

const sourceColor = (src: string) => {
  if (src === 'mapping') return { bg: 'hsl(210 60% 50% / 0.12)', color: 'hsl(210 60% 40%)' };
  if (src === 'fuzzy') return { bg: 'hsl(270 50% 50% / 0.12)', color: 'hsl(270 45% 40%)' };
  if (src === 'ai') return { bg: 'hsl(330 55% 50% / 0.12)', color: 'hsl(330 50% 42%)' };
  if (src === 'confirm-mirror') return { bg: 'hsl(180 45% 45% / 0.12)', color: 'hsl(180 45% 35%)' };
  return { bg: 'hsl(var(--muted) / 0.1)', color: 'hsl(var(--muted))' };
};

function plannedOf(r: any): string {
  if (r?.value != null && String(r.value) !== '') return String(r.value);
  if (r?.plannedValue != null && String(r.plannedValue) !== '') return String(r.plannedValue);
  return '';
}

function actualOf(r: any): string | null {
  if (r?.actualValue != null) return String(r.actualValue);
  if (r?.actual_value != null) return String(r.actual_value);
  return null;
}

function trunc(s: string, n = 80) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

export function SessionsPanel({ cfg }: { cfg: Config }) {
  const [sessions, setSessions] = useState<LearningSession[]>([]);
  const [selected, setSelected] = useState<LearningSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setSessions(await fetchLearningSessions(cfg, undefined, 80)); }
    catch (e) { setError((e as ApiError).message); setSessions([]); }
    finally { setLoading(false); }
  }, [cfg]);

  useEffect(() => { void load(); }, [load]);

  async function openSession(s: LearningSession) {
    setSelected(s);
    setLoadingDetail(true);
    try { setSelected(await fetchLearningSession(cfg, s.id)); }
    catch (e) { setError((e as ApiError).message); }
    finally { setLoadingDetail(false); }
  }

  if (selected) {
    const records = selected.records || [];
    const filledCount = records.filter((r: any) => r.result === 'filled').length;
    const skippedCount = records.filter((r: any) => r.result === 'skipped').length;
    const unmappedCount = records.filter((r: any) => r.result === 'unmapped').length;
    const failedCount = records.filter((r: any) => r.result && !['filled', 'skipped', 'unmapped'].includes(r.result)).length;
    const bySrc: Record<string, number> = {};
    records.forEach((r: any) => {
      if (r.result === 'filled') bySrc[r.source || 'unknown'] = (bySrc[r.source || 'unknown'] || 0) + 1;
    });

    return (
      <div>
        <button className="btn" onClick={() => setSelected(null)} style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} /> Back to sessions
        </button>
        <h2 className="display" style={{ fontSize: 17, fontWeight: 700 }}>{selected.hostname || '(no host)'}</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 12 }}>
          {selected.workspaceName ? `${selected.workspaceName} · ` : ''}
          rv: {selected.runtimeVersion || '—'} · {new Date(selected.receivedAt).toLocaleString()}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <span className="pill">Total {records.length}</span>
          <span className="pill" style={{ color: 'hsl(var(--good))' }}>Filled {filledCount}</span>
          {skippedCount > 0 && <span className="pill">Skipped {skippedCount}</span>}
          {unmappedCount > 0 && <span className="pill">Unmapped {unmappedCount}</span>}
          {failedCount > 0 && <span className="pill" style={{ color: 'hsl(var(--danger))' }}>Failed {failedCount}</span>}
          {Object.entries(bySrc).map(([src, n]) => {
            const c = sourceColor(src);
            return (
              <span key={src} className="pill" style={{ background: c.bg, color: c.color }}>{src}: {n}</span>
            );
          })}
        </div>
        {loadingDetail && records.length === 0 && <div className="skeleton" style={{ height: 64, borderRadius: 10 }} />}
        <div style={{ display: 'grid', gap: 6 }}>
          {records.map((r: any, i: number) => {
            const planned = plannedOf(r);
            const actual = actualOf(r);
            const label = r.label || r.semanticKey || r.profileKey || `field ${i + 1}`;
            return (
              <div key={i} className="card" style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{trunc(label, 60)}</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                      Planned: <code>{planned || '—'}</code>
                      {' · '}Actual: <code>{actual == null ? '—' : actual === '' ? '(empty)' : trunc(actual, 60)}</code>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11 }}>
                    <div style={{ fontWeight: 600 }}>{r.result || '?'}</div>
                    {r.source && <div className="muted">{r.source}</div>}
                    <div className="muted num">{r.durationMs ?? 0}ms</div>
                  </div>
                </div>
              </div>
            );
          })}
          {!loadingDetail && records.length === 0 && (
            <p className="muted" style={{ fontSize: 13, padding: '20px 0' }}>No records</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <section>
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 10 }}>
          <Broadcast size={20} weight="duotone" style={{ color: 'hsl(var(--marigold-deep))' }} />
          <h2 className="display" style={{ fontSize: 17, fontWeight: 700 }}>Fill Sessions</h2>
          <span className="muted num" style={{ fontSize: 12 }}>{sessions.length}</span>
        </div>
        <button className="btn" onClick={() => load()} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <ArrowClockwise size={14} weight="bold" />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="banner" role="alert" style={{ marginBottom: 12 }}>{error}</p>}

      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="state" style={{ padding: '48px 20px' }}>
          <Broadcast size={32} weight="duotone" style={{ color: 'hsl(var(--muted))', margin: '0 auto 8px' }} />
          <h3>No sessions yet</h3>
          <p className="muted" style={{ marginTop: 4 }}>Fill runs from cafés will appear here for review.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {sessions.map((s) => (
            <div key={s.id} className="card" onClick={() => openSession(s)}
              style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{s.hostname || '(no hostname)'}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {s.workspaceName ? `${s.workspaceName} · ` : ''}
                  {s.semanticFormKey || '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="num" style={{ fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: 'hsl(var(--good))' }}>{s.totalFilled}</span>
                  {' / '}
                  <span style={{ color: 'hsl(var(--danger))' }}>{s.totalFailed}</span>
                </div>
                <div className="muted" style={{ fontSize: 11 }}>{new Date(s.receivedAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
