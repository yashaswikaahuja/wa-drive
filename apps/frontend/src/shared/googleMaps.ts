/**
 * Singleton loader for the Google Maps JS API (Places + Geocoding).
 * Key comes from VITE_GOOGLE_MAPS_API_KEY (baked at build time). If the key is absent the loader
 * resolves to null and callers degrade gracefully (plain text field, coords-only labels).
 */
const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
let promise: Promise<any> | null = null;

export function hasMapsKey(): boolean {
  return !!KEY;
}

export function loadGoogleMaps(): Promise<any> {
  if (!KEY) return Promise.resolve(null);
  const w = window as any;
  if (w.google?.maps?.places) return Promise.resolve(w.google);
  if (promise) return promise;
  promise = new Promise((resolve) => {
    const cb = '__ccMapsReady';
    w[cb] = () => resolve(w.google);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&libraries=places&callback=${cb}&loading=async`;
    s.async = true;
    s.defer = true;
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return promise;
}
