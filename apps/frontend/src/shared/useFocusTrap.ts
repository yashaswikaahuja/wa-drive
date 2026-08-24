import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus within `ref` while mounted: focuses the first element,
 * cycles Tab/Shift+Tab inside the container, calls onEscape on Esc, and
 * restores focus to the previously-focused element on unmount.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, onEscape?: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const visibleFocusables = () =>
      Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);

    visibleFocusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onEscape?.(); return; }
      if (e.key !== 'Tab') return;
      const items = visibleFocusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [ref, onEscape]);
}
