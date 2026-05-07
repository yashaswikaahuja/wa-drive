import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../utils/helpers';

type Adapter = {
  componentClass: string; triggerSelector: string; optionSelector: string;
  verifySelector: string; optionsContainer: string;
  adapterVersion: number; successCount: number; failureCount: number;
  stale: boolean; learnedAt: string;
};
type Store = Record<string, Record<string, Adapter>>;
type Edits = Record<string, Partial<Adapter>>;

const S = {
  page: { padding: 24, fontFamily: 'sans-serif', background: '#0f172a', minHeight: '100vh', color: '#e2e8f0' } as React.CSSProperties,
  card: { background: '#1e293b', borderRadius: 8, padding: 16, marginBottom: 12 } as React.CSSProperties,
  row: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } as React.CSSProperties,
  label: { fontSize: 12, color: '#94a3b8', width: 140, flexShrink: 0 } as React.CSSProperties,
  input: { flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 4, padding: '4px 8px', color: '#e2e8f0', fontSize: 12, outline: 'none' } as React.CSSProperties,
  btnBlue: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12 } as React.CSSProperties,
  btnRed: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12 } as React.CSSProperties,
  btnGray: { background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12 } as React.CSSProperties,
};

export default function AdaptersPage() {
  const [data, setData] = useState<Store>({});
  const [edits, setEdits] = useState<Edits>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/adapters`).then(r => r.json()).then((store: Store) => {
      setData(store);
      const init: Edits = {};
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
    <div style={S.page}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>🔧 Adapter Management</h1>
      {toast && <div style={{ background: '#1e3a5f', color: '#7dd3fc', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{toast}</div>}
      {loading ? <p>Loading...</p> : total === 0 ? <p style={{ color: '#94a3b8' }}>No adapters saved yet.</p> : (
        Object.entries(data).map(([host, adapters]) => (
          <div key={host} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, color: '#7dd3fc', marginBottom: 10 }}>{host}</h2>
            {Object.entries(adapters).map(([cls, a]) => {
              const e = edits[`${host}::${cls}`] || a;
              return (
                <div key={cls} style={S.card}>
                  {/* Title row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{cls}</span>
                      <span style={{ fontSize: 12, color: a.stale ? '#f87171' : '#4ade80', marginLeft: 8 }}>
                        v{a.adapterVersion} {a.stale ? '⚠ stale' : '✓ active'}
                      </span>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                        ✓{a.successCount} ✗{a.failureCount} · {a.learnedAt}
                      </div>
                    </div>
                    <button onClick={() => del(host, cls)} style={S.btnRed}>Delete</button>
                  </div>

                  {/* Editable fields */}
                  {([
                    ['triggerSelector', 'Trigger Selector'],
                    ['optionSelector', 'Option Selector'],
                    ['verifySelector', 'Verify Selector'],
                    ['optionsContainer', 'Options Container'],
                  ] as [string, string][]).map(([f, label]) => (
                    <div key={f} style={S.row}>
                      <span style={S.label}>{label}</span>
                      <input style={S.input} value={(e as any)[f] || ''}
                        onChange={ev => setField(host, cls, f, ev.target.value)} />
                    </div>
                  ))}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => save(host, cls)} style={S.btnBlue}>💾 Save</button>
                    <button onClick={() => toggleStale(host, cls, !a.stale)} style={S.btnGray}>
                      {a.stale ? '✅ Mark Active' : '⚠ Mark Stale'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
