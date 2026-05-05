import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../utils/helpers';

type Profile = Record<string, string>;

const LABEL: Record<string, string> = {
  name: 'Full Name', dob: 'Date of Birth', gender: 'Gender',
  father_name: "Father's Name", mother_name: "Mother's Name",
  address: 'Address', mobile: 'Mobile', email: 'Email',
  aadhaar_number: 'Aadhaar', pan_number: 'PAN', epic_number: 'EPIC',
  category: 'Category', nationality: 'Nationality', pincode: 'Pincode',
  state: 'State', district: 'District', place_of_birth: 'Place of Birth',
  photo_url: 'Photo URL', signature_url: 'Signature URL',
  village: 'Village', post_office: 'Post Office', police_station: 'Police Station',
  block: 'Block', house_no: 'House No', street: 'Street',
  marital_status: 'Marital Status', religion: 'Religion', domicile_state: 'Domicile State',
};

export default function ProfilesPage() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await fetch(`${API_BASE_URL}/profiles`);
      setProfiles(await res.json());
    } catch { /* ignore */ }
  }

  async function deleteProfile(phone: string) {
    if (!confirm(`Delete profile for ${phone}?`)) return;
    await fetch(`${API_BASE_URL}/profiles/${phone}`, { method: 'DELETE' });
    setProfiles(p => p.filter(x => x.phone !== phone));
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    await fetch(`${API_BASE_URL}/profiles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    setSaving(false);
    setEditing(null);
    load();
  }

  const filtered = profiles.filter(p =>
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.phone || '').includes(search)
  );

  if (editing) return (
    <div className="min-h-screen bg-[#0c1322] text-[#dce2f7] font-['Inter',sans-serif]">
      <div className="bg-[#1e293b] border-b border-[#334155] px-4 h-10 flex items-center gap-3">
        <button onClick={() => setEditing(null)} className="text-[#94a3b8] hover:text-white">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <span className="text-sm font-bold uppercase tracking-wider">Edit Profile</span>
        <span className="text-[11px] text-[#64748b]">{editing.phone}</span>
      </div>
      <div className="max-w-lg mx-auto p-4 flex flex-col gap-3">
        {Object.entries(editing).filter(([k]) => k !== 'updatedAt' && k !== 'photo_url').map(([key, val]) => (
          <div key={key} className="group relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-[#94a3b8] uppercase tracking-wider">
                {LABEL[key] ?? key.replace(/_/g, ' ')}
              </label>
              <button onClick={() => { const e = { ...editing }; delete e[key]; setEditing(e); }}
                className="text-[#475569] hover:text-red-400 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
            </div>
            <input value={val} onChange={e => setEditing({ ...editing, [key]: e.target.value })}
              className="w-full bg-[#1e293b] border border-[#334155] rounded px-3 py-2 text-sm text-[#dce2f7] focus:outline-none focus:border-blue-500" />
          </div>
        ))}

        {/* Add new field */}
        <div className="border-t border-[#334155] pt-3 mt-1">
          <div className="text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2">Add New Field</div>
          <div className="flex gap-2">
            <input id="new-field-key" placeholder="Field name (e.g. religion)"
              className="flex-1 bg-[#1e293b] border border-dashed border-[#334155] rounded px-3 py-2 text-sm text-[#dce2f7] focus:outline-none focus:border-blue-500 placeholder:text-[#475569]" />
            <input id="new-field-val" placeholder="Value"
              className="flex-1 bg-[#1e293b] border border-dashed border-[#334155] rounded px-3 py-2 text-sm text-[#dce2f7] focus:outline-none focus:border-blue-500 placeholder:text-[#475569]" />
            <button onClick={() => {
              const k = (document.getElementById('new-field-key') as HTMLInputElement).value.trim().toLowerCase().replace(/\s+/g,'_');
              const v = (document.getElementById('new-field-val') as HTMLInputElement).value.trim();
              if (k && v) {
                setEditing({ ...editing, [k]: v });
                (document.getElementById('new-field-key') as HTMLInputElement).value = '';
                (document.getElementById('new-field-val') as HTMLInputElement).value = '';
              }
            }} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded font-bold">+</button>
          </div>
        </div>

        <button onClick={saveEdit} disabled={saving}
          className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold rounded">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0c1322] text-[#dce2f7] font-['Inter',sans-serif] flex flex-col">
      <div className="bg-[#1e293b] border-b border-[#334155] px-4 h-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-[#94a3b8] hover:text-white">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <span className="text-sm font-bold uppercase tracking-wider">Student Profiles</span>
          <span className="text-[11px] text-[#64748b]">{profiles.length} saved</span>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full max-w-md bg-[#1e293b] border border-[#334155] rounded px-3 py-2 text-sm text-[#dce2f7] focus:outline-none focus:border-blue-500 placeholder:text-[#475569]" />

        {filtered.length === 0 && (
          <div className="text-center text-[#475569] text-sm mt-8">
            {profiles.length === 0 ? 'No profiles saved yet. Use Form Ready → Save as Profile.' : 'No profiles match your search.'}
          </div>
        )}

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(p => (
            <div key={p.phone} className="bg-[#1e293b] border border-[#334155] rounded-lg p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-sm">{p.name || 'Unknown'}</div>
                  <div className="text-[11px] text-[#64748b]">📱 {p.phone}</div>
                </div>
                <div className="flex gap-1">
                  {p.photo_url && (
                    <div className="text-center">
                      <img src={p.photo_url} alt="Photo" className="w-10 h-12 rounded object-cover border border-[#334155]" />
                      <div className="text-[8px] text-[#64748b] mt-0.5">Photo</div>
                    </div>
                  )}
                  {p.signature_url && (
                    <div className="text-center">
                      <img src={p.signature_url} alt="Sign" className="w-16 h-8 rounded object-cover border border-[#334155] bg-white" />
                      <div className="text-[8px] text-[#64748b] mt-0.5">Sign</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-[#94a3b8] flex flex-col gap-0.5">
                {p.dob && <span>🎂 {p.dob}</span>}
                {p.aadhaar_number && <span>🪪 {p.aadhaar_number}</span>}
                {p.category && <span>📋 {p.category}</span>}
                {p.address && <span className="truncate">📍 {p.address}</span>}
              </div>
              <div className="flex gap-2 mt-1">
                <button onClick={() => setEditing({ ...p })}
                  className="flex-1 px-2 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs rounded flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">edit</span> Edit
                </button>
                <button onClick={() => deleteProfile(p.phone)}
                  className="flex-1 px-2 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs rounded flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">delete</span> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
