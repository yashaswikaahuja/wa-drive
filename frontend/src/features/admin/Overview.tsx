import { useEffect, useState } from 'react';
import { Broadcast, CheckCircle, XCircle, PencilSimple, UsersThree, ClipboardText, ChartPie } from '@phosphor-icons/react';
import api from '../../shared/api';

export default function Overview() {
  const [data, setData] = useState({ sessions: 0, filled: 0, failed: 0, corrections: 0, profiles: 0, jobs: 0, topForms: [] as any[] });

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/stats').then(r => r.data),
      api.get('/sessions?limit=20').then(r => r.data),
    ]).then(([stats, sessions]) => {
      const formCounts: Record<string, { host: string; count: number }> = {};
      sessions.forEach((s: any) => {
        const key = s.hostname || 'unknown';
        if (!formCounts[key]) formCounts[key] = { host: key, count: 0 };
        formCounts[key].count++;
      });
      const topForms = Object.values(formCounts).sort((a, b) => b.count - a.count).slice(0, 5);
      setData({ ...stats, topForms });
    }).catch(() => {});
  }, []);

  const cards = [
    { label: 'Total Sessions', value: data.sessions, icon: <Broadcast size={18} weight="duotone" /> },
    { label: 'Fields Filled', value: data.filled, icon: <CheckCircle size={18} weight="duotone" /> },
    { label: 'Fields Failed', value: data.failed, icon: <XCircle size={18} weight="duotone" /> },
    { label: 'Corrections', value: data.corrections, icon: <PencilSimple size={18} weight="duotone" /> },
    { label: 'Customers', value: data.profiles, icon: <UsersThree size={18} weight="duotone" /> },
    { label: 'Jobs', value: data.jobs, icon: <ClipboardText size={18} weight="duotone" /> },
  ];

  const successRate = data.filled + data.failed > 0 ? Math.round((data.filled / (data.filled + data.failed)) * 100) : 0;

  return (
    <div>
      <h1 className="text-xl font-semibold text-white tracking-tight mb-6">Admin Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {cards.map(c => (
          <div key={c.label} className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[#0a84ff]">{c.icon}</span>
              <span className="text-[11px] text-gray-500 uppercase">{c.label}</span>
            </div>
            <p className="text-2xl font-bold text-white tabular-nums font-mono">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-400 tracking-tight mb-3">Fill Success Rate</h3>
          <p className="text-3xl font-bold text-white tabular-nums font-mono">{successRate}%</p>
          <div className="mt-2 h-2 bg-white/[0.04] rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${successRate}%` }} />
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <ChartPie size={16} weight="duotone" className="text-[#0a84ff]" />
            <h3 className="text-sm font-semibold text-gray-400 tracking-tight">Top Forms</h3>
          </div>
          {data.topForms.length === 0 ? <p className="text-gray-600 text-sm">No sessions yet</p> : (
            <div className="divide-y divide-white/[0.04]">
              {data.topForms.map(f => (
                <div key={f.host} className="flex items-center justify-between py-2">
                  <span className="text-xs text-gray-300 truncate">{f.host}</span>
                  <span className="text-xs font-medium tabular-nums font-mono" style={{ color: '#0a84ff' }}>{f.count} sessions</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
