import { useEffect, useState } from 'react';
import api from '../../shared/api';

interface CorrectionBatch {
  id: string; hostname: string; semanticFormKey: string; trigger: string;
  corrections: any[]; receivedAt: string;
}

export default function Corrections() {
  const [batches, setBatches] = useState<CorrectionBatch[]>([]);
  const [selected, setSelected] = useState<CorrectionBatch | null>(null);

  useEffect(() => { api.get('/corrections').then(r => setBatches(r.data)).catch(() => {}); }, []);

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelected(null)} className="text-xs text-blue-400 mb-4 hover:underline">← Back</button>
        <h2 className="text-lg font-bold text-white mb-1">{selected.hostname}</h2>
        <p className="text-xs text-gray-500 mb-4">Trigger: {selected.trigger} · {new Date(selected.receivedAt).toLocaleString()}</p>
        <div className="space-y-2">
          {selected.corrections.map((c: any, i: number) => (
            <div key={i} className="bg-[#0d1220] border border-white/5 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={c.correctionType === 'override' ? 'text-orange-400' : 'text-blue-400'}>
                  {c.correctionType === 'override' ? '✏️' : '➕'}
                </span>
                <span className="text-sm text-white font-medium">{c.field || c.selector}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] ${c.correctionType === 'override' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                  {c.correctionType}
                </span>
              </div>
              <div className="flex gap-4 text-xs mt-1">
                <span className="text-red-400">Auto: {c.autofilledValue || '—'}</span>
                <span className="text-green-400">Operator: {c.finalOperatorValue || c.operatorValue || '—'}</span>
              </div>
              {c.strategy && <p className="text-[10px] text-gray-600 mt-1">Strategy: {c.strategy} · Plugin: {c.plugin || 'none'}</p>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-6">Corrections</h1>
      {batches.length === 0 ? <p className="text-gray-500 text-center py-12">No corrections captured yet</p> : (
        <div className="space-y-2">
          {batches.map(b => (
            <div key={b.id} onClick={() => setSelected(b)}
              className="bg-[#0d1220] border border-white/5 rounded-xl p-4 cursor-pointer hover:border-orange-500/30 transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{b.hostname}</p>
                  <p className="text-xs text-gray-500">Trigger: {b.trigger}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-orange-400 font-medium">{b.corrections?.length || 0} corrections</p>
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
