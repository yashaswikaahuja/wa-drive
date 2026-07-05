/**
 * LocationBanner — prompts existing operators whose café has no location on file to add it
 * (location capture was added to signup later, so pre-existing accounts have none).
 * Reads /auth/workspace; if location is empty, shows an inline City/Area field that saves via PATCH.
 * Renders nothing once a location is set or the operator dismisses it for the session.
 */
import { useEffect, useState } from 'react';
import { MapPin } from '@phosphor-icons/react';
import api from './api';
import { toast } from './toast';

export default function LocationBanner() {
  const [needed, setNeeded] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.get('/auth/workspace', { skipErrorToast: true } as any)
      .then(r => { if (!r.data?.location) setNeeded(true); })
      .catch(() => { /* endpoint missing on old backend → don't nag */ });
  }, []);

  if (!needed || dismissed) return null;

  async function save() {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      await api.patch('/auth/workspace', { location: v });
      toast.success('Location saved — thanks!');
      setNeeded(false);
    } catch (e: any) { toast.error(e.response?.data?.error || 'Could not save location'); }
    finally { setBusy(false); }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5"
      style={{ background: 'hsl(var(--pt-marigold) / 0.1)', borderColor: 'hsl(var(--pt-marigold) / 0.4)' }}>
      <MapPin size={18} weight="fill" style={{ color: 'hsl(var(--pt-marigold-deep))' }} className="shrink-0" />
      <p className="text-xs shrink-0" style={{ color: 'hsl(var(--pt-ink))' }}>Where is your shop located?</p>
      <input
        value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); }}
        className="input-field text-sm flex-1 min-w-[8rem]"
        placeholder="City / area — e.g. Patna, Boring Road" aria-label="City or area" maxLength={200}
      />
      <button onClick={save} disabled={busy || !value.trim()} className="btn-primary text-xs shrink-0">
        {busy ? '…' : 'Save'}
      </button>
      <button onClick={() => setDismissed(true)} className="text-xs pt-muted shrink-0 hover:text-ink">Later</button>
    </div>
  );
}
