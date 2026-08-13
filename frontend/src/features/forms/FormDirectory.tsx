import { useEffect, useState, useCallback, useRef } from 'react';
import {
  MagnifyingGlass, ArrowSquareOut, FileText, Camera,
  Signature, CurrencyInr, CheckCircle, Buildings, Clock, CalendarBlank
} from '@phosphor-icons/react';
import api from '../../shared/api';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

interface FormSpec { width: number; height: number; minKB: number; maxKB: number; format: string; bg: string; }
interface Form {
  id: string; name: string; short_name: string; portal: string; url: string;
  required_documents: string[]; fee: Record<string, number>;
  photo_specs: FormSpec | null; signature_specs: FormSpec | null;
  fill_count: number; confidence?: number | null;
  lifecycle: 'open' | 'upcoming' | 'closed' | 'archived';
  opens_at: string | null; closes_at: string | null;
  source_updated_at: string | null; closing_soon: boolean;
}

type FilterTab = 'all' | 'open' | 'closing_soon';

const PORTAL_TINT: Record<string, string> = {
  SSC: '#0a84ff', Railway: '#30d158', UPSC: '#bf5af2', NTA: '#ff9f0a',
  IBPS: '#5e5ce6', 'Passport Seva': '#ff453a', 'Bihar Board': '#ffd60a',
};

const BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Open' },
  upcoming: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Upcoming' },
  closed: { bg: 'bg-gray-500/15', text: 'text-gray-400', label: 'Closed' },
  archived: { bg: 'bg-gray-500/10', text: 'text-gray-500', label: 'Archived' },
  closing_soon: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Closing Soon' },
};

function LifecycleBadge({ form }: { form: Form }) {
  const key = form.closing_soon ? 'closing_soon' : form.lifecycle;
  const style = BADGE_STYLES[key] || BADGE_STYLES.open;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${style.bg} ${style.text}`}>
      {form.closing_soon && <Clock size={10} weight="bold" />}
      {style.label}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function DateLine({ form }: { form: Form }) {
  const opens = formatDate(form.opens_at);
  const closes = formatDate(form.closes_at);
  if (!opens && !closes) return null;
  return (
    <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
      <CalendarBlank size={12} className="text-gray-600 shrink-0" />
      {opens && <span>Opens {opens}</span>}
      {closes && <span className={form.closing_soon ? 'text-amber-400 font-medium' : ''}>Closes {closes}</span>}
    </div>
  );
}

function SpecChip({ icon: Icon, label, spec }: { icon: any; label: string; spec: FormSpec | null }) {
  if (!spec) return null;
  return (
    <div className="rounded-xl p-1 bg-white/[0.02] border border-white/[0.05]">
      <div className="rounded-lg px-3 py-2.5 bg-[#1c1c1e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Icon size={13} className="text-gray-400" />
          <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
        </div>
        <p className="text-xs text-gray-200 font-mono">{spec.width}×{spec.height}px</p>
        <p className="text-[11px] text-gray-500 font-mono">{spec.minKB}–{spec.maxKB} KB · {spec.format.toUpperCase()}</p>
      </div>
    </div>
  );
}

export default function FormDirectory() {
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Form | null>(null);
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');

  const load = useCallback(async (q: string, tab: FilterTab) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (tab === 'open') params.set('lifecycle', 'open');
      if (tab === 'closing_soon') params.set('closing_soon', '1');
      const r = await api.get(`/forms/search?${params.toString()}`);
      setForms(r.data);
    } catch {}
    setLoading(false);
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => { load('', filter); }, [load, filter]);
  useEffect(() => {
    const t = setTimeout(() => load(search, filter), 250);
    return () => clearTimeout(t);
  }, [search, filter, load]);

  const reveal = (i: number) => ({
    transform: mounted ? 'translateY(0)' : 'translateY(14px)',
    opacity: mounted ? 1 : 0,
    transition: `transform 600ms ${EASE} ${i * 50}ms, opacity 600ms ${EASE} ${i * 50}ms`,
  });

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'closing_soon', label: 'Closing Soon' },
  ];

  return (
    <div className="max-w-3xl mx-auto pt-4">
      <div style={reveal(0)} className="mb-5">
        <span className="inline-block rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-medium text-gray-500 bg-white/[0.04] border border-white/[0.06]">
          Form Directory
        </span>
        <h1 className="text-2xl font-semibold text-white tracking-tight mt-3">Which form do you need?</h1>
        <p className="text-sm text-gray-500 mt-1">Search any government form — get the link, required documents, and exact photo specs.</p>
      </div>

      {/* Search */}
      <div style={reveal(1)} className="mb-4 sticky top-0 z-10">
        <div className="rounded-[1.25rem] p-1.5 bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl">
          <div className="relative">
            <MagnifyingGlass size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="SSC, Railway, Passport, NEET..."
              className="w-full pl-12 pr-4 py-3.5 rounded-[0.95rem] text-base bg-[#1c1c1e] text-white placeholder:text-gray-600 outline-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] focus:shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_0_0_2px_rgba(10,132,255,0.25)] transition-all"
              style={{ transitionTimingFunction: EASE, transitionDuration: '300ms' }}
            />
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div style={reveal(1)} className="mb-6 flex gap-2">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border ${
              filter === tab.key
                ? 'bg-white/[0.1] text-white border-white/[0.15]'
                : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:bg-white/[0.06]'
            }`}
            style={{ transitionTimingFunction: EASE, transitionDuration: '200ms' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1,2,3].map(i => <div key={i} className="h-20 rounded-[1.25rem] bg-white/[0.03]" />)}
        </div>
      ) : forms.length === 0 ? (
        <div className="text-center py-20">
          <FileText size={36} className="mx-auto text-gray-600 mb-3" />
          <p className="text-sm text-gray-400">No form found for "{search}"</p>
          <p className="text-xs text-gray-600 mt-1">Try the portal name like SSC or Railway</p>
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map((f, i) => (
            <FormRow
              key={f.id}
              f={f}
              isOpen={selected?.id === f.id}
              onToggle={() => setSelected(selected?.id === f.id ? null : f)}
              style={reveal(2 + i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FormRow({ f, isOpen, onToggle, style }: { f: Form; isOpen: boolean; onToggle: () => void; style: React.CSSProperties }) {
  const tint = PORTAL_TINT[f.portal] || '#0a84ff';
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(0);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const update = () => setMaxH(isOpen ? el.scrollHeight : 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  return (
    <div style={style} className="rounded-[1.5rem] p-1.5 bg-white/[0.02] border border-white/[0.05]">
      <div className="rounded-[1.1rem] bg-[#1c1c1e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] overflow-hidden">
        {/* Header row */}
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:scale-[0.99] transition-transform"
          style={{ transitionTimingFunction: EASE, transitionDuration: '200ms' }}
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${tint}1a` }}>
            <Buildings size={20} weight="fill" style={{ color: tint }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white truncate">{f.short_name}</p>
              <LifecycleBadge form={f} />
            </div>
            <p className="text-xs text-gray-500 truncate">{f.name}</p>
            <DateLine form={f} />
          </div>
          {f.fill_count > 0 && (
            <span className="hidden sm:flex items-center gap-1.5 text-[11px] shrink-0">
              <CheckCircle size={12} weight="fill" className="text-[#30d158]" />
              <span className="text-gray-400">filled {f.fill_count}×</span>
              {f.confidence != null && f.confidence >= 70 && (
                <span className="text-[#30d158] font-medium">· {f.confidence}%</span>
              )}
            </span>
          )}
        </button>

        {/* Expanded detail */}
        <div
          className="overflow-hidden transition-all"
          style={{ maxHeight: maxH, transitionTimingFunction: EASE, transitionDuration: '400ms' }}
        >
          <div ref={contentRef} className="px-4 pb-4 pt-1 space-y-4">
            {/* Documents */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Required documents</p>
              <div className="flex flex-wrap gap-1.5">
                {f.required_documents.map(d => (
                  <span key={d} className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.05] text-gray-300 border border-white/[0.04]">{d}</span>
                ))}
              </div>
            </div>

            {/* Photo + Signature specs */}
            {(f.photo_specs || f.signature_specs) && (
              <div className="grid grid-cols-2 gap-2">
                <SpecChip icon={Camera} label="Photo" spec={f.photo_specs} />
                <SpecChip icon={Signature} label="Signature" spec={f.signature_specs} />
              </div>
            )}

            {/* Fee */}
            {f.fee && Object.keys(f.fee).length > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                <CurrencyInr size={14} className="text-gray-500" />
                {Object.entries(f.fee).map(([k, v]) => (
                  <span key={k} className="capitalize">{k.replace('_', '/')}: <span className="text-gray-200 font-medium">{v === 0 ? 'Free' : `₹${v}`}</span></span>
                ))}
              </div>
            )}

            {/* CTA */}
            <div className="flex items-center gap-2 flex-wrap">
              <a href={f.url} target="_blank" rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 pl-5 pr-2 py-2 rounded-full font-medium text-sm text-white active:scale-[0.98] transition-all min-w-0"
                style={{ background: tint, transitionTimingFunction: EASE, transitionDuration: '300ms' }}>
                <span className="truncate">Open {f.short_name}</span>
                <span className="w-7 h-7 rounded-full bg-black/20 flex items-center justify-center shrink-0 group-hover:translate-x-0.5 transition-transform" style={{ transitionTimingFunction: EASE, transitionDuration: '300ms' }}>
                  <ArrowSquareOut size={14} weight="bold" />
                </span>
              </a>
              {(f.photo_specs || f.signature_specs) && (
                <a
                  href={`/app/forms/photo?form=${encodeURIComponent(f.short_name)}${f.photo_specs ? `&photo=${encodeURIComponent(JSON.stringify(f.photo_specs))}` : ''}${f.signature_specs ? `&signature=${encodeURIComponent(JSON.stringify(f.signature_specs))}` : ''}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm text-gray-200 bg-white/[0.06] border border-white/[0.06] hover:bg-white/[0.1] active:scale-[0.98] transition-all shrink-0"
                  style={{ transitionTimingFunction: EASE, transitionDuration: '300ms' }}>
                  <Camera size={15} /> Prepare Photo
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
