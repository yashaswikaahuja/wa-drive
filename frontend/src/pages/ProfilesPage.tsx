import { useEffect, useState } from "react";
import { API_BASE_URL } from "../utils/helpers";

type Profile = Record<string, string>;

const LABEL: Record<string, string> = {
  name: "Full Name", dob: "Date of Birth", gender: "Gender",
  father_name: "Father's Name", mother_name: "Mother's Name",
  address: "Address", mobile: "Mobile", email: "Email",
  aadhaar_number: "Aadhaar", pan_number: "PAN", epic_number: "EPIC",
  category: "Category", nationality: "Nationality", pincode: "Pincode",
  state: "State", district: "District", place_of_birth: "Place of Birth",
  photo_url: "Photo URL", signature_url: "Signature URL",
  village: "Village", post_office: "Post Office", police_station: "Police Station",
  block: "Block", house_no: "House No", street: "Street",
  marital_status: "Marital Status", religion: "Religion", domicile_state: "Domicile State",
};

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Profile | null>(null);
  const [viewing, setViewing] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try { const res = await fetch(`${API_BASE_URL}/profiles`); setProfiles(await res.json()); } catch {}
  }

  async function deleteProfile(phone: string) {
    if (!confirm(`Delete profile for ${phone}?`)) return;
    await fetch(`${API_BASE_URL}/profiles/${phone}`, { method: "DELETE" });
    setProfiles(p => p.filter(x => x.phone !== phone));
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    await fetch(`${API_BASE_URL}/profiles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
    setSaving(false); setEditing(null); load();
  }

  const filtered = profiles.filter(p =>
    (p.name || "").toLowerCase().includes(search.toLowerCase()) || (p.phone || "").includes(search)
  );

  // Edit mode
  if (editing) return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setEditing(null)} className="btn-ghost p-1.5">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div>
          <h1 className="text-base font-bold text-white">Edit Profile</h1>
          <p className="text-xs text-muted-foreground">{editing.phone}</p>
        </div>
      </div>
      <div className="max-w-lg flex flex-col gap-3">
        {Object.entries(editing).filter(([k]) => k !== "updatedAt" && k !== "photo_url").map(([key, val]) => (
          <div key={key} className="group">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{LABEL[key] ?? key.replace(/_/g, " ")}</label>
              <button onClick={() => { const e = { ...editing }; delete e[key]; setEditing(e); }}
                className="text-muted-foreground hover:text-red-400 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
            </div>
            <input value={val} onChange={e => setEditing({ ...editing, [key]: e.target.value })} className="input-field" />
          </div>
        ))}
        <div className="border-t border-border pt-3 mt-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Add New Field</p>
          <div className="flex gap-2">
            <input id="new-field-key" placeholder="Field name" className="input-field flex-1" />
            <input id="new-field-val" placeholder="Value" className="input-field flex-1" />
            <button onClick={() => {
              const k = (document.getElementById("new-field-key") as HTMLInputElement).value.trim().toLowerCase().replace(/\s+/g,"_");
              const v = (document.getElementById("new-field-val") as HTMLInputElement).value.trim();
              if (k && v) { setEditing({ ...editing, [k]: v }); (document.getElementById("new-field-key") as HTMLInputElement).value = ""; (document.getElementById("new-field-val") as HTMLInputElement).value = ""; }
            }} className="btn-primary px-3">+</button>
          </div>
        </div>
        <button onClick={saveEdit} disabled={saving} className="btn-primary mt-2">{saving ? "Saving..." : "Save Changes"}</button>
      </div>
    </div>
  );

  return (
    <div className="page-container relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Student Profiles</h1>
          <p className="text-sm text-muted-foreground">{profiles.length} saved</p>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..."
          className="input-field w-full sm:w-64" />
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px] text-muted-foreground">people</span>
          </div>
          <p className="text-sm text-muted-foreground">{profiles.length === 0 ? "No profiles saved yet" : "No match"}</p>
        </div>
      )}

      {/* Profile cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map(p => (
          <div key={p.phone} className="card flex flex-col gap-3">
            <div className="flex items-start gap-3">
              {p.photo_url ? (
                <img src={p.photo_url} alt="Photo" className="w-12 h-14 rounded-lg object-cover border border-border shrink-0" />
              ) : (
                <div className="w-12 h-14 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-muted-foreground text-[24px]">person</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{p.name || "Unknown"}</p>
                <p className="text-[11px] text-muted-foreground">📱 {p.phone}</p>
                {p.dob && <p className="text-[11px] text-muted-foreground">🎂 {p.dob}</p>}
              </div>
              {p.signature_url && (
                <img src={p.signature_url} alt="Sign" className="w-14 h-7 rounded object-cover border border-border bg-white shrink-0" />
              )}
            </div>
            <div className="text-[11px] text-secondary-foreground flex flex-col gap-0.5">
              {p.aadhaar_number && <span>🪪 {p.aadhaar_number}</span>}
              {p.category && <span>📋 {p.category}</span>}
              {p.address && <span className="truncate">📍 {p.address}</span>}
            </div>
            <div className="flex gap-2 mt-auto pt-1">
              <button onClick={() => setViewing(p)} className="flex-1 btn-ghost text-xs border border-border flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-[14px]">visibility</span> View
              </button>
              <button onClick={() => setEditing({ ...p })} className="flex-1 btn-ghost text-xs border border-primary/30 text-primary flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-[14px]">edit</span> Edit
              </button>
              <button onClick={() => deleteProfile(p.phone)} className="btn-ghost text-xs border border-red-500/30 text-red-400 px-2">
                <span className="material-symbols-outlined text-[14px]">delete</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* View modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setViewing(null)}>
          <div className="w-full max-w-md max-h-[80vh] bg-card border border-border rounded-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {viewing.photo_url && <img src={viewing.photo_url} className="w-10 h-12 rounded-lg object-cover border border-border" />}
                <div>
                  <p className="text-sm font-bold text-white">{viewing.name}</p>
                  <p className="text-[11px] text-muted-foreground">{viewing.phone}</p>
                </div>
              </div>
              <button onClick={() => setViewing(null)} className="btn-ghost p-1">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(viewing).filter(([k, v]) => v && k !== "updatedAt" && k !== "photo_url" && k !== "signature_url").map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider w-28 shrink-0 pt-0.5">{LABEL[k] ?? k.replace(/_/g, " ")}</span>
                    <span className="text-xs text-foreground">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
