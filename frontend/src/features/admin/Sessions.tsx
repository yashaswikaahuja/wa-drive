import { useEffect, useState } from 'react';
import api from '../../shared/api';

interface Session {
  id: string; hostname: string; semanticFormKey: string; runtimeVersion: string;
  totalFilled: number; totalFailed: number; records?: any[]; receivedAt: string;
}

const sourceColor = (src: string) => {
  if (src === 'mapping') return 'bg-blue-500/20 text-blue-300';
  if (src === 'fuzzy') return 'bg-purple-500/20 text-purple-300';
  if (src === 'ai') return 'bg-pink-500/20 text-pink-300';
  if (src === 'confirm-mirror') return 'bg-cyan-500/20 text-cyan-300';
  if (src === 'none') return 'bg-gray-500/20 text-gray-400';
  return 'bg-gray-700 text-gray-300';
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
        <button onClick={() => setSelected(null)} className="text-xs text-blue-400 mb-4 hover:underline">← Back to sessions</button>
        <h2 className="text-lg font-bold text-white mb-1">{selected.hostname}</h2>
        <p className="text-xs text-gray-500 mb-3">
          rv: {selected.runtimeVersion} · {new Date(selected.receivedAt).toLocaleString()}
        </p>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-[11px] px-2 py-1 rounded bg-[#0d1220] border border-white/5">Total: <b className="text-white">{records.length}</b></span>
          <span className="text-[11px] px-2 py-1 rounded bg-green-500/15 text-green-300">Filled: <b>{filledCount}</b></span>
          {skippedCount > 0 && <span className="text-[11px] px-2 py-1 rounded bg-yellow-500/15 text-yellow-300">Skipped: <b>{skippedCount}</b></span>}
          {unmappedCount > 0 && <span className="text-[11px] px-2 py-1 rounded bg-gray-500/15 text-gray-300">Unmapped: <b>{unmappedCount}</b></span>}
          {failedCount > 0 && <span className="text-[11px] px-2 py-1 rounded bg-red-500/15 text-red-300">Failed: <b>{failedCount}</b></span>}
          {Object.entries(bySrc).map(([src, n]) => (
            <span key={src} className={`text-[11px] px-2 py-1 rounded ${sourceColor(src)}`}>{src}: <b>{n}</b></span>
          ))}
        </div>

        {loadingDetail && records.length === 0 && <p className="text-gray-600 text-sm">Loading records…</p>}
        <div className="space-y-1">
          {records.map((r: any, i: number) => (
            <div key={i} className="bg-[#0d1220] border border-white/5 rounded-lg px-3 py-2 flex items-center gap-3 text-xs">
              <span className={resultDot(r.result)}>●</span>
              <span className="text-gray-300 w-44 truncate font-mono" title={r.selector}>{r.selector}</span>
              <span className="text-gray-400 w-24 truncate" title={r.type}>{r.type}</span>
              <span className="text-white flex-1 truncate" title={r.value || ''}>{r.value || (r.label ? <span className="text-gray-600">{r.label}</span> : '—')}</span>
              {r.source && <span className={`text-[10px] px-1.5 py-0.5 rounded ${sourceColor(r.source)}`}>{r.source}</span>}
              {r.failReason && <span className="text-red-400 text-[10px]" title={r.failReason}>{r.failReason}</span>}
              <span className="text-gray-600 w-12 text-right">{r.durationMs ?? 0}ms</span>
            </div>
          ))}
          {!loadingDetail && records.length === 0 && <p className="text-gray-600 text-sm">No records</p>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-6">Sessions</h1>
      {sessions.length === 0 ? <p className="text-gray-500 text-center py-12">No sessions yet</p> : (
        <div className="space-y-2">
          {sessions.map(s => (
            <div key={s.id} onClick={() => openSession(s)}
              className="bg-[#0d1220] border border-white/5 rounded-xl p-4 cursor-pointer hover:border-blue-500/30 transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{s.hostname || '(no hostname)'}</p>
                  <p className="text-xs text-gray-500">rv {s.runtimeVersion} · {s.semanticFormKey || ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-green-400 font-medium">{s.totalFilled} filled</p>
                  {s.totalFailed > 0 && <p className="text-xs text-red-400">{s.totalFailed} failed</p>}
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
