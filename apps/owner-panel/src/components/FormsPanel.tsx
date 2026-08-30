import { useCallback, useEffect, useState } from 'react';
import {
  MagnifyingGlass, FileText, Camera, PencilSimple, Globe, CalendarBlank,
  Signature, CurrencyInr, X, Plus, CheckCircle, Clock, ArrowClockwise,
  CaretRight, Image, Trash
} from '@phosphor-icons/react';
import type { Config, CatalogForm } from '../api';
import { ApiError, fetchOwnerForms, patchOwnerForm } from '../api';

const LIFECYCLE_OPTS = ['open', 'upcoming', 'closed', 'archived'] as const;

const LIFECYCLE_STYLE: Record<string, { bg: string; color: string; icon: typeof CheckCircle }> = {
  open: { bg: 'hsl(var(--good) / 0.1)', color: 'hsl(var(--good))', icon: CheckCircle },
  upcoming: { bg: 'hsl(210 60% 50% / 0.1)', color: 'hsl(210 60% 45%)', icon: Clock },
  closed: { bg: 'hsl(var(--muted) / 0.1)', color: 'hsl(var(--muted))', icon: X },
  archived: { bg: 'hsl(var(--muted) / 0.06)', color: 'hsl(var(--muted) / 0.7)', icon: FileText },
};

function LifecyclePill({ lifecycle }: { lifecycle: string }) {
  const s = LIFECYCLE_STYLE[lifecycle] || LIFECYCLE_STYLE.archived;
  const Icon = s.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      <Icon size={12} weight="bold" />
      {lifecycle}
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FormsPanel({ cfg }: { cfg: Config }) {
  const [forms, setForms] = useState<CatalogForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<CatalogForm | null>(null);

  const load = useCallback(async (search: string) => {
    setLoading(true); setError('');
    try { setForms(await fetchOwnerForms(cfg, search)); }
    catch (e) { const err = e as ApiError; setError(err.message || `Failed (${err.status})`); setForms([]); }
    setLoading(false);
  }, [cfg]);

  useEffect(() => { load(''); }, [load]);
  useEffect(() => { const t = setTimeout(() => load(q), 300); return () => clearTimeout(t); }, [q, load]);

  return (
    <section style={{ marginTop: 16 }}>
      {/* Header */}
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 10 }}>
          <FileText size={20} weight="duotone" style={{ color: 'hsl(var(--marigold-deep))' }} />
          <h2 className="display" style={{ fontSize: 17, fontWeight: 700 }}>Form Catalog</h2>
          <span className="muted num" style={{ fontSize: 12 }}>{forms.length}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <MagnifyingGlass size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted))' }} />
            <input className="input" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)}
              style={{ width: 180, paddingLeft: 30, fontSize: 13 }} />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="banner" role="alert" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => load(q)}>
            <ArrowClockwise size={12} weight="bold" /> Retry
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />)}
        </div>
      ) : !error && forms.length === 0 ? (
        <div className="state" style={{ padding: '48px 20px' }}>
          <FileText size={32} weight="duotone" style={{ color: 'hsl(var(--muted))', margin: '0 auto 8px' }} />
          <h3>No forms found</h3>
          <p className="muted" style={{ marginTop: 4 }}>{q ? `Nothing matches "${q}"` : 'Catalog is empty'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {forms.map(f => (
            <div key={f.id} className="card" onClick={() => setEditing(f)}
              style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'box-shadow 150ms, border-color 150ms' }}>
              {/* Icon */}
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'hsl(var(--marigold) / 0.08)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Globe size={18} weight="duotone" style={{ color: 'hsl(var(--marigold-deep))' }} />
              </div>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{f.short_name}</span>
                  <LifecyclePill lifecycle={f.lifecycle} />
                </div>
                <div className="muted" style={{ fontSize: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>{f.portal}</span>
                  {f.required_documents?.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><FileText size={11} />{f.required_documents.length} docs</span>}
                  {!!f.photo_specs && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Camera size={11} />Photo</span>}
                  {!!f.signature_specs && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Signature size={11} />Sign</span>}
                  {f.closes_at && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><CalendarBlank size={11} />{fmtDate(f.closes_at)}</span>}
                </div>
              </div>
              {/* Arrow */}
              <CaretRight size={16} style={{ color: 'hsl(var(--muted))', flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}

      {editing && (
        <FormEditor form={editing} cfg={cfg} onClose={() => setEditing(null)}
          onSaved={(updated) => { setForms(fs => fs.map(f => f.id === updated.id ? updated : f)); setEditing(null); }} />
      )}
    </section>
  );
}

// ─── Spec editor ──────────────────────────────────────────────────────────────

interface FormSpec { width: number; height: number; minKB: number; maxKB: number; format: string; bg: string }
function emptySpec(): FormSpec { return { width: 0, height: 0, minKB: 0, maxKB: 0, format: 'jpg', bg: 'white' }; }

function SpecSection({ icon: Icon, label, spec, onChange, onClear }: {
  icon: typeof Camera; label: string; spec: FormSpec | null; onChange: (s: FormSpec) => void; onClear: () => void;
}) {
  const [enabled, setEnabled] = useState(!!spec);
  const s = spec || emptySpec();
  const toggle = (on: boolean) => { setEnabled(on); if (!on) onClear(); else onChange(emptySpec()); };

  return (
    <div style={{ background: 'hsl(var(--bg))', borderRadius: 10, padding: 14, marginTop: 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
        <input type="checkbox" checked={enabled} onChange={e => toggle(e.target.checked)} />
        <Icon size={16} weight="duotone" style={{ color: 'hsl(var(--marigold-deep))' }} />
        {label}
      </label>
      {enabled && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10 }}>
          <NumField label="Width (px)" value={s.width} onChange={v => onChange({ ...s, width: v })} />
          <NumField label="Height (px)" value={s.height} onChange={v => onChange({ ...s, height: v })} />
          <div>
            <span className="muted" style={{ fontSize: 10, display: 'block', marginBottom: 3 }}>Format</span>
            <select className="input" value={s.format} onChange={e => onChange({ ...s, format: e.target.value })} style={{ fontSize: 12 }}>
              <option value="jpg">JPG</option><option value="png">PNG</option><option value="jpeg">JPEG</option>
            </select>
          </div>
          <NumField label="Min KB" value={s.minKB} onChange={v => onChange({ ...s, minKB: v })} />
          <NumField label="Max KB" value={s.maxKB} onChange={v => onChange({ ...s, maxKB: v })} />
          <div>
            <span className="muted" style={{ fontSize: 10, display: 'block', marginBottom: 3 }}>Background</span>
            <select className="input" value={s.bg} onChange={e => onChange({ ...s, bg: e.target.value })} style={{ fontSize: 12 }}>
              <option value="white">White</option><option value="blue">Blue</option><option value="any">Any</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <span className="muted" style={{ fontSize: 10, display: 'block', marginBottom: 3 }}>{label}</span>
      <input className="input" type="number" value={value} onChange={e => onChange(+e.target.value)} style={{ fontSize: 12 }} />
    </div>
  );
}

// ─── Fee editor ───────────────────────────────────────────────────────────────

function FeeEditor({ fee, onChange }: { fee: Record<string, number>; onChange: (f: Record<string, number>) => void }) {
  const entries = Object.entries(fee);
  const [newKey, setNewKey] = useState('');
  const update = (key: string, val: number) => onChange({ ...fee, [key]: val });
  const remove = (key: string) => { const next = { ...fee }; delete next[key]; onChange(next); };
  const add = () => { if (newKey.trim()) { onChange({ ...fee, [newKey.trim()]: 0 }); setNewKey(''); } };

  return (
    <div style={{ marginTop: 6 }}>
      {entries.map(([k, v]) => (
        <div key={k} className="row" style={{ gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: 13, textTransform: 'capitalize', color: 'hsl(var(--ink-soft))' }}>{k.replace(/_/g, ' ')}</span>
          <span style={{ fontSize: 12, color: 'hsl(var(--muted))' }}>₹</span>
          <input className="input" type="number" min={0} value={v} onChange={e => update(k, +e.target.value)} style={{ width: 80, fontSize: 12 }} />
          <button className="iconbtn" onClick={() => remove(k)} title="Remove"><Trash size={14} /></button>
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <input className="input" placeholder="e.g. general, sc_st, female" value={newKey} onChange={e => setNewKey(e.target.value)} style={{ flex: 1, fontSize: 12 }} />
        <button className="btn" style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }} onClick={add}>
          <Plus size={12} weight="bold" /> Add
        </button>
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }: { icon: typeof FileText; title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid hsl(var(--border-soft))', paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon size={15} weight="duotone" style={{ color: 'hsl(var(--marigold-deep))' }} />
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'hsl(var(--ink-soft))' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Full editor ──────────────────────────────────────────────────────────────

function FormEditor({ form, cfg, onClose, onSaved }: {
  form: CatalogForm; cfg: Config; onClose: () => void; onSaved: (f: CatalogForm) => void;
}) {
  const [name, setName] = useState(form.name);
  const [shortName, setShortName] = useState(form.short_name);
  const [portal, setPortal] = useState(form.portal);
  const [url, setUrl] = useState(form.url);
  const [lifecycle, setLifecycle] = useState(form.lifecycle);
  const [opensAt, setOpensAt] = useState(form.opens_at?.slice(0, 10) || '');
  const [closesAt, setClosesAt] = useState(form.closes_at?.slice(0, 10) || '');
  const [noticeUrl, setNoticeUrl] = useState(form.official_notice_url || '');
  const [noticeSummary, setNoticeSummary] = useState(form.notice_summary || '');
  const [docs, setDocs] = useState((form.required_documents || []).join(', '));
  const [fee, setFee] = useState<Record<string, number>>(form.fee || {});
  const [photoSpecs, setPhotoSpecs] = useState<FormSpec | null>(form.photo_specs as FormSpec | null);
  const [sigSpecs, setSigSpecs] = useState<FormSpec | null>(form.signature_specs as FormSpec | null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true); setError('');
    const docArr = docs.split(',').map(d => d.trim()).filter(Boolean);
    for (const [, v] of Object.entries(fee)) { if (v < 0 || isNaN(v)) { setError('Fee values must be >= 0'); setSaving(false); return; } }
    if (photoSpecs && (photoSpecs.width <= 0 || photoSpecs.height <= 0)) { setError('Photo: width/height must be > 0'); setSaving(false); return; }
    if (sigSpecs && (sigSpecs.width <= 0 || sigSpecs.height <= 0)) { setError('Signature: width/height must be > 0'); setSaving(false); return; }
    try {
      const updated = await patchOwnerForm(cfg, form.id, {
        name, short_name: shortName, portal, url, lifecycle,
        opens_at: opensAt || null, closes_at: closesAt || null,
        official_notice_url: noticeUrl || null, notice_summary: noticeSummary || null,
        required_documents: docArr, fee, photo_specs: photoSpecs, signature_specs: sigSpecs,
      } as any);
      onSaved(updated);
    } catch (e: any) { setError(e.message || 'Save failed'); }
    setSaving(false);
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer__head row between">
          <div className="row" style={{ gap: 10 }}>
            <PencilSimple size={18} weight="duotone" style={{ color: 'hsl(var(--marigold-deep))' }} />
            <h3 className="display" style={{ fontSize: 16 }}>{form.short_name}</h3>
          </div>
          <button className="iconbtn" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="drawer__body">

          <Section icon={Globe} title="Identity">
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="row" style={{ gap: 10 }}>
                <div style={{ flex: 1 }}><span className="muted" style={{ fontSize: 10 }}>Short Name</span><input className="input" value={shortName} onChange={e => setShortName(e.target.value)} style={{ marginTop: 2, fontSize: 13 }} /></div>
                <div style={{ flex: 1 }}><span className="muted" style={{ fontSize: 10 }}>Portal</span><input className="input" value={portal} onChange={e => setPortal(e.target.value)} style={{ marginTop: 2, fontSize: 13 }} /></div>
              </div>
              <div><span className="muted" style={{ fontSize: 10 }}>Full Name</span><input className="input" value={name} onChange={e => setName(e.target.value)} style={{ marginTop: 2, fontSize: 13 }} /></div>
              <div><span className="muted" style={{ fontSize: 10 }}>Portal URL</span><input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" style={{ marginTop: 2, fontSize: 13 }} /></div>
            </div>
          </Section>

          <Section icon={CalendarBlank} title="Lifecycle & Dates">
            <select className="input" value={lifecycle} onChange={e => setLifecycle(e.target.value as any)} style={{ fontSize: 13 }}>
              {LIFECYCLE_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <div className="row" style={{ gap: 10, marginTop: 10 }}>
              <div style={{ flex: 1 }}><span className="muted" style={{ fontSize: 10 }}>Opens</span><input className="input" type="date" value={opensAt} onChange={e => setOpensAt(e.target.value)} style={{ marginTop: 2 }} /></div>
              <div style={{ flex: 1 }}><span className="muted" style={{ fontSize: 10 }}>Closes</span><input className="input" type="date" value={closesAt} onChange={e => setClosesAt(e.target.value)} style={{ marginTop: 2 }} /></div>
            </div>
          </Section>

          <Section icon={FileText} title="Notice">
            <div><span className="muted" style={{ fontSize: 10 }}>Official Notice URL</span><input className="input" value={noticeUrl} onChange={e => setNoticeUrl(e.target.value)} placeholder="https://…/notice.pdf" style={{ marginTop: 2, fontSize: 13 }} /></div>
            <div style={{ marginTop: 8 }}><span className="muted" style={{ fontSize: 10 }}>Summary</span><textarea className="input" rows={2} value={noticeSummary} onChange={e => setNoticeSummary(e.target.value)} style={{ marginTop: 2, fontSize: 13 }} /></div>
          </Section>

          <Section icon={FileText} title="Required Documents">
            <textarea className="input" rows={3} value={docs} onChange={e => setDocs(e.target.value)}
              placeholder="Aadhaar, 10th Marksheet, Photo, Signature" style={{ fontSize: 13 }} />
            <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>Comma-separated list of required documents</p>
          </Section>

          <Section icon={CurrencyInr} title="Fees">
            <FeeEditor fee={fee} onChange={setFee} />
          </Section>

          <Section icon={Image} title="Photo & Signature Specs">
            <SpecSection icon={Camera} label="Photo Specs" spec={photoSpecs} onChange={setPhotoSpecs} onClear={() => setPhotoSpecs(null)} />
            <SpecSection icon={Signature} label="Signature Specs" spec={sigSpecs} onChange={setSigSpecs} onClear={() => setSigSpecs(null)} />
          </Section>

          {error && <p className="banner">{error}</p>}

          <div className="row" style={{ gap: 10, paddingTop: 8 }}>
            <button className="btn btn--primary" onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle size={16} weight="bold" />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
