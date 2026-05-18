import { useEffect, useState } from 'react';
import api from '../../shared/api';

export default function Dashboard() {
  const [stats, setStats] = useState<any>({ sessions: 0, filled: 0, corrections: 0, profiles: 0, jobs: 0, jobsQueued: 0 });
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    api.get('/dashboard/stats').then(r => setStats(r.data)).catch(() => {});
    api.get('/drive/files/ws').then(r => setRecent(r.data.slice(0, 8))).catch(() => {});
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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

      {recent.length > 0 && (
        <div className="bg-[#0d1220] border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Activity</h3>
          <div className="space-y-2">
            {recent.map((f: any) => (
              <div key={f.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                <span className="text-lg">{f.fileName?.endsWith('.pdf') ? '📄' : f.fileName?.endsWith('.jpg') || f.fileName?.endsWith('.png') ? '🖼️' : '📎'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{f.fileName || 'Document'}</p>
                  <p className="text-[10px] text-gray-500">from {f.customerName || 'Unknown'}</p>
                </div>
                <span className="text-[10px] text-gray-600 shrink-0">{new Date(f.timestamp).toLocaleString('en-IN', {hour:'2-digit', minute:'2-digit', day:'numeric', month:'short'})}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
