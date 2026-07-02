/**
 * VerifyBanner — nudges accounts with an unverified email/phone to verify them.
 * Reads /auth/verify-status; if a configured channel is unverified, shows a banner that opens
 * a modal to request + confirm an OTP (email via SES, phone via the WhatsApp resolver).
 * Renders nothing when everything is verified or verification isn't configured on the backend.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldWarning } from '@phosphor-icons/react';
import api from './api';
import { toast } from './toast';
import { useFocusTrap } from './useFocusTrap';

export type VerifyStatus = {
  email?: string; phone?: string;
  emailVerified: boolean; phoneVerified: boolean;
  canVerifyEmail: boolean; canVerifyPhone: boolean;
};
export type Channel = 'email' | 'phone';

export default function VerifyBanner() {
  const [status, setStatus] = useState<VerifyStatus | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => {
    api.get('/auth/verify-status', { skipErrorToast: true } as any).then(r => setStatus(r.data)).catch(() => setStatus(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!status) return null;
  const pending: Channel[] = [];
  if (status.canVerifyEmail && status.email && !status.emailVerified) pending.push('email');
  if (status.canVerifyPhone && status.phone && !status.phoneVerified) pending.push('phone');
  if (!pending.length) return null;

  return (
    <>
      <div className="mb-4 flex items-center gap-3 rounded-xl border px-4 py-2.5"
        style={{ background: 'hsl(var(--pt-marigold) / 0.1)', borderColor: 'hsl(var(--pt-marigold) / 0.4)' }}>
        <ShieldWarning size={18} weight="fill" style={{ color: 'hsl(var(--pt-marigold-deep))' }} className="shrink-0" />
        <p className="text-xs flex-1 min-w-0" style={{ color: 'hsl(var(--pt-ink))' }}>
          Please verify your {pending.join(' and ')} to secure your account.
        </p>
        <button onClick={() => setOpen(true)} className="btn-primary text-xs shrink-0">Verify now</button>
      </div>
      {open && <VerifyModal pending={pending} status={status} onClose={() => setOpen(false)} onChanged={load} />}
    </>
  );
}

export function VerifyModal({ pending, status, onClose, onChanged }: { pending: Channel[]; status: VerifyStatus; onClose: () => void; onChanged: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onClose);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const remaining = pending.filter(c => !done[c]);
  useEffect(() => { if (remaining.length === 0) onClose(); }, [remaining.length, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div ref={ref} onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border shadow-2xl p-6"
        style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))' }}>
        <h2 className="pt-display text-lg font-bold" style={{ color: 'hsl(var(--pt-ink))' }}>Verify your contact</h2>
        <p className="text-xs pt-muted mt-1 mb-4">We'll send a code to confirm it's really yours.</p>
        <div className="space-y-3">
          {remaining.map(ch => (
            <ChannelRow key={ch} channel={ch} contact={ch === 'email' ? status.email! : status.phone!}
              onVerified={() => { setDone(d => ({ ...d, [ch]: true })); onChanged(); }} />
          ))}
        </div>
        <button onClick={onClose} className="pt-chip w-full mt-5">Close</button>
      </div>
    </div>
  );
}

function ChannelRow({ channel, contact, onVerified }: { channel: Channel; contact: string; onVerified: () => void }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const label = channel === 'email' ? 'Email' : 'WhatsApp';

  async function send() {
    setErr(''); setBusy(true);
    try { await api.post('/auth/request-verify', { channel }); setSent(true); toast.success(`Code sent to your ${channel}`); }
    catch (e: any) { setErr(e.response?.data?.error || 'Could not send code'); }
    finally { setBusy(false); }
  }
  async function confirm() {
    setErr(''); setBusy(true);
    try { await api.post('/auth/confirm-verify', { channel, code: code.trim() }); toast.success(`${label} verified`); onVerified(); }
    catch (e: any) { setErr(e.response?.data?.error || 'Incorrect code'); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'hsl(var(--pt-border))' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: 'hsl(var(--pt-ink))' }}>{label}</p>
          <p className="text-[11px] pt-muted truncate">{contact}</p>
        </div>
        {!sent && <button onClick={send} disabled={busy} className="btn-primary text-xs shrink-0">{busy ? '…' : 'Send code'}</button>}
      </div>
      {sent && (
        <>
          <div className="mt-2 flex gap-2">
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)}
              className="input-field text-sm tracking-widest" placeholder="6-digit code" />
            <button onClick={confirm} disabled={busy} className="btn-primary text-xs shrink-0">{busy ? '…' : 'Verify'}</button>
          </div>
          <button onClick={send} disabled={busy} className="text-[11px] mt-1.5 font-semibold" style={{ color: 'hsl(var(--pt-marigold-deep))' }}>Resend</button>
        </>
      )}
      {err && <p className="text-[11px] mt-1.5" style={{ color: 'hsl(0 65% 48%)' }}>{err}</p>}
    </div>
  );
}
