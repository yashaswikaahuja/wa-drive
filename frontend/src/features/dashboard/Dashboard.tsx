import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MagnifyingGlass, ArrowRight, Sparkle, Lightning,
  Clock, FileText, CheckCircle
} from '@phosphor-icons/react';
import api from '../../shared/api';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

interface QueueItem {
  phone: string; name: string; docCount: number;
  lastActivity: string; status: 'ready' | 'pending' | 'new'; fieldCount: number;
}
interface FormResult { id: string; short_name: string; portal: string; url: string; fill_count: number; }

function timeAgo(ts: string): string {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return Math.floor(d / 86400000) + 'd ago';
}

const STATUS = {
  ready:   { dot: '#30d158', label: 'Ready to fill',  hint: 'Profile ready' },
  pending: { dot: '#ffd60a', label: 'Not extracted',  hint: 'Docs received' },
  new:     { dot: '#0a84ff', label: 'New documents',  hint: 'Just arrived' },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [formResults, setFormResults] = useState<FormResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api.get('/dashboard/queue')
      .then(r => setQueue(r.data || []))
      .catch(() => {})
      .finally(() => { setLoading(false); requestAnimationFrame(() => setMounted(true)); });
  }, []);

  // Form search — debounced
  useEffect(() => {
    const q = search.trim();
    if (!q) { setFormResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { const r = await api.get(`/forms/search?q=${encodeURIComponent(q)}`); setFormResults(r.data || []); }
      catch {}
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  // Customers matching the search (so search works for both forms AND customers)
  const customerMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return queue.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 5);
  }, [search, queue]);

  const reveal = (i: number) => ({
    transform: mounted ? 'translateY(0)' : 'translateY(14px)',
    opacity: mounted ? 1 : 0,
    transition: `transform 600ms ${EASE} ${i * 60}ms, opacity 600ms ${EASE} ${i * 60}ms`,
  });

  const isSearching = search.trim().length > 0;
  const counts = useMemo(() => ({
    needsAttention: queue.filter(q => q.status !== 'ready').length,
    ready: queue.filter(q => q.status === 'ready').length,
  }), [queue]);

  return (
    <div className="max-w-2xl mx-auto pt-4">

      {/* Search — the first action: form OR customer */}
      <div style={reveal(0)} className="mb-6">
        <div className="rounded-[1.25rem] p-1.5 bg-white/[0.03] border border-white/[0.06]">
          <div className="relative">
            <MagnifyingGlass size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search a form (SSC, Railway...) or customer name"
              className="w-full pl-12 pr-4 py-3.5 rounded-[0.95rem] text-base bg-[#1c1c1e] text-white placeholder:text-gray-600 outline-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] focus:shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_0_0_2px_rgba(10,132,255,0.25)] transition-all"
              style={{ transitionTimingFunction: EASE, transitionDuration: '300ms' }}
            />
          </div>
        </div>
      </div>

      {/* SEARCH RESULTS MODE */}
      {isSearching ? (
        <div style={reveal(1)}>
          {customerMatches.length > 0 && (
            <section className="mb-6">
              <h2 className="text-[11px] uppercase tracking-[0.15em] text-gray-500 mb-3 px-1">Customers</h2>
              <div className="space-y-2">
                {customerMatches.map(c => <CustomerRow key={c.phone} c={c} onClick={() => navigate(`/app/customers/${encodeURIComponent(c.phone)}`)} />)}
              </div>
            </section>
          )}
          <section>
            <h2 className="text-[11px] uppercase tracking-[0.15em] text-gray-500 mb-3 px-1">Forms</h2>
            {searching && formResults.length === 0 ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />)}</div>
            ) : formResults.length === 0 ? (
              <p className="text-sm text-gray-600 px-1 py-4">No form matches "{search}". Try SSC, Railway, NEET, Passport.</p>
            ) : (
              <div className="space-y-2">
                {formResults.map(f => (
                  <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                    onClick={() => navigate(`/app/forms?q=${encodeURIComponent(search)}`)}
                    className="group flex items-center gap-3.5 px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-[#0a84ff]/30 active:scale-[0.99] transition-all"
                    style={{ transitionTimingFunction: EASE, transitionDuration: '250ms' }}>
                    <div className="w-10 h-10 rounded-xl bg-[#0a84ff]/10 flex items-center justify-center shrink-0">
                      <FileText size={18} className="text-[#0a84ff]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{f.short_name}</p>
                      <p className="text-xs text-gray-500">
                        {f.portal}{f.fill_count > 0 && <span className="text-[#30d158]"> · filled {f.fill_count}×</span>}
                      </p>
                    </div>
                    <ArrowRight size={15} className="text-gray-600 group-hover:text-[#0a84ff] transition-colors" />
                  </a>
                ))}
                <button onClick={() => navigate(`/app/forms?q=${encodeURIComponent(search)}`)}
                  className="text-xs text-[#0a84ff] hover:text-[#409cff] px-1 mt-1 transition-colors">
                  See full details & photo specs →
                </button>
              </div>
            )}
          </section>
        </div>
      ) : (
        /* WORK QUEUE MODE — "Who needs my attention?" */
        <>
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[1,2,3,4].map(i => <div key={i} className="h-[68px] rounded-xl bg-white/[0.03]" />)}
            </div>
          ) : queue.length === 0 ? (
            <div style={reveal(1)} className="text-center py-24">
              <div className="w-16 h-16 rounded-[1.25rem] bg-[#0a84ff]/10 flex items-center justify-center mx-auto mb-5 shadow-[0_0_40px_rgba(10,132,255,0.15)]">
                <Lightning size={28} weight="fill" className="text-[#0a84ff]" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2 tracking-tight">All caught up</h2>
              <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
                When customers send documents on WhatsApp, they'll show up here ready to work on.
              </p>
            </div>
          ) : (
            <>
              {/* Summary line */}
              <div style={reveal(1)} className="flex items-center gap-4 mb-4 px-1 text-sm">
                {counts.needsAttention > 0 && (
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ffd60a]" />
                    {counts.needsAttention} need{counts.needsAttention === 1 ? 's' : ''} attention
                  </span>
                )}
                {counts.ready > 0 && (
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#30d158]" />
                    {counts.ready} ready
                  </span>
                )}
              </div>

              <div style={reveal(2)} className="space-y-2">
                {queue.map(c => (
                  <CustomerRow key={c.phone} c={c} onClick={() => navigate(`/app/customers/${encodeURIComponent(c.phone)}`)} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function CustomerRow({ c, onClick }: { c: QueueItem; onClick: () => void }) {
  const s = STATUS[c.status];
  return (
    <button onClick={onClick}
      className="group w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] active:scale-[0.99] transition-all text-left"
      style={{ transitionTimingFunction: EASE, transitionDuration: '250ms' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-semibold"
        style={{ background: `${s.dot}1a`, color: s.dot }}>
        {c.name[0]?.toUpperCase() || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-100 truncate">{c.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
          <span className="text-xs text-gray-500">
            {s.label}
            {c.docCount > 0 && ` · ${c.docCount} doc${c.docCount === 1 ? '' : 's'}`}
            {c.lastActivity && ` · ${timeAgo(c.lastActivity)}`}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {c.status === 'ready' ? (
          <span className="hidden sm:flex items-center gap-1 text-xs font-medium text-[#30d158]">
            <CheckCircle size={13} weight="fill" /> Ready
          </span>
        ) : c.status === 'pending' ? (
          <span className="hidden sm:flex items-center gap-1 text-xs font-medium text-[#0a84ff]">
            <Sparkle size={13} weight="fill" /> Extract
          </span>
        ) : (
          <span className="hidden sm:flex items-center gap-1 text-xs font-medium text-[#0a84ff]">
            <Clock size={13} /> Process
          </span>
        )}
        <ArrowRight size={15} className="text-gray-600 group-hover:text-white transition-colors" />
      </div>
    </button>
  );
}
