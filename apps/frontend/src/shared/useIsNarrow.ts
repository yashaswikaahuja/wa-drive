import { useEffect, useState } from 'react';

/**
 * True on phone-width viewports (<768px). Uses matchMedia and is WebView-safe
 * (older Android WebViews only expose addListener/removeListener). Mirrors the
 * breakpoint used across the app (FileManager folders drawer, etc.).
 */
export function useIsNarrow(query = '(max-width: 767px)'): boolean {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const apply = () => setNarrow(mq.matches);
    apply();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, [query]);

  return narrow;
}
