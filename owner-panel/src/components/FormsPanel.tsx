import { useCallback, useEffect, useState } from 'react';
import type { Config, CatalogForm } from '../api';
import { ApiError, fetchOwnerForms, patchOwnerForm } from '../api';

const LIFECYCLE_OPTS = ['open', 'upcoming', 'closed', 'archived'] as const;

const BADGE_CLS: Record<string, string> = {
  open: 'badge-green', upcoming: 'badge-blue', closed: 'badge-muted', archived: 'badge-muted',
};

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
    try {
      setForms(await fetchOwnerForms(cfg, search));
    } catch (e) {
      const err = e as ApiError;
      setError(err.message || `Failed to load forms (${err.status || 'network'})`);
      setForms([]);
    }
    setLoading(false);
  }, [cfg]);

  useEffect(() => { load(''); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <section className="card" style={{ marginTop: 24, padding: 20 }}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h2 className="display" style={{ fontSize: 16 }}>Form Catalog</h2>
        <input
          className="input" placeholder="Search forms…" value={q} onChange={e => setQ(e.target.value)}
          style={{ width: 220 }}
        />
      </div>

      {error && (
        <div className="banner" role="alert" style={{ marginBottom: 12 }}>
          {error}
          <button className="btn" style={{ marginLeft: 12, padding: '4px 10px', fontSize: 12 }} onClick={() => load(q)}>
            Retry
          </button>
        </div>
      )}

      {loading ? <p className="muted">Loading…</p> : !error && forms.length === 0 ? (
        <p className="muted">No forms found{q ? ` for "${q}"` : ' — catalog may be empty'}</p>
      ) : forms.length > 0 && (
        <div className="table-wrap">
          <table className="table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr><th>Form</th><th>Portal</th><th>Lifecycle</th><th>Docs</th><th>Specs</th><th>Closes</th><th></th></tr>
            </thead>
            <tbody>
              {forms.map(f => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 600 }}>{f.short_name}</td>
                  <td>{f.portal}</td>
                  <td><span className={`pill ${BADGE_CLS[f.lifecycle] || ''}`}>{f.lifecycle}</span></td>
                  <td className="num">{f.required_documents?.length || 0}</td>
                  <td>{f.photo_specs ? '📷' : ''}{f.signature_specs ? '✍' : ''}</td>
                  <td>{fmtDate(f.closes_at)}</td>
                  <td><button className="btn" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setEditing(f)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <FormEditor
          form={editing}
          cfg={cfg}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setForms(fs => fs.map(f => f.id === updated.id ? updated : f));
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

// ─── Spec helpers ─────────────────────────────────────────────────────────────

interface FormSpec { width: number; height: number; minKB: number; maxKB: number; format: string; bg: string }

function emptySpec(): FormSpec { return { width: 0, height: 0, minKB: 0, maxKB: 0, format: 'jpg', bg: 'white' }; }

function SpecFields({ label, spec, onChange, onClear }: {
  label: string; spec: FormSpec | null; onChange: (s: FormSpec) => void; onClear: () => void;
}) {
  const [enabled, setEnabled] = useState(!!spec);
  const s = spec || emptySpec();

  const toggle = (on: boolean) => {
    setEnabled(on);
    if (!on) onClear();
    else onChange(emptySpec());
  };

  return (
    <fieldset style={{ border: '1px solid hsl(var(--border-soft))', borderRadius: 8, padding: 12, marginTop: 8 }}>
      <legend style={{ fontSize: 12, fontWeight: 600, padding: '0 4px' }}>
        <label style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={e => toggle(e.target.checked)} style={{ marginRight: 6 }} />
          {label}
        </label>
      </legend>
      {enabled && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
          <div>
            <label className="label">Width px</label>
            <input className="input" type="number" value={s.width} onChange={e => onChange({ ...s, width: +e.target.value })} style={{ marginTop: 2 }} />
          </div>
          <div>
            <label className="label">Height px</label>
            <input className="input" type="number" value={s.height} onChange={e => onChange({ ...s, height: +e.target.value })} style={{ marginTop: 2 }} />
          </div>
          <div>
            <label className="label">Format</label>
            <select className="input" value={s.format} onChange={e => onChange({ ...s, format: e.target.value })} style={{ marginTop: 2 }}>
              <option value="jpg">JPG</option><option value="png">PNG</option><option value="jpeg">JPEG</option>
            </select>
          </div>
          <div>
            <label className="label">Min KB</label>
            <input className="input" type="number" value={s.minKB} onChange={e => onChange({ ...s, minKB: +e.target.value })} style={{ marginTop: 2 }} />
          </div>
          <div>
            <label className="label">Max KB</label>
            <input className="input" type="number" value={s.maxKB} onChange={e => onChange({ ...s, maxKB: +e.target.value })} style={{ marginTop: 2 }} />
          </div>
          <div>
            <label className="label">Background</label>
            <select className="input" value={s.bg} onChange={e => onChange({ ...s, bg: e.target.value })} style={{ marginTop: 2 }}>
              <option value="white">White</option><option value="blue">Blue</option><option value="any">Any</option>
            </select>
          </div>
        </div>
      )}
    </fieldset>
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
    <div style={{ marginTop: 8 }}>
      {entries.map(([k, v]) => (
        <div key={k} className="row" style={{ gap: 8, marginBottom: 6 }}>
          <span style={{ flex: 1, fontSize: 13, textTransform: 'capitalize' }}>{k.replace(/_/g, '/')}</span>
          <input className="input" type="number" min={0} value={v} onChange={e => update(k, +e.target.value)} style={{ width: 90 }} />
          <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => remove(k)}>✕</button>
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 6 }}>
        <input className="input" placeholder="category (e.g. general)" value={newKey} onChange={e => setNewKey(e.target.value)} style={{ flex: 1 }} />
        <button className="btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={add}>+ Add</button>
      </div>
    </div>
  );
}

// ─── Full form editor ─────────────────────────────────────────────────────────

function FormEditor({ form, cfg, onClose, onSaved }: {
  form: CatalogForm; cfg: Config; onClose: () => void; onSaved: (f: CatalogForm) => void;
}) {
  // Identity
  const [name, setName] = useState(form.name);
  const [shortName, setShortName] = useState(form.short_name);
  const [portal, setPortal] = useState(form.portal);
  const [url, setUrl] = useState(form.url);

  // Lifecycle
  const [lifecycle, setLifecycle] = useState(form.lifecycle);
  const [opensAt, setOpensAt] = useState(form.opens_at?.slice(0, 10) || '');
  const [closesAt, setClosesAt] = useState(form.closes_at?.slice(0, 10) || '');

  // Notice
  const [noticeUrl, setNoticeUrl] = useState(form.official_notice_url || '');
  const [noticeSummary, setNoticeSummary] = useState(form.notice_summary || '');

  // Documents
  const [docs, setDocs] = useState((form.required_documents || []).join(', '));

  // Fees
  const [fee, setFee] = useState<Record<string, number>>(form.fee || {});

  // Specs
  const [photoSpecs, setPhotoSpecs] = useState<FormSpec | null>(form.photo_specs as FormSpec | null);
  const [sigSpecs, setSigSpecs] = useState<FormSpec | null>(form.signature_specs as FormSpec | null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true); setError('');

    // Validate
    const docArr = docs.split(',').map(d => d.trim()).filter(Boolean);
    for (const [, v] of Object.entries(fee)) {
      if (v < 0 || isNaN(v)) { setError('Fee values must be numbers >= 0'); setSaving(false); return; }
    }
    if (photoSpecs && (photoSpecs.width <= 0 || photoSpecs.height <= 0)) {
      setError('Photo specs: width and height must be > 0'); setSaving(false); return;
    }
    if (sigSpecs && (sigSpecs.width <= 0 || sigSpecs.height <= 0)) {
      setError('Signature specs: width and height must be > 0'); setSaving(false); return;
    }

    try {
      const updated = await patchOwnerForm(cfg, form.id, {
        name, short_name: shortName, portal, url, lifecycle,
        opens_at: opensAt || null,
        closes_at: closesAt || null,
        official_notice_url: noticeUrl || null,
        notice_summary: noticeSummary || null,
        required_documents: docArr,
        fee,
        photo_specs: photoSpecs,
        signature_specs: sigSpecs,
      } as any);
      onSaved(updated);
    } catch (e: any) { setError(e.message || 'Save failed'); }
    setSaving(false);
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer__head row between">
          <h3 className="display" style={{ fontSize: 16 }}>Edit: {form.short_name}</h3>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
        <div className="drawer__body">

          {/* Identity */}
          <fieldset style={{ border: 'none', padding: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>Identity</legend>
            <div style={{ display: 'grid', gap: 8 }}>
              <div>
                <label className="label">Short Name</label>
                <input className="input" value={shortName} onChange={e => setShortName(e.target.value)} style={{ marginTop: 2 }} />
              </div>
              <div>
                <label className="label">Full Name</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} style={{ marginTop: 2 }} />
              </div>
              <div className="row" style={{ gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label className="label">Portal</label>
                  <input className="input" value={portal} onChange={e => setPortal(e.target.value)} style={{ marginTop: 2 }} />
                </div>
                <div style={{ flex: 2 }}>
                  <label className="label">URL</label>
                  <input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" style={{ marginTop: 2 }} />
                </div>
              </div>
            </div>
          </fieldset>

          {/* Lifecycle */}
          <fieldset style={{ border: 'none', padding: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>Lifecycle</legend>
            <select className="input" value={lifecycle} onChange={e => setLifecycle(e.target.value as any)}>
              {LIFECYCLE_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <div className="row" style={{ gap: 12, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="label">Opens at</label>
                <input className="input" type="date" value={opensAt} onChange={e => setOpensAt(e.target.value)} style={{ marginTop: 2 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">Closes at</label>
                <input className="input" type="date" value={closesAt} onChange={e => setClosesAt(e.target.value)} style={{ marginTop: 2 }} />
              </div>
            </div>
          </fieldset>

          {/* Notice */}
          <fieldset style={{ border: 'none', padding: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>Notice</legend>
            <div>
              <label className="label">Notice URL</label>
              <input className="input" value={noticeUrl} onChange={e => setNoticeUrl(e.target.value)} placeholder="https://…/notice.pdf" style={{ marginTop: 2 }} />
            </div>
            <div style={{ marginTop: 8 }}>
              <label className="label">Summary</label>
              <textarea className="input" rows={2} value={noticeSummary} onChange={e => setNoticeSummary(e.target.value)} style={{ marginTop: 2 }} />
            </div>
          </fieldset>

          {/* Required Documents */}
          <fieldset style={{ border: 'none', padding: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>Required Documents</legend>
            <textarea className="input" rows={3} value={docs} onChange={e => setDocs(e.target.value)}
              placeholder="Aadhaar, 10th Marksheet, Photo, Signature" style={{ marginTop: 2 }} />
            <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>Comma-separated list</p>
          </fieldset>

          {/* Fees */}
          <fieldset style={{ border: 'none', padding: 0 }}>
            <legend className="label" style={{ marginBottom: 4 }}>Fees (₹ by category)</legend>
            <FeeEditor fee={fee} onChange={setFee} />
          </fieldset>

          {/* Photo / Signature Specs */}
          <SpecFields label="Photo Specs" spec={photoSpecs} onChange={setPhotoSpecs} onClear={() => setPhotoSpecs(null)} />
          <SpecFields label="Signature Specs" spec={sigSpecs} onChange={setSigSpecs} onClear={() => setSigSpecs(null)} />

          {/* Preview strip */}
          {(docs || Object.keys(fee).length > 0 || photoSpecs || sigSpecs) && (
            <div style={{ background: 'hsl(var(--bg))', borderRadius: 8, padding: 12, fontSize: 12 }}>
              <p className="label" style={{ marginBottom: 6 }}>Preview</p>
              {docs && <div style={{ marginBottom: 4 }}>📄 {docs.split(',').filter(d => d.trim()).length} docs</div>}
              {Object.keys(fee).length > 0 && <div style={{ marginBottom: 4 }}>💰 {Object.entries(fee).map(([k, v]) => `${k}: ₹${v}`).join(', ')}</div>}
              {photoSpecs && <div style={{ marginBottom: 4 }}>📷 {photoSpecs.width}×{photoSpecs.height}px, {photoSpecs.minKB}–{photoSpecs.maxKB}KB {photoSpecs.format}</div>}
              {sigSpecs && <div>✍ {sigSpecs.width}×{sigSpecs.height}px, {sigSpecs.minKB}–{sigSpecs.maxKB}KB {sigSpecs.format}</div>}
            </div>
          )}

          {error && <p className="banner">{error}</p>}

          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn--primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
