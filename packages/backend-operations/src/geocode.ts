/**
 * Server-side reverse-geocoding: GPS lat/lng → human address, via the Google Geocoding API.
 * Uses GEOCODE_API_KEY (a server key, no referrer restriction). Best-effort — returns null on any
 * failure so the caller falls back to storing coordinates.
 */
import { GEOCODE_API_KEY } from '@cybercontrol/backend-core';

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!GEOCODE_API_KEY) return null;
  if (!isFinite(lat) || !isFinite(lng)) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GEOCODE_API_KEY}`;
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const j: any = await r.json();
    if (j?.status !== 'OK' || !j.results?.length) return null;
    return j.results[0].formatted_address || null;
  } catch { return null; }
}
