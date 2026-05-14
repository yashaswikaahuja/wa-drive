import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../shared/api';

interface Profile { id: string; name: string; primary_contact_phone: string; }
interface Service { id: string; label: string; icon: string; execution_type: string; }

export default function NewJob() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/profiles').then(r => setProfiles(r.data));
    api.get('/services').then(r => setServices(r.data));
  }, []);

  const handleLaunch = async (service: Service) => {
    if (!selectedProfile) return;
    setLoading(true);
    try {
      await api.post('/jobs', { profileId: selectedProfile.id, serviceType: service.id });
      navigate('/app/jobs');
    } catch {} finally { setLoading(false); }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-white mb-6">New Job</h1>

      {/* Step 1: Select Customer */}
      {step === 1 && (
        <div>
          <p className="text-sm text-gray-400 mb-4">Step 1 — Select Customer</p>
          <div className="space-y-2">
            {profiles.map(p => (
              <button key={p.id} onClick={() => { setSelectedProfile(p); setStep(2); }}
                className="w-full text-left bg-[#0d1220] border border-white/5 rounded-xl p-4 flex items-center gap-3 hover:border-blue-500/30 transition">
                <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold">{p.name?.[0]}</div>
                <div>
                  <p className="text-sm font-medium text-white">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.primary_contact_phone}</p>
                </div>
              </button>
            ))}
            {profiles.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No customers. Add one first.</p>}
          </div>
        </div>
      )}

      {/* Step 2: Select Service */}
      {step === 2 && selectedProfile && (
        <div>
          <button onClick={() => setStep(1)} className="text-xs text-blue-400 mb-4 hover:underline">← Back</button>
          <p className="text-sm text-gray-400 mb-1">Step 2 — Select Service for</p>
          <p className="text-white font-medium mb-4">{selectedProfile.name}</p>
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
