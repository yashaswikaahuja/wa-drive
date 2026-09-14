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
    await api.post('/customers/persons', { phone: form.phone, name: form.name, displayLabel: form.name, relationship: 'self' });
    setForm({ name: '', phone: '' });
    setShowCreate(false);
    load();
  };

  const deleteHousehold = async (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this customer and all their profiles?')) return;
    try { await api.delete(`/customers/households/${encodeURIComponent(phone)}`); load(); } catch {}
  };

  const openPerson = (phone: string, personId?: string) => {
    const base = `/app/customers/${encodeURIComponent(phone)}`;
    navigate(personId ? `${base}?person=${encodeURIComponent(personId)}` : base);
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
        <div className="space-y-1">
          {filtered.map((h) => {
            // When searching by name, open THAT person — not always persons[0] (Kamaljeet).
            const matched = q
              ? h.persons.find((p) =>
                  (p.name || '').toLowerCase().includes(q) ||
                  (p.displayLabel || '').toLowerCase().includes(q),
                )
              : null;
            const primary = matched || h.persons[0];
            const others = h.persons.filter((p) => p.id !== primary?.id);

            return (
              <div
                key={h.phone}
                onClick={() => openPerson(h.phone, primary?.id)}
                className="group flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all hover:bg-[hsl(var(--pt-secondary))]"
              >
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center font-semibold text-sm"
                  style={{ background: 'hsl(var(--pt-marigold) / 0.14)', color: 'hsl(var(--pt-marigold-deep))' }}
                >
                  {(primary?.displayLabel || primary?.name || '?')[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: INK }}>
                    {primary?.displayLabel || primary?.name || h.phone}
                  </p>
                  <p className="text-xs pt-muted truncate">
                    {h.phone.match(/^\d{10,13}$/) ? h.phone : ''}
                    {others.length > 0 && (
                      <span>
                        {' · also '}
                        {others.map((p) => p.displayLabel || p.name).join(', ')}
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-[11px] pt-muted px-2 py-0.5 rounded" style={{ background: 'hsl(var(--pt-secondary))' }}>
                  {h.person_count} {parseInt(h.person_count, 10) === 1 ? 'person' : 'people'}
                </span>
                <button
                  onClick={(e) => deleteHousehold(h.phone, e)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 pt-muted hover:text-red-500 rounded transition-all"
                  title="Delete"
                >
                  <Trash size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
