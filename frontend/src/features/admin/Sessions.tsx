import { useEffect, useState } from 'react';
import { ArrowLeft, Broadcast } from '@phosphor-icons/react';
import api from '../../shared/api';

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

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => { api.get('/sessions').then(r => setSessions(r.data)).catch(() => {}); }, []);

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
        <div className="divide-y divide-white/[0.04]">
          {records.map((r: any, i: number) => (
            <div key={i} className="px-1 sm:px-3 py-2 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 text-xs">
              <span className={`${resultDot(r.result)} shrink-0`}>●</span>
              <span className="text-gray-300 w-[calc(100%-2rem)] sm:w-44 truncate font-mono" title={r.selector}>{r.selector}</span>
              <span className="text-gray-400 w-20 sm:w-24 truncate" title={r.type}>{r.type}</span>
              <span className="text-white flex-1 min-w-0 truncate" title={r.value || ''}>{r.value || (r.label ? <span className="text-gray-600">{r.label}</span> : '—')}</span>
              {r.source && <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${sourceColor(r.source)}`}>{r.source}</span>}
              {r.failReason && <span className="text-red-400 text-[10px] shrink-0" title={r.failReason}>{r.failReason}</span>}
              <span className="text-gray-600 w-12 text-right tabular-nums font-mono shrink-0">{r.durationMs ?? 0}ms</span>
            </div>
          ))}
          {!loadingDetail && records.length === 0 && <p className="text-gray-600 text-sm py-4">No records</p>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white tracking-tight mb-6">Sessions</h1>
      {sessions.length === 0 ? (
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
