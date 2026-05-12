import { useEffect, useState } from 'react';

import { API_BASE_URL } from '../utils/helpers';

type Adapter = {
  componentClass: string; triggerSelector: string; optionSelector: string;
  verifySelector: string; optionsContainer: string;
  adapterVersion: number; successCount: number; failureCount: number;
  stale: boolean; learnedAt: string;
};
type Store = Record<string, Record<string, Adapter>>;

const FIELDS: [keyof Adapter, string][] = [
  ['triggerSelector', 'Trigger Selector'],
  ['optionSelector', 'Option Selector'],
  ['verifySelector', 'Verify Selector'],
  ['optionsContainer', 'Options Container'],
];

export default function AdaptersPage() {
  
  const [data, setData] = useState<Store>({});
  const [edits, setEdits] = useState<Record<string, Partial<Adapter>>>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/adapters`).then(r => r.json()).then((store: Store) => {
      setData(store);
      const init: Record<string, Partial<Adapter>> = {};
      Object.entries(store).forEach(([host, map]) =>
        Object.entries(map).forEach(([cls, a]) => { init[`${host}::${cls}`] = { ...a }; })
      );
      setEdits(init);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const setField = (host: string, cls: string, field: string, val: string) => {
    const k = `${host}::${cls}`;
    setEdits(prev => ({ ...prev, [k]: { ...prev[k], [field]: val } }));
  };

  const save = async (host: string, cls: string) => {
    const e = edits[`${host}::${cls}`] || {};
    const res = await fetch(`${API_BASE_URL}/adapters/${host}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ componentClass: cls, triggerSelector: e.triggerSelector, optionSelector: e.optionSelector, verifySelector: e.verifySelector, optionsContainer: e.optionsContainer }),
    });
    const d = await res.json();
    d.ok ? (notify('Saved'), load()) : notify(d.error || 'Failed');
  };

  const del = async (host: string, cls: string) => {
    if (!confirm(`Delete ${cls} for ${host}?`)) return;
    await fetch(`${API_BASE_URL}/adapters/${host}/${cls}`, { method: 'DELETE' });
    notify('Deleted'); load();
  };

  const toggleStale = async (host: string, cls: string, stale: boolean) => {
    await fetch(`${API_BASE_URL}/adapters/${host}/${cls}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stale }),
    });
    notify(stale ? 'Marked stale' : 'Marked active'); load();
  };

  const total = Object.values(data).reduce((s, h) => s + Object.keys(h).length, 0);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-white">Adapters</h1>
          <span className="text-[11px] text-[#64748b]">{total} adapter{total !== 1 ? "s" : ""}</span>
        </div>
        <button onClick={load} className="btn-ghost p-1.5" title="Refresh">
          <span className="material-symbols-outlined text-[18px]">refresh</span>
        </button>
      </div>

      {toast && (
        <div className="mx-4 mt-2 px-3 py-2 rounded text-xs bg-blue-900/50 text-blue-300">{toast}</div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-[#475569] text-sm mt-8 text-center">Loading...</div>}
        {!loading && total === 0 && <div className="text-[#475569] text-sm mt-8 text-center">No adapters saved yet.</div>}

        {Object.entries(data).map(([host, adapters]) => (
          <div key={host} className="mb-6">
            <div className="text-xs text-[#7dd3fc] font-semibold uppercase tracking-wider mb-2">{host}</div>
            {Object.entries(adapters).map(([cls, a]) => {
              const e = edits[`${host}::${cls}`] || a;
              return (
                <div key={cls} className="bg-[#1e293b] border border-[#334155] rounded p-4 mb-3">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-sm font-semibold">{cls}</span>
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${a.stale ? 'bg-yellow-900 text-yellow-300' : 'bg-emerald-900 text-emerald-300'}`}>
                        {a.stale ? '⚠ stale' : '✓ active'}
                      </span>
                      <div className="text-[11px] text-[#64748b] mt-0.5">
                        v{a.adapterVersion} · {a.learnedAt} · ✓{a.successCount} ✗{a.failureCount}
                      </div>
                    </div>
                    <button onClick={() => del(host, cls)}
                      className="text-red-400 hover:text-red-300 text-xs">✕ Delete</button>
                  </div>

                  {FIELDS.map(([f, label]) => (
                    <div key={f as string} className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] text-[#94a3b8] w-36 shrink-0">{label}</span>
                      <input
                        value={(e[f] as string) || ''}
                        onChange={ev => setField(host, cls, f as string, ev.target.value)}
                        className="flex-1 bg-[#0c1322] border border-[#334155] rounded px-2 py-1 text-xs text-[#dce2f7] focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}

                  <div className="flex gap-2 mt-3">
                    <button onClick={() => save(host, cls)}
                      className="text-[11px] bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-white">
                      💾 Save
                    </button>
                    <button onClick={() => toggleStale(host, cls, !a.stale)}
                      className="text-[11px] bg-[#334155] hover:bg-[#475569] px-3 py-1 rounded">
                      {a.stale ? '✅ Mark Active' : '⚠ Mark Stale'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
