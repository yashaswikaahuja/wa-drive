/**
 * LocationBanner — the location-capture waterfall UI for logged-in operators.
 *   Tier ① "Use exact location" → browser geolocation popup → reverse-geocode (Google) → save as gps
 *   Tier ③ manual field → PlaceAutocompleteElement (if Maps key) else plain text → save as manual
 * Tier ② (silent IP) already runs server-side at login. The banner shows only while the café has no
 * location or just a coarse IP one — so we nudge for something more precise — and hides otherwise.
 */
import { useEffect, useRef, useState } from 'react';
import { MapPin, Crosshair } from '@phosphor-icons/react';
import api from './api';
import { toast } from './toast';
import { hasMapsKey, loadGoogleMaps } from './googleMaps';

type Payload = { location: string | null; lat?: number | null; lng?: number | null; source: 'gps' | 'manual' };

function latLngParts(loc: any): { lat: number | null; lng: number | null } {
  if (!loc) return { lat: null, lng: null };
  const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
  const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
  return {
    lat: typeof lat === 'number' ? lat : null,
    lng: typeof lng === 'number' ? lng : null,
  };
}

export default function LocationBanner() {
  const [needed, setNeeded] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const maps = hasMapsKey();

  // Show only when there's no location yet or it's a coarse IP guess (nudge to improve it).
  useEffect(() => {
    api.get('/auth/workspace', { skipErrorToast: true } as any)
      .then(r => { const d = r.data; if (!d?.location || d?.source === 'ip') setNeeded(true); })
      .catch(() => { /* old backend → don't nag */ });
  }, []);

  // New Places UI: PlaceAutocompleteElement (legacy Autocomplete is deprecated for new customers).
  useEffect(() => {
    if (!needed || !maps || !hostRef.current) return;
    let disposed = false;
    let el: HTMLElement | null = null;

    loadGoogleMaps().then(async (g) => {
      if (disposed || !g?.maps || !hostRef.current) return;
      try {
        const lib = await g.maps.importLibrary('places');
        const PlaceAutocompleteElement = lib.PlaceAutocompleteElement;
        if (!PlaceAutocompleteElement || disposed || !hostRef.current) return;

        el = new PlaceAutocompleteElement({ includedRegionCodes: ['in'] }) as unknown as HTMLElement;
        el.id = 'cc-place-autocomplete';
        el.setAttribute('placeholder', 'type city / area');
        el.className = 'cc-place-autocomplete';
        hostRef.current.innerHTML = '';
        hostRef.current.appendChild(el);

        el.addEventListener('gmp-select', async (event: any) => {
          try {
            const prediction = event.placePrediction;
            if (!prediction?.toPlace) return;
            const place = prediction.toPlace();
            await place.fetchFields({ fields: ['formattedAddress', 'displayName', 'location'] });
            const loc = place.formattedAddress || place.displayName || '';
            const { lat, lng } = latLngParts(place.location);
            if (loc) void save({ location: loc, lat, lng, source: 'manual' });
          } catch (err: any) {
            toast.error(err?.message || 'Could not read place');
          }
        });
      } catch {
        /* Maps library unavailable → plain text field remains usable via fallback UI */
      }
    });

    return () => {
      disposed = true;
      el?.remove();
      if (hostRef.current) hostRef.current.innerHTML = '';
    };
  }, [needed, maps]);

  if (!needed || dismissed) return null;

  async function save(payload: Payload) {
    setBusy(true);
    try {
      await api.patch('/auth/workspace', payload);
      toast.success('Location saved — thanks!');
      setNeeded(false);
    } catch (e: any) { toast.error(e.response?.data?.error || 'Could not save location'); }
    finally { setBusy(false); }
  }

  // Tier ① — precise: geolocation popup → send coords; the SERVER reverse-geocodes to an address.
  function useExact() {
    if (!navigator.geolocation) { toast.error('Location not supported on this device'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { void save({ location: null, lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'gps' }); },
      (err) => { setBusy(false); toast.error(err.code === 1 ? 'Location permission denied' : 'Could not get your location'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-2.5"
      style={{ background: 'hsl(var(--pt-marigold) / 0.1)', borderColor: 'hsl(var(--pt-marigold) / 0.4)' }}>
      <MapPin size={18} weight="fill" style={{ color: 'hsl(var(--pt-marigold-deep))' }} className="shrink-0" />
      <p className="text-xs shrink-0" style={{ color: 'hsl(var(--pt-ink))' }}>Where is your shop located?</p>
      <button onClick={useExact} disabled={busy} className="btn-primary text-xs shrink-0 inline-flex items-center gap-1">
        <Crosshair size={13} weight="bold" /> {busy ? '…' : 'Use exact location'}
      </button>
      <span className="text-xs pt-muted shrink-0">or</span>
      {maps ? (
        <div ref={hostRef} className="flex-1 min-w-[8rem] cc-place-autocomplete-host" aria-label="City or area" />
      ) : (
        <>
          <input
            value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && value.trim()) save({ location: value.trim(), source: 'manual' }); }}
            className="input-field text-sm flex-1 min-w-[8rem]"
            placeholder="type city / area" aria-label="City or area" maxLength={200}
          />
          <button onClick={() => value.trim() && save({ location: value.trim(), source: 'manual' })}
            disabled={busy || !value.trim()} className="btn-primary text-xs shrink-0">Save</button>
        </>
      )}
      <button onClick={() => setDismissed(true)} className="text-xs pt-muted shrink-0 hover:text-ink">Later</button>
      <style>{`
        .cc-place-autocomplete-host gmp-place-autocomplete {
          width: 100%;
          display: block;
        }
        .cc-place-autocomplete-host gmp-place-autocomplete,
        .cc-place-autocomplete-host .cc-place-autocomplete {
          --gmp-mat-color-surface: hsl(var(--pt-surface, 0 0% 100%));
          color-scheme: inherit;
        }
      `}</style>
    </div>
  );
}
