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
  label?: string;
  profileKey: string | null;
  fills: number;
  corrections: number;
  lastSeen: string;
  source?: string;
}

const PROFILE_KEY_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Identity', keys: ['name', 'father_name', 'mother_name', 'dob', 'gender', 'nationality', 'category', 'religion', 'marital_status'] },
  { label: 'Contact', keys: ['phone', 'email', 'email_id'] },
  { label: 'IDs', keys: ['aadhaar_number', 'vid', 'pan_number', 'epic_number'] },
  { label: 'Address', keys: ['pincode', 'state', 'district', 'block', 'village', 'sub_division', 'police_station', 'post_office', 'street', 'house_no', 'address', 'permanent_address', 'domicile_state'] },
  { label: 'Education (10th)', keys: ['roll_number_10th', 'board_10th', 'passing_year_10th', 'marks_10th', 'stream_10th'] },
  { label: 'Education (12th)', keys: ['roll_number_12th', 'board_12th', 'passing_year_12th', 'marks_12th', 'stream_12th'] },
  { label: 'Education (other)', keys: ['roll_number', 'board_name', 'year_of_passing', 'grade', 'division', 'subject', 'subjects', 'school_name', 'university_name', 'degree_name', 'highest_education_qualification'] },
  { label: 'Documents', keys: ['registration_number', 'certificate_number_10th', 'certificate_number_12th'] },
];

function favicon(host: string | null) {
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
}

export default function MappingsPage() {
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selected, setSelected] = useState<FormSummary | null>(null);
  const [fields, setFields] = useState<Record<string, FieldMapping>>({});
  const [search, setSearch] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadList(); }, []);

  async function loadList() {
    setLoading(true);
    try { const r = await api.get('/mappings/list'); setForms(r.data || []); }
    catch (e) { console.warn('failed to load list', e); }
    finally { setLoading(false); }
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
    } catch { setFields({}); }
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
    if (!confirm('Remove ALL mappings for this form?')) return;
    try {
      await api.delete('/mappings/' + formKey);
      setForms(prev => prev.filter(f => f.formKey !== formKey));
      if (selected?.formKey === formKey) { setSelected(null); setFields({}); }
    } catch { /* ignore */ }
  }

  async function backfillFromSessions() {
    if (!confirm('Backfill mappings for all forms from past sessions? Existing assignments are kept.')) return;
    setLoading(true);
    try {
      const r = await api.post('/mappings/backfill');
      alert(`Backfill done: ${r.data.seededTotal} fields added across ${r.data.formsSeeded} forms.`);
      await loadList();
    } catch (e) { console.warn('backfill failed', e); alert('Backfill failed'); }
    finally { setLoading(false); }
  }

  // ── Detail view ────────────────────────────────────────────────────────
  if (selected) {
    const fieldEntries = Object.entries(fields).sort((a, b) => a[0].localeCompare(b[0]));
    const mapped = fieldEntries.filter(([, m]) => m.profileKey).length;
    const total = fieldEntries.length;
    const pct = total ? Math.round((mapped / total) * 100) : 0;

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <button onClick={() => setSelected(null)} className="text-blue-400 mb-4 text-sm hover:underline flex items-center gap-1">
          <span>←</span> All forms
        </button>

        <div className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-xl border border-gray-800 p-6 mb-6">
          <div className="flex items-start gap-4">
            {favicon(selected.hostname) && (
              <img src={favicon(selected.hostname)!} alt="" className="w-10 h-10 rounded bg-white p-1" />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold truncate">{selected.hostname || 'Unknown host'}</h1>
              {selected.title && <div className="text-sm text-gray-400 truncate mt-0.5">{selected.title}</div>}
              <div className="flex gap-3 mt-3 text-xs text-gray-500 flex-wrap">
                <span>formKey: <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">{selected.formKey}</code></span>
                <span>·</span>
                <span>{total} fields</span>
                <span>·</span>
                <span>{selected.fills} fills</span>
                {selected.lastSeen && <><span>·</span><span>last seen {selected.lastSeen}</span></>}
              </div>
            </div>
            <button onClick={() => deleteForm(selected.formKey)} className="text-red-400 text-xs hover:bg-red-500/10 px-3 py-1.5 rounded border border-red-500/20">
              delete form
            </button>
          </div>

          <div className="mt-5">
            <div className="flex justify-between items-center mb-1.5 text-xs">
              <span className="text-gray-400">{mapped} of {total} fields mapped</span>
              <span className="text-gray-300">{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full transition-all ${pct === 100 ? 'bg-green-500' : pct > 50 ? 'bg-blue-500' : 'bg-yellow-500'}`} style={{ width: pct + '%' }} />
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-3 text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-800 bg-gray-900/50">
            <div className="col-span-6">Form Field Label</div>
            <div className="col-span-4">Maps To Profile Key</div>
            <div className="col-span-2 text-right">Stats</div>
          </div>
          {fieldEntries.map(([key, m]) => {
            const display = m.label || key;
            return (
              <div key={key} className={`grid grid-cols-12 px-4 py-2.5 border-b border-gray-800/50 items-center hover:bg-gray-800/30 transition ${!m.profileKey ? 'bg-yellow-500/5' : ''}`}>
                <div className="col-span-6 text-sm text-gray-200 truncate" title={display}>
                  {display}
                  {m.label && m.label !== key && (
                    <div className="text-[10px] text-gray-600 font-mono mt-0.5">key: {key}</div>
                  )}
                </div>
                <div className="col-span-4">
                  <select
                    value={m.profileKey || ''}
                    onChange={(e) => updateField(key, e.target.value)}
                    disabled={savingKey === key}
                    className="bg-gray-800 text-gray-100 text-sm px-2.5 py-1.5 rounded border border-gray-700 w-full focus:outline-none focus:border-blue-500"
                  >
                    <option value="">— skip / no mapping —</option>
                    {PROFILE_KEY_GROUPS.map(group => (
                      <optgroup key={group.label} label={group.label}>
                        {group.keys.map(k => <option key={k} value={k}>{k}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 flex items-center justify-end gap-2">
                  <span className="text-[11px] text-gray-500">f:{m.fills} c:{m.corrections}</span>
                  {m.source && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      m.source === 'manual' ? 'bg-cyan-500/20 text-cyan-300' :
                      m.source === 'agent' ? 'bg-blue-500/20 text-blue-300' :
                      m.source === 'heuristic' ? 'bg-purple-500/20 text-purple-300' :
                      m.source === 'backfill' ? 'bg-green-500/20 text-green-300' :
                      m.source === 'seed' ? 'bg-yellow-500/20 text-yellow-300' :
                      'bg-gray-700 text-gray-400'
                    }`}>{m.source}</span>
                  )}
                  <button onClick={() => deleteField(key)} className="text-gray-500 hover:text-red-400 text-base" title="Remove">×</button>
                </div>
              </div>
            );
          })}
          {fieldEntries.length === 0 && <div className="p-8 text-center text-gray-500 text-sm">No fields recorded yet.</div>}
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────
  const filtered = forms.filter(f =>
    !search ||
    f.formKey.toLowerCase().includes(search.toLowerCase()) ||
    (f.hostname || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.title || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Form Mappings</h1>
          <p className="text-sm text-gray-400">
            Each form your operators visit gets recorded here. Click any form to assign which profile field
            fills which form field. Edits take effect on the next fill.
          </p>
        </div>
        <button
          onClick={backfillFromSessions}
          className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 text-sm px-4 py-2 rounded-lg flex-shrink-0"
          title="Add fields from past autofill sessions to mappings"
        >
          ↻ Backfill from sessions
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="search by hostname, formKey, or title…"
        className="w-full bg-gray-900 border border-gray-800 px-4 py-2.5 rounded-lg mb-4 focus:outline-none focus:border-blue-500"
      />

      {loading && <div className="text-center text-gray-500 py-12 text-sm">loading…</div>}

      {!loading && (
        <div className="grid gap-3">
          {filtered.map(f => {
            const pct = f.fieldCount ? Math.round(((f.fieldCount - f.unmapped) / f.fieldCount) * 100) : 0;
            return (
              <div
                key={f.formKey}
                onClick={() => openForm(f)}
                className="bg-gray-900 hover:bg-gray-800/70 border border-gray-800 hover:border-gray-700 rounded-xl p-4 cursor-pointer transition group"
              >
                <div className="flex items-start gap-4">
                  <img
                    src={favicon(f.hostname) || ''}
                    alt=""
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                    className="w-9 h-9 rounded bg-white p-1 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-medium truncate">{f.hostname || '(unknown host)'}</h3>
                      <span className="text-[11px] text-gray-500 flex-shrink-0">{f.lastSeen || '—'}</span>
                    </div>
                    {f.title && <div className="text-xs text-gray-500 truncate mt-0.5">{f.title}</div>}
                    <div className="flex items-center gap-3 mt-2.5">
                      <code className="text-[10px] text-gray-600 font-mono">{f.formKey}</code>
                      <div className="flex items-center gap-2 flex-1 max-w-md">
                        <div className="h-1 bg-gray-800 rounded-full overflow-hidden flex-1">
                          <div className={`h-full ${pct === 100 ? 'bg-green-500' : pct > 50 ? 'bg-blue-500' : 'bg-yellow-500'}`} style={{ width: pct + '%' }} />
                        </div>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">{f.fieldCount - f.unmapped}/{f.fieldCount}</span>
                      </div>
                      {f.fills > 0 && <span className="text-[10px] text-gray-500">{f.fills} fills</span>}
                      {f.unmapped > 0 && <span className="text-[10px] text-yellow-500">{f.unmapped} unmapped</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
              <div className="text-gray-500 text-sm">
                {search ? 'No forms match your search.' : 'No forms recorded yet. Visit a form via the extension to seed it.'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
