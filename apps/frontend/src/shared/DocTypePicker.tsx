import { useState } from 'react';
import api from './api';
import { toast } from './toast';

export const DOC_TYPE_OPTIONS: { key: string; label: string }[] = [
  { key: 'aadhaar', label: 'Aadhaar' },
  { key: 'pan', label: 'PAN' },
  { key: 'passport', label: 'Passport' },
  { key: 'voter_id', label: 'Voter ID' },
  { key: 'driving_license', label: 'Driving License' },
  { key: 'ration_card', label: 'Ration Card' },
  { key: 'marksheet_10th', label: '10th Marksheet' },
  { key: 'marksheet_12th', label: '12th Marksheet' },
  { key: 'marksheet_graduation', label: 'Graduation' },
  { key: 'marksheet_postgrad', label: 'Post-Grad' },
  { key: 'admit_card', label: 'Admit Card' },
  { key: 'result', label: 'Result' },
  { key: 'certificate', label: 'Certificate' },
  { key: 'bank_passbook', label: 'Bank' },
  { key: 'photo', label: 'Photo' },
  { key: 'signature', label: 'Signature' },
  { key: 'form', label: 'Form' },
  { key: 'other', label: 'Other' },
];

export function DocTypePickerModal({
  fileId,
  onClose,
  onDone,
}: {
  fileId: string;
  onClose: () => void;
  onDone: (tag: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function pick(documentType: string) {
    setBusy(true); setErr('');
    try {
      const r = await api.post('/process/set-document-type', { fileId, documentType }, { skipErrorToast: true } as any);
      const tag = r.data?.tag || documentType;
      toast.success(`Type set: ${tag}${r.data?.fieldCount ? ` · ${r.data.fieldCount} fields` : ''}`);
      onDone(tag);
      onClose();
    } catch (e: any) {
      setErr(e.response?.data?.error || e.message || 'Failed to set type');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="w-full max-w-sm rounded-2xl border shadow-2xl p-5"
        style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="pt-display text-lg font-bold" style={{ color: 'hsl(var(--pt-ink))' }}>What document is this?</h2>
        <p className="text-xs pt-muted mt-1 mb-3">
          AI could not confidently identify it. Pick a type — we only extract fields configured for that type (Owner panel).
        </p>
        <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
          {DOC_TYPE_OPTIONS.filter((o) => o.key !== 'other').map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={busy}
              onClick={() => pick(o.key)}
              className="pt-chip text-xs text-left px-3 py-2"
            >
              {o.label}
            </button>
          ))}
        </div>
        {err && <p className="text-[11px] mt-2" style={{ color: 'hsl(0 65% 48%)' }}>{err}</p>}
        <button type="button" onClick={onClose} className="pt-chip w-full mt-3 text-xs" disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

/** Small provenance chip for profile fields. */
export function ProvenanceChip({
  source,
  documentType,
  confidence,
  needsReview,
}: {
  source?: string;
  documentType?: string;
  confidence?: number;
  needsReview?: boolean;
}) {
  if (needsReview) {
    return <span className="badge text-[10px]" style={{ color: 'hsl(35 92% 38%)' }}>Needs review</span>;
  }
  if (source === 'manual' || source === 'document_corrected' || source === 'operator') {
    return <span className="badge badge-success text-[10px]">Confirmed</span>;
  }
  if (source === 'document' || source === 'ai') {
    const pct = typeof confidence === 'number' ? ` · ${Math.round(confidence * 100)}%` : '';
    return (
      <span className="badge text-[10px] text-gray-400">
        {documentType || 'AI'}{pct}
      </span>
    );
  }
  return null;
}
