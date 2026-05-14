import { useEffect, useState } from 'react';
import api from '../../lib/api';

export default function Dashboard() {
  const [stats, setStats] = useState({ sessions: 0, filled: 0, corrections: 0, profiles: 0 });

  useEffect(() => {
    Promise.all([
      api.get('/sessions').then(r => r.data),
      api.get('/corrections').then(r => r.data),
      api.get('/profiles').then(r => r.data),
    ]).then(([sessions, corrections, profiles]) => {
      const filled = sessions.reduce((s: number, x: any) => s + (x.totalFilled || 0), 0);
      setStats({ sessions: sessions.length, filled, corrections: corrections.length, profiles: profiles.length });
    }).catch(() => {});
  }, []);

  const cards = [
    { label: 'Sessions', value: stats.sessions, icon: '📡' },
    { label: 'Fields Filled', value: stats.filled, icon: '✅' },
    { label: 'Corrections', value: stats.corrections, icon: '✏️' },
    { label: 'Customers', value: stats.profiles, icon: '👥' },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map(c => (
          <div key={c.label} className="bg-[#0d1220] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{c.icon}</span>
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">{c.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
