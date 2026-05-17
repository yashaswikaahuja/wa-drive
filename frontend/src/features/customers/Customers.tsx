import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/customers/households');
      setHouseholds(r.data);
    } catch {}
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Customers</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">+ New Customer</button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-[#0d1220] border border-white/5 rounded-xl p-4 mb-6 flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-[11px] text-gray-500 uppercase">Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a2236] border border-white/10 rounded-lg text-sm text-white outline-none" />
          </div>
          <div className="flex-1">
            <label className="text-[11px] text-gray-500 uppercase">Phone</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full mt-1 px-3 py-2 bg-[#1a2236] border border-white/10 rounded-lg text-sm text-white outline-none" />
          </div>
          <button type="submit" className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">Save</button>
        </form>
      )}

      {loading ? <p className="text-gray-500 text-sm">Loading...</p> : households.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No customers yet</p>
          <p className="text-sm">Add your first customer to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {households.map(h => (
            <div key={h.phone} onClick={() => navigate(`/app/customers/${encodeURIComponent(h.phone)}`)}
              className="bg-[#0d1220] border border-white/5 rounded-xl p-4 flex items-center gap-4 hover:border-blue-500/30 transition cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold">
                {h.persons[0]?.name?.[0] || '?'}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{h.persons[0]?.displayLabel || h.persons[0]?.name || h.phone.replace(/@.*/, '')}</p>
                <p className="text-xs text-gray-500 truncate">
                  {h.phone.match(/^[0-9]{10,13}$/) ? h.phone : ''}{h.persons.length > 1 ? (h.phone.match(/^[0-9]{10,13}$/) ? ' · ' : '') + h.persons.slice(1).map(p => p.displayLabel || p.name).join(' · ') : ''}
                </p>
              </div>
              <span className="text-[10px] text-gray-500 px-2 py-0.5 rounded-full bg-white/5">
                {h.person_count} {parseInt(h.person_count) === 1 ? 'person' : 'people'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
