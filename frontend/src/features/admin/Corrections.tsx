import { useEffect, useState } from 'react';
import { ArrowLeft, PencilSimple, Plus } from '@phosphor-icons/react';
import api from '../../shared/api';
import PageHeader from '../../shared/PageHeader';

interface CorrectionBatch {
  id: string; hostname: string; semanticFormKey: string; trigger: string;
  corrections?: any[]; correctionCount?: number; receivedAt: string;
}

export default function Corrections() {
  const [batches, setBatches] = useState<CorrectionBatch[]>([]);
  const [selected, setSelected] = useState<CorrectionBatch | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => { api.get('/corrections').then(r => setBatches(r.data)).catch(() => {}); }, []);

  async function openBatch(b: CorrectionBatch) {
    setSelected(b);
    setLoadingDetail(true);
    try {
      const r = await api.get(`/corrections/${b.id}`);
      setSelected(r.data);
    } catch {}
    finally { setLoadingDetail(false); }
  }

  if (selected) {
    const corrections = selected.corrections || [];
    return (
      <div>
        <button onClick={() => setSelected(null)} className="btn-ghost text-xs mb-4 flex items-center gap-1">
          <ArrowLeft size={14} /> Back
        </button>
        <h2 className="text-lg font-semibold text-white tracking-tight mb-1">{selected.hostname}</h2>
        <p className="text-xs text-gray-500 mb-4">
          Trigger: <span className="text-orange-400">{selected.trigger}</span> ·
          {' '}{corrections.length} correction{corrections.length === 1 ? '' : 's'} ·
          {' '}{new Date(selected.receivedAt).toLocaleString()}
        </p>
        {loadingDetail && corrections.length === 0 && <div className="h-16 bg-white/[0.03] animate-pulse rounded-xl" />}
        <div className="space-y-2">
          {corrections.map((c: any, i: number) => (
            <div key={i} className="card p-3">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={c.correctionType === 'override' ? 'text-orange-400' : 'text-[#0a84ff]'}>
                  {c.correctionType === 'override' ? <PencilSimple size={14} weight="bold" /> : <Plus size={14} weight="bold" />}
                </span>
                <span className="text-sm text-white font-medium">{c.field || c.selector}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] ${c.correctionType === 'override' ? 'bg-orange-500/20 text-orange-400' : 'bg-[#0a84ff]/20 text-[#0a84ff]'}`}>
                  {c.correctionType}
                </span>
                {c.profileKey && <span className="px-2 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-400">profile.{c.profileKey}</span>}
                {c.originalResult && c.originalResult !== 'filled' && <span className="badge badge-warning text-[10px]">{c.originalResult}</span>}
              </div>
              <div className="flex gap-4 text-xs mt-1 flex-wrap">
                <span className="text-red-300">
                  <span className="text-gray-500">autofilled:</span>{' '}
                  <code className="bg-red-500/10 px-1.5 py-0.5 rounded">{c.autofilledValue || '—'}</code>
                </span>
                <span className="text-green-300">
                  <span className="text-gray-500">operator:</span>{' '}
                  <code className="bg-green-500/10 px-1.5 py-0.5 rounded">{c.finalOperatorValue || c.operatorValue || '—'}</code>
                </span>
              </div>
              {(c.strategy || c.plugin) && (
                <p className="text-[10px] text-gray-600 mt-1">
                  Strategy: {c.strategy || '—'}{c.plugin ? ` · Plugin: ${c.plugin}` : ''}
                </p>
              )}
              {c.selector && (
                <p className="text-[10px] text-gray-700 mt-0.5 font-mono truncate" title={c.selector}>{c.selector}</p>
              )}
            </div>
          ))}
          {!loadingDetail && corrections.length === 0 && <p className="text-gray-600 text-sm">No correction entries</p>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Corrections" subtitle="Operator edits to autofilled forms" />
      {batches.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-4">
          <PencilSimple size={34} className="pt-muted mb-3" />
          <p className="text-sm font-medium" style={{ color: 'hsl(var(--pt-ink))' }}>No corrections yet</p>
          <p className="text-xs pt-muted mt-1 max-w-xs">Operator edits to autofilled forms will show up here for review.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {batches.map(b => (
            <div key={b.id} onClick={() => openBatch(b)}
              className="card p-4 cursor-pointer hover:border-orange-500/30 transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white tracking-tight">{b.hostname || '(no hostname)'}</p>
                  <p className="text-xs text-gray-500">Trigger: {b.trigger || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-orange-400 font-medium tabular-nums font-mono">{b.correctionCount ?? b.corrections?.length ?? 0} correction{(b.correctionCount ?? b.corrections?.length ?? 0) === 1 ? '' : 's'}</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-600 mt-2">{new Date(b.receivedAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
