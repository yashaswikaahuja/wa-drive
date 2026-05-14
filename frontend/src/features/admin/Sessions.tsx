import { useEffect, useState } from 'react';
import api from '../../shared/api';

interface Session {
  id: string; hostname: string; semanticFormKey: string; runtimeVersion: string;
  totalFilled: number; totalFailed: number; records: any[]; receivedAt: string;
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);

  useEffect(() => { api.get('/sessions').then(r => setSessions(r.data)).catch(() => {}); }, []);

  if (selected) {
    const records = selected.records || [];
    return (
      <div>
        <button onClick={() => setSelected(null)} className="text-xs text-blue-400 mb-4 hover:underline">← Back to sessions</button>
        <h2 className="text-lg font-bold text-white mb-1">{selected.hostname}</h2>
        <p className="text-xs text-gray-500 mb-4">rv: {selected.runtimeVersion} · {selected.totalFilled} filled · {selected.totalFailed} failed · {new Date(selected.receivedAt).toLocaleString()}</p>
        <div className="space-y-1">
          {records.map((r: any, i: number) => (
            <div key={i} className="bg-[#0d1220] border border-white/5 rounded-lg px-3 py-2 flex items-center gap-3 text-xs">
              <span className={r.result === 'filled' ? 'text-green-400' : r.result === 'skipped' ? 'text-yellow-400' : 'text-red-400'}>●</span>
              <span className="text-gray-300 w-32 truncate">{r.selector}</span>
              <span className="text-white flex-1 truncate">{r.value}</span>
              <span className="text-gray-500">{r.strategy}</span>
              <span className="text-gray-600">{r.durationMs}ms</span>
            </div>
          ))}
          {records.length === 0 && <p className="text-gray-600 text-sm">No records</p>}
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
            <div key={s.id} onClick={() => setSelected(s)}
              className="bg-[#0d1220] border border-white/5 rounded-xl p-4 cursor-pointer hover:border-blue-500/30 transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{s.hostname}</p>
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
