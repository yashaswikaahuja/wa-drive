import { useCallback, useEffect, useState } from 'react';
import type { Config, CatalogForm } from '../api';
import { fetchOwnerForms, patchOwnerForm } from '../api';

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
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<CatalogForm | null>(null);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    try { setForms(await fetchOwnerForms(cfg, search)); } catch {}
    setLoading(false);
  }, [cfg]);

  useEffect(() => { load(''); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h2 className="display" style={{ fontSize: 16 }}>Form Catalog</h2>
        <input
          className="input" placeholder="Search forms…" value={q} onChange={e => setQ(e.target.value)}
          style={{ width: 220 }}
        />
      </div>

      {loading ? <p className="muted">Loading…</p> : forms.length === 0 ? <p className="muted">No forms found</p> : (
        <table className="table" style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr><th>Form</th><th>Portal</th><th>Lifecycle</th><th>Closes</th><th>Updated</th><th></th></tr>
          </thead>
          <tbody>
            {forms.map(f => (
              <tr key={f.id}>
                <td style={{ fontWeight: 600 }}>{f.short_name}</td>
                <td>{f.portal}</td>
                <td><span className={`badge ${BADGE_CLS[f.lifecycle] || ''}`}>{f.lifecycle}</span></td>
                <td>{fmtDate(f.closes_at)}</td>
                <td className="muted">{fmtDate(f.source_updated_at)}</td>
                <td><button className="btn btn-sm" onClick={() => setEditing(f)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
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

function FormEditor({ form, cfg, onClose, onSaved }: {
  form: CatalogForm; cfg: Config; onClose: () => void; onSaved: (f: CatalogForm) => void;
}) {
  const [lifecycle, setLifecycle] = useState(form.lifecycle);
  const [opensAt, setOpensAt] = useState(form.opens_at?.slice(0, 10) || '');
  const [closesAt, setClosesAt] = useState(form.closes_at?.slice(0, 10) || '');
  const [url, setUrl] = useState(form.url);
  const [noticeUrl, setNoticeUrl] = useState(form.official_notice_url || '');
  const [noticeSummary, setNoticeSummary] = useState(form.notice_summary || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true); setError('');
    try {
      const updated = await patchOwnerForm(cfg, form.id, {
        lifecycle,
        opens_at: opensAt || null,
        closes_at: closesAt || null,
        url,
        official_notice_url: noticeUrl || null,
        notice_summary: noticeSummary || null,
      } as any);
      onSaved(updated);
    } catch (e: any) { setError(e.message || 'Save failed'); }
    setSaving(false);
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <h3 className="display" style={{ fontSize: 16 }}>{form.short_name}</h3>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <p className="muted" style={{ marginBottom: 16 }}>{form.name} · {form.portal}</p>

        <label className="field-label">Lifecycle</label>
        <select className="input" value={lifecycle} onChange={e => setLifecycle(e.target.value as any)}>
          {LIFECYCLE_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        <div className="row" style={{ gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="field-label">Opens at</label>
            <input className="input" type="date" value={opensAt} onChange={e => setOpensAt(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="field-label">Closes at</label>
            <input className="input" type="date" value={closesAt} onChange={e => setClosesAt(e.target.value)} />
          </div>
        </div>

        <label className="field-label" style={{ marginTop: 12 }}>Portal URL</label>
        <input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />

        <label className="field-label" style={{ marginTop: 12 }}>Official Notice URL</label>
        <input className="input" value={noticeUrl} onChange={e => setNoticeUrl(e.target.value)} placeholder="https://…/notice.pdf" />

        <label className="field-label" style={{ marginTop: 12 }}>Notice Summary</label>
        <textarea className="input" rows={3} value={noticeSummary} onChange={e => setNoticeSummary(e.target.value)} placeholder="Short owner note about this cycle…" />

        {error && <p className="banner" style={{ marginTop: 12 }}>{error}</p>}

        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
