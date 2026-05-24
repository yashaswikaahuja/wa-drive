import { useEffect, useState } from 'react';
import api from '../../shared/api';

interface FormSummary {
  formKey: string;
  hostname: string | null;
  title: string | null;
  fieldCount: number;
  unmapped: number;
  fills: number;
  corrections: number;
  lastSeen: string | null;
}

interface FieldMapping {
  profileKey: string | null;
  fills: number;
  corrections: number;
  lastSeen: string;
  source?: string;
}

// Common profile keys that show up in dropdown — sourced from a representative
// extracted profile. Operator picks one of these per field, or 'custom' to enter
// a key manually.
const PROFILE_KEY_SUGGESTIONS = [
  'name', 'father_name', 'mother_name',
  'dob', 'gender', 'nationality', 'category',
  'phone', 'email', 'email_id',
  'aadhaar_number', 'pan_number', 'epic_number', 'vid',
  'pincode', 'state', 'district', 'block', 'village', 'sub_division',
  'police_station', 'post_office', 'street', 'house_no', 'address', 'permanent_address',
  'roll_number', 'roll_number_10th', 'roll_number_12th',
  'board_10th', 'board_12th', 'board_name',
  'passing_year_10th', 'passing_year_12th', 'year_of_passing',
  'marks_10th', 'marks_12th', 'grade', 'division',
  'school_name', 'university_name', 'degree_name', 'highest_education_qualification',
  'religion', 'marital_status', 'domicile_state',
  'subject', 'subjects', 'stream', 'stream_10th', 'stream_12th',
  'registration_number', 'certificate_number_10th', 'certificate_number_12th',
];

export default function MappingsPage() {
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selected, setSelected] = useState<FormSummary | null>(null);
  const [fields, setFields] = useState<Record<string, FieldMapping>>({});
  const [search, setSearch] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => { loadList(); }, []);

  async function loadList() {
    try {
      const r = await api.get('/mappings/list');
      setForms(r.data || []);
    } catch (e) { console.warn('failed to load mappings list', e); }
  }

  async function openForm(f: FormSummary) {
    setSelected(f);
    try {
      const r = await api.get('/mappings/' + f.formKey);
      const data = r.data || {};
      const cleaned: Record<string, FieldMapping> = {};
      for (const [k, v] of Object.entries(data)) {
        if (k === '_meta') continue;
        cleaned[k] = v as FieldMapping;
      }
      setFields(cleaned);
    } catch (e) { setFields({}); }
  }

  async function updateField(label: string, profileKey: string | null) {
    setSavingKey(label);
    try {
      await api.patch('/mappings/' + selected!.formKey + '/' + encodeURIComponent(label), { profileKey: profileKey || null });
      setFields(prev => ({ ...prev, [label]: { ...prev[label], profileKey: profileKey || null, source: 'manual' } }));
    } catch (e) { console.warn('save failed', e); }
    finally { setSavingKey(null); }
  }

  async function deleteField(label: string) {
    if (!confirm('Remove this mapping?')) return;
    try {
      await api.delete('/mappings/' + selected!.formKey + '/' + encodeURIComponent(label));
      setFields(prev => { const next = { ...prev }; delete next[label]; return next; });
    } catch (e) { console.warn('delete failed', e); }
  }

  async function deleteForm(formKey: string) {
    if (!confirm('Remove ALL mappings for this form? This cannot be undone.')) return;
    try {
      await api.delete('/mappings/' + formKey);
      setForms(prev => prev.filter(f => f.formKey !== formKey));
      if (selected?.formKey === formKey) { setSelected(null); setFields({}); }
    } catch (e) { console.warn('delete form failed', e); }
  }

  if (selected) {
    const fieldEntries = Object.entries(fields).sort((a, b) => a[0].localeCompare(b[0]));
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <button onClick={() => setSelected(null)} className="text-blue-400 mb-4 text-sm">← All forms</button>
        <h1 className="text-2xl font-bold mb-1">{selected.hostname || 'Unknown host'}</h1>
        <div className="text-sm text-gray-400 mb-6">
          formKey: <code className="bg-gray-800 px-2 py-0.5 rounded">{selected.formKey}</code>
          {' · '}{fieldEntries.length} fields
          {selected.unmapped > 0 && <span className="text-yellow-400">{' · '}{selected.unmapped} unmapped</span>}
          {selected.fills > 0 && <span>{' · '}{selected.fills} fills</span>}
          {' · '}<button onClick={() => deleteForm(selected.formKey)} className="text-red-400 hover:underline">delete form</button>
        </div>

        <div className="bg-gray-900 rounded border border-gray-800">
          <div className="grid grid-cols-12 px-3 py-2 text-xs uppercase text-gray-500 border-b border-gray-800">
            <div className="col-span-6">Form Field Label</div>
            <div className="col-span-4">Maps To Profile Key</div>
            <div className="col-span-2 text-right">Stats / Actions</div>
          </div>
          {fieldEntries.map(([label, m]) => (
            <div key={label} className="grid grid-cols-12 px-3 py-2 border-b border-gray-800 items-center hover:bg-gray-800/30">
              <div className="col-span-6 text-sm font-mono">{label}</div>
              <div className="col-span-4">
                <select
                  value={m.profileKey || ''}
                  onChange={(e) => updateField(label, e.target.value)}
                  disabled={savingKey === label}
                  className="bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-700 w-full"
                >
                  <option value="">— skip / no map —</option>
                  {PROFILE_KEY_SUGGESTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="col-span-2 text-right text-xs">
                <span className="text-gray-500">f:{m.fills} c:{m.corrections}</span>
                {m.source && <span className={`ml-2 px-1 rounded ${m.source === 'manual' ? 'bg-cyan-900 text-cyan-300' : m.source === 'agent' ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-400'}`}>{m.source}</span>}
                <button onClick={() => deleteField(label)} className="ml-2 text-red-400 hover:underline">×</button>
              </div>
            </div>
          ))}
          {fieldEntries.length === 0 && <div className="p-6 text-center text-gray-500">No fields recorded yet.</div>}
        </div>
      </div>
    );
  }

  const filtered = forms.filter(f =>
    !search ||
    f.formKey.toLowerCase().includes(search.toLowerCase()) ||
    (f.hostname || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.title || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Form Mappings</h1>
      <p className="text-sm text-gray-400 mb-4">
        Each form your operators visit gets recorded here. Click any form to assign the profile key
        for each field. Edits take effect on the next fill.
      </p>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="search by hostname, formKey, title…"
        className="w-full bg-gray-900 border border-gray-700 px-3 py-2 rounded mb-4"
      />
      <div className="bg-gray-900 rounded border border-gray-800">
        <div className="grid grid-cols-12 px-3 py-2 text-xs uppercase text-gray-500 border-b border-gray-800">
          <div className="col-span-5">Hostname / Title</div>
          <div className="col-span-3">formKey</div>
          <div className="col-span-1 text-center">Fields</div>
          <div className="col-span-1 text-center">Unmapped</div>
          <div className="col-span-1 text-center">Fills</div>
          <div className="col-span-1 text-right">Last Seen</div>
        </div>
        {filtered.map(f => (
          <div
            key={f.formKey}
            onClick={() => openForm(f)}
            className="grid grid-cols-12 px-3 py-2 border-b border-gray-800 items-center hover:bg-gray-800/30 cursor-pointer"
          >
            <div className="col-span-5">
              <div className="text-sm">{f.hostname || '(unknown)'}</div>
              <div className="text-xs text-gray-500 truncate">{f.title || ''}</div>
            </div>
            <div className="col-span-3 text-xs font-mono text-gray-400">{f.formKey}</div>
            <div className="col-span-1 text-center text-sm">{f.fieldCount}</div>
            <div className={`col-span-1 text-center text-sm ${f.unmapped > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
              {f.unmapped}
            </div>
            <div className="col-span-1 text-center text-sm">{f.fills}</div>
            <div className="col-span-1 text-right text-xs text-gray-500">{f.lastSeen || '-'}</div>
          </div>
        ))}
        {filtered.length === 0 && <div className="p-6 text-center text-gray-500">No forms recorded yet. Visit a form via the extension to seed it.</div>}
      </div>
    </div>
  );
}
