import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../utils/helpers';

type Adapter = {
  host: string; cls: string;
  triggerSelector: string; optionSelector: string;
  verifySelector: string; optionsContainer: string;
  adapterVersion: number; stale: boolean;
  successCount: number; failureCount: number; learnedAt: string;
};

const EMPTY_NEW = { hostname: '', cls: '', triggerSelector: '', optionSelector: '', verifySelector: '', optionsContainer: '' };
const FIELDS: [keyof Adapter, string][] = [
  ['triggerSelector', 'Trigger Selector'],
  ['optionSelector', 'Option Selector'],
  ['verifySelector', 'Verify Selector'],
  ['optionsContainer', 'Options Container'],
];

export default function AdaptersPage() {
  const navigate = useNavigate();
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<Adapter>>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_NEW);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => { load(); }, []);

  function notify(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    try {
      const res = await fetch(`${API_BASE_URL}/adapters`);
      const store: Record<string, Record<string, Adapter>> = await res.json();
      const flat = Object.entries(store).flatMap(([host, map]) =>
        Object.entries(map).map(([cls, a]) => ({ ...a, host, cls }))
      );
      setAdapters(flat);
      const init: Record<string, Partial<Adapter>> = {};
      flat.forEach(a => { init[`${a.host}::${a.cls}`] = { ...a }; });
      setEdits(init);
    } catch (e: any) { notify(e.message, false); }
  }

  function setField(host: string, cls: string, field: string, val: string) {
    const k = `${host}::${cls}`;
    setEdits(prev => ({ ...prev, [k]: { ...prev[k], [field]: val } }));
  }

  async function save(a: Adapter) {
    const e = edits[`${a.host}::${a.cls}`] || {};
    try {
      const res = await fetch(`${API_BASE_URL}/adapters/${a.host}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ componentClass: a.cls, triggerSelector: e.triggerSelector, optionSelector: e.optionSelector, verifySelector: e.verifySelector, optionsContainer: e.optionsContainer }),
      });
      const d = await res.json();
      d.ok ? (notify('Saved'), load()) : notify(d.error || 'Save failed', false);
    } catch (err: any) { notify(err.message, false); }
  }

  async function del(a: Adapter) {
    if (!confirm(`Delete adapter for ${a.host} / ${a.cls}?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/adapters/${a.host}/${a.cls}`, { method: 'DELETE' });
      const d = await res.json();
      d.ok ? (notify('Deleted'), load()) : notify(d.error || 'Delete failed', false);
    } catch (err: any) { notify(err.message, false); }
  }

  async function toggleStale(a: Adapter) {
    try {
      await fetch(`${API_BASE_URL}/adapters/${a.host}/${a.cls}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stale: !a.stale }),
      });
      notify(a.stale ? 'Marked active' : 'Marked stale');
      load();
    } catch (err: any) { notify(err.message, false); }
  }

  async function addNew() {
    const { hostname, cls, triggerSelector, optionSelector, verifySelector, optionsContainer } = newForm;
    if (!hostname || !cls || !triggerSelector || !optionSelector) {
      notify('Hostname, class, trigger and option selector are required', false); return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/adapters/${hostname}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ componentClass: cls, triggerSelector, optionSelector, verifySelector, optionsContainer }),
      });
      const d = await res.json();
      if (d.ok) { notify('Created'); setShowAdd(false); setNewForm(EMPTY_NEW); load(); }
      else notify(d.error || 'Failed', false);
    } catch (err: any) { notify(err.message, false); }
  }

  return (
    <div className="min-h-screen bg-[#0c1322] text-[#dce2f7] font-['Inter',sans-serif] flex flex-col">
      {/* Header */}
      <div className="bg-[#1e293b] border-b border-[#334155] px-4 h-10 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/')} className="text-[#94a3b8] hover:text-white">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <span className="text-sm font-bold uppercase tracking-wider">Adapter Manager</span>
        <span className="text-[11px] text-[#64748b]">{adapters.length} adapter{adapters.length !== 1 ? 's' : ''}</span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setShowAdd(v => !v)} className="text-[11px] bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded">+ New</button>
          <button onClick={load} className="text-[11px] bg-[#334155] hover:bg-[#475569] px-3 py-1 rounded">↻ Refresh</button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`mx-4 mt-2 px-3 py-2 rounded text-xs ${toast.ok ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Add new form */}
        {showAdd && (
          <div className="bg-[#1e293b] border border-blue-500 rounded p-4 space-y-2">
            <div className="text-xs font-bold text-blue-300 mb-2">New Adapter</div>
            {([
              ['hostname', 'Hostname (e.g. ssc.gov.in)'],
              ['cls', 'Component Class (e.g. ng-dropdown)'],
              ['triggerSelector', 'Trigger Selector'],
              ['optionSelector', 'Option Selector'],
              ['verifySelector', 'Verify Selector'],
              ['optionsContainer', 'Options Container'],
            ] as [string, string][]).map(([f, label]) => (
              <div key={f} className="flex items-center gap-2">
                <span className="text-[11px] text-[#94a3b8] w-40 shrink-0">{label}</span>
                <input value={(newForm as any)[f]}
                  onChange={e => setNewForm(p => ({ ...p, [f]: e.target.value }))}
                  className="flex-1 bg-[#0c1322] border border-[#334155] rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500" />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button onClick={addNew} className="text-[11px] bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded">💾 Save</button>
              <button onClick={() => { setShowAdd(false); setNewForm(EMPTY_NEW); }} className="text-[11px] bg-[#334155] hover:bg-[#475569] px-3 py-1 rounded">Cancel</button>
            </div>
          </div>
        )}

        {adapters.length === 0 && !showAdd && (
          <div className="text-[#475569] text-sm text-center mt-12">No adapters saved yet.</div>
        )}

        {adapters.map(a => {
          const k = `${a.host}::${a.cls}`;
          const e = edits[k] || a;
          return (
            <div key={k} className="bg-[#1e293b] border border-[#334155] rounded p-4">
              {/* Card header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold">
                    {a.host}
                    <span className="text-[#64748b] mx-1">—</span>
                    {a.cls}
                    <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${a.stale ? 'bg-yellow-900 text-yellow-300' : 'bg-emerald-900 text-emerald-300'}`}>
                      {a.stale ? 'stale' : 'active'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#64748b] mt-0.5">
                    v{a.adapterVersion} · {a.learnedAt} · ✓{a.successCount} ✗{a.failureCount}
                  </div>
                </div>
                <button onClick={() => del(a)} className="text-red-400 hover:text-red-300 text-xs ml-4">✕ Delete</button>
              </div>

              {/* Editable fields */}
              <div className="space-y-2">
                {FIELDS.map(([f, label]) => (
                  <div key={f as string} className="flex items-center gap-2">
                    <span className="text-[11px] text-[#94a3b8] w-36 shrink-0">{label}</span>
                    <input
                      value={(e[f] as string) || ''}
                      onChange={ev => setField(a.host, a.cls, f as string, ev.target.value)}
                      className="flex-1 bg-[#0c1322] border border-[#334155] rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-3">
                <button onClick={() => save(a)} className="text-[11px] bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded">💾 Save</button>
                <button onClick={() => toggleStale(a)} className="text-[11px] bg-[#334155] hover:bg-[#475569] px-3 py-1 rounded">
                  {a.stale ? '✅ Mark Active' : '⚠ Mark Stale'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
