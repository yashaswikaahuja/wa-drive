import { useEffect, useState } from 'react';
import api from '../../lib/api';

export default function Overview() {
  const [data, setData] = useState({ sessions: 0, filled: 0, failed: 0, corrections: 0, profiles: 0, jobs: 0, topForms: [] as any[] });

  useEffect(() => {
    Promise.all([
      api.get('/sessions').then(r => r.data),
      api.get('/corrections').then(r => r.data),
      api.get('/profiles').then(r => r.data),
      api.get('/jobs').then(r => r.data),
    ]).then(([sessions, corrections, profiles, jobs]) => {
      const filled = sessions.reduce((s: number, x: any) => s + (x.totalFilled || 0), 0);
      const failed = sessions.reduce((s: number, x: any) => s + (x.totalFailed || 0), 0);
      // Top forms by session count
      const formCounts: Record<string, { host: string; count: number }> = {};
      sessions.forEach((s: any) => {
        const key = s.hostname || 'unknown';
        if (!formCounts[key]) formCounts[key] = { host: key, count: 0 };
        formCounts[key].count++;
      });
      const topForms = Object.values(formCounts).sort((a, b) => b.count - a.count).slice(0, 5);
      setData({ sessions: sessions.length, filled, failed, corrections: corrections.length, profiles: profiles.length, jobs: jobs.length, topForms });
    }).catch(() => {});
  }, []);

  const cards = [
    { label: 'Total Sessions', value: data.sessions, icon: '📡' },
    { label: 'Fields Filled', value: data.filled, icon: '✅' },
    { label: 'Fields Failed', value: data.failed, icon: '❌' },
    { label: 'Corrections', value: data.corrections, icon: '✏️' },
    { label: 'Customers', value: data.profiles, icon: '👥' },
    { label: 'Jobs', value: data.jobs, icon: '📋' },
  ];

  const successRate = data.filled + data.failed > 0 ? Math.round((data.filled / (data.filled + data.failed)) * 100) : 0;

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-6">Admin Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {cards.map(c => (
          <div key={c.label} className="bg-[#0d1220] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span>{c.icon}</span>
              <span className="text-[11px] text-gray-500 uppercase">{c.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Success Rate */}
        <div className="bg-[#0d1220] border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Fill Success Rate</h3>
          <p className="text-3xl font-bold text-white">{successRate}%</p>
          <div className="mt-2 h-2 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${successRate}%` }} />
          </div>
        </div>

        {/* Top Forms */}
        <div className="bg-[#0d1220] border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Top Forms</h3>
          {data.topForms.length === 0 ? <p className="text-gray-600 text-sm">No sessions yet</p> : (
            <div className="space-y-2">
              {data.topForms.map(f => (
                <div key={f.host} className="flex items-center justify-between">
                  <span className="text-xs text-gray-300 truncate">{f.host}</span>
                  <span className="text-xs text-blue-400 font-medium">{f.count} sessions</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
