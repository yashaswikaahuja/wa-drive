import { useEffect, useState } from 'react';
import { ArrowLeft, Broadcast } from '@phosphor-icons/react';
import api from '../../shared/api';
import PageHeader from '../../shared/PageHeader';

interface Session {
  id: string; hostname: string; semanticFormKey: string; runtimeVersion: string;
  totalFilled: number; totalFailed: number; records?: any[]; receivedAt: string;
}

const sourceColor = (src: string) => {
  if (src === 'mapping') return 'bg-[#0a84ff]/20 text-[#0a84ff]';
  if (src === 'fuzzy') return 'bg-purple-500/20 text-purple-300';
  if (src === 'ai') return 'bg-pink-500/20 text-pink-300';
  if (src === 'confirm-mirror') return 'bg-cyan-500/20 text-cyan-300';
  if (src === 'none') return 'bg-gray-500/20 text-gray-400';
  return 'bg-white/[0.03] text-gray-300';
};

const resultDot = (r: string) => {
  if (r === 'filled') return 'text-green-400';
  if (r === 'skipped') return 'text-yellow-400';
  if (r === 'unmapped') return 'text-gray-500';
  return 'text-red-400';
};

/** Planned value the extension intended to type/select */
function plannedOf(r: any): string {
  if (r?.value != null && String(r.value) !== '') return String(r.value);
  if (r?.plannedValue != null && String(r.plannedValue) !== '') return String(r.plannedValue);
  return '';
}

/** What was read back from the control after fill (if recorded) */
function actualOf(r: any): string | null {
  if (r?.actualValue != null) return String(r.actualValue);
  if (r?.actual_value != null) return String(r.actual_value);
  return null;
}

function trunc(s: string, n = 80) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get('/sessions').then(r => setSessions(r.data)).catch(() => {}).finally(() => setLoading(false)); }, []);

  async function openSession(s: Session) {
    setSelected(s);
    setLoadingDetail(true);
    try {
      const r = await api.get(`/sessions/${s.id}`);
      setSelected(r.data);
    } catch {}
    finally { setLoadingDetail(false); }
  }

  if (selected) {
    const records = selected.records || [];
    const filledCount = records.filter((r: any) => r.result === 'filled').length;
    const skippedCount = records.filter((r: any) => r.result === 'skipped').length;
    const unmappedCount = records.filter((r: any) => r.result === 'unmapped').length;
    const failedCount = records.filter((r: any) => r.result && !['filled', 'skipped', 'unmapped'].includes(r.result)).length;
    const bySrc: Record<string, number> = {};
    records.forEach((r: any) => { if (r.result === 'filled') bySrc[r.source || 'unknown'] = (bySrc[r.source || 'unknown'] || 0) + 1; });

    return (
      <div>
        <button onClick={() => setSelected(null)} className="btn-ghost text-xs mb-4 flex items-center gap-1">
          <ArrowLeft size={14} /> Back to sessions
        </button>
        <h2 className="text-lg font-semibold text-white tracking-tight mb-1">{selected.hostname}</h2>
        <p className="text-xs text-gray-500 mb-3">
          rv: {selected.runtimeVersion} · {new Date(selected.receivedAt).toLocaleString()}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="badge badge-info">Total: <b className="text-white">{records.length}</b></span>
          <span className="badge badge-success">Filled: <b>{filledCount}</b></span>
          {skippedCount > 0 && <span className="badge badge-warning">Skipped: <b>{skippedCount}</b></span>}
          {unmappedCount > 0 && <span className="badge">Unmapped: <b>{unmappedCount}</b></span>}
          {failedCount > 0 && <span className="badge badge-danger">Failed: <b>{failedCount}</b></span>}
          {Object.entries(bySrc).map(([src, n]) => (
            <span key={src} className={`text-[11px] px-2 py-1 rounded ${sourceColor(src)}`}>{src}: <b>{n}</b></span>
          ))}
        </div>

        {loadingDetail && records.length === 0 && <div className="h-16 bg-white/[0.03] animate-pulse rounded-xl" />}

        {/* Column legend */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-600 border-b border-white/[0.04]">
          <div className="col-span-3">Label</div>
          <div className="col-span-1">Type</div>
          <div className="col-span-3">Planned (meant to fill)</div>
          <div className="col-span-3">Actual (on page)</div>
          <div className="col-span-2 text-right">Result / ms</div>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {records.map((r: any, i: number) => {
            const planned = plannedOf(r);
            const actual = actualOf(r);
            // Prefer human labels; avoid showing raw semantic/DOM node ids as the title.
            const rawLabel = r.label || r.semanticKey || r.profileKey || '';
            const looksLikeNodeId = typeof rawLabel === 'string' && (
              /^node[_:-]/i.test(rawLabel)
              || /^n[_-]?[0-9a-f]{4,}$/i.test(rawLabel)
              || (r.nodeId && rawLabel === r.nodeId)
              || (r.selector && rawLabel === r.selector && /^(#|\.|node[_:-])/i.test(rawLabel))
            );
            const label = (!looksLikeNodeId && rawLabel)
              || r.semanticKey
              || r.profileKey
              || r.selector
              || `field ${i + 1}`;
            const actualMissing = r.result === 'filled' && (actual === null || actual === undefined);
            const mismatch =
              planned &&
              actual != null &&
              actual !== '' &&
              planned.toLowerCase().replace(/[^a-z0-9]/g, '') !== actual.toLowerCase().replace(/[^a-z0-9]/g, '') &&
              !actual.toLowerCase().includes(planned.toLowerCase().slice(0, 6));
            return (
              <div key={i} className="px-1 sm:px-3 py-2.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 items-start">
                  <div className="sm:col-span-3 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`${resultDot(r.result)} shrink-0 text-[10px]`}>●</span>
                      <span className="text-white font-medium truncate" title={label}>{trunc(label, 48)}</span>
                    </div>
                    {r.selector && (
                      <div className="text-[10px] text-gray-600 font-mono truncate pl-3.5" title={r.selector}>
                        {r.selector}
                      </div>
                    )}
                  </div>
                  <div className="sm:col-span-1 text-gray-400 truncate pl-3.5 sm:pl-0" title={r.type || r.strategy || ''}>
                    {r.type || r.strategy || '—'}
                  </div>
                  <div className="sm:col-span-3 min-w-0 pl-3.5 sm:pl-0">
                    <span className="sm:hidden text-[10px] text-gray-600 mr-1">Planned:</span>
                    <span
                      className={`font-mono break-all ${planned ? 'text-sky-300' : 'text-gray-600'}`}
                      title={planned || '(none)'}
                    >
                      {planned ? trunc(planned, 100) : '—'}
                    </span>
                  </div>
                  <div className="sm:col-span-3 min-w-0 pl-3.5 sm:pl-0">
                    <span className="sm:hidden text-[10px] text-gray-600 mr-1">Actual:</span>
                    {actualMissing ? (
                      <span className="text-amber-400/90 font-mono" title="Extension did not record DOM value">
                        (not recorded)
                      </span>
                    ) : actual === '' ? (
                      <span className="text-amber-400/90 font-mono">(empty)</span>
                    ) : actual != null ? (
                      <span
                        className={`font-mono break-all ${mismatch ? 'text-red-300' : 'text-emerald-300'}`}
                        title={actual}
                      >
                        {trunc(actual, 100)}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                    {mismatch && (
                      <span className="ml-1 text-[10px] text-red-400">mismatch</span>
                    )}
                  </div>
                  <div className="sm:col-span-2 flex flex-wrap sm:flex-col items-start sm:items-end gap-1 pl-3.5 sm:pl-0">
                    <span className={`${resultDot(r.result)} font-medium`}>{r.result || '?'}</span>
                    {r.failReason && (
                      <span className="text-red-400 text-[10px] max-w-full truncate" title={r.failReason}>
                        {r.failReason}
                      </span>
                    )}
                    {r.source && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${sourceColor(r.source)}`}>{r.source}</span>
                    )}
                    <span className="text-gray-600 tabular-nums font-mono text-[10px]">{r.durationMs ?? 0}ms</span>
                  </div>
                </div>
              </div>
            );
          })}
          {!loadingDetail && records.length === 0 && <p className="text-gray-600 text-sm py-4">No records</p>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Sessions" subtitle="Autofill runs from the operator extension" />
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[68px] rounded-2xl" style={{ background: 'hsl(var(--pt-secondary) / 0.6)' }} />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-4">
          <Broadcast size={34} className="pt-muted mb-3" />
          <p className="text-sm font-medium" style={{ color: 'hsl(var(--pt-ink))' }}>No sessions yet</p>
          <p className="text-xs pt-muted mt-1 max-w-xs">Autofill runs from the extension will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <div key={s.id} onClick={() => openSession(s)}
              className="card p-4 cursor-pointer hover:border-[#0a84ff]/30 transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white tracking-tight">{s.hostname || '(no hostname)'}</p>
                  <p className="text-xs text-gray-500">rv {s.runtimeVersion} · {s.semanticFormKey || ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-green-400 font-medium tabular-nums font-mono">{s.totalFilled} filled</p>
                  {s.totalFailed > 0 && <p className="text-xs text-red-400 tabular-nums font-mono">{s.totalFailed} failed</p>}
                </div>
              </div>
              <p className="text-[10px] text-gray-600 mt-2">{new Date(s.receivedAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
