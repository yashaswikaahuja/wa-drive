import { useEffect, useState } from 'react';
import api from '../../lib/api';

export default function Dashboard() {
  const [stats, setStats] = useState<any>({ sessions: 0, filled: 0, corrections: 0, profiles: 0, jobs: 0, jobsQueued: 0 });

  useEffect(() => {
    api.get('/dashboard/stats').then(r => setStats(r.data)).catch(() => {});
  }, []);

  const cards = [
    { label: 'Active Jobs', value: stats.jobsQueued + (stats.jobsInProgress || 0), icon: '📋' },
    { label: 'Customers', value: stats.profiles, icon: '👥' },
    { label: 'Total Fills', value: stats.filled, icon: '✅' },
    { label: 'Corrections', value: stats.corrections, icon: '✏️' },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
