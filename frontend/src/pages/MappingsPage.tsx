import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../utils/helpers';

type FieldMapping = { profileKey: string; fills: number; corrections: number; lastSeen?: string };
type FormMapping = Record<string, FieldMapping>;

const PROFILE_KEY_LABELS: Record<string, string> = {
  name: 'Full Name', dob: 'Date of Birth', father_name: "Father's Name",
  mother_name: "Mother's Name", gender: 'Gender', aadhaar_number: 'Aadhaar',
  pan_number: 'PAN', address: 'Full Address', village: 'Village',
  district: 'District', state: 'State', block: 'Block', pincode: 'Pincode',
  mobile: 'Mobile', email: 'Email', category: 'Category', nationality: 'Nationality',
  religion: 'Religion', marital_status: 'Marital Status',
};

export default function MappingsPage() {
  const navigate = useNavigate();
  const [formKeys, setFormKeys] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mapping, setMapping] = useState<FormMapping>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadKeys(); }, []);

  async function loadKeys() {
    try {
      const res = await fetch(`${API_BASE_URL}/mappings`);
      const keys = await res.json();
      setFormKeys(keys.filter((k: string) => k !== 'test_form_123'));
    } catch { /* ignore */ }
  }

  async function loadMapping(key: string) {
    setSelected(key);
    try {
      const res = await fetch(`${API_BASE_URL}/mappings/${key}`);
      const data = await res.json();
      setMapping(data || {});
    } catch { /* ignore */ }
  }

  function confidence(m: FieldMapping) {
    const f = m.fills || 0, c = m.corrections || 0;
    if (f + c === 0) return 0.5;
    return Math.round((f / (f + c * 3)) * 100);
  }

  function confColor(pct: number) {
    if (pct >= 75) return 'text-emerald-400';
    if (pct >= 40) return 'text-yellow-400';
    return 'text-red-400';
  }

  async function updateMapping(fieldLabel: string, newProfileKey: string) {
    if (!selected) return;
    setSaving(true);
    await fetch(`${API_BASE_URL}/mappings/${selected}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: { [fieldLabel]: { profileKey: newProfileKey, delta: { fills: 1, corrections: 0 } } } }),
    });
    await loadMapping(selected);
    setSaving(false);
  }

  async function deleteField(fieldLabel: string) {
    if (!selected) return;
    await fetch(`${API_BASE_URL}/mappings/${selected}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: { [fieldLabel]: { profileKey: mapping[fieldLabel]?.profileKey || '', delta: { fills: 0, corrections: 99 } } } }),
    });
    await loadMapping(selected);
  }

  const entries = Object.entries(mapping).filter(([k]) => k !== 'savedAt');

  return (
    <div className="min-h-screen bg-[#0c1322] text-[#dce2f7] font-['Inter',sans-serif] flex flex-col">
      <div className="bg-[#1e293b] border-b border-[#334155] px-4 h-10 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/')} className="text-[#94a3b8] hover:text-white">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <span className="text-sm font-bold uppercase tracking-wider">Learned Form Mappings</span>
        <span className="text-[11px] text-[#64748b]">{formKeys.length} forms</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: form list */}
        <div className="w-64 bg-[#141b2b] border-r border-[#334155] flex flex-col shrink-0 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] text-[#94a3b8] uppercase tracking-wider border-b border-[#334155]">Forms</div>
          {formKeys.length === 0 && <div className="p-4 text-[11px] text-[#475569]">No learned mappings yet.</div>}
          {formKeys.map(k => (
            <div key={k} className={`flex items-center border-b border-[#1e293b] ${selected === k ? 'bg-blue-600/20 border-l-2 border-blue-500' : ''}`}>
              <button onClick={() => loadMapping(k)}
                className={`flex-1 text-left px-3 py-2 text-[11px] truncate transition-colors ${selected === k ? 'text-blue-300' : 'text-[#94a3b8] hover:bg-[#1e293b]'}`}>
                {k.replace(/_/g, '.')}
              </button>
              <button onClick={async () => { if (confirm(`Delete mapping for ${k}?`)) { await fetch(`${API_BASE_URL}/mappings/${k}`, { method: 'DELETE' }); if (selected === k) { setSelected(null); setMapping({}); } await loadKeys(); } }}
                className="px-2 text-red-500 hover:text-red-300 text-[13px]" title="Delete form mapping">✕</button>
            </div>
          ))}
        </div>

        {/* Right: mapping details */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selected && <div className="text-[#475569] text-sm mt-8 text-center">Select a form to view its learned mappings</div>}
          {selected && (
            <div>
              <div className="text-xs text-[#64748b] mb-3">{selected.replace(/_/g, '.')}</div>
              <div className="text-[10px] text-[#94a3b8] mb-2">
                Confidence: <span className="text-emerald-400">≥75% reliable</span> · <span className="text-yellow-400">40-74% uncertain</span> · <span className="text-red-400">&lt;40% wrong</span>
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-[#64748b] border-b border-[#334155]">
                    <th className="text-left py-2 pr-4">Form Field Label</th>
                    <th className="text-left py-2 pr-4">Maps To</th>
                    <th className="text-left py-2 pr-4">Confidence</th>
                    <th className="text-left py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(([label, m]) => (
                    <tr key={label} className="border-b border-[#1e293b] hover:bg-[#1e293b]">
                      <td className="py-2 pr-4 text-[#dce2f7]">{label}</td>
                      <td className="py-2 pr-4">
                        <select value={m.profileKey} onChange={e => updateMapping(label, e.target.value)}
                          className="bg-[#1e293b] border border-[#334155] rounded px-2 py-1 text-xs text-[#dce2f7] focus:outline-none focus:border-blue-500">
                          {Object.entries(PROFILE_KEY_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v} ({k})</option>
                          ))}
                          <option value={m.profileKey}>{m.profileKey}</option>
                        </select>
                      </td>
                      <td className={`py-2 pr-4 font-bold ${confColor(confidence(m))}`}>{confidence(m)}%</td>
                      <td className="py-2">
                        <button onClick={() => deleteField(label)}
                          className="text-red-400 hover:text-red-300 text-[10px]">✕ Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {saving && <div className="text-[11px] text-blue-400 mt-2">Saving...</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
