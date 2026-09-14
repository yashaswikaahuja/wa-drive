import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, PencilSimple, Plus, ArrowClockwise } from '@phosphor-icons/react';
import type { Config, LearningCorrection } from '../api';
import { ApiError, fetchLearningCorrection, fetchLearningCorrections } from '../api';

export function CorrectionsPanel({ cfg }: { cfg: Config }) {
  const [batches, setBatches] = useState<LearningCorrection[]>([]);
  const [selected, setSelected] = useState<LearningCorrection | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setBatches(await fetchLearningCorrections(cfg, undefined, 80)); }
    catch (e) { setError((e as ApiError).message); setBatches([]); }
    finally { setLoading(false); }
  }, [cfg]);

  useEffect(() => { void load(); }, [load]);

  async function openBatch(b: LearningCorrection) {
    setSelected(b);
    setLoadingDetail(true);
    try { setSelected(await fetchLearningCorrection(cfg, b.id)); }
    catch (e) { setError((e as ApiError).message); }
    finally { setLoadingDetail(false); }
  }

  if (selected) {
    const corrections = selected.corrections || [];
    return (
      <div>
        <button className="btn" onClick={() => setSelected(null)} style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} /> Back
        </button>
        <h2 className="display" style={{ fontSize: 17, fontWeight: 700 }}>{selected.hostname || '(no host)'}</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 14 }}>
          {selected.workspaceName ? `${selected.workspaceName} · ` : ''}
          Trigger: <strong>{selected.trigger || '—'}</strong>
          {' · '}{corrections.length} correction{corrections.length === 1 ? '' : 's'}
          {' · '}{new Date(selected.receivedAt).toLocaleString()}
        </p>
        {loadingDetail && corrections.length === 0 && <div className="skeleton" style={{ height: 64, borderRadius: 10 }} />}
        <div style={{ display: 'grid', gap: 8 }}>
          {corrections.map((c: any, i: number) => (
            <div key={i} className="card" style={{ padding: '12px 14px' }}>
              <div className="row" style={{ gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ color: c.correctionType === 'override' ? 'hsl(var(--marigold-deep))' : 'hsl(210 60% 45%)' }}>
                  {c.correctionType === 'override'
                    ? <PencilSimple size={14} weight="bold" />
                    : <Plus size={14} weight="bold" />}
                </span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.field || c.selector}</span>
                <span className="pill">{c.correctionType}</span>
                {c.profileKey && <span className="pill">profile.{c.profileKey}</span>}
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                <span>
                  <span className="muted">autofilled:</span>{' '}
                  <code style={{ background: 'hsl(var(--danger) / 0.08)', padding: '1px 6px', borderRadius: 4 }}>
                    {c.autofilledValue || '—'}
                  </code>
                </span>
                <span>
                  <span className="muted">operator:</span>{' '}
                  <code style={{ background: 'hsl(var(--good) / 0.1)', padding: '1px 6px', borderRadius: 4 }}>
                    {c.finalOperatorValue || c.operatorValue || '—'}
                  </code>
                </span>
              </div>
              {c.selector && (
                <p className="muted" style={{ fontSize: 10, fontFamily: 'var(--mono)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.selector}>
                  {c.selector}
                </p>
              )}
            </div>
          ))}
          {!loadingDetail && corrections.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>No correction entries</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <section>
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 10 }}>
          <PencilSimple size={20} weight="duotone" style={{ color: 'hsl(var(--marigold-deep))' }} />
          <h2 className="display" style={{ fontSize: 17, fontWeight: 700 }}>Corrections</h2>
          <span className="muted num" style={{ fontSize: 12 }}>{batches.length}</span>
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
      ) : batches.length === 0 ? (
        <div className="state" style={{ padding: '48px 20px' }}>
          <PencilSimple size={32} weight="duotone" style={{ color: 'hsl(var(--muted))', margin: '0 auto 8px' }} />
          <h3>No corrections yet</h3>
          <p className="muted" style={{ marginTop: 4 }}>Operator edits to autofilled forms show up here for review.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {batches.map((b) => (
            <div key={b.id} className="card" onClick={() => openBatch(b)}
              style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{b.hostname || '(no hostname)'}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {b.workspaceName ? `${b.workspaceName} · ` : ''}
                  Trigger: {b.trigger || '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--marigold-deep))' }}>
                  {b.correctionCount ?? b.corrections?.length ?? 0} correction{(b.correctionCount ?? b.corrections?.length ?? 0) === 1 ? '' : 's'}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>{new Date(b.receivedAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
