import { useEffect, useState, useCallback, useRef } from 'react';
import {
  MagnifyingGlass, ArrowSquareOut, FileText, Camera,
  Signature, CurrencyInr, CheckCircle, Buildings
} from '@phosphor-icons/react';
import api from '../../shared/api';
import { REVEAL_EASE as EASE, useReveal } from '../../shared/useReveal';

interface FormSpec { width: number; height: number; minKB: number; maxKB: number; format: string; bg: string; }
interface Form {
  id: string; name: string; short_name: string; portal: string; url: string;
  required_documents: string[]; fee: Record<string, number>;
  photo_specs: FormSpec | null; signature_specs: FormSpec | null; fill_count: number; confidence?: number | null;
}

const PORTAL_TINT: Record<string, string> = {
  SSC: 'hsl(215 75% 42%)',
  Railway: 'hsl(158 55% 36%)',
  UPSC: 'hsl(280 45% 42%)',
  NTA: 'hsl(28 95% 48%)',
  IBPS: 'hsl(230 45% 48%)',
  'Passport Seva': 'hsl(0 65% 48%)',
  'Bihar Board': 'hsl(40 90% 40%)',
};

function SpecChip({ icon: Icon, label, spec }: { icon: any; label: string; spec: FormSpec | null }) {
  if (!spec) return null;
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ background: 'hsl(var(--pt-secondary) / 0.65)', border: '1px solid hsl(var(--pt-border))' }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={13} style={{ color: 'hsl(var(--pt-muted))' }} />
        <span className="pt-label text-[10px]" style={{ color: 'hsl(var(--pt-muted))' }}>{label}</span>
      </div>
      <p className="text-xs font-mono font-medium" style={{ color: 'hsl(var(--ink))' }}>{spec.width}×{spec.height}px</p>
      <p className="text-[11px] font-mono" style={{ color: 'hsl(var(--pt-muted))' }}>{spec.minKB}–{spec.maxKB} KB · {spec.format.toUpperCase()}</p>
    </div>
  );
}

export default function FormDirectory() {
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Form | null>(null);
  const { reveal, trigger } = useReveal({ auto: false });

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try { const r = await api.get(`/forms/search?q=${encodeURIComponent(q)}`); setForms(r.data); }
    catch {}
    setLoading(false);
    trigger();
  }, [trigger]);

  useEffect(() => { load(''); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <div className="max-w-3xl mx-auto pt-4">
      <div style={reveal(0)} className="mb-5">
        <span
          className="inline-block rounded-full px-3 py-1 pt-label text-[10px] font-medium"
          style={{ color: 'hsl(var(--marigold-deep))', background: 'hsl(var(--marigold) / 0.12)', border: '1px solid hsl(var(--marigold) / 0.25)' }}
        >
          Form Directory
        </span>
        <h1 className="pt-display text-[1.65rem] font-bold tracking-tight mt-3" style={{ color: 'hsl(var(--ink))' }}>
          Which form do you need?
        </h1>
        <p className="text-sm mt-1.5" style={{ color: 'hsl(var(--pt-muted))' }}>
          Search any government form — get the link, required documents, and exact photo specs.
        </p>
      </div>

      {/* Search */}
      <div style={reveal(1)} className="mb-8 sticky top-0 z-10">
        <div className="paper-card p-1.5">
          <div className="relative">
            <MagnifyingGlass size={20} className="absolute left-4 top-1/2 -translate-y-1/2 pt-muted pointer-events-none" />
            <input
              autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="SSC, Railway, Passport, NEET..."
              className="w-full pl-12 pr-4 py-3.5 rounded-[0.95rem] text-base outline-none transition-all input-field border-0"
              style={{ transitionTimingFunction: EASE, transitionDuration: '300ms', background: 'hsl(var(--pt-secondary) / 0.5)' }}
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl" style={{ background: 'hsl(var(--pt-secondary) / 0.6)' }} />)}
        </div>
      ) : forms.length === 0 ? (
        <div className="text-center py-20">
          <FileText size={36} className="mx-auto mb-3" style={{ color: 'hsl(var(--pt-muted))' }} />
          <p className="text-sm" style={{ color: 'hsl(var(--pt-muted))' }}>No form found for "{search}"</p>
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--pt-muted))' }}>Try the portal name like SSC or Railway</p>
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
  const tint = PORTAL_TINT[f.portal] || 'hsl(var(--marigold-deep))';
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(0);

  // Measure the real content height so nothing gets clipped (forms vary; on
  // mobile the doc chips + CTA buttons wrap to extra rows).
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
    <div style={{ ...style, border: '1px solid hsl(var(--pt-border))', boxShadow: 'var(--shadow-paper)' }} className="rounded-2xl overflow-hidden bg-white">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:scale-[0.99] transition-transform"
        style={{ transitionTimingFunction: EASE, transitionDuration: '200ms' }}
      >
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'hsl(var(--marigold) / 0.12)' }}>
          <Buildings size={20} weight="fill" style={{ color: tint }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--ink))' }}>{f.short_name}</p>
          <p className="text-xs truncate" style={{ color: 'hsl(var(--pt-muted))' }}>{f.name}</p>
        </div>
        {f.fill_count > 0 && (
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] shrink-0" style={{ color: 'hsl(var(--pt-muted))' }}>
            <CheckCircle size={12} weight="fill" style={{ color: 'hsl(var(--confidence))' }} />
            <span>filled {f.fill_count}×</span>
            {f.confidence != null && f.confidence >= 70 && (
              <span className="font-medium" style={{ color: 'hsl(var(--confidence))' }}>· {f.confidence}%</span>
            )}
          </span>
        )}
      </button>

      <div
        className="overflow-hidden transition-all"
        style={{ maxHeight: maxH, transitionTimingFunction: EASE, transitionDuration: '400ms' }}
      >
        <div ref={contentRef} className="px-4 pb-4 pt-1 space-y-4 border-t" style={{ borderColor: 'hsl(var(--pt-border-soft))' }}>
          <div>
            <p className="pt-label text-[10px] mb-2" style={{ color: 'hsl(var(--pt-muted))' }}>Required documents</p>
            <div className="flex flex-wrap gap-1.5">
              {f.required_documents.map(d => (
                <span
                  key={d}
                  className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                  style={{ background: 'hsl(var(--pt-secondary))', color: 'hsl(var(--ink-soft))', border: '1px solid hsl(var(--pt-border))' }}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>

          {(f.photo_specs || f.signature_specs) && (
            <div className="grid grid-cols-2 gap-2">
              <SpecChip icon={Camera} label="Photo" spec={f.photo_specs} />
              <SpecChip icon={Signature} label="Signature" spec={f.signature_specs} />
            </div>
          )}

          {f.fee && Object.keys(f.fee).length > 0 && (
            <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: 'hsl(var(--pt-muted))' }}>
              <CurrencyInr size={14} />
              {Object.entries(f.fee).map(([k, v]) => (
                <span key={k} className="capitalize">
                  {k.replace('_', '/')}:{' '}
                  <span className="font-semibold" style={{ color: 'hsl(var(--ink))' }}>{v === 0 ? 'Free' : `₹${v}`}</span>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 pl-5 pr-2 py-2 rounded-full font-semibold text-sm text-white active:scale-[0.98] transition-all min-w-0"
              style={{ background: 'var(--gradient-marigold)', transitionTimingFunction: EASE, transitionDuration: '300ms' }}
            >
              <span className="truncate">Open {f.short_name}</span>
              <span className="w-7 h-7 rounded-full bg-black/15 flex items-center justify-center shrink-0 group-hover:translate-x-0.5 transition-transform">
                <ArrowSquareOut size={14} weight="bold" />
              </span>
            </a>
            {(f.photo_specs || f.signature_specs) && (
              <a
                href={`/app/photos/portal?form=${encodeURIComponent(f.short_name)}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all shrink-0"
                style={{
                  color: 'hsl(var(--ink))',
                  background: 'hsl(var(--pt-secondary))',
                  border: '1px solid hsl(var(--pt-border))',
                  transitionTimingFunction: EASE,
                  transitionDuration: '300ms',
                }}
              >
                <Camera size={15} /> Prepare Photo
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
