import { useEffect, useMemo, useState } from 'react';
import { Files, FloppyDisk, CheckCircle } from '@phosphor-icons/react';
import type { Config } from '../api';
import { fetchDocumentExtractMaps, putDocumentExtractMaps } from '../api';

/** Profile keys operators typically extract — mirrors Hub schema + travel. */
const PROFILE_KEY_OPTIONS = [
  'name', 'first_name', 'middle_name', 'last_name', 'father_name', 'mother_name', 'husband_name',
  'dob', 'gender', 'nationality', 'category', 'religion', 'marital_status',
  'phone', 'email', 'address', 'village', 'post_office', 'police_station', 'block', 'sub_division',
  'ward_no', 'city', 'district', 'state', 'pincode',
  'aadhaar_number', 'pan_number', 'passport_number', 'voter_id_number', 'driving_license_number', 'ration_card_number',
  'roll_number', 'registration_number', 'certificate_number', 'board', 'school_name', 'college_name', 'university_name',
  'course', 'stream', 'marks_obtained', 'total_marks', 'percentage', 'division', 'passing_year',
  'exam_name', 'exam_date', 'exam_center', 'exam_seat_number', 'application_number',
  'account_holder_name', 'bank_account_number', 'ifsc_code', 'bank_name', 'branch_name',
  'issue_date', 'expiry_date', 'place_of_issue',
];

export function DocumentExtractMapsPanel({ cfg }: { cfg: Config }) {
  const [maps, setMaps] = useState<Record<string, string[]>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [docTypes, setDocTypes] = useState<string[]>([]);
  const [selected, setSelected] = useState('aadhaar');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDocumentExtractMaps(cfg)
      .then((r) => {
        setMaps(r.maps || {});
        setLabels(r.labels || {});
        setDocTypes(r.docTypes || Object.keys(r.maps || {}));
        if (r.docTypes?.length) setSelected(r.docTypes[0]);
      })
      .catch((e) => setMsg(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [cfg]);

  const selectedKeys = useMemo(() => new Set(maps[selected] || []), [maps, selected]);

  const toggle = (key: string) => {
    setMaps((prev) => {
      const cur = new Set(prev[selected] || []);
      if (cur.has(key)) cur.delete(key); else cur.add(key);
      return { ...prev, [selected]: [...cur] };
    });
  };

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const r = await putDocumentExtractMaps(cfg, maps);
      setMaps(r.maps || maps);
      setMsg('saved');
      setTimeout(() => setMsg(''), 3000);
    } catch (e: any) {
      setMsg(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <section className="card" style={{ padding: 20, marginTop: 16 }}>Loading extract maps…</section>;
  }

  return (
    <section className="card" style={{ padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'hsl(158 50% 40% / 0.12)', display: 'grid', placeItems: 'center' }}>
          <Files size={16} weight="duotone" style={{ color: 'hsl(158 50% 35%)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 className="display" style={{ fontSize: 15, fontWeight: 700 }}>Document extract maps</h2>
          <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            After AI identifies the document type, only these fields are extracted. Prevents token waste and profile overwrites.
          </p>
        </div>
        <button type="button" className="btn" onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {msg === 'saved' ? <CheckCircle size={14} weight="fill" /> : <FloppyDisk size={14} />}
          {saving ? 'Saving…' : msg === 'saved' ? 'Saved' : 'Save maps'}
        </button>
      </div>
      {msg && msg !== 'saved' && <p style={{ color: 'hsl(0 65% 45%)', fontSize: 12, marginBottom: 10 }}>{msg}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 420, overflow: 'auto' }}>
          {docTypes.filter((t) => t !== 'photo' && t !== 'signature').map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSelected(t)}
              className="pt-chip"
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                background: selected === t ? 'hsl(158 50% 40% / 0.15)' : 'transparent',
                border: selected === t ? '1px solid hsl(158 50% 40% / 0.4)' : '1px solid transparent',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: selected === t ? 700 : 500,
              }}
            >
              {labels[t] || t}
              <span className="muted" style={{ float: 'right' }}>{(maps[t] || []).length}</span>
            </button>
          ))}
        </div>
        <div style={{ background: 'hsl(var(--bg))', borderRadius: 10, padding: 14, maxHeight: 420, overflow: 'auto' }}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{labels[selected] || selected}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
            {PROFILE_KEY_OPTIONS.map((key) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedKeys.has(key)} onChange={() => toggle(key)} />
                <span style={{ fontFamily: 'var(--mono)' }}>{key}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
