import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../utils/helpers';

type Stats = { totalSessions: number; totalFills: number; successRate: number; sites: number; pendingTeaching: number };

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ totalSessions: 0, totalFills: 0, successRate: 0, sites: 0, pendingTeaching: 0 });
  const [profiles, setProfiles] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/sessions/stats`).then(r => r.json()).then(d => {
      setStats({ totalSessions: d.totalSessions ?? 0, totalFills: d.totalFills ?? 0, successRate: d.successRate ?? 0, sites: d.uniqueSites ?? 0, pendingTeaching: d.pendingTeaching ?? 0 });
    }).catch(() => {});
    fetch(`${API_BASE_URL}/profiles`).then(r => r.json()).then(d => setProfiles(Array.isArray(d) ? d.length : 0)).catch(() => {});
    fetch(`${API_BASE_URL}/whatsapp/status`).then(r => r.json()).then(d => setConnected(d.connected ?? false)).catch(() => setConnected(false));
  }, []);

  const STATS = [
    { label: 'Sessions', value: stats.totalSessions, icon: 'play_circle', color: 'text-blue-400' },
    { label: 'Fields Filled', value: stats.totalFills, icon: 'edit_note', color: 'text-green-400' },
    { label: 'Success Rate', value: `${stats.successRate}%`, icon: 'verified', color: 'text-emerald-400' },
    { label: 'Sites Tested', value: stats.sites, icon: 'language', color: 'text-purple-400' },
    { label: 'Profiles', value: profiles, icon: 'people', color: 'text-cyan-400' },
    { label: 'Pending Teach', value: stats.pendingTeaching, icon: 'school', color: 'text-amber-400' },
  ];

  const ACTIONS = [
    { label: 'Open Inbox', desc: 'View received files', icon: 'inbox', path: '/inbox', color: 'bg-blue-600' },
    { label: 'Profiles', desc: 'Manage student data', icon: 'people', path: '/profiles', color: 'bg-cyan-600' },
    { label: 'Mappings', desc: 'Form field mappings', icon: 'schema', path: '/mappings', color: 'bg-purple-600' },
    { label: 'Adapters', desc: 'Dropdown adapters', icon: 'extension', path: '/adapters', color: 'bg-amber-600' },
  ];

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-muted-foreground">CyberControl Operator Hub — AutoFill v5.11</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${connected ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            WhatsApp {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {STATS.map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-[18px] ${s.color}`}>{s.icon}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</span>
            </div>
            <span className="text-2xl font-bold text-white">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Quick Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ACTIONS.map(a => (
          <button key={a.path} onClick={() => navigate(a.path)}
            className="card flex items-center gap-4 text-left group cursor-pointer">
            <div className={`w-10 h-10 rounded-lg ${a.color}/20 flex items-center justify-center shrink-0`}>
              <span className={`material-symbols-outlined text-[20px] ${a.color.replace('bg-', 'text-').replace('-600', '-400')}`}>{a.icon}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-white group-hover:text-primary transition-colors">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
