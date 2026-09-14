import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Brain, Trash, ArrowClockwise } from '@phosphor-icons/react';
import type { Config, FormMappingSummary } from '../api';
import {
  ApiError,
  deleteMappingField,
  deleteMappingForm,
  fetchMappingForm,
  fetchMappingList,
  fetchMappingTranslations,
  patchMappingField,
  patchMappingTranslations,
} from '../api';
import {
  formatRelation,
  normalizeRelation,
  previewRelation,
  RELATION_KIND_OPTIONS,
  statusFromSource,
  type MappingRelation,
} from '../lib/mappingRelation';

interface Condition { key: string; op: string; value?: string; }
interface Rule { when: Condition[]; then: string; }
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
  { label: 'Bank', keys: ['bank_account_number', 'ifsc_code', 'cif_number', 'bank_name', 'branch_name', 'account_holder_name'] },
  { label: 'Travel', keys: ['departure', 'arrival', 'from_station', 'to_station', 'journey_date', 'return_date', 'travel_class', 'quota', 'passenger_count'] },
  { label: 'Eligibility', keys: ['occupation', 'ex_serviceman', 'ews_certificate', 'disability_certificate', 'domicile_certificate', 'income_certificate', 'caste_certificate', 'languages', 'skills'] },
  { label: 'Education (10th)', keys: ['roll_number_10th', 'board_10th', 'passing_year_10th', 'marks_obtained_10th', 'total_marks_10th', 'percentage_10th', 'division_10th', 'school_name', 'certificate_number_10th'] },
  { label: 'Education (12th)', keys: ['roll_number_12th', 'board_12th', 'passing_year_12th', 'marks_obtained_12th', 'total_marks_12th', 'percentage_12th', 'division_12th', 'stream_12th', 'school_name_12th', 'certificate_number_12th'] },
  { label: 'Education (Graduation)', keys: ['roll_number_grad', 'university_name', 'degree', 'passing_year_grad', 'marks_obtained_grad', 'total_marks_grad', 'percentage_grad', 'division_grad', 'registration_number_grad'] },
  { label: 'Education (other)', keys: ['roll_number', 'board_name', 'year_of_passing', 'grade', 'division', 'subject', 'subjects', 'school_name', 'degree_name', 'highest_education_qualification', 'qualification_status'] },
  { label: 'Documents', keys: ['registration_number', 'certificate_number_10th', 'certificate_number_12th'] },
];

const ALL_PROFILE_KEYS: string[] = PROFILE_KEY_GROUPS.flatMap((g) => g.keys);

function favicon(host: string | null) {
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
}

function getTypeGroup(t: string) {
  if (!t || t === 'text' || t === 'textarea' || t === 'number' || t === 'email' || t === 'tel') return 'text';
  if (t === 'dropdown' || t === 'select' || t === 'mat-select' || t === 'ng-dropdown') return 'dropdown';
  if (t === 'radio' || t === 'radio-group' || t === 'mat-radio') return 'radio';
  if (t === 'checkbox' || t === 'checkbox-group' || t === 'checkbox-agreement' || t === 'mat-checkbox') return 'checkbox';
  if (t === 'date') return 'date';
  return 'text';
}

function typeMeta(type: string) {
  const grp = getTypeGroup(type);
  if (grp === 'dropdown') return { icon: '▾', label: 'Dropdown', color: 'hsl(270 45% 42%)' };
  if (grp === 'radio') return { icon: '◉', label: 'Radio', color: 'hsl(var(--marigold-deep))' };
  if (grp === 'checkbox') return { icon: '☑', label: 'Checkbox', color: 'hsl(var(--good))' };
  if (grp === 'date') return { icon: '📅', label: 'Date', color: 'hsl(200 55% 40%)' };
  return { icon: '⎽', label: 'Text', color: 'hsl(var(--muted))' };
}

export function MappingsPanel({ cfg }: { cfg: Config }) {
  const [forms, setForms] = useState<FormMappingSummary[]>([]);
  const [selected, setSelected] = useState<FormMappingSummary | null>(null);
  const [fields, setFields] = useState<Record<string, FieldMapping>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [msg, setMsg] = useState('');
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [newTransKey, setNewTransKey] = useState('');
  const [newTransVal, setNewTransVal] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [list, trans] = await Promise.all([
        fetchMappingList(cfg),
        fetchMappingTranslations(cfg).catch(() => ({})),
      ]);
      setForms(list);
      setTranslations(trans || {});
    } catch (e) {
      setError((e as ApiError).message);
      setForms([]);
    } finally {
      setLoading(false);
    }
  }, [cfg]);

  useEffect(() => { void loadList(); }, [loadList]);

  async function openForm(f: FormMappingSummary) {
    setSelected(f);
    setMsg('');
    setExpandedKey(null);
    setTypeFilter('all');
    try {
      const data = await fetchMappingForm(cfg, f.formKey);
      const cleaned: Record<string, FieldMapping> = {};
      for (const [k, v] of Object.entries(data || {})) {
        if (k === '_meta') continue;
        cleaned[k] = v as FieldMapping;
      }
      setFields(cleaned);
    } catch (e) {
      setError((e as ApiError).message);
      setFields({});
    }
  }

  async function saveBinding(label: string, profileKey: string | null, relation: MappingRelation | null) {
    if (!selected) return;
    setSavingKey(label); setMsg('');
    try {
      await patchMappingField(cfg, selected.formKey, label, {
        profileKey: profileKey || null,
        relation: profileKey ? (relation || { kind: 'identity' }) : null,
      });
      setFields((prev) => ({
        ...prev,
        [label]: {
          ...prev[label],
          profileKey: profileKey || null,
          relation: profileKey ? (relation || { kind: 'identity' }) : null,
          source: 'manual',
        },
      }));
      setMsg('Mapping saved');
      setEditKey(null);
    } catch (e) {
      setMsg((e as ApiError).message || 'Save failed');
    } finally {
      setSavingKey(null);
    }
  }

  async function saveFieldConfig(label: string, cfgPatch: Partial<FieldMapping>) {
    if (!selected) return;
    setSavingKey(label); setMsg('');
    try {
      await patchMappingField(cfg, selected.formKey, label, {
        profileKey: cfgPatch.profileKey ?? null,
        relation: cfgPatch.profileKey ? (cfgPatch.relation || { kind: 'identity' }) : null,
        fillMode: cfgPatch.fillMode ?? null,
        rules: cfgPatch.rules ?? null,
        constantValue: cfgPatch.constantValue ?? null,
        fallback: cfgPatch.fallback ?? null,
      });
      setFields((prev) => ({
        ...prev,
        [label]: { ...prev[label], ...cfgPatch, source: 'manual' },
      }));
      setMsg('Rules saved');
    } catch (e) {
      setMsg((e as ApiError).message || 'Save failed');
    } finally {
      setSavingKey(null);
    }
  }

  async function removeField(label: string) {
    if (!selected || !window.confirm('Remove this field mapping?')) return;
    try {
      await deleteMappingField(cfg, selected.formKey, label);
      setFields((prev) => {
        const next = { ...prev };
        delete next[label];
        return next;
      });
      if (expandedKey === label) setExpandedKey(null);
    } catch (e) {
      setMsg((e as ApiError).message || 'Delete failed');
    }
  }

  async function removeForm(formKey: string) {
    if (!window.confirm('Remove ALL mappings for this form? This cannot be undone.')) return;
    try {
      await deleteMappingForm(cfg, formKey);
      setForms((prev) => prev.filter((f) => f.formKey !== formKey));
      if (selected?.formKey === formKey) {
        setSelected(null);
        setFields({});
      }
    } catch (e) {
      setMsg((e as ApiError).message || 'Delete failed');
    }
  }

  async function saveTranslation(key: string, value: string) {
    try {
      await patchMappingTranslations(cfg, { [key]: value });
      setTranslations((prev) => ({ ...prev, [key]: value }));
    } catch (e) {
      setMsg((e as ApiError).message || 'Failed to save translation');
    }
  }

  async function removeTranslation(key: string) {
    try {
      await patchMappingTranslations(cfg, { [key]: null });
      setTranslations((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
    } catch (e) {
      setMsg((e as ApiError).message || 'Failed to remove');
    }
  }

  if (selected) {
    const fieldEntries = Object.entries(fields).sort((a, b) => {
      const ao = a[1].order, bo = b[1].order;
      if (ao !== undefined && bo !== undefined) return ao - bo;
      if (ao !== undefined) return -1;
      if (bo !== undefined) return 1;
      return a[0].localeCompare(b[0]);
    });

    const typeCounts: Record<string, number> = { all: fieldEntries.length };
    for (const [, m] of fieldEntries) {
      const g = getTypeGroup(m.type || 'text');
      typeCounts[g] = (typeCounts[g] || 0) + 1;
    }

    const filteredEntries = typeFilter === 'all'
      ? fieldEntries
      : fieldEntries.filter(([, m]) => getTypeGroup(m.type || 'text') === typeFilter);

    const mapped = fieldEntries.filter(([, m]) => m.profileKey || m.fillMode).length;
    const total = fieldEntries.length;
    const pct = total ? Math.round((mapped / total) * 100) : 0;

    return (
      <div>
        <button className="btn" onClick={() => setSelected(null)} style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} /> All forms
        </button>

        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div className="row" style={{ gap: 12, minWidth: 0 }}>
              {favicon(selected.hostname) && (
                <img src={favicon(selected.hostname)!} alt="" width={36} height={36} style={{ borderRadius: 8, background: '#fff', padding: 2 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <h2 className="display" style={{ fontSize: 17, fontWeight: 700 }}>
                  {selected.title || selected.hostname || 'Unknown form'}
                </h2>
                {selected.title && selected.hostname && (
                  <div className="muted" style={{ fontSize: 12 }}>{selected.hostname}</div>
                )}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {total} fields · {mapped} configured · {selected.fills} fills
                </div>
              </div>
            </div>
            <button className="btn" onClick={() => removeForm(selected.formKey)} style={{ color: 'hsl(var(--danger))', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Trash size={14} /> Delete
            </button>
          </div>
          <div style={{ marginTop: 12, height: 6, borderRadius: 99, background: 'hsl(var(--border))', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: pct === 100 ? 'hsl(var(--good))' : pct > 50 ? 'hsl(210 60% 45%)' : 'hsl(var(--marigold))',
            }} />
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            Edit Source + Relation for text fields. Use <strong>Rules</strong> on dropdown / radio / checkbox fields to pick options and conditions.
          </p>
          {msg && <p style={{ fontSize: 12, marginTop: 6, color: 'hsl(var(--good))' }}>{msg}</p>}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'text', label: 'Text' },
            { key: 'dropdown', label: 'Dropdown' },
            { key: 'radio', label: 'Radio' },
            { key: 'checkbox', label: 'Checkbox' },
            { key: 'date', label: 'Date' },
          ].filter((t) => typeCounts[t.key]).map((t) => (
            <button
              key={t.key}
              className="btn"
              onClick={() => setTypeFilter(t.key)}
              style={{
                fontSize: 12,
                padding: '4px 12px',
                borderRadius: 999,
                background: typeFilter === t.key ? 'hsl(var(--marigold))' : undefined,
                borderColor: typeFilter === t.key ? 'hsl(var(--marigold-deep))' : undefined,
                color: typeFilter === t.key ? '#1a1205' : undefined,
                fontWeight: typeFilter === t.key ? 700 : undefined,
              }}
            >
              {t.label} <span className="muted" style={{ marginLeft: 4 }}>{typeCounts[t.key]}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          {filteredEntries.map(([key, m]) => {
            const display = m.label || key.replace(/_/g, ' ');
            const type = m.type || 'text';
            const grp = getTypeGroup(type);
            const meta = typeMeta(type);
            const isRuleType = grp === 'radio' || grp === 'dropdown' || grp === 'checkbox';
            const rel = normalizeRelation(m.relation, m.profileKey);
            const status = statusFromSource(m.source);
            const isOpen = expandedKey === key;
            const hasOptions = !!(m.options && m.options.length > 0);

            return (
              <div
                key={key}
                className="card"
                style={{
                  padding: '10px 12px',
                  background: !m.profileKey && !m.fillMode ? 'hsl(45 90% 50% / 0.06)' : undefined,
                }}
              >
                <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span title={meta.label} style={{ color: meta.color, width: 18, textAlign: 'center', flexShrink: 0 }}>{meta.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{display}</div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2, fontFamily: 'var(--mono)' }}>
                          {m.profileKey || (m.fillMode ? `mode:${m.fillMode}` : '—')}
                          {' · '}
                          {m.profileKey ? formatRelation(rel) : '—'}
                          {' · '}
                          <span style={{ color: status.tone.includes('emerald') || status.label === 'Manual' ? 'hsl(var(--good))' : undefined }}>
                            {status.label}
                          </span>
                          {m.fillMode ? ` · ${m.fillMode}` : ''}
                          {m.constantValue ? ` · const:${m.constantValue}` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      className="btn"
                      style={{ fontSize: 12, padding: '4px 10px' }}
                      disabled={savingKey === key}
                      onClick={() => setEditKey(key)}
                    >Edit</button>
                    {isRuleType && (
                      <button
                        className="btn"
                        style={{
                          fontSize: 12,
                          padding: '4px 10px',
                          background: isOpen ? 'hsl(210 60% 50% / 0.12)' : undefined,
                          borderColor: isOpen ? 'hsl(210 60% 45%)' : undefined,
                        }}
                        onClick={() => setExpandedKey(isOpen ? null : key)}
                        title="Choice rules (fillMode / options)"
                      >{isOpen ? 'Rules▴' : 'Rules'}</button>
                    )}
                    <button
                      className="btn"
                      style={{ fontSize: 12, padding: '4px 8px', color: 'hsl(var(--danger))' }}
                      onClick={() => removeField(key)}
                    >×</button>
                  </div>
                </div>

                {hasOptions && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, marginLeft: 26 }}>
                    {m.options!.slice(0, 12).map((opt, i) => (
                      <span key={i} className="pill" style={{ color: meta.color }}>{opt}</span>
                    ))}
                    {m.options!.length > 12 && (
                      <span className="muted" style={{ fontSize: 11 }}>+{m.options!.length - 12} more</span>
                    )}
                  </div>
                )}

                {isOpen && isRuleType && (
                  <FieldRuleEditor
                    typeGroup={grp}
                    mapping={m}
                    saving={savingKey === key}
                    onSave={(cfgPatch) => saveFieldConfig(key, cfgPatch)}
                    onClose={() => setExpandedKey(null)}
                  />
                )}
              </div>
            );
          })}
          {filteredEntries.length === 0 && (
            <p className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
              {typeFilter === 'all' ? 'No fields recorded yet.' : 'No fields of this type.'}
            </p>
          )}
        </div>

        {editKey && fields[editKey] && (
          <BindingEditor
            fieldKey={editKey}
            mapping={fields[editKey]}
            saving={savingKey === editKey}
            onSave={(pk, rel) => saveBinding(editKey, pk, rel)}
            onClose={() => setEditKey(null)}
          />
        )}
      </div>
    );
  }

  const filtered = forms.filter((f) =>
    !search
    || f.formKey.toLowerCase().includes(search.toLowerCase())
    || (f.hostname || '').toLowerCase().includes(search.toLowerCase())
    || (f.title || '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section>
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 10 }}>
          <Brain size={20} weight="duotone" style={{ color: 'hsl(var(--marigold-deep))' }} />
          <h2 className="display" style={{ fontSize: 17, fontWeight: 700 }}>Form Mappings</h2>
          <span className="muted num" style={{ fontSize: 12 }}>{forms.length}</span>
        </div>
        <button className="btn" onClick={() => loadList()} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <ArrowClockwise size={14} weight="bold" />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        Global taught mappings used by fill — including dropdown/radio rules. Open a form to review Source, Relation, options, and Rules.
      </p>

      {error && <p className="banner" role="alert" style={{ marginBottom: 12 }}>{error}</p>}
      {msg && <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{msg}</p>}

      <input
        className="input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search hostname, formKey, or title…"
        style={{ width: '100%', marginBottom: 12 }}
      />

      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((f) => {
            const pct = f.fieldCount ? Math.round(((f.fieldCount - f.unmapped) / f.fieldCount) * 100) : 0;
            return (
              <div key={f.formKey} className="card" onClick={() => openForm(f)}
                style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={favicon(f.hostname) || ''}
                  alt=""
                  width={28}
                  height={28}
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                  style={{ borderRadius: 6, background: '#fff', padding: 2, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{f.title || f.hostname || '(unknown)'}</div>
                  {f.title && f.hostname && <div className="muted" style={{ fontSize: 11 }}>{f.hostname}</div>}
                </div>
                <div className="row" style={{ gap: 8, flexShrink: 0 }}>
                  <div style={{ width: 72, height: 5, borderRadius: 99, background: 'hsl(var(--border))', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: pct === 100 ? 'hsl(var(--good))' : 'hsl(210 60% 45%)',
                    }} />
                  </div>
                  <span className="muted num" style={{ fontSize: 11 }}>
                    {f.fieldCount - f.unmapped}/{f.fieldCount}
                  </span>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="state" style={{ padding: '40px 16px' }}>
              <Brain size={32} weight="duotone" style={{ color: 'hsl(var(--muted))', margin: '0 auto 8px' }} />
              <h3>{search ? 'No forms match' : 'No forms recorded yet'}</h3>
              <p className="muted" style={{ marginTop: 4 }}>
                {search ? `Nothing matches "${search}"` : 'Visit a form via the extension to seed mappings.'}
              </p>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 28 }}>
        <h3 className="display" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Value Translations</h3>
        <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          When a profile value doesn&apos;t match a form option (e.g. OBC → Other Backward Class), add a global translation.
        </p>
        <div className="card" style={{ overflow: 'hidden' }}>
          {Object.entries(translations).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => (
            <div key={key} className="row between" style={{ padding: '8px 12px', borderBottom: '1px solid hsl(var(--border-soft))' }}>
              <div style={{ fontSize: 13 }}>
                <code>{key}</code> <span className="muted">→</span> {val}
              </div>
              <button className="btn" style={{ color: 'hsl(var(--danger))', padding: '2px 8px' }} onClick={() => removeTranslation(key)}>×</button>
            </div>
          ))}
          {Object.keys(translations).length === 0 && (
            <div className="muted" style={{ padding: 16, textAlign: 'center', fontSize: 13 }}>No translations yet.</div>
          )}
          <div className="row" style={{ padding: 12, gap: 8, flexWrap: 'wrap' }}>
            <input className="input" value={newTransKey} onChange={(e) => setNewTransKey(e.target.value)}
              placeholder="Profile value (e.g. OBC)" style={{ flex: 1, minWidth: 120 }} />
            <span className="muted">→</span>
            <input className="input" value={newTransVal} onChange={(e) => setNewTransVal(e.target.value)}
              placeholder="Form option text" style={{ flex: 1, minWidth: 140 }} />
            <button
              className="btn btn--primary"
              disabled={!newTransKey.trim() || !newTransVal.trim()}
              onClick={() => {
                if (newTransKey.trim() && newTransVal.trim()) {
                  void saveTranslation(newTransKey.trim(), newTransVal.trim());
                  setNewTransKey('');
                  setNewTransVal('');
                }
              }}
            >Add</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConditionRows({ conditions, onChange }: { conditions: Condition[]; onChange: (c: Condition[]) => void }) {
  const update = (i: number, patch: Partial<Condition>) =>
    onChange(conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {conditions.map((c, i) => {
        const opDef = OPERATORS.find((o) => o.op === c.op) || OPERATORS[0];
        return (
          <div key={i} className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 10, width: 28, flexShrink: 0 }}>{i === 0 ? 'IF' : 'AND'}</span>
            <select className="input" value={c.key} onChange={(e) => update(i, { key: e.target.value })} style={{ flex: 1, minWidth: 120, fontSize: 12, padding: '4px 8px' }}>
              <option value="">field…</option>
              {ALL_PROFILE_KEYS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
            </select>
            <select className="input" value={c.op} onChange={(e) => update(i, { op: e.target.value })} style={{ width: 96, fontSize: 12, padding: '4px 8px' }}>
              {OPERATORS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            {opDef.needsValue && (
              <input className="input" value={c.value || ''} onChange={(e) => update(i, { value: e.target.value })}
                placeholder="value" style={{ flex: 1, minWidth: 80, fontSize: 12, padding: '4px 8px' }} />
            )}
            <button className="btn" style={{ padding: '2px 8px', color: 'hsl(var(--danger))' }}
              onClick={() => onChange(conditions.filter((_, idx) => idx !== i))}>×</button>
          </div>
        );
      })}
      <button className="btn" style={{ fontSize: 11, justifySelf: 'start', padding: '2px 8px' }}
        onClick={() => onChange([...conditions, { key: '', op: 'eq', value: '' }])}>+ AND condition</button>
    </div>
  );
}

function FieldRuleEditor({
  typeGroup,
  mapping,
  saving,
  onSave,
  onClose,
}: {
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
    (mapping.fillMode as FillMode) || (mapping.profileKey ? 'match' : (isCheckbox && !isMulti ? 'always' : 'condition')),
  );
  const [profileKey, setProfileKey] = useState(mapping.profileKey || '');
  const [constantValue, setConstantValue] = useState(mapping.constantValue || '');
  const [rules, setRules] = useState<Rule[]>(
    mapping.rules && mapping.rules.length
      ? mapping.rules
      : [{ when: [{ key: '', op: 'eq', value: '' }], then: isCheckbox ? 'check' : (options[0] || '') }],
  );
  const [fallback, setFallback] = useState(mapping.fallback || '');

  const modes: { m: FillMode; label: string }[] = isCheckbox
    ? (isMulti
      ? [{ m: 'match', label: 'Match list' }, { m: 'condition', label: 'Per-option rules' }, { m: 'skip', label: 'Skip' }]
      : [{ m: 'always', label: 'Always check' }, { m: 'condition', label: 'Check if…' }, { m: 'skip', label: 'Skip' }])
    : [{ m: 'match', label: 'Match field' }, { m: 'constant', label: 'Constant' }, { m: 'condition', label: 'Condition' }, { m: 'skip', label: 'Skip' }];

  const setRuleConds = (ri: number, conds: Condition[]) => setRules((rs) => rs.map((r, i) => (i === ri ? { ...r, when: conds } : r)));
  const setRuleThen = (ri: number, then: string) => setRules((rs) => rs.map((r, i) => (i === ri ? { ...r, then } : r)));
  const addRule = () => setRules((rs) => [...rs, { when: [{ key: '', op: 'eq', value: '' }], then: options[0] || '' }]);
  const removeRule = (ri: number) => setRules((rs) => rs.filter((_, i) => i !== ri));

  function save() {
    const cfg: Partial<FieldMapping> = { fillMode: mode, profileKey: null, constantValue: null, rules: null, fallback: null };
    if (mode === 'match') cfg.profileKey = profileKey || null;
    else if (mode === 'constant') cfg.constantValue = constantValue || null;
    else if (mode === 'condition') {
      cfg.rules = isCheckbox && !isMulti ? [{ when: rules[0]?.when || [], then: 'check' }] : rules;
      cfg.fallback = fallback || null;
    } else if (mode === 'always') {
      cfg.fillMode = 'always';
    }
    onSave(cfg);
    onClose();
  }

  return (
    <div style={{
      marginTop: 10,
      marginLeft: 26,
      padding: 12,
      borderRadius: 10,
      border: '1px solid hsl(var(--border))',
      background: 'hsl(var(--paper-deep) / 0.55)',
      display: 'grid',
      gap: 12,
    }}>
      {!options.length && (
        <p className="muted" style={{ fontSize: 11 }}>
          No options recorded for this field yet. Fill the form once with the extension so option labels are captured — then Rules can target them.
        </p>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {modes.map((x) => (
          <button
            key={x.m}
            className="btn"
            onClick={() => setMode(x.m)}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 999,
              background: mode === x.m ? 'hsl(210 60% 45%)' : undefined,
              borderColor: mode === x.m ? 'hsl(210 60% 40%)' : undefined,
              color: mode === x.m ? '#fff' : undefined,
            }}
          >{x.label}</button>
        ))}
      </div>

      {mode === 'match' && (
        <div>
          <label className="label" style={{ display: 'block', marginBottom: 6 }}>
            {isMulti ? 'Check each option contained in this profile list:' : 'Fill from profile field (option matched by value):'}
          </label>
          <select className="input" value={profileKey} onChange={(e) => setProfileKey(e.target.value)} style={{ width: '100%' }}>
            <option value="">field…</option>
            {PROFILE_KEY_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.keys.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {mode === 'constant' && (
        <div>
          <label className="label" style={{ display: 'block', marginBottom: 6 }}>Always select:</label>
          {options.length ? (
            <select className="input" value={constantValue} onChange={(e) => setConstantValue(e.target.value)} style={{ width: '100%' }}>
              <option value="">option…</option>
              {options.map((o, i) => <option key={i} value={o}>{o}</option>)}
            </select>
          ) : (
            <input className="input" value={constantValue} onChange={(e) => setConstantValue(e.target.value)} placeholder="value" style={{ width: '100%' }} />
          )}
        </div>
      )}

      {mode === 'always' && (
        <p className="muted" style={{ fontSize: 11 }}>This box is always checked (declarations, agreements).</p>
      )}

      {mode === 'skip' && (
        <p className="muted" style={{ fontSize: 11 }}>This field is left untouched during autofill.</p>
      )}

      {mode === 'condition' && isCheckbox && !isMulti && (
        <div>
          <label className="label" style={{ display: 'block', marginBottom: 8 }}>Check this box when all are true:</label>
          <ConditionRows conditions={rules[0]?.when || []} onChange={(c) => setRuleConds(0, c)} />
        </div>
      )}

      {mode === 'condition' && (!isCheckbox || isMulti) && (
        <div style={{ display: 'grid', gap: 10 }}>
          {rules.map((r, ri) => (
            <div key={ri} style={{ padding: 10, borderRadius: 8, border: '1px solid hsl(var(--border-soft))', background: 'hsl(var(--card))', display: 'grid', gap: 8 }}>
              <ConditionRows conditions={r.when} onChange={(c) => setRuleConds(ri, c)} />
              <div className="row" style={{ gap: 6 }}>
                <span className="muted" style={{ fontSize: 10, width: 40, flexShrink: 0 }}>{isMulti ? 'CHECK' : 'THEN'}</span>
                <select className="input" value={r.then} onChange={(e) => setRuleThen(ri, e.target.value)} style={{ flex: 1, fontSize: 12, padding: '4px 8px' }}>
                  <option value="">select option…</option>
                  {options.map((o, i) => <option key={i} value={o}>{o}</option>)}
                </select>
                {rules.length > 1 && (
                  <button className="btn" style={{ padding: '2px 8px', color: 'hsl(var(--danger))' }} onClick={() => removeRule(ri)}>×</button>
                )}
              </div>
            </div>
          ))}
          <button className="btn" style={{ fontSize: 11, justifySelf: 'start', padding: '2px 8px' }} onClick={addRule}>
            + {isMulti ? 'option rule' : 'rule'}
          </button>
          {!isMulti && (
            <div className="row" style={{ gap: 6 }}>
              <span className="muted" style={{ fontSize: 10, width: 70, flexShrink: 0 }}>OTHERWISE</span>
              <select className="input" value={fallback} onChange={(e) => setFallback(e.target.value)} style={{ flex: 1, fontSize: 12, padding: '4px 8px' }}>
                <option value="">— nothing —</option>
                {options.map((o, i) => <option key={i} value={o}>{o}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save rules'}</button>
      </div>
    </div>
  );
}

function BindingEditor({
  fieldKey,
  mapping,
  saving,
  onSave,
  onClose,
}: {
  fieldKey: string;
  mapping: FieldMapping;
  saving: boolean;
  onSave: (profileKey: string | null, relation: MappingRelation | null) => void;
  onClose: () => void;
}) {
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

  // Preview without a live profile — show relation shape only
  const preview = previewRelation({}, profileKey || null, relation);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'hsl(222 37% 12% / 0.35)',
        display: 'grid', placeItems: 'center', padding: 16,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="card" style={{ width: '100%', maxWidth: 440, padding: 18 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="display" style={{ fontSize: 15, fontWeight: 700 }}>Edit mapping</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: 2, marginBottom: 14 }}>{mapping.label || fieldKey}</p>

        {mapping.options && mapping.options.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="label" style={{ marginBottom: 6 }}>Form options</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {mapping.options.map((o, i) => <span key={i} className="pill">{o}</span>)}
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              For dropdown/radio/checkbox fill behaviour, close this and open <strong>Rules</strong> on the field row.
            </p>
          </div>
        )}

        <label className="label" style={{ display: 'block', marginBottom: 6 }}>Source (profile atom)</label>
        <select className="input" value={profileKey} onChange={(e) => setProfileKey(e.target.value)} style={{ width: '100%', marginBottom: 12 }}>
          <option value="">— none / clear —</option>
          {PROFILE_KEY_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.keys.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
            </optgroup>
          ))}
        </select>

        {profileKey && (
          <>
            <label className="label" style={{ display: 'block', marginBottom: 6 }}>Relation</label>
            <select
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value as MappingRelation['kind'])}
              style={{ width: '100%', marginBottom: 12 }}
            >
              {RELATION_KIND_OPTIONS.map((o) => (
                <option key={o.kind} value={o.kind}>{o.label}</option>
              ))}
            </select>

            {(kind === 'last_n' || kind === 'first_n') && (
              <>
                <label className="label" style={{ display: 'block', marginBottom: 6 }}>N</label>
                <input className="input" type="number" min={1} max={32} value={n}
                  onChange={(e) => setN(e.target.value)} style={{ width: 96, marginBottom: 12 }} />
              </>
            )}

            {kind === 'date_part' && (
              <>
                <label className="label" style={{ display: 'block', marginBottom: 6 }}>Part</label>
                <select className="input" value={part} onChange={(e) => setPart(e.target.value)} style={{ width: '100%', marginBottom: 12 }}>
                  <option value="day">day</option>
                  <option value="month">month</option>
                  <option value="year">year</option>
                </select>
              </>
            )}

            {kind === 'name_part' && (
              <>
                <label className="label" style={{ display: 'block', marginBottom: 6 }}>Part</label>
                <select className="input" value={part} onChange={(e) => setPart(e.target.value)} style={{ width: '100%', marginBottom: 12 }}>
                  <option value="first">first</option>
                  <option value="middle">middle</option>
                  <option value="last">last</option>
                </select>
              </>
            )}

            <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid hsl(var(--border-soft))', marginBottom: 8 }}>
              <div className="label">Relation</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, marginTop: 2 }}>{formatRelation(relation)}</div>
              {preview != null && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>sample: {preview}</div>}
            </div>
          </>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--primary"
            disabled={saving}
            onClick={() => onSave(profileKey || null, relation)}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
