import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, PencilSimple, Plus, ArrowClockwise } from '@phosphor-icons/react';
import type { Config, LearningCorrection, Workspace } from '../api';
import {
  ApiError,
  fetchLearningCorrection,
  fetchLearningCorrections,
  fetchWorkspaces,
} from '../api';

export function CorrectionsPanel({ cfg }: { cfg: Config }) {
  const [batches, setBatches] = useState<LearningCorrection[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState<LearningCorrection | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async (wsId?: string) => {
    setLoading(true); setError('');
    try {
      const [list, ws] = await Promise.all([
        fetchLearningCorrections(cfg, wsId || undefined, 120),
        fetchWorkspaces(cfg, '', 'last_active').catch(() => [] as Workspace[]),
      ]);
      setBatches(list);
      setWorkspaces(ws);
    } catch (e) {
      setError((e as ApiError).message);
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [cfg]);

  useEffect(() => { void load(workspaceId); }, [load, workspaceId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter((b) =>
      (b.hostname || '').toLowerCase().includes(q)
      || (b.trigger || '').toLowerCase().includes(q)
      || (b.semanticFormKey || '').toLowerCase().includes(q)
      || (b.workspaceName || '').toLowerCase().includes(q),
    );
  }, [batches, search]);

  async function openBatch(b: LearningCorrection) {
    setSelected(b);
    setLoadingDetail(true);
    try { setSelected(await fetchLearningCorrection(cfg, b.id)); }
    catch (e) { setError((e as ApiError).message); }
    finally { setLoadingDetail(false); }
  }

  if (selected) {
    const corrections = selected.corrections || [];
    const overrides = corrections.filter((c: any) => c.correctionType === 'override').length;
    const additions = corrections.filter((c: any) => c.correctionType !== 'override').length;

    return (
      <div>
        <button className="btn" onClick={() => setSelected(null)} style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} /> Back to corrections
        </button>
        <h2 className="display" style={{ fontSize: 17, fontWeight: 700 }}>{selected.hostname || '(no host)'}</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 12 }}>
          {selected.workspaceName ? `${selected.workspaceName} · ` : ''}
          {selected.semanticFormKey ? `${selected.semanticFormKey} · ` : ''}
          Trigger: <strong style={{ color: 'hsl(var(--marigold-deep))' }}>{selected.trigger || '—'}</strong>
          {' · '}{new Date(selected.receivedAt).toLocaleString()}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <span className="pill">Total <b>{corrections.length}</b></span>
          {overrides > 0 && <span className="pill" style={{ color: 'hsl(var(--marigold-deep))' }}>Overrides <b>{overrides}</b></span>}
          {additions > 0 && <span className="pill" style={{ color: 'hsl(210 60% 40%)' }}>Additions <b>{additions}</b></span>}
        </div>

        {loadingDetail && corrections.length === 0 && <div className="skeleton" style={{ height: 64, borderRadius: 10 }} />}

        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(140px, 1.6fr) minmax(100px, 1.2fr) minmax(100px, 1.2fr) minmax(90px, 1fr)',
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
            <div>Field</div>
            <div>Autofilled</div>
            <div>Operator</div>
            <div>Meta</div>
          </div>

          {corrections.map((c: any, i: number) => {
            const isOverride = c.correctionType === 'override';
            return (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(140px, 1.6fr) minmax(100px, 1.2fr) minmax(100px, 1.2fr) minmax(90px, 1fr)',
                  gap: 8,
                  padding: '10px 12px',
                  borderBottom: '1px solid hsl(var(--border-soft))',
                  fontSize: 12,
                  alignItems: 'start',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: isOverride ? 'hsl(var(--marigold-deep))' : 'hsl(210 60% 45%)' }}>
                      {isOverride ? <PencilSimple size={14} weight="bold" /> : <Plus size={14} weight="bold" />}
                    </span>
                    <span style={{ fontWeight: 600 }}>{c.field || c.selector || `field ${i + 1}`}</span>
                    <span className="pill" style={{
                      background: isOverride ? 'hsl(var(--marigold) / 0.12)' : 'hsl(210 60% 50% / 0.12)',
                      color: isOverride ? 'hsl(var(--marigold-deep))' : 'hsl(210 60% 40%)',
                    }}>
                      {c.correctionType || '—'}
                    </span>
                  </div>
                  {c.selector && (
                    <div className="muted" style={{ fontSize: 10, fontFamily: 'var(--mono)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.selector}>
                      {c.selector}
                    </div>
                  )}
                </div>

                <div>
                  <code style={{ background: 'hsl(var(--danger) / 0.08)', padding: '2px 6px', borderRadius: 4, wordBreak: 'break-word', display: 'inline-block' }}>
                    {c.autofilledValue || '—'}
                  </code>
                </div>

                <div>
                  <code style={{ background: 'hsl(var(--good) / 0.1)', padding: '2px 6px', borderRadius: 4, wordBreak: 'break-word', display: 'inline-block' }}>
                    {c.finalOperatorValue || c.operatorValue || '—'}
                  </code>
                </div>

                <div className="muted" style={{ fontSize: 11 }}>
                  {c.profileKey && <div style={{ marginBottom: 2 }}>profile.<span style={{ fontFamily: 'var(--mono)' }}>{c.profileKey}</span></div>}
                  {c.originalResult && c.originalResult !== 'filled' && (
                    <div style={{ color: 'hsl(45 90% 40%)', marginBottom: 2 }}>{c.originalResult}</div>
                  )}
                  {(c.strategy || c.plugin) && (
                    <div>{c.strategy || '—'}{c.plugin ? ` · ${c.plugin}` : ''}</div>
                  )}
                </div>
              </div>
            );
          })}

          {!loadingDetail && corrections.length === 0 && (
            <p className="muted" style={{ fontSize: 13, padding: 20 }}>No correction entries</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <section>
      <div className="row between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="row" style={{ gap: 10 }}>
          <PencilSimple size={20} weight="duotone" style={{ color: 'hsl(var(--marigold-deep))' }} />
          <h2 className="display" style={{ fontSize: 17, fontWeight: 700 }}>Corrections</h2>
          <span className="muted num" style={{ fontSize: 12 }}>
            {filtered.length}{search || workspaceId ? ` / ${batches.length}` : ''}
          </span>
        </div>
        <button className="btn" onClick={() => load(workspaceId)} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <ArrowClockwise size={14} weight="bold" />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        Operator edits after autofill — review overrides and new fields taught from the café floor.
      </p>

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
          placeholder="Filter hostname, trigger, formKey…"
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
          <PencilSimple size={32} weight="duotone" style={{ color: 'hsl(var(--muted))', margin: '0 auto 8px' }} />
          <h3>{batches.length === 0 ? 'No corrections yet' : 'No matches'}</h3>
          <p className="muted" style={{ marginTop: 4 }}>
            {batches.length === 0
              ? 'Operator edits to autofilled forms show up here for review.'
              : 'Try another café or clear the search filter.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((b) => {
            const count = b.correctionCount ?? b.corrections?.length ?? 0;
            return (
              <div key={b.id} className="card" onClick={() => openBatch(b)}
                style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{b.hostname || '(no hostname)'}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {b.workspaceName ? `${b.workspaceName} · ` : ''}
                    Trigger: {b.trigger || '—'}
                    {b.semanticFormKey ? ` · ${b.semanticFormKey}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="num" style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--marigold-deep))' }}>
                    {count} correction{count === 1 ? '' : 's'}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>{new Date(b.receivedAt).toLocaleString()}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
