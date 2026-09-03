import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Trash } from '@phosphor-icons/react';
import api from '../../shared/api';
import { toast } from '../../shared/toast';
import { useFocusTrap } from '../../shared/useFocusTrap';
import {
  MappingRelation,
  RELATION_KIND_OPTIONS,
  flattenProfileData,
  formatRelation,
  normalizeRelation,
  previewRelation,
  statusFromSource,
} from './mappingRelation';

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

interface Condition { key: string; op: string; value?: string; }
interface Rule { when: Condition[]; then: string; }  // then = option text, or 'check' for single checkbox

type FillMode = 'match' | 'always' | 'constant' | 'condition' | 'skip';

interface FieldMapping {
  label?: string;
  type?: string;
  order?: number;
  options?: string[] | null;
  profileKey: string | null;
  relation?: MappingRelation | null;
  fillMode?: FillMode | null;
  rules?: Rule[] | null;
  constantValue?: string | null;
  fallback?: string | null;
  fills: number;
  corrections: number;
  lastSeen: string;
  source?: string;
}

interface PreviewProfileOption {
  id: string;
  name: string | null;
  displayLabel?: string | null;
  phone?: string | null;
}

const OPERATORS: { op: string; label: string; needsValue: boolean }[] = [
  { op: 'eq', label: 'is', needsValue: true },
  { op: 'neq', label: 'is not', needsValue: true },
  { op: 'contains', label: 'contains', needsValue: true },
  { op: 'notEmpty', label: 'exists', needsValue: false },
  { op: 'empty', label: 'is empty', needsValue: false },
];

const PROFILE_KEY_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Identity', keys: ['name', 'first_name', 'middle_name', 'last_name', 'father_name', 'mother_name', 'husband_name', 'dob', 'gender', 'nationality', 'category', 'religion', 'marital_status'] },
  { label: 'Contact', keys: ['phone', 'email', 'email_id'] },
  { label: 'IDs', keys: ['aadhaar_number', 'vid', 'pan_number', 'epic_number'] },
  { label: 'Address', keys: ['pincode', 'state', 'district', 'block', 'village', 'sub_division', 'police_station', 'post_office', 'ward_no', 'city', 'street', 'house_no', 'address', 'permanent_address', 'domicile_state'] },
  { label: 'Eligibility', keys: ['occupation', 'ex_serviceman', 'ews_certificate', 'disability_certificate', 'domicile_certificate', 'income_certificate', 'caste_certificate', 'languages', 'skills'] },
  { label: 'Education (10th)', keys: ['roll_number_10th', 'board_10th', 'passing_year_10th', 'marks_obtained_10th', 'total_marks_10th', 'percentage_10th', 'division_10th', 'school_name', 'certificate_number_10th'] },
  { label: 'Education (12th)', keys: ['roll_number_12th', 'board_12th', 'passing_year_12th', 'marks_obtained_12th', 'total_marks_12th', 'percentage_12th', 'division_12th', 'stream_12th', 'school_name_12th', 'certificate_number_12th'] },
  { label: 'Education (Graduation)', keys: ['roll_number_grad', 'university_name', 'degree', 'passing_year_grad', 'marks_obtained_grad', 'total_marks_grad', 'percentage_grad', 'division_grad', 'registration_number_grad'] },
  { label: 'Education (other)', keys: ['roll_number', 'board_name', 'year_of_passing', 'grade', 'division', 'subject', 'subjects', 'school_name', 'degree_name', 'highest_education_qualification', 'qualification_status'] },
  { label: 'Documents', keys: ['registration_number', 'certificate_number_10th', 'certificate_number_12th'] },
];

const ALL_PROFILE_KEYS: string[] = PROFILE_KEY_GROUPS.flatMap(g => g.keys);

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
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [newTransKey, setNewTransKey] = useState('');
  const [newTransVal, setNewTransVal] = useState('');
  const [confirmState, setConfirmState] = useState<{ message: string; danger?: boolean; confirmLabel?: string; onConfirm: () => void } | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [previewProfiles, setPreviewProfiles] = useState<PreviewProfileOption[]>([]);
  const [previewProfileId, setPreviewProfileId] = useState<string>('');
  const [previewFlat, setPreviewFlat] = useState<Record<string, string>>({});

  useEffect(() => { loadList(); loadTranslations(); loadPreviewProfiles(); }, []);

  async function loadPreviewProfiles() {
    try {
      const r = await api.get('/profiles');
      const rows: PreviewProfileOption[] = Array.isArray(r.data) ? r.data : [];
      setPreviewProfiles(rows);
      if (rows[0]?.id) setPreviewProfileId(rows[0].id);
    } catch {
      /* preview is optional — mappings API may be on a host without /profiles */
    }
  }

  useEffect(() => {
    if (!previewProfileId) { setPreviewFlat({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get('/profiles/' + previewProfileId);
        if (cancelled) return;
        setPreviewFlat(flattenProfileData(r.data?.data || {}));
      } catch {
        if (!cancelled) setPreviewFlat({});
      }
    })();
    return () => { cancelled = true; };
  }, [previewProfileId]);

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

  /** #303 — save profileKey + relation as protected manual binding */
  async function saveBinding(label: string, profileKey: string | null, relation: MappingRelation | null) {
    setSavingKey(label);
    try {
      const body: Record<string, unknown> = {
        profileKey: profileKey || null,
        relation: profileKey ? (relation || { kind: 'identity' }) : null,
      };
      await api.patch('/mappings/' + selected!.formKey + '/' + encodeURIComponent(label), body);
      setFields(prev => ({
        ...prev,
        [label]: {
          ...prev[label],
          profileKey: profileKey || null,
          relation: profileKey ? (relation || { kind: 'identity' }) : null,
          source: 'manual',
        },
      }));
      toast.success('Mapping saved');
      setEditKey(null);
    } catch (e) {
      console.warn('save binding failed', e);
      toast.error('Save failed');
    } finally {
      setSavingKey(null);
    }
  }

  // Save the full rule config for a field (radio/dropdown/checkbox rule builder)
  async function saveFieldConfig(label: string, cfg: Partial<FieldMapping>) {
    setSavingKey(label);
    try {
      await api.patch('/mappings/' + selected!.formKey + '/' + encodeURIComponent(label), {
        profileKey: cfg.profileKey ?? null,
        relation: cfg.profileKey ? (cfg.relation || { kind: 'identity' }) : null,
        fillMode: cfg.fillMode ?? null,
        rules: cfg.rules ?? null,
        constantValue: cfg.constantValue ?? null,
        fallback: cfg.fallback ?? null,
      });
      setFields(prev => ({ ...prev, [label]: { ...prev[label], ...cfg, source: 'manual' } }));
      toast.success('Saved');
    } catch (e) { console.warn('save config failed', e); toast.error('Save failed'); }
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
              <p className="text-[11px] text-gray-500 mt-2">
                AI/learning proposes Source + Relation. Edit only when wrong — manual saves are protected.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              {previewProfiles.length > 0 && (
                <select
                  value={previewProfileId}
                  onChange={(e) => setPreviewProfileId(e.target.value)}
                  className="input-field text-xs py-1.5 max-w-[220px]"
                  title="Profile used for Preview column"
                >
                  {previewProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.displayLabel || p.name || p.phone || p.id.slice(0, 8)}</option>
                  ))}
                </select>
              )}
              <button onClick={() => deleteForm(selected.formKey)} className="btn-ghost text-red-400 text-xs flex items-center gap-1">
                <Trash size={14} /> Delete
              </button>
            </div>
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

        <div className="card overflow-hidden overflow-x-auto">
          <div className="flex items-center px-4 py-3 text-[11px] uppercase tracking-wider text-gray-500 border-b border-white/[0.04] min-w-[720px]">
            <span className="w-5 flex-shrink-0" />
            <div className="flex-1 min-w-[140px] ml-3">Form field</div>
            <div className="w-28 flex-shrink-0">Source</div>
            <div className="w-32 flex-shrink-0">Relation</div>
            <div className="w-28 flex-shrink-0">Preview</div>
            <div className="w-24 flex-shrink-0">Status</div>
            <div className="w-28 flex-shrink-0" />
          </div>
          <div className="divide-y divide-white/[0.04] min-w-[720px]">
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
              const grp = getTypeGroup(type);
              const isRuleType = grp === 'radio' || grp === 'dropdown' || grp === 'checkbox';
              const rel = normalizeRelation(m.relation, m.profileKey);
              const preview = previewRelation(previewFlat, m.profileKey, rel);
              const status = statusFromSource(m.source);
              const isOpen = expandedKey === key;
              return (
                <div key={key} className={`px-4 py-2.5 hover:bg-white/[0.02] transition ${!m.profileKey ? 'bg-yellow-500/[0.03]' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm flex-shrink-0 w-5 text-center ${typeColor}`} title={typeLabel}>{typeIcon}</span>
                    <div className="flex-1 min-w-[140px]">
                      <div className="text-sm text-gray-200 truncate" title={display}>{display}</div>
                    </div>
                    <div className="w-28 flex-shrink-0 text-xs text-gray-300 truncate font-mono" title={m.profileKey || ''}>
                      {m.profileKey || <span className="text-gray-600">—</span>}
                    </div>
                    <div className="w-32 flex-shrink-0 text-xs text-gray-300 truncate font-mono" title={formatRelation(rel)}>
                      {m.profileKey ? formatRelation(rel) : <span className="text-gray-600">—</span>}
                    </div>
                    <div className="w-28 flex-shrink-0 text-xs text-gray-400 truncate" title={preview || ''}>
                      {preview != null ? preview : <span className="text-gray-600">{m.profileKey ? 'n/a' : '—'}</span>}
                    </div>
                    <div className={`w-24 flex-shrink-0 text-xs ${status.tone}`}>{status.label}</div>
                    <div className="w-28 flex-shrink-0 flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditKey(key)}
                        className="text-[11px] text-[#0a84ff] hover:underline px-1"
                        disabled={savingKey === key}
                      >Edit</button>
                      {isRuleType && (
                        <button
                          onClick={() => setExpandedKey(isOpen ? null : key)}
                          className="text-[11px] text-gray-500 hover:text-gray-300 px-1"
                          title="Choice rules (legacy fillMode)"
                        >{isOpen ? 'Rules▴' : 'Rules'}</button>
                      )}
                      <button onClick={() => deleteField(key)} className="text-gray-600 hover:text-red-400 text-lg leading-none" title="Remove">×</button>
                    </div>
                  </div>
                  {hasOptions && (
                    <div className="ml-8 mt-1.5 flex flex-wrap gap-1.5">
                      {m.options!.slice(0, 8).map((opt, i) => (
                        <span key={i} className={`inline-block px-2 py-0.5 rounded text-[11px] ${typeColor} bg-white/[0.03] border border-white/[0.06]`}>{opt}</span>
                      ))}
                      {m.options!.length > 8 && <span className="text-[11px] text-gray-600">+{m.options!.length - 8} more</span>}
                    </div>
                  )}
                  {isOpen && isRuleType && (
                    <FieldRuleEditor
                      typeGroup={grp}
                      mapping={m}
                      saving={savingKey === key}
                      onSave={(cfg) => saveFieldConfig(key, cfg)}
                      onClose={() => setExpandedKey(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {filteredEntries.length === 0 && <div className="p-8 text-center text-gray-500 text-sm">{typeFilter === 'all' ? 'No fields recorded yet.' : 'No fields of this type.'}</div>}
        </div>
        {editKey && fields[editKey] && (
          <BindingEditor
            fieldKey={editKey}
            mapping={fields[editKey]}
            saving={savingKey === editKey}
            previewFlat={previewFlat}
            onSave={(pk, rel) => saveBinding(editKey, pk, rel)}
            onClose={() => setEditKey(null)}
          />
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
          Forms discovered from fills. AI proposes Source + Relation; open a form to review and correct.
          Manual edits are protected and reused on the next fill.
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

function ConditionRows({ conditions, onChange }: { conditions: Condition[]; onChange: (c: Condition[]) => void; }) {
  const update = (i: number, patch: Partial<Condition>) =>
    onChange(conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-1.5">
      {conditions.map((c, i) => {
        const opDef = OPERATORS.find(o => o.op === c.op) || OPERATORS[0];
        return (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 w-8 flex-shrink-0">{i === 0 ? 'IF' : 'AND'}</span>
            <select value={c.key} onChange={e => update(i, { key: e.target.value })} className="input-field text-xs py-1 flex-1 min-w-0">
              <option value="">field…</option>
              {ALL_PROFILE_KEYS.map(k => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
            </select>
            <select value={c.op} onChange={e => update(i, { op: e.target.value })} className="input-field text-xs py-1 w-24 flex-shrink-0">
              {OPERATORS.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            {opDef.needsValue && (
              <input value={c.value || ''} onChange={e => update(i, { value: e.target.value })} placeholder="value" className="input-field text-xs py-1 flex-1 min-w-0" />
            )}
            <button onClick={() => onChange(conditions.filter((_, idx) => idx !== i))} className="text-gray-600 hover:text-red-400 flex-shrink-0" title="Remove condition">×</button>
          </div>
        );
      })}
      <button onClick={() => onChange([...conditions, { key: '', op: 'eq', value: '' }])} className="text-[11px] text-[#0a84ff] hover:underline">+ AND condition</button>
    </div>
  );
}

function FieldRuleEditor({ typeGroup, mapping, saving, onSave, onClose }: {
  typeGroup: string;
  mapping: FieldMapping;
  saving: boolean;
  onSave: (cfg: Partial<FieldMapping>) => void;
  onClose: () => void;
}) {
  const options = mapping.options || [];
  const isCheckbox = typeGroup === 'checkbox';
  const isMulti = mapping.type === 'checkbox-group' || (isCheckbox && options.length > 1);
  const [mode, setMode] = useState<FillMode>(
    (mapping.fillMode as FillMode) || (mapping.profileKey ? 'match' : (isCheckbox && !isMulti ? 'always' : 'condition'))
  );
  const [profileKey, setProfileKey] = useState(mapping.profileKey || '');
  const [constantValue, setConstantValue] = useState(mapping.constantValue || '');
  const [rules, setRules] = useState<Rule[]>(
    mapping.rules && mapping.rules.length
      ? mapping.rules
      : [{ when: [{ key: '', op: 'eq', value: '' }], then: isCheckbox ? 'check' : (options[0] || '') }]
  );
  const [fallback, setFallback] = useState(mapping.fallback || '');

  const modes: { m: FillMode; label: string }[] = isCheckbox
    ? (isMulti
      ? [{ m: 'match', label: 'Match list' }, { m: 'condition', label: 'Per-option rules' }, { m: 'skip', label: 'Skip' }]
      : [{ m: 'always', label: 'Always check' }, { m: 'condition', label: 'Check if…' }, { m: 'skip', label: 'Skip' }])
    : [{ m: 'match', label: 'Match field' }, { m: 'constant', label: 'Constant' }, { m: 'condition', label: 'Condition' }, { m: 'skip', label: 'Skip' }];

  const setRuleConds = (ri: number, conds: Condition[]) => setRules(rs => rs.map((r, i) => i === ri ? { ...r, when: conds } : r));
  const setRuleThen = (ri: number, then: string) => setRules(rs => rs.map((r, i) => i === ri ? { ...r, then } : r));
  const addRule = () => setRules(rs => [...rs, { when: [{ key: '', op: 'eq', value: '' }], then: options[0] || '' }]);
  const removeRule = (ri: number) => setRules(rs => rs.filter((_, i) => i !== ri));

  function save() {
    const cfg: Partial<FieldMapping> = { fillMode: mode, profileKey: null, constantValue: null, rules: null, fallback: null };
    if (mode === 'match') cfg.profileKey = profileKey || null;
    else if (mode === 'constant') cfg.constantValue = constantValue || null;
    else if (mode === 'condition') {
      cfg.rules = isCheckbox && !isMulti ? [{ when: rules[0]?.when || [], then: 'check' }] : rules;
      cfg.fallback = fallback || null;
    }
    onSave(cfg);
    onClose();
  }

  return (
    <div className="ml-8 mt-2 mb-1 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] space-y-3">
      {/* Mode selector */}
      <div className="flex gap-1.5 flex-wrap">
        {modes.map(x => (
          <button key={x.m} onClick={() => setMode(x.m)}
            className={`px-2.5 py-1 rounded-full text-[11px] transition ${mode === x.m ? 'bg-[#0a84ff] text-white' : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.1]'}`}>
            {x.label}
          </button>
        ))}
      </div>

      {mode === 'match' && (
        <div>
          <label className="text-[11px] text-gray-500 block mb-1">
            {isMulti ? 'Check each option contained in this profile list:' : 'Fill from profile field (option matched by value):'}
          </label>
          <select value={profileKey} onChange={e => setProfileKey(e.target.value)} className="input-field text-xs py-1.5 w-full">
            <option value="">field…</option>
            {PROFILE_KEY_GROUPS.map(g => (
              <optgroup key={g.label} label={g.label}>{g.keys.map(k => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}</optgroup>
            ))}
          </select>
        </div>
      )}

      {mode === 'constant' && (
        <div>
          <label className="text-[11px] text-gray-500 block mb-1">Always select:</label>
          {options.length ? (
            <select value={constantValue} onChange={e => setConstantValue(e.target.value)} className="input-field text-xs py-1.5 w-full">
              <option value="">option…</option>
              {options.map((o, i) => <option key={i} value={o}>{o}</option>)}
            </select>
          ) : (
            <input value={constantValue} onChange={e => setConstantValue(e.target.value)} placeholder="value" className="input-field text-xs py-1.5 w-full" />
          )}
        </div>
      )}

      {mode === 'always' && (
        <p className="text-[11px] text-gray-500">This box is always checked (declarations, agreements).</p>
      )}

      {mode === 'skip' && (
        <p className="text-[11px] text-gray-500">This field is left untouched during autofill.</p>
      )}

      {mode === 'condition' && isCheckbox && !isMulti && (
        <div>
          <label className="text-[11px] text-gray-500 block mb-1.5">Check this box when all are true:</label>
          <ConditionRows conditions={rules[0]?.when || []} onChange={c => setRuleConds(0, c)} />
        </div>
      )}

      {mode === 'condition' && (!isCheckbox || isMulti) && (
        <div className="space-y-2.5">
          {rules.map((r, ri) => (
            <div key={ri} className="p-2 rounded bg-black/20 border border-white/[0.05] space-y-1.5">
              <ConditionRows conditions={r.when} onChange={c => setRuleConds(ri, c)} />
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] text-gray-500 w-8 flex-shrink-0">{isMulti ? 'CHECK' : 'THEN'}</span>
                <select value={r.then} onChange={e => setRuleThen(ri, e.target.value)} className="input-field text-xs py-1 flex-1">
                  <option value="">select option…</option>
                  {options.map((o, i) => <option key={i} value={o}>{o}</option>)}
                </select>
                {rules.length > 1 && <button onClick={() => removeRule(ri)} className="text-gray-600 hover:text-red-400 flex-shrink-0" title="Remove rule">×</button>}
              </div>
            </div>
          ))}
          <button onClick={addRule} className="text-[11px] text-[#0a84ff] hover:underline">+ {isMulti ? 'option rule' : 'rule'}</button>
          {!isMulti && (
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[10px] text-gray-500 w-14 flex-shrink-0">OTHERWISE</span>
              <select value={fallback} onChange={e => setFallback(e.target.value)} className="input-field text-xs py-1 flex-1">
                <option value="">— nothing —</option>
                {options.map((o, i) => <option key={i} value={o}>{o}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="btn-secondary text-xs px-3 py-1">Cancel</button>
        <button onClick={save} disabled={saving} className="btn-primary text-xs px-3 py-1">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function BindingEditor({
  fieldKey,
  mapping,
  saving,
  previewFlat,
  onSave,
  onClose,
}: {
  fieldKey: string;
  mapping: FieldMapping;
  saving: boolean;
  previewFlat: Record<string, string>;
  onSave: (profileKey: string | null, relation: MappingRelation | null) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, onClose);
  const [profileKey, setProfileKey] = useState(mapping.profileKey || '');
  const initial = normalizeRelation(mapping.relation, mapping.profileKey);
  const [kind, setKind] = useState(initial.kind);
  const [n, setN] = useState(String(initial.n ?? 4));
  const [part, setPart] = useState(initial.part || 'day');

  const relation: MappingRelation | null = !profileKey
    ? null
    : kind === 'last_n' || kind === 'first_n'
      ? { kind, n: Math.max(1, parseInt(n, 10) || 1) }
      : kind === 'date_part' || kind === 'name_part'
        ? { kind, part }
        : { kind };

  const preview = previewRelation(previewFlat, profileKey || null, relation);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div ref={dialogRef} onClick={(e) => e.stopPropagation()} className="card max-w-md w-full p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Edit mapping</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{mapping.label || fieldKey}</p>
        </div>

        <div>
          <label className="text-[11px] text-gray-500 block mb-1">Source (profile atom)</label>
          <select value={profileKey} onChange={(e) => setProfileKey(e.target.value)} className="input-field text-xs w-full py-1.5">
            <option value="">— none / clear —</option>
            {PROFILE_KEY_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.keys.map((k) => (
                  <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {profileKey && (
          <>
            <div>
              <label className="text-[11px] text-gray-500 block mb-1">Relation</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as MappingRelation['kind'])}
                className="input-field text-xs w-full py-1.5"
              >
                {RELATION_KIND_OPTIONS.map((o) => (
                  <option key={o.kind} value={o.kind}>{o.label}</option>
                ))}
              </select>
            </div>

            {(kind === 'last_n' || kind === 'first_n') && (
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">N</label>
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={n}
                  onChange={(e) => setN(e.target.value)}
                  className="input-field text-xs w-24 py-1.5"
                />
              </div>
            )}

            {kind === 'date_part' && (
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Part</label>
                <select value={part} onChange={(e) => setPart(e.target.value)} className="input-field text-xs w-full py-1.5">
                  <option value="day">day</option>
                  <option value="month">month</option>
                  <option value="year">year</option>
                </select>
              </div>
            )}

            {kind === 'name_part' && (
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Part</label>
                <select value={part} onChange={(e) => setPart(e.target.value)} className="input-field text-xs w-full py-1.5">
                  <option value="first">first</option>
                  <option value="middle">middle</option>
                  <option value="last">last</option>
                </select>
              </div>
            )}

            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">Preview</div>
              <div className="text-sm text-gray-200 font-mono mt-0.5 truncate">
                {preview != null ? preview : <span className="text-gray-600">n/a (pick a preview profile or check source value)</span>}
              </div>
              <div className="text-[11px] text-gray-500 mt-1 font-mono">{formatRelation(relation)}</div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button
            onClick={() => onSave(profileKey || null, relation)}
            disabled={saving}
            className="btn-primary text-sm"
          >{saving ? 'Saving…' : 'Save'}</button>
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
