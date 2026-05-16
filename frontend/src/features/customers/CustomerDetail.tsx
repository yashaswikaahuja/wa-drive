import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../shared/api';
import { PROFILE_SCHEMA, getCompleteness, flattenProfileData } from '../../shared/profileSchema';

interface Person {
  id: string;
  name: string;
  displayLabel: string;
  relationship: string;
  createdAt: string;
  updatedAt: string;
}

interface Household {
  phone: string;
  person_count: string;
  persons: Person[];
}

interface DriveFile {
  id: string;
  fileName: string;
  fileUrl: string;
  customerId: string;  // phone
  customerName: string;
  timestamp: string;
}

interface PersonDetail {
  id: string;
  name: string;
  primary_contact_phone: string;
  data: any;
  display_label?: string;
  relationship?: string;
}

const RELATIONSHIPS = [
  { value: 'self', label: 'Self' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'other', label: 'Other' },
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
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingInSection, setAddingInSection] = useState<string | null>(null);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  const loadHousehold = async () => {
    const r = await api.get('/customers/households');
    const h = r.data.find((x: Household) => x.phone === phone);
    setHousehold(h || null);
    if (h && h.persons.length > 0 && !selectedPerson) setSelectedPerson(h.persons[0].id);
  };

  const loadDocuments = async () => {
    try {
      const r = await api.get('/drive/files');
      const docs = r.data.filter((d: any) => d.customerId === phone);
      setDocuments(docs);
    } catch {}
  };

  const loadPerson = async (personId: string) => {
    try {
      const r = await api.get(`/profiles/${personId}?full=1`);
      setPersonDetail(r.data);
    } catch {}
  };

  useEffect(() => { loadHousehold(); loadDocuments(); }, [phone]);
  useEffect(() => { if (selectedPerson) loadPerson(selectedPerson); }, [selectedPerson]);

  const addPerson = async (form: { name: string; relationship: string }) => {
    try {
      await api.post('/customers/persons', { phone, name: form.name, displayLabel: form.name, relationship: form.relationship });
      setShowAddPerson(false);
      await loadHousehold();
    } catch (e: any) { setError(e.message); }
  };

  const saveField = async (key: string, value: string) => {
    if (!selectedPerson) return;
    try {
      await api.patch(`/customers/persons/${selectedPerson}`, { fields: { [key]: { value, source: 'manual', confidence: 1 } } });
      await loadPerson(selectedPerson);
    } catch (e: any) { setError(e.message); }
    setEditingField(null);
  };

  const toFieldKey = (name: string) => name.toLowerCase().replace(/\s+/g, '_');

  const handleAddField = () => {
    if (newFieldKey && newFieldValue) {
      saveField(toFieldKey(newFieldKey), newFieldValue);
      setAddingInSection(null);
      setNewFieldKey('');
      setNewFieldValue('');
    }
  };

  const handleExtract = async (doc: DriveFile) => {
    if (!selectedPerson) { setError('Select a person first'); return; }
    setExtracting(doc.id);
    setError('');
    try {
      const r = await api.post('/process/extract', { fileId: doc.id });
      setExtractedSuggestions(r.data.suggested);
      setExtractDocId(doc.id);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Extraction failed');
    } finally {
      setExtracting(null);
    }
  };

  const confirmExtraction = async (acceptedFields: Record<string, any>) => {
    if (!selectedPerson) return;
    try {
      await api.patch(`/customers/persons/${selectedPerson}`, { fields: acceptedFields });
      setExtractedSuggestions(null);
      setExtractDocId(null);
      await loadPerson(selectedPerson);
    } catch (e: any) { setError(e.message); }
  };

  if (!household) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="max-w-5xl">
      <button onClick={() => navigate('/app/customers')} className="text-xs text-blue-400 mb-4 hover:underline">← Back to Customers</button>

      <div className="flex items-start gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold">
          📞
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{household.phone}</h1>
          <p className="text-sm text-gray-500">{household.persons.length} person{household.persons.length !== 1 ? 's' : ''} in household</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left: Persons in household */}
        <div className="col-span-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-gray-500 uppercase">People</h3>
            <button onClick={() => setShowAddPerson(true)} className="text-xs text-blue-400 hover:underline">+ Add</button>
          </div>
          <div className="space-y-1">
            {household.persons.map(p => (
              <button key={p.id} onClick={() => setSelectedPerson(p.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedPerson === p.id ? 'bg-blue-600/20 text-blue-300' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}>
                <div>{p.displayLabel || p.name}</div>
                <div className="text-[10px] text-gray-500 capitalize">{p.relationship}</div>
              </button>
            ))}
          </div>
          {showAddPerson && <AddPersonForm onSubmit={addPerson} onCancel={() => setShowAddPerson(false)} />}
        </div>

        {/* Center: Selected person detail */}
        <div className="col-span-6">
          <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Profile</h3>
          {personDetail ? (
            <div className="space-y-2">
              <div className="bg-[#0d1220] border border-white/5 rounded-xl p-3">
                <p className="text-sm font-medium text-white">{personDetail.display_label || personDetail.name}</p>
                <p className="text-[11px] text-gray-500 capitalize mb-2">{personDetail.relationship || 'self'}</p>
                {(() => {
                  const flat = flattenProfileData(personDetail.data || {});
                  const { percent, filled, total, missing } = getCompleteness(flat);
                  return (
                    <div>
                      <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                        <span>{percent}% ready for SSC OTR</span>
                        <span>{filled}/{total} required</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${percent >= 80 ? 'bg-green-500' : percent >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{width: `${percent}%`}} />
                      </div>
                      {missing.length > 0 && <p className="text-[9px] text-gray-600 mt-1">Missing: {missing.slice(0, 4).join(', ')}</p>}
                    </div>
                  );
                })()}
              </div>
              {PROFILE_SCHEMA.map(section => {
                const raw = personDetail.data || {};
                const flat = flattenProfileData(raw);
                const visibleFields = section.fields.filter(f => flat[f.key] || f.required);
                if (!visibleFields.length) return null;
                const hasAny = section.fields.some(f => flat[f.key]);
                if (!hasAny) return (
                  <div key={section.id} className="bg-[#0d1220] border border-white/[0.02] rounded-lg px-3 py-2 flex justify-between items-center">
                    <span className="text-[11px] text-gray-600">{section.icon} {section.title}</span>
                    <span className="text-[9px] text-gray-700">No data</span>
                  </div>
                );
                return (
                  <div key={section.id} className="bg-[#0d1220] border border-white/5 rounded-lg px-3 py-2">
                    <p className="text-[10px] font-medium text-gray-500 mb-1.5">{section.icon} {section.title}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {visibleFields.map(f => {
                        const val = flat[f.key];
                        const rawVal = raw[f.key];
                        const docId = rawVal && typeof rawVal === 'object' && rawVal.documentId;
                        const isEditing = editingField === f.key;
                        return (
                          <div key={f.key} className="flex flex-col">
                            <span className={`text-[9px] ${val ? 'text-gray-500' : 'text-red-400/60'}`}>{f.label}{f.required && !val ? ' *' : ''}</span>
                            {isEditing ? (
                              <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                onBlur={() => { if (editValue !== (val||'')) saveField(f.key, editValue); else setEditingField(null); }}
                                onKeyDown={e => { if (e.key === 'Enter') { saveField(f.key, editValue); } if (e.key === 'Escape') setEditingField(null); }}
                                className="text-[11px] bg-blue-600/10 border border-blue-500/30 rounded px-1 py-0.5 text-white outline-none w-full" />
                            ) : (
                              <div className="flex items-center gap-1 cursor-pointer group" onClick={() => { setEditingField(f.key); setEditValue(val || ''); }}>
                                <span className={`text-[11px] truncate ${val ? 'text-white' : 'text-gray-700 italic'}`} title={val || ''}>{val || 'missing'}</span>
                                {docId && <span className="text-[8px] text-blue-400/60" title={`From document ${docId}`}>📄</span>}
                                <span className="text-[9px] text-gray-600 opacity-0 group-hover:opacity-100">✎</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Extra fields not in schema */}
                    </div>
                    {addingInSection === section.id ? (
                      <div className="flex gap-2 mt-2">
                        <input placeholder="Field name" value={newFieldKey} onChange={e => setNewFieldKey(e.target.value)}
                          className="text-[11px] bg-[#1a2236] border border-white/10 rounded px-2 py-1 text-white outline-none flex-1" />
                        <input placeholder="Value" value={newFieldValue} onChange={e => setNewFieldValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddField(); }}
                          className="text-[11px] bg-[#1a2236] border border-white/10 rounded px-2 py-1 text-white outline-none flex-1" />
                        <button onClick={handleAddField} className="text-[10px] text-green-400 px-2">Save</button>
                        <button onClick={() => { setAddingInSection(null); setNewFieldKey(''); setNewFieldValue(''); }} className="text-[10px] text-gray-500 px-1">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingInSection(section.id)} className="text-[10px] text-blue-400 hover:text-blue-300 mt-1.5">+ Add</button>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-gray-600 text-sm">Select a person</p>}

          {/* Extraction suggestions modal */}
          {extractedSuggestions && (
            <ExtractionConfirm
              suggestions={extractedSuggestions}
              documentId={extractDocId || ''}
              onCancel={() => { setExtractedSuggestions(null); setExtractDocId(null); }}
              onConfirm={confirmExtraction}
            />
          )}
        </div>

        {/* Right: Documents */}
        <div className="col-span-3">
          <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Documents from this household</h3>
          {documents.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No documents yet. Documents sent on WhatsApp from this number will appear here.</p>
          ) : (
            <div className="space-y-2">
              {documents.slice(0, 20).map(d => {
                const ext = d.fileName?.split('.').pop()?.toLowerCase() || '';
                const isImg = ['jpg','jpeg','png','gif','webp'].includes(ext);
                const thumb = d.fileUrl?.replace('sz=w200','sz=w300');
                return (
                  <div key={d.id} className="bg-[#0d1220] border border-white/5 rounded-lg p-2 flex gap-2 items-center">
                    {isImg ? (
                      <img src={thumb} className="w-12 h-12 rounded object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-white/5 flex items-center justify-center text-lg">{ext === 'pdf' ? '📕' : '📄'}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-white truncate">{ext.toUpperCase()} · {new Date(d.timestamp).toLocaleDateString()}</p>
                      <button onClick={() => handleExtract(d)} disabled={extracting === d.id || !selectedPerson}
                        className="text-[10px] text-blue-400 hover:underline disabled:text-gray-600">
                        {extracting === d.id ? 'Extracting...' : 'Extract data'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 mt-3 text-xs text-red-400">{error}</div>}
    </div>
  );
}

function AddPersonForm({ onSubmit, onCancel }: { onSubmit: (f: any) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('self');
  return (
    <div className="bg-[#0d1220] border border-white/5 rounded-xl p-3 mt-2">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name"
        className="w-full px-2 py-1.5 bg-[#1a2236] border border-white/10 rounded text-xs text-white outline-none mb-2" />
      <select value={relationship} onChange={e => setRelationship(e.target.value)}
        className="w-full px-2 py-1.5 bg-[#1a2236] border border-white/10 rounded text-xs text-white outline-none mb-2">
        {RELATIONSHIPS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <div className="flex gap-2">
        <button onClick={() => onSubmit({ name, relationship })} disabled={!name}
          className="flex-1 px-2 py-1 bg-blue-600 text-white text-xs rounded disabled:opacity-50">Add</button>
        <button onClick={onCancel} className="px-2 py-1 bg-white/5 text-gray-400 text-xs rounded">Cancel</button>
      </div>
    </div>
  );
}

function ExtractionConfirm({ suggestions, documentId, onCancel, onConfirm }: any) {
  const [accepted, setAccepted] = useState<Record<string, any>>({ ...suggestions });

  const toggle = (key: string) => {
    setAccepted((prev: any) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = suggestions[key];
      return next;
    });
  };

  const updateValue = (key: string, value: string) => {
    setAccepted((prev: any) => ({ ...prev, [key]: { ...prev[key], value, source: 'document_corrected' } }));
  };

  return (
    <div className="bg-[#0d1220] border border-blue-500/30 rounded-xl p-4 mt-3">
      <p className="text-sm font-medium text-blue-400 mb-3">Extracted from document — confirm fields</p>
      <div className="space-y-2 mb-3">
        {Object.entries(suggestions).map(([k, v]: [string, any]) => (
          <div key={k} className="flex items-center gap-2">
            <input type="checkbox" checked={!!accepted[k]} onChange={() => toggle(k)} />
            <span className="text-xs text-gray-400 w-24 capitalize">{k.replace(/_/g, ' ')}</span>
            <input
              value={accepted[k]?.value || v.value || ''}
              onChange={e => updateValue(k, e.target.value)}
              disabled={!accepted[k]}
              className="flex-1 px-2 py-1 bg-[#1a2236] border border-white/10 rounded text-xs text-white outline-none disabled:opacity-50" />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => onConfirm(accepted)} className="px-3 py-1.5 bg-green-600 text-white text-xs rounded">Confirm & Save</button>
        <button onClick={onCancel} className="px-3 py-1.5 bg-white/5 text-gray-400 text-xs rounded">Cancel</button>
      </div>
    </div>
  );
}
