import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash, MagnifyingGlass, Users } from '@phosphor-icons/react';
import api from '../../shared/api';

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

  const filtered = search
    ? households.filter(h => h.persons.some(p => p.name?.toLowerCase().includes(search.toLowerCase())) || h.phone.includes(search))
    : households;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Customers</h1>
          <p className="text-sm text-gray-500">{households.length} households</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Customer
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="card mb-4 flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="Customer name" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">Phone</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" placeholder="10-digit phone" />
          </div>
          <button type="submit" className="btn-primary">Save</button>
        </form>
      )}

      <div className="relative mb-4">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" placeholder="Search by name or phone..." />
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[1,2,3].map(i => <div key={i} className="h-16 rounded-lg bg-white/[0.02] animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users size={40} className="mx-auto text-gray-600 mb-3" />
          <p className="text-sm text-gray-400">{search ? `No results for "${search}"` : 'No customers yet'}</p>
          {!search && <p className="text-xs text-gray-600 mt-1">Add your first customer to get started</p>}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(h => (
            <div key={h.phone} onClick={() => navigate(`/app/customers/${encodeURIComponent(h.phone)}`)}
              className="group flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all hover:bg-white/[0.03]">
              <div className="w-9 h-9 rounded-md bg-teal-500/10 flex items-center justify-center text-teal-400 font-semibold text-sm">
                {h.persons[0]?.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200">{h.persons[0]?.displayLabel || h.persons[0]?.name || h.phone}</p>
                <p className="text-xs text-gray-500">
                  {h.phone.match(/^\d{10,13}$/) ? h.phone : ''}
                  {h.persons.length > 1 && ` · ${h.persons.length} people`}
                </p>
              </div>
              <span className="text-[11px] text-gray-600 px-2 py-0.5 rounded bg-white/[0.03]">
                {h.person_count} {parseInt(h.person_count) === 1 ? 'person' : 'people'}
              </span>
              <button onClick={(e) => deleteHousehold(h.phone, e)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-600 hover:text-red-400 rounded transition-all" title="Delete">
                <Trash size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
