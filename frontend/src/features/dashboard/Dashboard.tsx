import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lightning, MagnifyingGlass, ArrowRight, CheckCircle,
  Clock, FileText, UserCircle, TrendUp, Fire
} from '@phosphor-icons/react';
import api from '../../shared/api';

// Custom easing — physical spring feel
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>({ filled: 0, profiles: 0, corrections: 0 });
  const [pending, setPending] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/stats').then(r => setStats(r.data)).catch(() => {}),
      api.get('/drive/files/ws').then(r => {
        const files = r.data || [];
        setPending(files.filter((f: any) => !f.extracted).slice(0, 5));
        setRecent(files.slice(0, 6));
      }).catch(() => {}),
    ]).finally(() => { setLoading(false); requestAnimationFrame(() => setMounted(true)); });
  }, []);

  const todayFills = stats.filled || 0;
  const accuracy = stats.filled > 0 ? Math.round(((stats.filled - (stats.corrections || 0)) / stats.filled) * 100) : 100;
  const streak = 5;

  const metrics = [
    { label: 'Forms filled', value: todayFills, icon: CheckCircle, tint: '#30d158' },
    { label: 'Accuracy', value: `${accuracy}%`, icon: TrendUp, tint: '#0a84ff' },
    { label: 'Day streak', value: streak, icon: Fire, tint: '#ff9f0a' },
    { label: 'Customers', value: stats.profiles || 0, icon: UserCircle, tint: '#bf5af2' },
  ];

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-6 animate-pulse pt-8">
      <div className="h-14 w-full rounded-2xl bg-white/[0.03]" />
      <div className="h-28 rounded-[1.75rem] bg-white/[0.03]" />
      <div className="h-48 rounded-[1.75rem] bg-white/[0.03]" />
    </div>
  );

  // Staggered reveal helper
  const reveal = (i: number) => ({
    transform: mounted ? 'translateY(0)' : 'translateY(16px)',
    opacity: mounted ? 1 : 0,
    filter: mounted ? 'blur(0)' : 'blur(4px)',
    transition: `transform 700ms ${EASE} ${i * 70}ms, opacity 700ms ${EASE} ${i * 70}ms, filter 700ms ${EASE} ${i * 70}ms`,
  });

  return (
    <div className="max-w-3xl mx-auto pt-4">

      {/* Eyebrow */}
      <div style={reveal(0)} className="mb-5">
        <span className="inline-block rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-medium text-gray-500 bg-white/[0.04] border border-white/[0.06]">
          Workspace
        </span>
      </div>

      {/* Search — double-bezel input */}
      <div style={reveal(1)} className="mb-8">
        <div className="rounded-[1.25rem] p-1.5 bg-white/[0.03] border border-white/[0.06]">
          <div className="relative">
            <MagnifyingGlass size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search customer or form..."
              className="w-full pl-12 pr-24 py-3.5 rounded-[0.95rem] text-base bg-[#1c1c1e] text-white placeholder:text-gray-600 outline-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] focus:shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_0_0_2px_rgba(10,132,255,0.25)] transition-all"
              style={{ transitionTimingFunction: EASE, transitionDuration: '300ms' }}
              onKeyDown={e => { if (e.key === 'Enter' && search.trim()) navigate(`/app/customers?q=${encodeURIComponent(search)}`); }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-gray-600 font-mono hidden sm:block">↵ Enter</span>
          </div>
        </div>
      </div>

      {/* Metrics — double-bezel stat tiles */}
      <div style={reveal(2)} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-[1.25rem] p-1.5 bg-white/[0.02] border border-white/[0.05]">
            <div className="rounded-[0.95rem] px-4 py-3.5 bg-[#1c1c1e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-3" style={{ background: `${m.tint}1a` }}>
                <m.icon size={15} weight="fill" style={{ color: m.tint }} />
              </div>
              <p className="text-2xl font-semibold text-white tabular-nums tracking-tight leading-none">{m.value}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1.5">{m.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <section style={reveal(3)} className="mb-8">
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff9f0a] animate-pulse" />
            <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.15em]">Needs attention</h2>
          </div>
          <div className="space-y-2.5">
            {pending.map((f: any) => (
              <button
                key={f.id}
                onClick={() => navigate('/app/whatsapp')}
                className="group w-full flex items-center gap-3.5 px-4 py-3.5 rounded-[1.25rem] bg-white/[0.03] border border-white/[0.05] active:scale-[0.98] transition-all text-left"
                style={{ transitionTimingFunction: EASE, transitionDuration: '300ms' }}
              >
                <div className="w-10 h-10 rounded-xl bg-[#ff9f0a]/10 flex items-center justify-center shrink-0">
                  <FileText size={17} className="text-[#ff9f0a]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-100 truncate">{f.customerName || 'New customer'}</p>
                  <p className="text-xs text-gray-500 truncate">Sent {f.fileName || 'documents'} · not processed</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center shrink-0 group-hover:bg-[#ff9f0a]/15 transition-all" style={{ transitionTimingFunction: EASE, transitionDuration: '300ms' }}>
                  <ArrowRight size={14} className="text-gray-500 group-hover:text-[#ff9f0a] group-hover:translate-x-0.5 transition-all" style={{ transitionTimingFunction: EASE, transitionDuration: '300ms' }} />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Recent */}
      {recent.length > 0 && (
        <section style={reveal(4)}>
          <div className="flex items-center gap-2 mb-4 px-1">
            <Clock size={13} className="text-gray-500" />
            <h2 className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.15em]">Recent</h2>
          </div>
          <div className="rounded-[1.25rem] overflow-hidden bg-white/[0.02] border border-white/[0.05] divide-y divide-white/[0.04]">
            {recent.map((f: any) => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors" style={{ transitionDuration: '200ms' }}>
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                  <FileText size={14} className="text-gray-500" />
                </div>
                <p className="flex-1 min-w-0 text-sm text-gray-300 truncate">{f.customerName || 'Unknown'}</p>
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
        <div style={reveal(3)} className="text-center py-24">
          <div className="w-16 h-16 rounded-[1.25rem] bg-[#0a84ff]/10 flex items-center justify-center mx-auto mb-5 shadow-[0_0_40px_rgba(10,132,255,0.15)]">
            <Lightning size={28} weight="fill" className="text-[#0a84ff]" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2 tracking-tight">Ready to go</h2>
          <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
            When customers send documents on WhatsApp, they'll appear here automatically.
          </p>
        </div>
      )}
    </div>
  );
}
