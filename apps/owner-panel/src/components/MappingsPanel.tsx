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
  RELATION_KIND_OPTIONS,
  statusFromSource,
  type MappingRelation,
} from '../lib/mappingRelation';

interface FieldMapping {
  label?: string;
  type?: string;
  order?: number;
  options?: string[] | null;
  profileKey: string | null;
  relation?: MappingRelation | null;
  fillMode?: string | null;
  rules?: any[] | null;
  constantValue?: string | null;
  fallback?: string | null;
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
  { label: 'Bank', keys: ['bank_account_number', 'ifsc_code', 'cif_number', 'bank_name', 'branch_name', 'account_holder_name'] },
  { label: 'Travel', keys: ['departure', 'arrival', 'from_station', 'to_station', 'journey_date', 'return_date', 'travel_class', 'quota', 'passenger_count'] },
  { label: 'Eligibility', keys: ['occupation', 'ex_serviceman', 'ews_certificate', 'disability_certificate', 'domicile_certificate', 'income_certificate', 'caste_certificate', 'languages', 'skills'] },
  { label: 'Education (10th)', keys: ['roll_number_10th', 'board_10th', 'passing_year_10th', 'marks_obtained_10th', 'total_marks_10th', 'percentage_10th', 'division_10th', 'school_name', 'certificate_number_10th'] },
  { label: 'Education (12th)', keys: ['roll_number_12th', 'board_12th', 'passing_year_12th', 'marks_obtained_12th', 'total_marks_12th', 'percentage_12th', 'division_12th', 'stream_12th', 'school_name_12th', 'certificate_number_12th'] },
  { label: 'Education (Graduation)', keys: ['roll_number_grad', 'university_name', 'degree', 'passing_year_grad', 'marks_obtained_grad', 'total_marks_grad', 'percentage_grad', 'division_grad', 'registration_number_grad'] },
];

function favicon(host: string | null) {
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
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

  async function removeField(label: string) {
    if (!selected || !window.confirm('Remove this field mapping?')) return;
    try {
      await deleteMappingField(cfg, selected.formKey, label);
      setFields((prev) => {
        const next = { ...prev };
        delete next[label];
        return next;
      });
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
    const mapped = fieldEntries.filter(([, m]) => m.profileKey).length;
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
                  {total} fields · {mapped} mapped · {selected.fills} fills
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
            AI/learning proposes Source + Relation. Edit only when wrong — manual saves are protected.
          </p>
          {msg && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{msg}</p>}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          {fieldEntries.map(([key, m]) => {
            const display = m.label || key.replace(/_/g, ' ');
            const rel = normalizeRelation(m.relation, m.profileKey);
            const status = statusFromSource(m.source);
            return (
              <div key={key} className="card" style={{
                padding: '10px 12px',
                background: !m.profileKey ? 'hsl(45 90% 50% / 0.06)' : undefined,
              }}>
                <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{display}</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2, fontFamily: 'var(--mono)' }}>
                      {m.profileKey || '—'} · {m.profileKey ? formatRelation(rel) : '—'} · {status.label}
                      {m.type ? ` · ${m.type}` : ''}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }}
                      disabled={savingKey === key}
                      onClick={() => setEditKey(key)}>Edit</button>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 8px', color: 'hsl(var(--danger))' }}
                      onClick={() => removeField(key)}>×</button>
                  </div>
                </div>
                {m.options && m.options.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {m.options.slice(0, 8).map((opt, i) => (
                      <span key={i} className="pill">{opt}</span>
                    ))}
                    {m.options.length > 8 && <span className="muted" style={{ fontSize: 11 }}>+{m.options.length - 8}</span>}
                  </div>
                )}
              </div>
            );
          })}
          {fieldEntries.length === 0 && (
            <p className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>No fields recorded yet.</p>
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
        Global taught mappings used by fill. Café Hub no longer edits these — review and correct here.
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
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: 18 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="display" style={{ fontSize: 15, fontWeight: 700 }}>Edit mapping</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: 2, marginBottom: 14 }}>{mapping.label || fieldKey}</p>

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
