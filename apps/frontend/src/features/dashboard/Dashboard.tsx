import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MagnifyingGlass, ArrowRight, Sparkle, Lightning,
  FileText, ChatCircle, CheckCircle, Circle, X
} from '@phosphor-icons/react';
import api from '../../shared/api';
import { extensionBridge } from '../../shared/extensionBridge';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const INK = 'hsl(var(--pt-ink))';
const MARIGOLD = 'hsl(var(--pt-marigold))';
const MARIGOLD_DEEP = 'hsl(var(--pt-marigold-deep))';
const GREEN = 'hsl(158 60% 36%)';

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

      <SetupChecklist />

      {/* Search — first action: form OR customer */}
      <div style={reveal(0)} className="mb-8">
        <div className="paper-card p-1.5">
          <div className="relative">
            <MagnifyingGlass size={20} className="absolute left-4 top-1/2 -translate-y-1/2 pt-muted pointer-events-none" />
            <input
              autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search a form (SSC, Railway...) or customer name"
              className="w-full pl-12 pr-4 py-3.5 rounded-[0.95rem] text-base outline-none transition-all"
              style={{ background: 'hsl(var(--pt-secondary) / 0.5)', color: INK }}
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
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl" style={{ background: 'hsl(var(--pt-secondary) / 0.6)' }} />)}
        </div>
      ) : queue.length === 0 ? (
        <div style={reveal(1)} className="text-center py-24">
          <div className="w-16 h-16 rounded-[1.25rem] flex items-center justify-center mx-auto mb-5"
            style={{ background: 'hsl(var(--pt-marigold) / 0.12)' }}>
            <Lightning size={28} weight="fill" style={{ color: MARIGOLD_DEEP }} />
          </div>
          <h2 className="pt-display text-xl font-bold mb-2 tracking-tight" style={{ color: INK }}>All caught up</h2>
          <p className="text-sm pt-muted max-w-xs mx-auto leading-relaxed">
            When customers send documents on WhatsApp, they'll show up here ready to work on.
          </p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section style={reveal(1)} className="mb-8">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: MARIGOLD }} />
                <h2 className="pt-label text-[11px] font-medium pt-muted">Needs action · {pending.length}</h2>
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

          {ready.length > 0 && (
            <section style={reveal(2)} className="mb-8">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="w-2 h-2 rounded-full" style={{ background: GREEN }} />
                <h2 className="pt-label text-[11px] font-medium pt-muted">Ready to fill · {ready.length}</h2>
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

/* First-run setup guidance — hides once complete or dismissed.
   Never flashes "incomplete": renders nothing until real statuses are known,
   and remembers completion so set-up workspaces show nothing instantly. */
function SetupChecklist() {
  const navigate = useNavigate();
  const cachedComplete = localStorage.getItem('cc-setup-complete') === '1';
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('cc-setup-dismissed') === '1');
  const [extOk, setExtOk] = useState<boolean | null>(cachedComplete ? true : null);
  const [waOk, setWaOk] = useState<boolean | null>(cachedComplete ? true : (localStorage.getItem('cc-wa-connected') === 'true' ? true : null));
  const [driveOk, setDriveOk] = useState<boolean | null>(cachedComplete ? true : (localStorage.getItem('cc-drive-connected') === 'true' ? true : null));

  // Only trust definitive extension states; ignore transient 'unknown'/'connecting'.
  useEffect(() => extensionBridge.onStatus((s) => {
    if (s === 'connected') setExtOk(true);
    else if (s === 'disconnected') setExtOk(false);
  }), []);

  useEffect(() => {
    if (cachedComplete) return;   // already set up — skip extra status calls for a faster load
    let alive = true;
    api.get('/drive/status').then(r => { const c = !!r.data?.connected; localStorage.setItem('cc-drive-connected', c ? 'true' : 'false'); if (alive) setDriveOk(c); }).catch(() => { if (alive) setDriveOk(false); });
    api.get('/whatsapp/status').then(r => { if (alive) setWaOk(!!r.data?.connected); }).catch(() => { if (alive) setWaOk(false); });
    return () => { alive = false; };
  }, []);

  const steps = [
    { done: extOk === true, label: 'Install the browser extension', desc: 'Autofills government forms', action: () => window.open('https://cybercontrol.fun/#extension', '_blank') },
    { done: waOk === true, label: 'Connect WhatsApp', desc: 'Receive customer documents', action: () => navigate('/app/whatsapp') },
    { done: driveOk === true, label: 'Connect Google Drive', desc: 'Store received files', action: () => navigate('/app/settings') },
  ];
  const allKnown = extOk !== null && waOk !== null && driveOk !== null;
  const allDone = steps.every(s => s.done);
  const doneCount = steps.filter(s => s.done).length;

  useEffect(() => {
    if (allDone) localStorage.setItem('cc-setup-complete', '1');
    else if (allKnown) localStorage.removeItem('cc-setup-complete');
  }, [allDone, allKnown]);

  if (dismissed) return null;
  if (!allKnown) return null;   // render nothing until every status is known → no flash
  if (allDone) return null;

  return (
    <div className="paper-card p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="pt-display text-sm font-bold" style={{ color: INK }}>Set up your workspace</p>
          <p className="text-xs pt-muted">{doneCount} of {steps.length} done</p>
        </div>
        <button onClick={() => { localStorage.setItem('cc-setup-dismissed', '1'); setDismissed(true); }} className="pt-muted hover:text-red-500 p-1 transition-colors" aria-label="Dismiss setup checklist">
          <X size={16} />
        </button>
      </div>
      <div className="space-y-1.5">
        {steps.map((s, i) => (
          <button key={i} onClick={s.action} disabled={s.done}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition active:scale-[0.99] disabled:cursor-default"
            style={{ background: 'hsl(var(--pt-secondary) / 0.5)' }}>
            {s.done
              ? <CheckCircle size={20} weight="fill" style={{ color: GREEN }} className="shrink-0" />
              : <Circle size={20} style={{ color: 'hsl(var(--pt-muted))' }} className="shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: s.done ? 'hsl(var(--pt-muted))' : INK, textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</div>
              <div className="text-[11px] pt-muted">{s.desc}</div>
            </div>
            {!s.done && <ArrowRight size={15} className="pt-muted shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/* PENDING card — customer sent docs, needs processing */
function PendingCard({ c, onProcess, onAsk }: { c: QueueItem; onProcess: () => void; onAsk: () => void }) {
  const isNew = c.status === 'new';
  const tint = isNew ? MARIGOLD : 'hsl(35 92% 48%)';
  return (
    <div className="paper-card p-4">
      <div className="flex items-center gap-3.5 mb-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-sm font-semibold"
          style={{ background: isNew ? 'hsl(var(--pt-marigold) / 0.14)' : 'hsl(35 92% 48% / 0.14)', color: tint }}>
          {c.name[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: INK }}>{c.name}</p>
          <p className="text-xs pt-muted">
            {isNew ? 'New documents' : 'Documents received'}
            {c.docCount > 0 && ` · ${c.docCount} doc${c.docCount === 1 ? '' : 's'}`}
            {c.lastActivity && ` · ${timeAgo(c.lastActivity)}`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onProcess}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white active:scale-[0.98] transition-transform"
          style={{ background: MARIGOLD, transitionTimingFunction: EASE, transitionDuration: '200ms' }}>
          <Sparkle size={15} weight="fill" /> Process documents
        </button>
        <button onClick={onAsk}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium active:scale-[0.98] transition-all"
          style={{ background: 'hsl(var(--pt-secondary))', color: INK, transitionTimingFunction: EASE, transitionDuration: '200ms' }}>
          <ChatCircle size={15} /> Open chat
        </button>
      </div>
    </div>
  );
}

/* READY card — profile built, can fill */
function ReadyCard({ c, onClick }: { c: QueueItem; onClick: () => void }) {
  return (
    <div className="paper-card p-4" style={{ borderColor: 'hsl(158 60% 36% / 0.35)' }}>
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-sm font-semibold"
          style={{ background: 'hsl(158 60% 36% / 0.14)', color: GREEN }}>
          {c.name[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: INK }}>{c.name}</p>
          <p className="text-xs pt-muted">
            Profile ready · {c.fieldCount} fields saved
            {c.lastActivity && ` · ${timeAgo(c.lastActivity)}`}
          </p>
        </div>
        <button onClick={onClick}
          className="group flex items-center gap-2 pl-4 pr-2 py-2 rounded-full text-sm font-semibold text-white active:scale-[0.98] transition-transform shrink-0"
          style={{ background: GREEN, transitionTimingFunction: EASE, transitionDuration: '200ms' }}>
          Fill form
          <span className="w-7 h-7 rounded-full bg-black/15 flex items-center justify-center group-hover:translate-x-0.5 transition-transform" style={{ transitionTimingFunction: EASE, transitionDuration: '200ms' }}>
            <ArrowRight size={14} weight="bold" />
          </span>
        </button>
      </div>
    </div>
  );
}

function SearchResults({ search, searching, formResults, customerMatches, navigate }: any) {
  return (
    <div>
      {customerMatches.length > 0 && (
        <section className="mb-6">
          <h2 className="pt-label text-[11px] pt-muted mb-3 px-1">Customers</h2>
          <div className="space-y-2">
            {customerMatches.map((c: QueueItem) => (
              <button key={c.phone} onClick={() => navigate(`/app/customers/${encodeURIComponent(c.phone)}`)}
                className="group w-full flex items-center gap-3.5 px-4 py-3 rounded-xl paper-card active:scale-[0.99] transition-all text-left"
                style={{ transitionTimingFunction: EASE, transitionDuration: '200ms' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0"
                  style={{ background: 'hsl(var(--pt-marigold) / 0.14)', color: MARIGOLD_DEEP }}>{c.name[0]?.toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: INK }}>{c.name}</p>
                  <p className="text-xs pt-muted">{c.status === 'ready' ? 'Ready to fill' : 'Needs processing'}</p>
                </div>
                <ArrowRight size={15} className="pt-muted" />
              </button>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="pt-label text-[11px] pt-muted mb-3 px-1">Forms</h2>
        {searching && formResults.length === 0 ? (
          <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'hsl(var(--pt-secondary) / 0.6)' }} />)}</div>
        ) : formResults.length === 0 ? (
          <p className="text-sm pt-muted px-1 py-4">No form matches "{search}". Try SSC, Railway, NEET, Passport.</p>
        ) : (
          <div className="space-y-2">
            {formResults.map((f: FormResult) => (
              <button key={f.id} onClick={() => navigate(`/app/forms?q=${encodeURIComponent(search)}`)}
                className="group w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl paper-card active:scale-[0.99] transition-all text-left"
                style={{ transitionTimingFunction: EASE, transitionDuration: '200ms' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'hsl(var(--pt-marigold) / 0.14)' }}><FileText size={18} style={{ color: MARIGOLD_DEEP }} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: INK }}>{f.short_name}</p>
                  <p className="text-xs pt-muted">{f.portal}{f.fill_count > 0 && <span style={{ color: GREEN }}> · filled {f.fill_count}×</span>}</p>
                </div>
                <ArrowRight size={15} className="pt-muted" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
