import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash, PencilSimple, FileText, Image as ImageIcon,
  Sparkle, CheckCircle, X, FilePdf, UserPlus
} from '@phosphor-icons/react';
import api from '../../shared/api';
import { PROFILE_SCHEMA, getCompleteness, flattenProfileData, SECTION_FOR_DOCTYPE } from '../../shared/profileSchema';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

interface Person { id: string; name: string; displayLabel: string; relationship: string; createdAt: string; updatedAt: string; }
interface Household { phone: string; person_count: string; persons: Person[]; }
interface DriveFile { id: string; fileName: string; fileUrl: string; customerId: string; customerName: string; timestamp: string; }
interface PersonDetail { id: string; name: string; primary_contact_phone: string; data: any; display_label?: string; relationship?: string; }

const RELATIONSHIPS = [
  { value: 'self', label: 'Self' }, { value: 'spouse', label: 'Spouse' },
  { value: 'parent', label: 'Parent' }, { value: 'child', label: 'Child' },
  { value: 'sibling', label: 'Sibling' }, { value: 'other', label: 'Other' },
];

export default function CustomerDetail() {
  const { id: phoneParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const phone = decodeURIComponent(phoneParam || '');

  const [household, setHousehold] = useState<Household | null>(null);
  const [documents, setDocuments] = useState<DriveFile[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [personDetail, setPersonDetail] = useState<PersonDetail | null>(null);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [extractedSuggestions, setExtractedSuggestions] = useState<any | null>(null);
  const [extractDocId, setExtractDocId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [extractError, setExtractError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingInSection, setAddingInSection] = useState<string | null>(null);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [readiness, setReadiness] = useState<any[]>([]);

  const loadHousehold = async () => {
    const r = await api.get('/customers/households');
    const h = r.data.find((x: Household) => x.phone === phone);
    setHousehold(h || null);
    if (h && h.persons.length > 0 && !selectedPerson) setSelectedPerson(h.persons[0].id);
  };
  const loadDocuments = async () => {
    try { const r = await api.get('/drive/files/ws'); setDocuments(r.data.filter((d: any) => d.customerId === phone)); } catch {}
  };
  const loadPerson = async (personId: string) => {
    try { const r = await api.get(`/customers/persons/${personId}`); setPersonDetail(r.data); } catch {}
  };

  useEffect(() => { loadHousehold(); loadDocuments(); loadReadiness(); }, [phone]);
  useEffect(() => { if (selectedPerson) loadPerson(selectedPerson); }, [selectedPerson]);

  const loadReadiness = async () => {
    try { const r = await api.get(`/forms/readiness/${encodeURIComponent(phone)}`); setReadiness(r.data || []); } catch {}
  };

  const addPerson = async (form: { name: string; relationship: string }) => {
    try {
      await api.post('/customers/persons', { phone, name: form.name, displayLabel: form.name, relationship: form.relationship });
      setShowAddPerson(false); await loadHousehold();
    } catch (e: any) { setError(e.message); }
  };
  const deletePerson = async (personId: string, personName: string) => {
    if (!confirm(`Delete "${personName}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/customers/persons/${personId}`);
      if (selectedPerson === personId) { setSelectedPerson(null); setPersonDetail(null); }
      await loadHousehold();
    } catch (e: any) { setError(e.message); }
  };
  const saveField = async (key: string, value: string) => {
    if (!selectedPerson) return;
    try {
      await api.patch(`/customers/persons/${selectedPerson}`, { fields: { [key]: { value, source: 'manual', confidence: 1 } } });
      await loadPerson(selectedPerson); loadReadiness();
    } catch (e: any) { setError(e.message); }
    setEditingField(null);
  };
  const toFieldKey = (name: string) => name.toLowerCase().replace(/\s+/g, '_');
  const handleAddField = () => {
    if (newFieldKey && newFieldValue) {
      saveField(toFieldKey(newFieldKey), newFieldValue);
      setAddingInSection(null); setNewFieldKey(''); setNewFieldValue('');
    }
  };
  const handleExtract = async (doc: DriveFile) => {
    if (!selectedPerson) { setError('Select a person first'); return; }
    setExtracting(doc.id); setError('');
    try {
      const r = await api.post('/process/extract', { fileId: doc.id });
      setExtractedSuggestions(r.data.suggested); setExtractDocId(doc.id);
    } catch (e: any) { setError(e.response?.data?.error || e.message || 'Extraction failed'); }
    finally { setExtracting(null); }
  };
  const confirmExtraction = async (acceptedFields: Record<string, any>) => {
    if (!selectedPerson) { setExtractError('No person selected'); return; }
    setExtractError('');
    setSaving(true);
    try {
      const fields = { ...acceptedFields };
      delete (fields as any).document_type; // classification, not a profile field
      await api.patch(`/customers/persons/${selectedPerson}`, { fields });
      setExtractedSuggestions(null); setExtractDocId(null);
      await loadPerson(selectedPerson); loadReadiness();
    } catch (e: any) { setExtractError(e.response?.data?.error || e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (!household) return (
    <div className="max-w-4xl mx-auto pt-4 space-y-4 animate-pulse">
      <div className="h-6 w-24 rounded bg-white/[0.03]" />
      <div className="h-16 rounded-2xl bg-white/[0.03]" />
      <div className="h-40 rounded-2xl bg-white/[0.03]" />
    </div>
  );

  const primaryName = household.persons[0]?.displayLabel || household.persons[0]?.name || phone;
  const flat = personDetail ? flattenProfileData(personDetail.data || {}) : {};
  const completeness = getCompleteness(flat);

  return (
    <div className="max-w-4xl mx-auto pt-4">
      <button onClick={() => navigate('/app/customers')} className="btn-ghost flex items-center gap-1.5 mb-4 px-0 text-gray-400">
        <ArrowLeft size={15} /> Customers
      </button>

      {/* Header — name first, phone secondary */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-[#0a84ff]/10 flex items-center justify-center text-[#0a84ff] text-xl font-semibold shrink-0">
          {primaryName[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-white tracking-tight truncate">{primaryName}</h1>
          <p className="text-sm text-gray-500">
            {phone.match(/^\d{10,13}$/) ? `+${phone}` : phone}
            {household.persons.length > 1 && ` · ${household.persons.length} people`}
          </p>
        </div>
      </div>

      {/* People tabs (if household) */}
      {household.persons.length > 1 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {household.persons.map(p => (
            <button key={p.id} onClick={() => setSelectedPerson(p.id)}
              className="group flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full text-sm transition-all active:scale-[0.97]"
              style={{
                background: selectedPerson === p.id ? 'rgba(10,132,255,0.12)' : 'rgba(255,255,255,0.04)',
                color: selectedPerson === p.id ? '#0a84ff' : '#94a3b8',
                transitionTimingFunction: EASE, transitionDuration: '200ms',
              }}>
              {p.displayLabel || p.name}
              <span className="text-[10px] opacity-50 capitalize">{p.relationship}</span>
              <span onClick={(e) => { e.stopPropagation(); deletePerson(p.id, p.displayLabel || p.name); }}
                className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                <X size={11} />
              </span>
            </button>
          ))}
          <button onClick={() => setShowAddPerson(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm text-gray-500 bg-white/[0.03] hover:text-white transition-colors">
            <UserPlus size={14} /> Add
          </button>
        </div>
      )}
      {household.persons.length <= 1 && (
        <div className="mb-6">
          <button onClick={() => setShowAddPerson(true)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors">
            <UserPlus size={15} /> Add family member
          </button>
        </div>
      )}
      {showAddPerson && <div className="mb-6"><AddPersonForm onSubmit={addPerson} onCancel={() => setShowAddPerson(false)} /></div>}

      {personDetail && (
        <>
          {/* Readiness — per form (architecture: "SSC 85%, missing 10th marksheet") */}
          <section className="card mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs uppercase tracking-[0.15em] text-gray-500">Form readiness</h2>
              <span className="text-xs text-gray-500 tabular-nums">{completeness.filled}/{completeness.total} core fields</span>
            </div>
            {readiness.length === 0 ? (
              <p className="text-xs text-gray-600">No form data. Visit Find Form to see requirements.</p>
            ) : (
              <div className="space-y-3">
                {readiness.slice(0, 5).map((f: any) => {
                  const color = f.percent >= 80 ? '#30d158' : f.percent >= 50 ? '#ffd60a' : '#ff453a';
                  return (
                    <div key={f.id} className="flex items-center gap-3">
                      <div className="w-28 shrink-0">
                        <p className="text-sm text-gray-200 truncate">{f.short_name}</p>
                        {f.missing.length > 0 && f.percent < 100 && (
                          <p className="text-[10px] text-gray-600 truncate">need {f.missing[0].replace(/_/g, ' ')}{f.missing.length > 1 ? ` +${f.missing.length - 1}` : ''}</p>
                        )}
                      </div>
                      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${f.percent}%`, background: color, transitionTimingFunction: EASE, transitionDuration: '600ms' }} />
                      </div>
                      <span className="text-sm font-semibold tabular-nums w-10 text-right" style={{ color }}>{f.percent}%</span>
                      {f.percent === 100
                        ? <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-[#30d158] shrink-0 w-12 text-right hover:underline">Fill →</a>
                        : <span className="w-12 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Profile data — grouped sections */}
          <section className="mb-6">
            <h2 className="text-xs uppercase tracking-[0.15em] text-gray-500 mb-3 px-1">Profile data</h2>
            <div className="space-y-3">
              {PROFILE_SCHEMA.map(section => {
                const raw = personDetail.data || {};
                const sflat = flattenProfileData(raw);
                const schemaKeysAll = new Set(PROFILE_SCHEMA.flatMap(s => s.fields.map(f => f.key)));
                // extra fields (not in any schema section) whose source document maps to THIS section
                const GENERIC_NOISE = new Set(['stream','subject','course','division','percentage','marks_obtained','total_marks','marks','marks_10th','marks_graduation','percentage_graduation','passing_year_graduation','roll_number','registration_number','enrollment_number','exam_date','exam_name','graduation_subject','board_name']);
                const extras = Object.entries(raw).filter(([k, v]: any) => {
                  if (schemaKeysAll.has(k) || k === 'document_type') return false;
                  if (GENERIC_NOISE.has(k)) return false; // unsuffixed generic — its level-specific key is shown instead
                  const val = v && typeof v === 'object' ? v.value : v;
                  if (!val) return false;
                  const dt = v && typeof v === 'object' ? v.documentType : null;
                  return dt && SECTION_FOR_DOCTYPE[dt] === section.id;
                });
                const hasAny = section.fields.some(f => sflat[f.key]) || extras.length > 0;
                const visibleFields = section.fields.filter(f => sflat[f.key] || f.required);
                if (!visibleFields.length && !extras.length) return null;
                return (
                  <div key={section.id} className="card">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3">{section.title}</p>
                    {!hasAny ? (
                      <p className="text-xs text-gray-600">No data yet</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        {visibleFields.map(f => {
                          const val = sflat[f.key];
                          const rawVal = raw[f.key];
                          const docId = rawVal && typeof rawVal === 'object' && rawVal.documentId;
                          const isEditing = editingField === f.key;
                          return (
                            <div key={f.key} className="flex flex-col gap-0.5">
                              <span className={`text-[10px] uppercase tracking-wide ${val ? 'text-gray-500' : 'text-[#ff453a]/60'}`}>
                                {f.label}{f.required && !val ? ' *' : ''}
                              </span>
                              {isEditing ? (
                                <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => { if (editValue !== (val || '')) saveField(f.key, editValue); else setEditingField(null); }}
                                  onKeyDown={e => { if (e.key === 'Enter') saveField(f.key, editValue); if (e.key === 'Escape') setEditingField(null); }}
                                  className="text-sm bg-[#0a84ff]/10 border border-[#0a84ff]/30 rounded-md px-2 py-1 text-white outline-none w-full" />
                              ) : (
                                <button onClick={() => { setEditingField(f.key); setEditValue(val || ''); }}
                                  className="flex items-center gap-1.5 group text-left">
                                  <span className={`text-sm truncate ${val ? 'text-gray-100' : 'text-gray-700 italic'}`} title={val || ''}>{val || 'missing'}</span>
                                  {docId && <Sparkle size={10} weight="fill" className="text-[#0a84ff]/60 shrink-0" />}
                                  <PencilSimple size={11} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {extras.map(([k, v]: any) => {
                          const val = v && typeof v === 'object' ? v.value : v;
                          const isEditing = editingField === k;
                          return (
                            <div key={k} className="flex flex-col gap-0.5">
                              <span className="text-[10px] uppercase tracking-wide text-gray-500 capitalize">{k.replace(/_(10th|12th|grad)$/, '').replace(/_/g, ' ')}</span>
                              {isEditing ? (
                                <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => { if (editValue !== (val || '')) saveField(k, editValue); else setEditingField(null); }}
                                  onKeyDown={e => { if (e.key === 'Enter') saveField(k, editValue); if (e.key === 'Escape') setEditingField(null); }}
                                  className="text-sm bg-[#0a84ff]/10 border border-[#0a84ff]/30 rounded-md px-2 py-1 text-white outline-none w-full" />
                              ) : (
                                <button onClick={() => { setEditingField(k); setEditValue(val || ''); }} className="flex items-center gap-1.5 group text-left">
                                  <span className="text-sm text-gray-100 truncate" title={val || ''}>{val}</span>
                                  <Sparkle size={10} weight="fill" className="text-[#0a84ff]/60 shrink-0" />
                                  <PencilSimple size={11} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {addingInSection === section.id ? (
                      <div className="flex gap-2 mt-3">
                        <input placeholder="Field name" value={newFieldKey} onChange={e => setNewFieldKey(e.target.value)} className="input-field text-xs py-1.5 flex-1" />
                        <input placeholder="Value" value={newFieldValue} onChange={e => setNewFieldValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddField(); }} className="input-field text-xs py-1.5 flex-1" />
                        <button onClick={handleAddField} className="text-xs text-[#30d158] px-2">Save</button>
                        <button onClick={() => { setAddingInSection(null); setNewFieldKey(''); setNewFieldValue(''); }} className="text-xs text-gray-500 px-1">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingInSection(section.id)} className="text-xs text-[#0a84ff] hover:text-[#409cff] mt-3 flex items-center gap-1 transition-colors">
                        <Plus size={12} /> Add field
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Fields whose source document has NO dedicated section → DYNAMIC section per document */}
              {(() => {
                const schemaKeys = new Set(PROFILE_SCHEMA.flatMap(s => s.fields.map(f => f.key)));
                const raw = personDetail.data || {};
                const NOISE = new Set(['stream','subject','course','division','percentage','marks_obtained','total_marks','marks','marks_10th','marks_graduation','percentage_graduation','passing_year_graduation','roll_number','registration_number','enrollment_number','exam_date','exam_name','graduation_subject','board_name','document_label']);
                const humanize = (dt: string) => dt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                // group fields (whose docType has no schema section) by a TITLE derived from document_label
                const groups: Record<string, { title: string; fields: [string, string][] }> = {};
                for (const [k, val] of Object.entries(flat)) {
                  if (schemaKeys.has(k) || k === 'document_type' || !val || NOISE.has(k)) continue;
                  const rv = raw[k];
                  const dt = (rv && typeof rv === 'object' && rv.documentType) || 'other';
                  if (SECTION_FOR_DOCTYPE[dt]) continue; // already shown inside its schema section
                  // title: the document's own label if present, else humanized docType
                  const labelEntry = Object.entries(raw).find(([kk, vv]: any) => kk === 'document_label' && vv?.documentType === dt);
                  const title = (labelEntry && (labelEntry[1] as any).value) || (dt === 'other' ? 'Other Details' : humanize(dt));
                  (groups[title] ||= { title, fields: [] }).fields.push([k, val]);
                }
                return Object.values(groups).map(g => (
                  <div key={g.title} className="card">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3">{g.title}</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      {g.fields.map(([k, val]) => (
                        <div key={k} className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wide text-gray-500">{k.replace(/_/g, ' ')}</span>
                          <button onClick={() => { setEditingField(k); setEditValue(val || ''); }} className="flex items-center gap-1.5 group text-left">
                            <span className="text-sm text-gray-100 truncate">{val}</span>
                            <PencilSimple size={11} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </section>
        </>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs uppercase tracking-[0.15em] text-gray-500 mb-3 px-1">Documents · {documents.length}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {documents.slice(0, 12).map(d => {
              const ext = d.fileName?.split('.').pop()?.toLowerCase() || '';
              const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
              const thumb = d.fileUrl?.replace('sz=w200', 'sz=w400');
              return (
                <div key={d.id} className="rounded-xl p-1.5 bg-white/[0.02] border border-white/[0.05]">
                  <div className="rounded-lg bg-[#1c1c1e] overflow-hidden">
                    <div className="aspect-[4/3] bg-black/40 flex items-center justify-center overflow-hidden">
                      {isImg ? <img src={thumb} className="w-full h-full object-cover" />
                        : ext === 'pdf' ? <FilePdf size={32} className="text-gray-600" />
                          : <FileText size={32} className="text-gray-600" />}
                    </div>
                    <div className="p-2.5">
                      <p className="text-[11px] text-gray-400 truncate mb-1.5">{ext.toUpperCase()} · {new Date(d.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                      <button onClick={() => handleExtract(d)} disabled={extracting === d.id || !selectedPerson}
                        className="flex items-center gap-1 text-[11px] text-[#0a84ff] hover:text-[#409cff] disabled:text-gray-600 transition-colors">
                        <Sparkle size={11} weight="fill" /> {extracting === d.id ? 'Extracting…' : 'Extract data'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Extraction confirm */}
      {extractedSuggestions && (
        <ExtractionConfirm suggestions={extractedSuggestions} documentId={extractDocId || ''} error={extractError} saving={saving}
          onCancel={() => { setExtractedSuggestions(null); setExtractDocId(null); setExtractError(''); }} onConfirm={confirmExtraction} />
      )}

      {error && <div className="rounded-xl bg-[#ff453a]/10 border border-[#ff453a]/20 p-3 mt-4 text-sm text-[#ff453a]">{error}</div>}
    </div>
  );
}

function AddPersonForm({ onSubmit, onCancel }: { onSubmit: (f: any) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('self');
  return (
    <div className="card flex gap-3 items-end">
      <div className="flex-1">
        <label className="text-xs text-gray-400 mb-1 block">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Family member name" className="input-field" />
      </div>
      <div className="w-36">
        <label className="text-xs text-gray-400 mb-1 block">Relationship</label>
        <select value={relationship} onChange={e => setRelationship(e.target.value)} className="input-field">
          {RELATIONSHIPS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <button onClick={() => onSubmit({ name, relationship })} disabled={!name} className="btn-primary">Add</button>
      <button onClick={onCancel} className="btn-ghost">Cancel</button>
    </div>
  );
}

function ExtractionConfirm({ suggestions, onCancel, onConfirm, error, saving }: any) {
  const [accepted, setAccepted] = useState<Record<string, any>>({ ...suggestions });
  const toggle = (key: string) => setAccepted((prev: any) => {
    const next = { ...prev };
    if (next[key]) delete next[key]; else next[key] = suggestions[key];
    return next;
  });
  const updateValue = (key: string, value: string) => setAccepted((prev: any) => ({ ...prev, [key]: { ...prev[key], value, source: 'document_corrected' } }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-[1.5rem] p-1.5 bg-white/[0.03] border border-white/[0.08] max-h-[85vh] flex flex-col">
        <div className="rounded-[1.1rem] bg-[#1c1c1e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] p-5 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkle size={18} weight="fill" className="text-[#0a84ff]" />
            <p className="text-base font-semibold text-white">Review extracted data</p>
          </div>
          <p className="text-xs text-gray-500 mb-4">Uncheck to skip. Edit values inline. Confirm to save.</p>
          <div className="space-y-2 mb-4 overflow-y-auto flex-1">
            {Object.entries(suggestions).map(([k, v]: [string, any]) => (
              <label key={k} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={!!accepted[k]} onChange={() => toggle(k)}
                  className="w-4 h-4 rounded accent-[#0a84ff]" />
                <span className="text-xs text-gray-400 w-28 capitalize shrink-0">{k.replace(/_/g, ' ')}</span>
                <input value={accepted[k]?.value || v.value || ''} onChange={e => updateValue(k, e.target.value)} disabled={!accepted[k]}
                  className="input-field text-xs py-1.5 flex-1 disabled:opacity-40" />
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => onConfirm(accepted)} disabled={saving} className="btn-primary flex items-center gap-2 flex-1 justify-center disabled:opacity-50">
              <CheckCircle size={16} weight="fill" /> {saving ? 'Saving…' : 'Confirm & Save'}
            </button>
            <button onClick={onCancel} disabled={saving} className="btn-secondary disabled:opacity-50">Cancel</button>
          </div>
          {error && <p className="text-xs text-[#ff453a] mt-3">{error}</p>}
        </div>
      </div>
    </div>
  );
}
