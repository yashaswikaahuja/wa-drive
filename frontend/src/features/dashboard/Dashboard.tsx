import { useEffect, useState } from 'react';
import { Briefcase, Users, CheckCircle, PencilSimple, FileText, Image } from '@phosphor-icons/react';
import api from '../../shared/api';

export default function Dashboard() {
  const [stats, setStats] = useState<any>({ sessions: 0, filled: 0, corrections: 0, profiles: 0, jobs: 0, jobsQueued: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/stats').then(r => setStats(r.data)).catch(() => {}),
      api.get('/drive/files/ws').then(r => setRecent(r.data.slice(0, 8))).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: 'Active Jobs', value: stats.jobsQueued + (stats.jobsInProgress || 0), icon: Briefcase, color: 'text-amber-400' },
    { label: 'Customers', value: stats.profiles, icon: Users, color: 'text-blue-400' },
    { label: 'Total Fills', value: stats.filled, icon: CheckCircle, color: 'text-green-400' },
    { label: 'Corrections', value: stats.corrections, icon: PencilSimple, color: 'text-orange-400' },
  ];

  if (loading) return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-8 w-40 bg-white/[0.02] animate-pulse rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white/[0.02] animate-pulse rounded-lg" />)}
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {cards.map(c => (
          <div key={c.label} className="card">
            <div className="flex items-center gap-2 mb-3">
              <c.icon size={18} className={c.color} />
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">{c.label}</span>
            </div>
            <p className="text-2xl font-semibold text-white tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {recent.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Recent Documents</h3>
          <div className="divide-y divide-white/[0.04]">
            {recent.map((f: any) => (
              <div key={f.id} className="flex items-center gap-3 py-3">
                {f.fileName?.match(/\.(jpg|jpeg|png|webp)$/i)
                  ? <Image size={18} className="text-gray-500 shrink-0" />
                  : <FileText size={18} className="text-gray-500 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{f.fileName || 'Document'}</p>
                  <p className="text-xs text-gray-500">{f.customerName || 'Unknown'}</p>
                </div>
                <span className="text-xs text-gray-600 tabular-nums shrink-0">
                  {new Date(f.timestamp).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

