import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MagnifyingGlass, ArrowRight, Sparkle, Lightning,
  FileText, ChatCircle, Lightning as Bolt
} from '@phosphor-icons/react';
import api from '../../shared/api';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

interface QueueItem {
  phone: string; name: string; docCount: number;
  lastActivity: string; status: 'ready' | 'pending' | 'new'; fieldCount: number;
}
interface FormResult { id: string; short_name: string; portal: string; url: string; fill_count: number; }

function timeAgo(ts: string): string {
  if (!ts) return '';
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return Math.floor(d / 86400000) + 'd ago';
}

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

  useEffect(() => {
    const q = search.trim();
    if (!q) { setFormResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { const r = await api.get(`/forms/search?q=${encodeURIComponent(q)}`); setFormResults(r.data || []); } catch {}
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const customerMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return queue.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 5);
  }, [search, queue]);

  // Split into sections per architecture mockup
  const pending = useMemo(() => queue.filter(q => q.status === 'new' || q.status === 'pending'), [queue]);
  const ready = useMemo(() => queue.filter(q => q.status === 'ready'), [queue]);

  const reveal = (i: number) => ({
    transform: mounted ? 'translateY(0)' : 'translateY(14px)',
    opacity: mounted ? 1 : 0,
    transition: `transform 600ms ${EASE} ${i * 60}ms, opacity 600ms ${EASE} ${i * 60}ms`,
  });

  const isSearching = search.trim().length > 0;

  return (
    <div className="max-w-2xl mx-auto pt-4">

      {/* Search — first action: form OR customer */}
      <div style={reveal(0)} className="mb-8">
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

      {isSearching ? (
        <SearchResults
          search={search} searching={searching} formResults={formResults}
          customerMatches={customerMatches} navigate={navigate}
        />
      ) : loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-white/[0.03]" />)}
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
          {/* PENDING — needs action */}
          {pending.length > 0 && (
            <section style={reveal(1)} className="mb-8">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="w-2 h-2 rounded-full bg-[#ffd60a] animate-pulse" />
                <h2 className="text-[11px] uppercase tracking-[0.15em] text-gray-400 font-medium">Needs action · {pending.length}</h2>
              </div>
              <div className="space-y-3">
                {pending.map(c => (
                  <PendingCard key={c.phone} c={c}
                    onProcess={() => navigate(`/app/customers/${encodeURIComponent(c.phone)}`)}
                    onAsk={() => navigate('/app/whatsapp')} />
                ))}
              </div>
            </section>
          )}

          {/* READY — can fill anytime */}
          {ready.length > 0 && (
            <section style={reveal(2)} className="mb-8">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="w-2 h-2 rounded-full bg-[#30d158]" />
                <h2 className="text-[11px] uppercase tracking-[0.15em] text-gray-400 font-medium">Ready to fill · {ready.length}</h2>
              </div>
              <div className="space-y-3">
                {ready.map(c => (
                  <ReadyCard key={c.phone} c={c} onClick={() => navigate(`/app/customers/${encodeURIComponent(c.phone)}`)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* PENDING card — customer sent docs, needs processing */
function PendingCard({ c, onProcess, onAsk }: { c: QueueItem; onProcess: () => void; onAsk: () => void }) {
  const isNew = c.status === 'new';
  return (
    <div className="rounded-2xl p-1.5 bg-white/[0.02] border border-white/[0.05]">
      <div className="rounded-[0.85rem] bg-[#1c1c1e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] p-4">
        <div className="flex items-center gap-3.5 mb-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-sm font-semibold"
            style={{ background: isNew ? 'rgba(10,132,255,0.12)' : 'rgba(255,214,10,0.12)', color: isNew ? '#0a84ff' : '#ffd60a' }}>
            {c.name[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{c.name}</p>
            <p className="text-xs text-gray-500">
              {isNew ? 'New documents' : 'Documents received'}
              {c.docCount > 0 && ` · ${c.docCount} doc${c.docCount === 1 ? '' : 's'}`}
              {c.lastActivity && ` · ${timeAgo(c.lastActivity)}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onProcess}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white active:scale-[0.98] transition-transform"
            style={{ background: '#0a84ff', transitionTimingFunction: EASE, transitionDuration: '200ms' }}>
            <Sparkle size={15} weight="fill" /> Process documents
          </button>
          <button onClick={onAsk}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] active:scale-[0.98] transition-all"
            style={{ transitionTimingFunction: EASE, transitionDuration: '200ms' }}>
            <ChatCircle size={15} /> Open chat
          </button>
        </div>
      </div>
    </div>
  );
}

/* READY card — profile built, can fill */
function ReadyCard({ c, onClick }: { c: QueueItem; onClick: () => void }) {
  return (
    <div className="rounded-2xl p-1.5 bg-[#30d158]/[0.04] border border-[#30d158]/[0.12]">
      <div className="rounded-[0.85rem] bg-[#1c1c1e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] p-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-sm font-semibold bg-[#30d158]/12 text-[#30d158]"
            style={{ background: 'rgba(48,209,88,0.12)' }}>
            {c.name[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{c.name}</p>
            <p className="text-xs text-gray-500">
              Profile ready · {c.fieldCount} fields saved
              {c.lastActivity && ` · ${timeAgo(c.lastActivity)}`}
            </p>
          </div>
          <button onClick={onClick}
            className="group flex items-center gap-2 pl-4 pr-2 py-2 rounded-full text-sm font-medium text-white active:scale-[0.98] transition-transform shrink-0"
            style={{ background: '#30d158', color: '#04140a', transitionTimingFunction: EASE, transitionDuration: '200ms' }}>
            Fill form
            <span className="w-7 h-7 rounded-full bg-black/15 flex items-center justify-center group-hover:translate-x-0.5 transition-transform" style={{ transitionTimingFunction: EASE, transitionDuration: '200ms' }}>
              <ArrowRight size={14} weight="bold" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchResults({ search, searching, formResults, customerMatches, navigate }: any) {
  return (
    <div>
      {customerMatches.length > 0 && (
        <section className="mb-6">
          <h2 className="text-[11px] uppercase tracking-[0.15em] text-gray-500 mb-3 px-1">Customers</h2>
          <div className="space-y-2">
            {customerMatches.map((c: QueueItem) => (
              <button key={c.phone} onClick={() => navigate(`/app/customers/${encodeURIComponent(c.phone)}`)}
                className="group w-full flex items-center gap-3.5 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] active:scale-[0.99] transition-all text-left"
                style={{ transitionTimingFunction: EASE, transitionDuration: '200ms' }}>
                <div className="w-9 h-9 rounded-lg bg-[#0a84ff]/10 flex items-center justify-center text-[#0a84ff] text-sm font-semibold shrink-0">{c.name[0]?.toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-100 truncate">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.status === 'ready' ? 'Ready to fill' : 'Needs processing'}</p>
                </div>
                <ArrowRight size={15} className="text-gray-600 group-hover:text-white transition-colors" />
              </button>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="text-[11px] uppercase tracking-[0.15em] text-gray-500 mb-3 px-1">Forms</h2>
        {searching && formResults.length === 0 ? (
          <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />)}</div>
        ) : formResults.length === 0 ? (
          <p className="text-sm text-gray-600 px-1 py-4">No form matches "{search}". Try SSC, Railway, NEET, Passport.</p>
        ) : (
          <div className="space-y-2">
            {formResults.map((f: FormResult) => (
              <button key={f.id} onClick={() => navigate(`/app/forms?q=${encodeURIComponent(search)}`)}
                className="group w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-[#0a84ff]/30 active:scale-[0.99] transition-all text-left"
                style={{ transitionTimingFunction: EASE, transitionDuration: '200ms' }}>
                <div className="w-10 h-10 rounded-xl bg-[#0a84ff]/10 flex items-center justify-center shrink-0"><FileText size={18} className="text-[#0a84ff]" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{f.short_name}</p>
                  <p className="text-xs text-gray-500">{f.portal}{f.fill_count > 0 && <span className="text-[#30d158]"> · filled {f.fill_count}×</span>}</p>
                </div>
                <ArrowRight size={15} className="text-gray-600 group-hover:text-[#0a84ff] transition-colors" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
