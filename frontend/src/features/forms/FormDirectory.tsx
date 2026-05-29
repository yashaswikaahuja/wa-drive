import { useEffect, useState, useCallback } from 'react';
import {
  MagnifyingGlass, ArrowSquareOut, FileText, Camera,
  Signature, CurrencyInr, CheckCircle, Buildings
} from '@phosphor-icons/react';
import api from '../../shared/api';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

interface FormSpec { width: number; height: number; minKB: number; maxKB: number; format: string; bg: string; }
interface Form {
  id: string; name: string; short_name: string; portal: string; url: string;
  required_documents: string[]; fee: Record<string, number>;
  photo_specs: FormSpec | null; signature_specs: FormSpec | null; fill_count: number;
}

const PORTAL_TINT: Record<string, string> = {
  SSC: '#0a84ff', Railway: '#30d158', UPSC: '#bf5af2', NTA: '#ff9f0a',
  IBPS: '#5e5ce6', 'Passport Seva': '#ff453a', 'Bihar Board': '#ffd60a',
};

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

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try { const r = await api.get(`/forms/search?q=${encodeURIComponent(q)}`); setForms(r.data); }
    catch {}
    setLoading(false);
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => { load(''); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  const reveal = (i: number) => ({
    transform: mounted ? 'translateY(0)' : 'translateY(14px)',
    opacity: mounted ? 1 : 0,
    transition: `transform 600ms ${EASE} ${i * 50}ms, opacity 600ms ${EASE} ${i * 50}ms`,
  });

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
      <div style={reveal(1)} className="mb-8 sticky top-0 z-10">
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
          {forms.map((f, i) => {
            const tint = PORTAL_TINT[f.portal] || '#0a84ff';
            const isOpen = selected?.id === f.id;
            return (
              <div key={f.id} style={reveal(2 + i)} className="rounded-[1.5rem] p-1.5 bg-white/[0.02] border border-white/[0.05]">
                <div className="rounded-[1.1rem] bg-[#1c1c1e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] overflow-hidden">
                  {/* Header row */}
                  <button
                    onClick={() => setSelected(isOpen ? null : f)}
                    className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:scale-[0.99] transition-transform"
                    style={{ transitionTimingFunction: EASE, transitionDuration: '200ms' }}
                  >
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${tint}1a` }}>
                      <Buildings size={20} weight="fill" style={{ color: tint }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{f.short_name}</p>
                      <p className="text-xs text-gray-500 truncate">{f.name}</p>
                    </div>
                    {f.fill_count > 0 && (
                      <span className="hidden sm:flex items-center gap-1 text-[11px] text-gray-500 shrink-0">
                        <CheckCircle size={12} weight="fill" className="text-[#30d158]" />
                        {f.fill_count}×
                      </span>
                    )}
                  </button>

                  {/* Expanded detail */}
                  <div
                    className="overflow-hidden transition-all"
                    style={{ maxHeight: isOpen ? 600 : 0, transitionTimingFunction: EASE, transitionDuration: '500ms' }}
                  >
                    <div className="px-4 pb-4 pt-1 space-y-4">
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
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <CurrencyInr size={14} className="text-gray-500" />
                          {Object.entries(f.fee).map(([k, v]) => (
                            <span key={k} className="capitalize">{k.replace('_', '/')}: <span className="text-gray-200 font-medium">{v === 0 ? 'Free' : `₹${v}`}</span></span>
                          ))}
                        </div>
                      )}

                      {/* CTA — button-in-button */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={f.url} target="_blank" rel="noopener noreferrer"
                          className="group inline-flex items-center gap-2 pl-5 pr-2 py-2 rounded-full font-medium text-sm text-white active:scale-[0.98] transition-all"
                          style={{ background: tint, transitionTimingFunction: EASE, transitionDuration: '300ms' }}>
                          Open {f.short_name}
                          <span className="w-7 h-7 rounded-full bg-black/20 flex items-center justify-center group-hover:translate-x-0.5 transition-transform" style={{ transitionTimingFunction: EASE, transitionDuration: '300ms' }}>
                            <ArrowSquareOut size={14} weight="bold" />
                          </span>
                        </a>
                        {(f.photo_specs || f.signature_specs) && (
                          <a
                            href={`/app/forms/photo?form=${encodeURIComponent(f.short_name)}${f.photo_specs ? `&photo=${encodeURIComponent(JSON.stringify(f.photo_specs))}` : ''}${f.signature_specs ? `&signature=${encodeURIComponent(JSON.stringify(f.signature_specs))}` : ''}`}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm text-gray-200 bg-white/[0.06] border border-white/[0.06] hover:bg-white/[0.1] active:scale-[0.98] transition-all"
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
          })}
        </div>
      )}
    </div>
  );
}
