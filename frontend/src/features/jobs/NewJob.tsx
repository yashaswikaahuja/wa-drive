import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../shared/api';

interface Person { id: string; name: string; displayLabel: string; relationship: string; }
interface Household { phone: string; persons: Person[]; }
interface Service { id: string; label: string; icon: string; execution_type: string; }

export default function NewJob() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<{ household: Household; person: Person } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/customers/households').then(r => setHouseholds(r.data));
    api.get('/services').then(r => setServices(r.data));
  }, []);

  const handleLaunch = async (service: Service) => {
    if (!selectedPerson) return;
    setLoading(true);
    try {
      await api.post('/jobs', { profileId: selectedPerson.person.id, serviceType: service.id });
      navigate('/app/jobs');
    } catch {} finally { setLoading(false); }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-white mb-6">New Job</h1>

      {step === 1 && (
        <div>
          <p className="text-sm text-gray-400 mb-4">Step 1 — Select Person</p>
          {households.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No customers. Add one first.</p>
          ) : (
            <div className="space-y-3">
              {households.map(h => (
                <div key={h.phone} className="bg-[#0d1220] border border-white/5 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-2 px-2">{h.phone}</p>
                  <div className="space-y-1">
                    {h.persons.map(p => (
                      <button key={p.id} onClick={() => { setSelectedPerson({ household: h, person: p }); setStep(2); }}
                        className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-blue-600/20 hover:text-blue-300 text-sm text-white flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-600/30 flex items-center justify-center text-xs font-bold">{p.name?.[0]}</div>
                        <div>
                          <div>{p.displayLabel || p.name}</div>
                          <div className="text-[10px] text-gray-500 capitalize">{p.relationship}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && selectedPerson && (
        <div>
          <button onClick={() => setStep(1)} className="text-xs text-blue-400 mb-4 hover:underline">← Back</button>
          <p className="text-sm text-gray-400 mb-1">Step 2 — Select Service for</p>
          <p className="text-white font-medium mb-4">{selectedPerson.person.displayLabel || selectedPerson.person.name} <span className="text-xs text-gray-500">({selectedPerson.household.phone})</span></p>
          <div className="grid grid-cols-2 gap-3">
            {services.map(s => (
              <button key={s.id} onClick={() => handleLaunch(s)} disabled={loading}
                className="bg-[#0d1220] border border-white/5 rounded-xl p-5 text-center hover:border-blue-500/30 transition disabled:opacity-50">
                <span className="text-2xl block mb-2">{s.icon}</span>
                <p className="text-sm text-white font-medium">{s.label}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
