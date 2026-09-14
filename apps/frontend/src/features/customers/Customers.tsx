import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash, MagnifyingGlass, Users } from '@phosphor-icons/react';
import api from '../../shared/api';

const INK = 'hsl(var(--pt-ink))';

interface Household {
  phone: string;
  person_count: string;
  persons: Array<{ id: string; name: string; relationship: string; displayLabel: string }>;
}

export default function Customers() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try { const r = await api.get('/customers/households'); setHouseholds(r.data); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) return;
    const r = await api.post('/customers/persons', {
      phone: form.phone,
      name: form.name,
      displayLabel: form.name,
      relationship: 'self',
    });
    setForm({ name: '', phone: '' });
    setShowCreate(false);
    await load();
    const newId = r.data?.id;
    navigate(
      `/app/customers/${encodeURIComponent(form.phone)}${newId ? `?person=${encodeURIComponent(newId)}` : ''}`,
    );
  };

  const deleteHousehold = async (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this customer and all their profiles?')) return;
    try { await api.delete(`/customers/households/${encodeURIComponent(phone)}`); load(); } catch {}
  };

  /** Always open a specific person — never rely on persons[0] alone. */
  const openPerson = (phone: string, personId: string) => {
    navigate(`/app/customers/${encodeURIComponent(phone)}?person=${encodeURIComponent(personId)}`);
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? households.filter((h) =>
        h.phone.includes(q) ||
        h.persons.some((p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.displayLabel || '').toLowerCase().includes(q),
        ),
      )
    : households;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="pt-display text-lg font-bold" style={{ color: INK }}>Customers</h1>
          <p className="text-sm pt-muted">{households.length} households</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Customer
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="card mb-4 flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs pt-muted mb-1 block">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="Customer name" />
          </div>
          <div className="flex-1">
            <label className="text-xs pt-muted mb-1 block">Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-field" placeholder="10-digit phone" />
          </div>
          <button type="submit" className="btn-primary">Save</button>
        </form>
      )}

      <div className="relative mb-4">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pt-muted" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-9" placeholder="Search by name or phone..." />
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: 'hsl(var(--pt-secondary) / 0.6)' }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users size={40} className="mx-auto pt-muted mb-3" />
          <p className="text-sm pt-muted">{search ? `No results for "${search}"` : 'No customers yet'}</p>
          {!search && <p className="text-xs pt-muted mt-1">Add your first customer to get started</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((h) => {
            const qMatch = q
              ? h.persons.filter((p) =>
                  (p.name || '').toLowerCase().includes(q) ||
                  (p.displayLabel || '').toLowerCase().includes(q),
                )
              : [];
            // When searching: show one row per matched person. Otherwise: one row per person in household.
            const rows = qMatch.length > 0 ? qMatch : h.persons;

            return (
              <div key={h.phone} className="rounded-lg overflow-hidden" style={{ background: 'hsl(var(--pt-secondary) / 0.35)' }}>
                <div className="px-4 pt-2 pb-1 flex items-center justify-between">
                  <p className="text-[11px] pt-muted">
                    {h.phone.match(/^\d{10,13}$/) ? `+${h.phone}` : h.phone}
                    {' · '}{h.persons.length} {h.persons.length === 1 ? 'person' : 'people'}
                  </p>
                  <button
                    onClick={(e) => deleteHousehold(h.phone, e)}
                    className="p-1 pt-muted hover:text-red-500 rounded"
                    title="Delete household"
                  >
                    <Trash size={13} />
                  </button>
                </div>
                {rows.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openPerson(h.phone, p.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all hover:bg-[hsl(var(--pt-secondary))] border-t border-white/5"
                  >
                    <div
                      className="w-9 h-9 rounded-md flex items-center justify-center font-semibold text-sm shrink-0"
                      style={{ background: 'hsl(var(--pt-marigold) / 0.14)', color: 'hsl(var(--pt-marigold-deep))' }}
                    >
                      {(p.displayLabel || p.name || '?')[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: INK }}>
                        {p.displayLabel || p.name || 'Unnamed'}
                      </p>
                      <p className="text-xs pt-muted capitalize">{p.relationship || 'self'}</p>
                    </div>
                    <span className="text-[11px] text-[#0a84ff]">Open →</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
