import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Broadcast, ArrowClockwise } from '@phosphor-icons/react';
import type { Config, LearningSession, Workspace } from '../api';
import { ApiError, fetchLearningSession, fetchLearningSessions, fetchWorkspaces } from '../api';

const sourceStyle = (src: string) => {
  if (src === 'mapping') return { bg: 'hsl(210 60% 50% / 0.12)', color: 'hsl(210 60% 40%)' };
  if (src === 'fuzzy') return { bg: 'hsl(270 50% 50% / 0.12)', color: 'hsl(270 45% 40%)' };
  if (src === 'ai') return { bg: 'hsl(330 55% 50% / 0.12)', color: 'hsl(330 50% 42%)' };
  if (src === 'confirm-mirror') return { bg: 'hsl(180 45% 45% / 0.12)', color: 'hsl(180 45% 35%)' };
  if (src === 'none') return { bg: 'hsl(var(--muted) / 0.1)', color: 'hsl(var(--muted))' };
  return { bg: 'hsl(var(--muted) / 0.08)', color: 'hsl(var(--ink-soft))' };
};

const resultColor = (r: string) => {
  if (r === 'filled') return 'hsl(var(--good))';
  if (r === 'skipped') return 'hsl(45 90% 40%)';
  if (r === 'unmapped') return 'hsl(var(--muted))';
  return 'hsl(var(--danger))';
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

function fieldLabel(r: any, i: number): string {
  const rawLabel = r.label || r.semanticKey || r.profileKey || '';
  const looksLikeNodeId = typeof rawLabel === 'string' && (
    /^node[_:-]/i.test(rawLabel)
    || /^n[_-]?[0-9a-f]{4,}$/i.test(rawLabel)
    || (r.nodeId && rawLabel === r.nodeId)
    || (r.selector && rawLabel === r.selector && /^(#|\.|node[_:-])/i.test(rawLabel))
  );
  return (!looksLikeNodeId && rawLabel)
    || r.semanticKey
    || r.profileKey
    || r.selector
    || `field ${i + 1}`;
}

export function SessionsPanel({ cfg }: { cfg: Config }) {
  const [sessions, setSessions] = useState<LearningSession[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState<LearningSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async (wsId?: string) => {
    setLoading(true); setError('');
    try {
      const [list, ws] = await Promise.all([
        fetchLearningSessions(cfg, wsId || undefined, 120),
        fetchWorkspaces(cfg, '', 'last_active').catch(() => [] as Workspace[]),
      ]);
      setSessions(list);
      setWorkspaces(ws);
    } catch (e) {
      setError((e as ApiError).message);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [cfg]);

  useEffect(() => { void load(workspaceId); }, [load, workspaceId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) =>
      (s.hostname || '').toLowerCase().includes(q)
      || (s.semanticFormKey || '').toLowerCase().includes(q)
      || (s.workspaceName || '').toLowerCase().includes(q)
      || (s.runtimeVersion || '').toLowerCase().includes(q),
    );
  }, [sessions, search]);

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
          {selected.semanticFormKey ? `${selected.semanticFormKey} · ` : ''}
          rv: {selected.runtimeVersion || '—'} · {new Date(selected.receivedAt).toLocaleString()}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <span className="pill">Total <b>{records.length}</b></span>
          <span className="pill" style={{ color: 'hsl(var(--good))' }}>Filled <b>{filledCount}</b></span>
          {skippedCount > 0 && <span className="pill" style={{ color: 'hsl(45 90% 40%)' }}>Skipped <b>{skippedCount}</b></span>}
          {unmappedCount > 0 && <span className="pill">Unmapped <b>{unmappedCount}</b></span>}
          {failedCount > 0 && <span className="pill" style={{ color: 'hsl(var(--danger))' }}>Failed <b>{failedCount}</b></span>}
          {Object.entries(bySrc).map(([src, n]) => {
            const c = sourceStyle(src);
            return (
              <span key={src} className="pill" style={{ background: c.bg, color: c.color }}>{src}: <b>{n}</b></span>
            );
          })}
        </div>

        {loadingDetail && records.length === 0 && <div className="skeleton" style={{ height: 64, borderRadius: 10 }} />}

        {/* Column header — Hub parity */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div
            className="label"
            style={{
              display: 'none',
              gridTemplateColumns: '2.2fr 0.8fr 2fr 2fr 1.2fr',
              gap: 8,
              padding: '8px 12px',
              borderBottom: '1px solid hsl(var(--border-soft))',
              background: 'hsl(var(--paper-deep) / 0.5)',
            }}
            // show as grid on wider screens via inline media isn't available; use CSS class fallback below
          />
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(120px, 2.2fr) minmax(60px, 0.8fr) minmax(100px, 2fr) minmax(100px, 2fr) minmax(90px, 1.2fr)',
            gap: 8,
            padding: '8px 12px',
            borderBottom: '1px solid hsl(var(--border-soft))',
            background: 'hsl(var(--paper-deep) / 0.45)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'hsl(var(--muted))',
            fontFamily: 'var(--mono)',
          }}>
            <div>Label</div>
            <div>Type</div>
            <div>Planned (meant to fill)</div>
            <div>Actual (on page)</div>
            <div style={{ textAlign: 'right' }}>Result / ms</div>
          </div>

          <div>
            {records.map((r: any, i: number) => {
              const planned = plannedOf(r);
              const actual = actualOf(r);
              const label = fieldLabel(r, i);
              const actualMissing = r.result === 'filled' && (actual === null || actual === undefined);
              const mismatch =
                !!planned
                && actual != null
                && actual !== ''
                && planned.toLowerCase().replace(/[^a-z0-9]/g, '') !== actual.toLowerCase().replace(/[^a-z0-9]/g, '')
                && !actual.toLowerCase().includes(planned.toLowerCase().slice(0, 6));
              const src = r.source ? sourceStyle(r.source) : null;

              return (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px, 2.2fr) minmax(60px, 0.8fr) minmax(100px, 2fr) minmax(100px, 2fr) minmax(90px, 1.2fr)',
                    gap: 8,
                    padding: '10px 12px',
                    borderBottom: '1px solid hsl(var(--border-soft))',
                    fontSize: 12,
                    alignItems: 'start',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: resultColor(r.result || ''), fontSize: 10 }}>●</span>
                      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>
                        {trunc(label, 48)}
                      </span>
                    </div>
                    {r.selector && (
                      <div className="muted" style={{ fontSize: 10, fontFamily: 'var(--mono)', marginTop: 2, paddingLeft: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.selector}>
                        {r.selector}
                      </div>
                    )}
                  </div>

                  <div className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.type || r.strategy || ''}>
                    {r.type || r.strategy || '—'}
                  </div>

                  <div style={{ minWidth: 0, fontFamily: 'var(--mono)', color: planned ? 'hsl(210 60% 40%)' : 'hsl(var(--muted))', wordBreak: 'break-word' }} title={planned || '(none)'}>
                    {planned ? trunc(planned, 100) : '—'}
                  </div>

                  <div style={{ minWidth: 0, fontFamily: 'var(--mono)', wordBreak: 'break-word' }}>
                    {actualMissing ? (
                      <span style={{ color: 'hsl(45 90% 40%)' }} title="Extension did not record DOM value">(not recorded)</span>
                    ) : actual === '' ? (
                      <span style={{ color: 'hsl(45 90% 40%)' }}>(empty)</span>
                    ) : actual != null ? (
                      <span style={{ color: mismatch ? 'hsl(var(--danger))' : 'hsl(var(--good))' }} title={actual}>
                        {trunc(actual, 100)}
                        {mismatch && <span style={{ marginLeft: 4, fontSize: 10, fontFamily: 'var(--sans)' }}>mismatch</span>}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: resultColor(r.result || '') }}>{r.result || '?'}</div>
                    {r.failReason && (
                      <div style={{ color: 'hsl(var(--danger))', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.failReason}>
                        {r.failReason}
                      </div>
                    )}
                    {src && (
                      <span className="pill" style={{ background: src.bg, color: src.color, fontSize: 10, marginTop: 2, display: 'inline-block' }}>
                        {r.source}
                      </span>
                    )}
                    <div className="muted num" style={{ fontSize: 10, marginTop: 2 }}>{r.durationMs ?? 0}ms</div>
                  </div>
                </div>
              );
            })}
            {!loadingDetail && records.length === 0 && (
              <p className="muted" style={{ fontSize: 13, padding: 20 }}>No records</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section>
      <div className="row between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="row" style={{ gap: 10 }}>
          <Broadcast size={20} weight="duotone" style={{ color: 'hsl(var(--marigold-deep))' }} />
          <h2 className="display" style={{ fontSize: 17, fontWeight: 700 }}>Fill Sessions</h2>
          <span className="muted num" style={{ fontSize: 12 }}>{filtered.length}{search || workspaceId ? ` / ${sessions.length}` : ''}</span>
        </div>
        <button className="btn" onClick={() => load(workspaceId)} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <ArrowClockwise size={14} weight="bold" />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          className="input"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          style={{ minWidth: 200, flex: '0 1 240px' }}
          title="Filter by café workspace"
        >
          <option value="">All cafés</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name || w.id.slice(0, 8)}</option>
          ))}
        </select>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter hostname, formKey, café…"
          style={{ flex: 1, minWidth: 180 }}
        />
      </div>

      {error && <p className="banner" role="alert" style={{ marginBottom: 12 }}>{error}</p>}

      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="state" style={{ padding: '48px 20px' }}>
          <Broadcast size={32} weight="duotone" style={{ color: 'hsl(var(--muted))', margin: '0 auto 8px' }} />
          <h3>{sessions.length === 0 ? 'No sessions yet' : 'No matches'}</h3>
          <p className="muted" style={{ marginTop: 4 }}>
            {sessions.length === 0
              ? 'Fill runs from cafés will appear here for review.'
              : 'Try another café or clear the search filter.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((s) => (
            <div key={s.id} className="card" onClick={() => openSession(s)}
              style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{s.hostname || '(no hostname)'}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {s.workspaceName ? `${s.workspaceName} · ` : ''}
                  rv {s.runtimeVersion || '—'} · {s.semanticFormKey || '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="num" style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--good))' }}>
                  {s.totalFilled} filled
                </div>
                {s.totalFailed > 0 && (
                  <div className="num" style={{ fontSize: 12, color: 'hsl(var(--danger))' }}>{s.totalFailed} failed</div>
                )}
                <div className="muted" style={{ fontSize: 11 }}>{new Date(s.receivedAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
