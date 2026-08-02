import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Trash } from '@phosphor-icons/react';
import api from '../../shared/api';
import { toast } from '../../shared/toast';
import { useFocusTrap } from '../../shared/useFocusTrap';

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
  type?: string;
  order?: number;
  options?: string[] | null;
  profileKey: string | null;
  fills: number;
  corrections: number;
  lastSeen: string;
  source?: string;
}

const PROFILE_KEY_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Identity', keys: ['name', 'first_name', 'middle_name', 'last_name', 'father_name', 'mother_name', 'husband_name', 'dob', 'gender', 'nationality', 'category', 'religion', 'marital_status'] },
  { label: 'Contact', keys: ['phone', 'email', 'email_id'] },
  { label: 'IDs', keys: ['aadhaar_number', 'vid', 'pan_number', 'epic_number'] },
  { label: 'Address', keys: ['pincode', 'state', 'district', 'block', 'village', 'sub_division', 'police_station', 'post_office', 'ward_no', 'city', 'street', 'house_no', 'address', 'permanent_address', 'domicile_state'] },
  { label: 'Education (10th)', keys: ['roll_number_10th', 'board_10th', 'passing_year_10th', 'marks_obtained_10th', 'total_marks_10th', 'percentage_10th', 'division_10th', 'school_name', 'certificate_number_10th'] },
  { label: 'Education (12th)', keys: ['roll_number_12th', 'board_12th', 'passing_year_12th', 'marks_obtained_12th', 'total_marks_12th', 'percentage_12th', 'division_12th', 'stream_12th', 'school_name_12th', 'certificate_number_12th'] },
  { label: 'Education (Graduation)', keys: ['roll_number_grad', 'university_name', 'degree', 'passing_year_grad', 'marks_obtained_grad', 'total_marks_grad', 'percentage_grad', 'division_grad', 'registration_number_grad'] },
  { label: 'Education (other)', keys: ['roll_number', 'board_name', 'year_of_passing', 'grade', 'division', 'subject', 'subjects', 'school_name', 'degree_name', 'highest_education_qualification', 'qualification_status'] },
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
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [newTransKey, setNewTransKey] = useState('');
  const [newTransVal, setNewTransVal] = useState('');
  const [confirmState, setConfirmState] = useState<{ message: string; danger?: boolean; confirmLabel?: string; onConfirm: () => void } | null>(null);

  useEffect(() => { loadList(); loadTranslations(); }, []);

  async function loadTranslations() {
    try { const r = await api.get('/mappings/translations'); setTranslations(r.data || {}); } catch {}
  }

  async function saveTranslation(key: string, value: string) {
    try {
      await api.patch('/mappings/translations', { entries: { [key]: value } });
      setTranslations(prev => ({ ...prev, [key]: value }));
    } catch { toast.error('Failed to save translation'); }
  }

  async function removeTranslation(key: string) {
    try {
      await api.patch('/mappings/translations', { entries: { [key]: null } });
      setTranslations(prev => { const n = { ...prev }; delete n[key]; return n; });
    } catch { toast.error('Failed to remove'); }
  }

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
    setConfirmState({
      message: 'Remove this field mapping?',
      danger: true,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        try {
          await api.delete('/mappings/' + selected!.formKey + '/' + encodeURIComponent(label));
          setFields(prev => { const next = { ...prev }; delete next[label]; return next; });
        } catch (e) { console.warn('delete failed', e); toast.error('Failed to remove mapping'); }
      },
    });
  }

  async function deleteForm(formKey: string) {
    setConfirmState({
      message: 'Remove ALL mappings for this form? This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete form',
      onConfirm: async () => {
        try {
          await api.delete('/mappings/' + formKey);
          setForms(prev => prev.filter(f => f.formKey !== formKey));
          if (selected?.formKey === formKey) { setSelected(null); setFields({}); }
        } catch { toast.error('Failed to delete form mappings'); }
      },
    });
  }

  // ── Detail view ────────────────────────────────────────────────────────
  if (selected) {
    const fieldEntries = Object.entries(fields).sort((a, b) => {
      const ao = a[1].order, bo = b[1].order;
      if (ao !== undefined && bo !== undefined) return ao - bo;
      if (ao !== undefined) return -1;
      if (bo !== undefined) return 1;
      return a[0].localeCompare(b[0]);
    });

    // Type grouping helper
    const getTypeGroup = (t: string) => {
      if (!t || t === 'text' || t === 'textarea' || t === 'number' || t === 'email' || t === 'tel') return 'text';
      if (t === 'dropdown' || t === 'select' || t === 'mat-select' || t === 'ng-dropdown') return 'dropdown';
      if (t === 'radio' || t === 'radio-group' || t === 'mat-radio') return 'radio';
      if (t === 'checkbox' || t === 'checkbox-group' || t === 'checkbox-agreement' || t === 'mat-checkbox') return 'checkbox';
      if (t === 'date') return 'date';
      return 'text';
    };

    const filteredEntries = typeFilter === 'all' ? fieldEntries : fieldEntries.filter(([, m]) => getTypeGroup(m.type || 'text') === typeFilter);
    const mapped = fieldEntries.filter(([, m]) => m.profileKey).length;
    const total = fieldEntries.length;
    const pct = total ? Math.round((mapped / total) * 100) : 0;

    // Count by type for filter tabs
    const typeCounts: Record<string, number> = { all: fieldEntries.length };
    for (const [, m] of fieldEntries) {
      const g = getTypeGroup(m.type || 'text');
      typeCounts[g] = (typeCounts[g] || 0) + 1;
    }

    return (
      <div className="max-w-5xl mx-auto">
        <button onClick={() => setSelected(null)} className="btn-ghost text-sm mb-4 flex items-center gap-1">
          <ArrowLeft size={14} /> All forms
        </button>

        <div className="card p-6 mb-6">
          <div className="flex items-start gap-4">
            {favicon(selected.hostname) && (
              <img src={favicon(selected.hostname)!} alt="" className="w-10 h-10 rounded-xl bg-white p-1" />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-white tracking-tight truncate">{selected.title || selected.hostname || 'Unknown form'}</h1>
              {selected.title && selected.hostname && <div className="text-xs text-gray-500 mt-0.5">{selected.hostname}</div>}
              <div className="flex gap-3 mt-2 text-xs text-gray-500">
                <span>{total} fields</span>
                <span>·</span>
                <span>{mapped} mapped</span>
                {selected.fills > 0 && <><span>·</span><span>{selected.fills} fills</span></>}
              </div>
            </div>
            <button onClick={() => deleteForm(selected.formKey)} className="btn-ghost text-red-400 text-xs flex items-center gap-1">
              <Trash size={14} /> Delete
            </button>
          </div>

          <div className="mt-4">
            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
              <div className={`h-full transition-all ${pct === 100 ? 'bg-green-500' : pct > 50 ? 'bg-[#0a84ff]' : 'bg-yellow-500'}`} style={{ width: pct + '%' }} />
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 mb-3 flex-wrap">
          {[
            { key: 'all', label: 'All', icon: '' },
            { key: 'text', label: 'Text', icon: '⎽' },
            { key: 'dropdown', label: 'Dropdown', icon: '▾' },
            { key: 'radio', label: 'Radio', icon: '◉' },
            { key: 'checkbox', label: 'Checkbox', icon: '☑' },
            { key: 'date', label: 'Date', icon: '📅' },
          ].filter(t => typeCounts[t.key]).map(t => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className={`px-3 py-1 rounded-full text-xs transition ${typeFilter === t.key ? 'bg-[#0a84ff] text-white' : 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.08]'}`}
            >
              {t.icon && <span className="mr-1">{t.icon}</span>}{t.label} <span className="ml-1 opacity-60">{typeCounts[t.key]}</span>
            </button>
          ))}
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center px-4 py-3 text-[11px] uppercase tracking-wider text-gray-500 border-b border-white/[0.04]">
            <span className="w-5 flex-shrink-0" />
            <div className="flex-1 ml-3">Form Field</div>
            <div className="w-52 flex-shrink-0">Profile Key</div>
            <div className="w-6 flex-shrink-0" />
          </div>
          <div className="divide-y divide-white/[0.04]">
            {filteredEntries.map(([key, m]) => {
              const display = m.label || key.replace(/_/g, ' ');
              const type = m.type || 'text';
              const typeIcon = type === 'dropdown' || type === 'select' || type === 'mat-select' || type === 'ng-dropdown' ? '▾'
                : type === 'radio-group' || type === 'radio' || type === 'mat-radio' ? '◉'
                : type === 'checkbox-group' || type === 'checkbox' || type === 'checkbox-agreement' || type === 'mat-checkbox' ? '☑'
                : type === 'date' ? '📅'
                : '⎽';
              const typeLabel = type === 'dropdown' || type === 'select' || type === 'mat-select' || type === 'ng-dropdown' ? 'Dropdown'
                : type === 'radio-group' || type === 'radio' || type === 'mat-radio' ? 'Radio'
                : type === 'checkbox-group' || type === 'checkbox' || type === 'checkbox-agreement' || type === 'mat-checkbox' ? 'Checkbox'
                : type === 'date' ? 'Date'
                : 'Text';
              const typeColor = type === 'dropdown' || type === 'select' || type === 'mat-select' || type === 'ng-dropdown' ? 'text-purple-400'
                : type === 'radio-group' || type === 'radio' || type === 'mat-radio' ? 'text-orange-400'
                : type === 'checkbox-group' || type === 'checkbox' || type === 'checkbox-agreement' || type === 'mat-checkbox' ? 'text-green-400'
                : type === 'date' ? 'text-sky-400'
                : 'text-gray-500';
              const hasOptions = m.options && m.options.length > 0;
              return (
                <div key={key} className={`px-4 py-2.5 hover:bg-white/[0.02] transition ${!m.profileKey ? 'bg-yellow-500/[0.03]' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm flex-shrink-0 w-5 text-center ${typeColor}`} title={typeLabel}>{typeIcon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-200 truncate" title={display}>{display}</div>
                    </div>
                    <div className="w-52 flex-shrink-0">
                      <select
                        value={m.profileKey || ''}
                        onChange={(e) => updateField(key, e.target.value)}
                        disabled={savingKey === key}
                        className="input-field text-xs w-full py-1.5"
                      >
                        <option value="">{type === 'checkbox-agreement' ? '— auto-check —' : '— skip —'}</option>
                        {PROFILE_KEY_GROUPS.map(group => (
                          <optgroup key={group.label} label={group.label}>
                            {group.keys.map(k => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <button onClick={() => deleteField(key)} className="text-gray-600 hover:text-red-400 text-lg flex-shrink-0" title="Remove">×</button>
                  </div>
                  {hasOptions && (
                    <div className="ml-8 mt-1.5 flex flex-wrap gap-1.5">
                      {m.options!.slice(0, 8).map((opt, i) => (
                        <span key={i} className={`inline-block px-2 py-0.5 rounded text-[11px] ${typeColor} bg-white/[0.03] border border-white/[0.06]`}>{opt}</span>
                      ))}
                      {m.options!.length > 8 && <span className="text-[11px] text-gray-600">+{m.options!.length - 8} more</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {filteredEntries.length === 0 && <div className="p-8 text-center text-gray-500 text-sm">{typeFilter === 'all' ? 'No fields recorded yet.' : 'No fields of this type.'}</div>}
        </div>
        {confirmState && (
          <ConfirmDialog
            message={confirmState.message}
            danger={confirmState.danger}
            confirmLabel={confirmState.confirmLabel}
            onCancel={() => setConfirmState(null)}
            onConfirm={() => { const fn = confirmState.onConfirm; setConfirmState(null); fn(); }}
          />
        )}
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
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white tracking-tight mb-1">Form Mappings</h1>
        <p className="text-sm text-gray-400">
          Each form your operators visit gets recorded here. Click any form to assign which profile field
          fills which form field. Edits take effect on the next fill.
        </p>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="search by hostname, formKey, or title…"
        className="input-field w-full mb-4"
      />

      {loading && <div className="h-32 bg-white/[0.03] animate-pulse rounded-2xl" />}

      {!loading && (
        <div className="grid gap-3">
          {filtered.map(f => {
            const pct = f.fieldCount ? Math.round(((f.fieldCount - f.unmapped) / f.fieldCount) * 100) : 0;
            return (
              <div
                key={f.formKey}
                onClick={() => openForm(f)}
                className="card p-4 cursor-pointer hover:border-white/10 transition group"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={favicon(f.hostname) || ''}
                    alt=""
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                    className="w-8 h-8 rounded-lg bg-white p-0.5 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-white text-sm truncate">{f.title || f.hostname || '(unknown)'}</h3>
                    {f.title && f.hostname && <div className="text-[11px] text-gray-600 truncate">{f.hostname}</div>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-2 w-32">
                      <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden flex-1">
                        <div className={`h-full ${pct === 100 ? 'bg-green-500' : pct > 50 ? 'bg-[#0a84ff]' : 'bg-yellow-500'}`} style={{ width: pct + '%' }} />
                      </div>
                      <span className="text-[11px] text-gray-500 tabular-nums">{f.fieldCount - f.unmapped}/{f.fieldCount}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="card p-12 text-center">
              <div className="text-gray-500 text-sm">
                {search ? 'No forms match your search.' : 'No forms recorded yet. Visit a form via the extension to seed it.'}
              </div>
            </div>
          )}
        </div>
      )}
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          danger={confirmState.danger}
          confirmLabel={confirmState.confirmLabel}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { const fn = confirmState.onConfirm; setConfirmState(null); fn(); }}
        />
      )}

      {/* Value Translations Table */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-white mb-1">Value Translations</h2>
        <p className="text-xs text-gray-500 mb-4">
          When a profile value doesn't match a form option exactly (e.g. "OBC" vs "Other Backward Class"), add a translation here. These apply globally across all forms.
        </p>
        <div className="card overflow-hidden">
          <div className="divide-y divide-white/[0.04]">
            {Object.entries(translations).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => (
              <div key={key} className="flex items-center gap-3 px-4 py-2">
                <span className="text-sm text-gray-300 font-mono flex-1">{key}</span>
                <span className="text-gray-600">→</span>
                <span className="text-sm text-gray-200 flex-1">{val}</span>
                <button onClick={() => removeTranslation(key)} className="text-gray-600 hover:text-red-400 text-lg">×</button>
              </div>
            ))}
            {Object.keys(translations).length === 0 && (
              <div className="px-4 py-6 text-center text-gray-600 text-sm">No translations yet. Add common ones like OBC → Other Backward Class.</div>
            )}
          </div>
          <div className="flex items-center gap-2 px-4 py-3 border-t border-white/[0.04]">
            <input value={newTransKey} onChange={e => setNewTransKey(e.target.value)} placeholder="Profile value (e.g. OBC)" className="input-field text-xs flex-1 py-1.5" />
            <span className="text-gray-600 text-sm">→</span>
            <input value={newTransVal} onChange={e => setNewTransVal(e.target.value)} placeholder="Form option text (e.g. Other Backward Class)" className="input-field text-xs flex-1 py-1.5" />
            <button
              onClick={() => { if (newTransKey.trim() && newTransVal.trim()) { saveTranslation(newTransKey.trim(), newTransVal.trim()); setNewTransKey(''); setNewTransVal(''); } }}
              disabled={!newTransKey.trim() || !newTransVal.trim()}
              className="btn-primary text-xs px-3 py-1.5"
            >Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ message, danger, confirmLabel, onConfirm, onCancel }: { message: string; danger?: boolean; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, onCancel);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel} role="dialog" aria-modal="true">
      <div ref={dialogRef} onClick={e => e.stopPropagation()} className="card max-w-sm w-full p-5">
        <p className="text-sm" style={{ color: 'hsl(var(--pt-ink))' }}>{message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            autoFocus
            className="btn-primary text-sm"
            style={danger ? { background: 'hsl(0 70% 50%)', boxShadow: 'none' } : undefined}
          >{confirmLabel || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}
