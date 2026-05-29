import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lightning, MagnifyingGlass, ArrowRight, CheckCircle,
  Clock, FileText, UserCircle, TrendUp, Fire
} from '@phosphor-icons/react';
import api from '../../shared/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>({ filled: 0, profiles: 0, corrections: 0 });
  const [pending, setPending] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/stats').then(r => setStats(r.data)).catch(() => {}),
      api.get('/drive/files/ws').then(r => {
        const files = r.data || [];
        // Pending = recent files not yet extracted (no profile link)
        setPending(files.filter((f: any) => !f.extracted).slice(0, 5));
        setRecent(files.slice(0, 6));
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const todayFills = stats.filled || 0;
  const accuracy = stats.filled > 0 ? Math.round(((stats.filled - (stats.corrections || 0)) / stats.filled) * 100) : 100;
  const streak = 5; // TODO: calculate from sessions

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
      <div className="h-12 w-64 rounded-xl bg-white/[0.03]" />
      <div className="h-32 rounded-2xl bg-white/[0.03]" />
      <div className="h-48 rounded-2xl bg-white/[0.03]" />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">

      {/* Search — the primary action */}
      <div className="relative mb-8">
        <MagnifyingGlass size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customer or form..."
          className="w-full pl-12 pr-4 py-4 rounded-2xl text-base bg-white/[0.04] border border-white/[0.06] text-white placeholder:text-gray-600 outline-none focus:border-[#0a84ff] focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(10,132,255,0.1)] transition-all"
          onKeyDown={e => {
            if (e.key === 'Enter' && search.trim()) {
              navigate(`/app/customers?q=${encodeURIComponent(search)}`);
            }
          }}
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-gray-600 hidden sm:block">Press Enter</span>
      </div>

      {/* Stats strip — satisfying numbers */}
      <div className="flex items-center gap-6 mb-8 px-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#30d158]/10 flex items-center justify-center">
            <CheckCircle size={16} weight="fill" className="text-[#30d158]" />
          </div>
          <div>
            <p className="text-xl font-semibold text-white tabular-nums">{todayFills}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Forms filled</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0a84ff]/10 flex items-center justify-center">
            <TrendUp size={16} className="text-[#0a84ff]" />
          </div>
          <div>
            <p className="text-xl font-semibold text-white tabular-nums">{accuracy}%</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Accuracy</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#ff9f0a]/10 flex items-center justify-center">
            <Fire size={16} weight="fill" className="text-[#ff9f0a]" />
          </div>
          <div>
            <p className="text-xl font-semibold text-white tabular-nums">{streak}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Day streak</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#bf5af2]/10 flex items-center justify-center">
            <UserCircle size={16} className="text-[#bf5af2]" />
          </div>
          <div>
            <p className="text-xl font-semibold text-white tabular-nums">{stats.profiles || 0}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Customers</p>
          </div>
        </div>
      </div>

      {/* Pending — needs attention */}
      {pending.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="w-2 h-2 rounded-full bg-[#ff9f0a] animate-pulse" />
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Needs attention</h2>
          </div>
          <div className="space-y-2">
            {pending.map((f: any) => (
              <div key={f.id}
                onClick={() => navigate('/app/whatsapp')}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.05] cursor-pointer hover:bg-white/[0.05] hover:border-[#ff9f0a]/20 transition-all group">
                <div className="w-9 h-9 rounded-lg bg-[#ff9f0a]/10 flex items-center justify-center">
                  <FileText size={16} className="text-[#ff9f0a]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{f.customerName || 'New customer'}</p>
                  <p className="text-xs text-gray-500">Sent {f.fileName || 'documents'} · not processed</p>
                </div>
                <ArrowRight size={14} className="text-gray-600 group-hover:text-[#ff9f0a] transition-colors" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent activity — progress feeling */}
      {recent.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Clock size={14} className="text-gray-500" />
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Recent</h2>
          </div>
          <div className="space-y-1">
            {recent.map((f: any) => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-white/[0.02] transition-colors">
                <div className="w-7 h-7 rounded-md bg-white/[0.04] flex items-center justify-center">
                  <FileText size={14} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate">{f.customerName || 'Unknown'}</p>
                </div>
                <span className="text-[11px] text-gray-600 tabular-nums">
                  {new Date(f.timestamp).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!loading && recent.length === 0 && pending.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
            <Lightning size={28} weight="fill" className="text-[#0a84ff]" />
          </div>
          <h2 className="text-lg font-medium text-white mb-2">Ready to go</h2>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            When customers send documents on WhatsApp, they'll appear here.
          </p>
        </div>
      )}
    </div>
  );
}
