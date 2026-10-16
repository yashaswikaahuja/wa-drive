import { useCallback, useEffect, useState, type CSSProperties } from 'react';

/** Same easing as Find Form / Today. */
export const REVEAL_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

type Options = {
  /** When true (default), start the stagger on mount. Set false and call `trigger()` after data loads. */
  auto?: boolean;
  /** Stagger gap between sections (Find Form = 50). */
  stepMs?: number;
  /** Duration per section (Find Form = 600). */
  durationMs?: number;
  /** Rise distance in px (Find Form = 14). */
  distancePx?: number;
};

/**
 * Find Form–style staggered fade/rise for page sections.
 * Usage: `const { reveal, trigger } = useReveal()` then `style={reveal(0)}` on blocks.
 */
export function useReveal(opts: Options = {}) {
  const auto = opts.auto !== false;
  const stepMs = opts.stepMs ?? 50;
  const durationMs = opts.durationMs ?? 600;
  const distancePx = opts.distancePx ?? 14;
  const [mounted, setMounted] = useState(false);

  const trigger = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMounted(true);
      return;
    }
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!auto) return;
    trigger();
  }, [auto, trigger]);

  const reveal = useCallback(
    (i: number): CSSProperties => {
      if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return {};
      }
      return {
        transform: mounted ? 'translateY(0)' : `translateY(${distancePx}px)`,
        opacity: mounted ? 1 : 0,
        transition: `transform ${durationMs}ms ${REVEAL_EASE} ${i * stepMs}ms, opacity ${durationMs}ms ${REVEAL_EASE} ${i * stepMs}ms`,
      };
    },
    [mounted, stepMs, durationMs, distancePx],
  );

  return { mounted, setMounted, trigger, reveal };
}
