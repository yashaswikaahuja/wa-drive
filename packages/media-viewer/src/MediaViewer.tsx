/**
 * Windows Photos–style media viewer overlay.
 * Dark stage (#0a0a0a), frosted white controls, filmstrip for images,
 * Mozilla PDF.js embed for PDFs. Shared by File Manager and WhatsApp Documents.
 *
 * Café-operator UX: inspect ID photos quickly — focal pinch/cursor zoom,
 * pan while zoomed, filmstrip nav, frosted chrome that stays readable on dark photos.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import {
  ArrowBendUpLeft,
  Camera,
  CaretLeft,
  CaretRight,
  DotsThree,
  DownloadSimple,
  File as FileIcon,
  FilePdf,
  Image as ImageIcon,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  PencilSimple,
  Printer,
  SpinnerGap,
  Trash,
} from '@phosphor-icons/react';
import MozillaPdfEmbed from './MozillaPdfEmbed';
import { displayName, type MediaKind } from './utils';

export type MediaViewerFile = {
  id: string;
  fileName: string;
  /** Ready-to-display URL (blob: or authenticated download). */
  url: string;
  kind: MediaKind;
};

export type MediaViewerStripItem = {
  id: string;
  fileName: string;
  /** Optional thumb URL for the filmstrip. */
  thumbUrl?: string;
  kind?: MediaKind | 'other';
};

export type MediaViewerProps = {
  file: MediaViewerFile | null;
  /** Filmstrip / navigation set (folder files or chat media). */
  items?: MediaViewerStripItem[];
  /** Index of `file` within `items` (−1 if unknown). */
  index?: number;
  /** True while resolving the next/prev blob. */
  opening?: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** Click a filmstrip thumb. */
  onSelectItem?: (id: string) => void;
  onDelete?: () => void;
  onDownload?: () => void;
  onOpenInPhotoEditor?: () => void;
  onPrint?: () => void;
  showDelete?: boolean;
  showPrint?: boolean;
  showPhotoEditor?: boolean;
  /** Custom filmstrip thumb; defaults to thumbUrl / glyph. */
  renderStripThumb?: (item: MediaViewerStripItem, active: boolean) => ReactNode;
  zIndexClass?: string;
};

const BTN =
  'rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white/90 active:scale-95 transition-transform';
const BTN_ICON = `w-9 h-9 sm:w-11 sm:h-11 ${BTN}`;
/** Hub marigold — active filmstrip / accent on dark stage */
const ACCENT_RING = 'ring-2 ring-[hsl(28,95%,55%)] ring-offset-1 ring-offset-transparent';

function DefaultStripThumb({ item }: { item: MediaViewerStripItem }) {
  const [broken, setBroken] = useState(false);
  if (item.thumbUrl && !broken) {
    return (
      <img
        src={item.thumbUrl}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  if (item.kind === 'pdf') return <FilePdf size={18} weight="fill" className="text-red-400" />;
  if (item.kind === 'image') return <ImageIcon size={18} weight="fill" className="text-sky-400" />;
  return <FileIcon size={18} weight="fill" className="text-white/50" />;
}

export default function MediaViewer({
  file,
  items = [],
  index = -1,
  opening = false,
  onClose,
  onPrev,
  onNext,
  onSelectItem,
  onDelete,
  onDownload,
  onOpenInPhotoEditor,
  onPrint,
  showDelete = true,
  showPrint = false,
  showPhotoEditor = true,
  renderStripThumb,
  zIndexClass = 'z-[100]',
}: MediaViewerProps) {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  /** Pan offset (px) so scale can stay anchored under pinch/cursor. */
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [pinching, setPinching] = useState(false);
  const [panning, setPanning] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreWrapRef = useRef<HTMLDivElement | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const stageElRef = useRef<HTMLDivElement | null>(null);
  const swipeStartX = useRef<number | null>(null);
  /** One-finger / mouse drag while zoomed. */
  const dragRef = useRef<{
    pointerX: number;
    pointerY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  /** Two-finger / Safari gesture pinch → content scale (not browser page zoom). */
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef(1);
  const pinchActive = useRef(false);
  const kindRef = useRef<MediaKind>('image');
  const onPrevRef = useRef(onPrev);
  const onNextRef = useRef(onNext);
  const detachPinchRef = useRef<(() => void) | null>(null);
  const applyZoomAtRef = useRef<(z: number, clientX: number, clientY: number) => void>(() => {});

  const clampZoom = (z: number) => Math.min(4, Math.max(0.5, Number(z.toFixed(2))));

  /** Zoom so the content under (clientX, clientY) stays fixed on screen. */
  const applyZoomAt = useCallback((rawZoom: number, clientX: number, clientY: number) => {
    let next = clampZoom(rawZoom);
    const prev = zoomRef.current;
    let nextPan = { ...panRef.current };

    if (next === 1) {
      nextPan = { x: 0, y: 0 };
    } else if (imgRef.current && prev > 0 && next !== prev) {
      const rect = imgRef.current.getBoundingClientRect();
      const vx = rect.left + rect.width / 2;
      const vy = rect.top + rect.height / 2;
      const dx = clientX - vx;
      const dy = clientY - vy;
      const ratio = next / prev;
      nextPan = {
        x: panRef.current.x + dx * (1 - ratio),
        y: panRef.current.y + dy * (1 - ratio),
      };
    }

    zoomRef.current = next;
    panRef.current = nextPan;
    setZoom(next);
    setPan(nextPan);
  }, []);

  applyZoomAtRef.current = applyZoomAt;

  const resetZoomPan = useCallback(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const setPanBoth = useCallback((next: { x: number; y: number }) => {
    panRef.current = next;
    setPan(next);
  }, []);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  useEffect(() => {
    onPrevRef.current = onPrev;
    onNextRef.current = onNext;
  }, [onPrev, onNext]);

  useEffect(() => {
    resetZoomPan();
    setPinching(false);
    setPanning(false);
    setMoreOpen(false);
    pinchStartDist.current = null;
    pinchActive.current = false;
    dragRef.current = null;
    lastTapRef.current = null;
  }, [file?.id, resetZoomPan]);

  useEffect(() => {
    if (!file?.id) return;
    requestAnimationFrame(() => {
      const el = filmstripRef.current?.querySelector(`[data-file-id="${file.id}"]`);
      el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    });
  }, [file?.id]);

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (moreOpen) {
          setMoreOpen(false);
          return;
        }
        if (zoomRef.current !== 1) {
          resetZoomPan();
          return;
        }
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onPrev?.();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNext?.();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const img = imgRef.current;
        const rect = img?.getBoundingClientRect();
        const cx = rect ? rect.left + rect.width / 2 : 0;
        const cy = rect ? rect.top + rect.height / 2 : 0;
        applyZoomAtRef.current(zoomRef.current + 0.25, cx, cy);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        const img = imgRef.current;
        const rect = img?.getBoundingClientRect();
        const cx = rect ? rect.left + rect.width / 2 : 0;
        const cy = rect ? rect.top + rect.height / 2 : 0;
        applyZoomAtRef.current(zoomRef.current - 0.25, cx, cy);
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoomPan();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file?.id, onClose, onPrev, onNext, moreOpen, resetZoomPan]);

  /** Close overflow menu on outside click. */
  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!moreWrapRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    window.addEventListener('pointerdown', onPointer, true);
    return () => window.removeEventListener('pointerdown', onPointer, true);
  }, [moreOpen]);

  const kind = file?.kind ?? 'image';
  kindRef.current = kind;

  /**
   * Desktop trackpad pinch arrives as ctrl/meta + wheel. React onWheel is passive,
   * so preventDefault there cannot stop browser page zoom — use a native listener.
   * Zoom toward the cursor (clientX/Y), not the image center.
   */
  useEffect(() => {
    if (!file || file.kind !== 'image') return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      applyZoomAtRef.current(zoomRef.current - e.deltaY * 0.002, e.clientX, e.clientY);
      setPinching(Math.abs(e.deltaY) > 0.5);
    };
    const clearPinching = () => setPinching(false);
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('mouseup', clearPinching);
    window.addEventListener('keyup', clearPinching);
    return () => {
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('mouseup', clearPinching);
      window.removeEventListener('keyup', clearPinching);
      setPinching(false);
    };
  }, [file?.id, file?.kind]);

  /** Bind pinch / pan / swipe on the stage node as soon as it mounts. */
  const bindPinchSurface = useCallback((el: HTMLDivElement | null) => {
    detachPinchRef.current?.();
    detachPinchRef.current = null;
    stageElRef.current = el;
    if (!el) return;

    const touchDistance = (a: Touch, b: Touch) => {
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.hypot(dx, dy);
    };
    const touchMidpoint = (a: Touch, b: Touch) => ({
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    });

    const maybeDoubleTap = (clientX: number, clientY: number) => {
      const now = Date.now();
      const prev = lastTapRef.current;
      lastTapRef.current = { t: now, x: clientX, y: clientY };
      if (!prev || now - prev.t > 320) return false;
      if (Math.hypot(clientX - prev.x, clientY - prev.y) > 36) return false;
      lastTapRef.current = null;
      if (zoomRef.current > 1.05) {
        applyZoomAtRef.current(1, clientX, clientY);
      } else {
        applyZoomAtRef.current(2, clientX, clientY);
      }
      return true;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (kindRef.current !== 'image') return;
      if (e.touches.length >= 2) {
        e.preventDefault();
        pinchActive.current = true;
        setPinching(true);
        setPanning(false);
        dragRef.current = null;
        pinchStartDist.current = touchDistance(e.touches[0], e.touches[1]);
        pinchStartZoom.current = zoomRef.current;
        swipeStartX.current = null;
        return;
      }
      if (e.touches.length === 1 && !pinchActive.current) {
        const t = e.touches[0];
        swipeStartX.current = t.clientX;
        if (zoomRef.current > 1.01) {
          dragRef.current = {
            pointerX: t.clientX,
            pointerY: t.clientY,
            panX: panRef.current.x,
            panY: panRef.current.y,
            moved: false,
          };
        } else {
          dragRef.current = null;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (kindRef.current !== 'image') return;
      if (e.touches.length >= 2) {
        e.preventDefault();
        if (!pinchStartDist.current || pinchStartDist.current <= 0) {
          pinchStartDist.current = touchDistance(e.touches[0], e.touches[1]);
          pinchStartZoom.current = zoomRef.current;
        }
        pinchActive.current = true;
        setPinching(true);
        setPanning(false);
        swipeStartX.current = null;
        dragRef.current = null;
        const dist = touchDistance(e.touches[0], e.touches[1]);
        const mid = touchMidpoint(e.touches[0], e.touches[1]);
        applyZoomAtRef.current(
          pinchStartZoom.current * (dist / pinchStartDist.current),
          mid.x,
          mid.y,
        );
        return;
      }
      if (e.touches.length === 1 && dragRef.current && zoomRef.current > 1.01) {
        e.preventDefault();
        const t = e.touches[0];
        const d = dragRef.current;
        const dx = t.clientX - d.pointerX;
        const dy = t.clientY - d.pointerY;
        if (Math.hypot(dx, dy) > 4) d.moved = true;
        setPanning(true);
        setPanBoth({ x: d.panX + dx, y: d.panY + dy });
        swipeStartX.current = null;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (kindRef.current !== 'image') return;
      if (e.touches.length < 2) pinchStartDist.current = null;
      if (e.touches.length === 0) {
        const wasPinch = pinchActive.current;
        const drag = dragRef.current;
        pinchActive.current = false;
        pinchStartDist.current = null;
        setPinching(false);
        setPanning(false);
        dragRef.current = null;

        if (wasPinch) {
          swipeStartX.current = null;
          return;
        }

        // Double-tap zoom / reset at tap point (only if we did not pan).
        if (drag?.moved) {
          swipeStartX.current = null;
          return;
        }
        if (e.changedTouches.length > 0) {
          const t = e.changedTouches[0];
          if (maybeDoubleTap(t.clientX, t.clientY)) {
            swipeStartX.current = null;
            return;
          }
        }

        // File swipe only at 1× — when zoomed, drag pans instead.
        if (zoomRef.current > 1.01) {
          swipeStartX.current = null;
          return;
        }
        if (swipeStartX.current == null || e.changedTouches.length === 0) return;
        const dx = e.changedTouches[0].clientX - swipeStartX.current;
        swipeStartX.current = null;
        if (Math.abs(dx) < 60) return;
        if (dx < 0) onNextRef.current?.();
        else onPrevRef.current?.();
      }
    };

    // Safari / iOS Safari expose non-standard gesture* events for pinch.
    const onGestureStart = (e: Event) => {
      if (kindRef.current !== 'image') return;
      e.preventDefault();
      pinchActive.current = true;
      setPinching(true);
      pinchStartZoom.current = zoomRef.current;
      swipeStartX.current = null;
      dragRef.current = null;
    };
    const onGestureChange = (e: Event) => {
      if (kindRef.current !== 'image') return;
      e.preventDefault();
      const ge = e as Event & { scale?: number; clientX?: number; clientY?: number };
      const scale = ge.scale;
      if (typeof scale !== 'number' || !Number.isFinite(scale)) return;
      pinchActive.current = true;
      setPinching(true);
      const img = imgRef.current;
      const rect = img?.getBoundingClientRect();
      const fx =
        typeof ge.clientX === 'number' && Number.isFinite(ge.clientX)
          ? ge.clientX
          : rect
            ? rect.left + rect.width / 2
            : 0;
      const fy =
        typeof ge.clientY === 'number' && Number.isFinite(ge.clientY)
          ? ge.clientY
          : rect
            ? rect.top + rect.height / 2
            : 0;
      applyZoomAtRef.current(pinchStartZoom.current * scale, fx, fy);
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      pinchActive.current = false;
      setPinching(false);
      pinchStartDist.current = null;
      swipeStartX.current = null;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (kindRef.current !== 'image') return;
      if (e.button !== 0) return;
      if (zoomRef.current <= 1.01) return;
      // Ignore clicks on chrome buttons / filmstrip.
      const t = e.target as HTMLElement | null;
      if (t?.closest('button, a, [data-filmstrip]')) return;
      dragRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
        moved: false,
      };
      setPanning(true);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current || kindRef.current !== 'image') return;
      if (zoomRef.current <= 1.01) return;
      e.preventDefault();
      const d = dragRef.current;
      const dx = e.clientX - d.pointerX;
      const dy = e.clientY - d.pointerY;
      if (Math.hypot(dx, dy) > 3) d.moved = true;
      setPanBoth({ x: d.panX + dx, y: d.panY + dy });
    };
    const onMouseUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      setPanning(false);
      if (drag && !drag.moved && kindRef.current === 'image') {
        // Treat as click — double-click handled via dblclick.
      }
    };
    const onDblClick = (e: MouseEvent) => {
      if (kindRef.current !== 'image') return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('button, a, [data-filmstrip]')) return;
      e.preventDefault();
      if (zoomRef.current > 1.05) applyZoomAtRef.current(1, e.clientX, e.clientY);
      else applyZoomAtRef.current(2, e.clientX, e.clientY);
    };

    const opts = { capture: true, passive: false } as const;
    el.addEventListener('touchstart', onTouchStart, opts);
    el.addEventListener('touchmove', onTouchMove, opts);
    el.addEventListener('touchend', onTouchEnd, opts);
    el.addEventListener('touchcancel', onTouchEnd, opts);
    el.addEventListener('gesturestart', onGestureStart, opts);
    el.addEventListener('gesturechange', onGestureChange, opts);
    el.addEventListener('gestureend', onGestureEnd, opts);
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('dblclick', onDblClick);

    detachPinchRef.current = () => {
      el.removeEventListener('touchstart', onTouchStart, true);
      el.removeEventListener('touchmove', onTouchMove, true);
      el.removeEventListener('touchend', onTouchEnd, true);
      el.removeEventListener('touchcancel', onTouchEnd, true);
      el.removeEventListener('gesturestart', onGestureStart, true);
      el.removeEventListener('gesturechange', onGestureChange, true);
      el.removeEventListener('gestureend', onGestureEnd, true);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('dblclick', onDblClick);
    };
  }, [setPanBoth]);

  useEffect(() => () => {
    detachPinchRef.current?.();
    detachPinchRef.current = null;
  }, []);

  if (!file) {
    if (!opening) return null;
    return (
      <div
        className={`fixed inset-0 ${zIndexClass} bg-[#0a0a0a] flex items-center justify-center`}
        role="dialog"
        aria-modal="true"
        aria-busy="true"
      >
        <SpinnerGap size={36} className="animate-spin text-white" />
      </div>
    );
  }

  const canNavigate = items.length > 1 && !!(onPrev || onNext);
  const zoomed = zoom > 1.01;
  const chromeDim = pinching || panning;

  const onTouchStartPdf = (e: ReactTouchEvent) => {
    if (kind !== 'pdf') return;
    if (e.touches.length === 1) swipeStartX.current = e.touches[0].clientX;
  };
  const onTouchEndPdf = (e: ReactTouchEvent) => {
    if (kind !== 'pdf') return;
    if (swipeStartX.current == null || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(dx) < 60) return;
    if (dx < 0) onNext?.();
    else onPrev?.();
  };

  const counter =
    index >= 0 && items.length > 0 ? ` · File ${index + 1} of ${items.length}` : '';

  const stepZoomButton = () => {
    if (zoomed) {
      resetZoomPan();
      return;
    }
    const img = imgRef.current;
    const rect = img?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : 0;
    const cy = rect ? rect.top + rect.height / 2 : 0;
    applyZoomAt(2, cx, cy);
  };

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} bg-[#0a0a0a] flex flex-col overscroll-none`}
      style={{ touchAction: kind === 'pdf' ? 'auto' : 'none' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={displayName(file.fileName)}
    >
      <div
        ref={bindPinchSurface}
        className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          touchAction: kind === 'pdf' ? 'auto' : 'none',
          cursor: kind === 'image' && zoomed ? (panning ? 'grabbing' : 'grab') : undefined,
        }}
        data-pinch-surface={kind === 'image' ? '1' : undefined}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(40,40,45,0.9) 0%, rgba(10,10,10,1) 70%)',
          }}
        />

        {/* Floating controls — photos only. PDF uses Mozilla toolbar. */}
        {kind === 'image' && (
          <>
            <button
              type="button"
              onClick={onClose}
              className={`absolute top-2 left-2 sm:top-4 sm:left-4 z-20 h-9 sm:h-11 px-2.5 sm:px-3.5 gap-1 ${BTN} ${
                chromeDim ? 'opacity-40' : 'opacity-100'
              } transition-opacity`}
              title="Back (Esc)"
              aria-label="Back"
            >
              <ArrowBendUpLeft size={16} weight="bold" />
              <span className="text-[11px] sm:text-xs font-semibold">Back</span>
            </button>

            <div
              className={`absolute top-2 right-2 sm:top-4 sm:right-4 z-20 flex items-center gap-1.5 sm:gap-2 transition-opacity ${
                chromeDim ? 'opacity-40' : 'opacity-100'
              }`}
            >
              <button
                type="button"
                className={BTN_ICON}
                title={zoomed ? 'Reset zoom' : 'Zoom in'}
                aria-label={zoomed ? 'Reset zoom' : 'Zoom in'}
                onClick={stepZoomButton}
              >
                {zoomed ? (
                  <MagnifyingGlassMinus size={18} weight="bold" />
                ) : (
                  <MagnifyingGlassPlus size={18} weight="bold" />
                )}
              </button>
              {showPrint && onPrint && (
                <button
                  type="button"
                  className={`hidden sm:flex ${BTN_ICON}`}
                  title="Print"
                  aria-label="Print"
                  onClick={onPrint}
                >
                  <Printer size={18} weight="bold" />
                </button>
              )}
              {showPhotoEditor && onOpenInPhotoEditor && (
                <button
                  type="button"
                  className={`hidden sm:flex ${BTN_ICON}`}
                  title="Edit in Photo Editor"
                  aria-label="Photo Editor"
                  onClick={onOpenInPhotoEditor}
                >
                  <PencilSimple size={20} weight="bold" />
                </button>
              )}
              {showDelete && onDelete && (
                <button
                  type="button"
                  className={BTN_ICON}
                  title="Delete"
                  aria-label="Delete"
                  onClick={onDelete}
                >
                  <Trash size={18} weight="bold" />
                </button>
              )}
              <div className="relative" ref={moreWrapRef}>
                <button
                  type="button"
                  className={BTN_ICON}
                  title="More"
                  aria-label="More actions"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((v: boolean) => !v)}
                >
                  <DotsThree size={22} weight="bold" />
                </button>
                {moreOpen && (
                  <div
                    className="absolute right-0 min-w-[180px] rounded-xl border border-white/15 bg-[#2c2c2e]/95 backdrop-blur-md shadow-2xl py-1.5 text-sm text-white z-30"
                    style={{ top: '3.25rem' }}
                    onClick={(e) => e.stopPropagation()}
                    role="menu"
                  >
                    {onDownload && (
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full px-3.5 py-2.5 text-left hover:bg-white/10 flex items-center gap-2.5"
                        onClick={() => {
                          setMoreOpen(false);
                          onDownload();
                        }}
                      >
                        <DownloadSimple size={16} /> Download
                      </button>
                    )}
                    {showPrint && onPrint && (
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full px-3.5 py-2.5 text-left hover:bg-white/10 flex items-center gap-2.5 sm:hidden"
                        onClick={() => {
                          setMoreOpen(false);
                          onPrint();
                        }}
                      >
                        <Printer size={16} /> Print
                      </button>
                    )}
                    {showPhotoEditor && onOpenInPhotoEditor && (
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full px-3.5 py-2.5 text-left hover:bg-white/10 flex items-center gap-2.5 sm:hidden"
                        onClick={() => {
                          setMoreOpen(false);
                          onOpenInPhotoEditor();
                        }}
                      >
                        <Camera size={16} /> Photo Editor
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full px-3.5 py-2.5 text-left hover:bg-white/10"
                      onClick={() => {
                        resetZoomPan();
                        setMoreOpen(false);
                      }}
                    >
                      Reset zoom
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {kind === 'image' && canNavigate && !zoomed && (
          <>
            <button
              type="button"
              className={`absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-12 sm:h-12 ${BTN} ${
                chromeDim ? 'opacity-30' : 'opacity-90 hover:opacity-100'
              } transition-opacity`}
              onClick={onPrev}
              title="Previous file"
              aria-label="Previous file"
            >
              <CaretLeft size={22} weight="bold" className="sm:hidden" />
              <CaretLeft size={26} weight="bold" className="hidden sm:block" />
            </button>
            <button
              type="button"
              className={`absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-12 sm:h-12 ${BTN} ${
                chromeDim ? 'opacity-30' : 'opacity-90 hover:opacity-100'
              } transition-opacity`}
              onClick={onNext}
              title="Next file"
              aria-label="Next file"
            >
              <CaretRight size={22} weight="bold" className="sm:hidden" />
              <CaretRight size={26} weight="bold" className="hidden sm:block" />
            </button>
          </>
        )}

        {kind === 'pdf' && canNavigate && (
          <>
            <div
              className="absolute left-0 top-10 bottom-0 w-10 sm:w-6 z-40 md:hidden"
              style={{ touchAction: 'pan-y' }}
              onTouchStart={onTouchStartPdf}
              onTouchEnd={onTouchEndPdf}
              title="Swipe for previous file"
            />
            <div
              className="absolute right-0 top-10 bottom-0 w-10 sm:w-6 z-40 md:hidden"
              style={{ touchAction: 'pan-y' }}
              onTouchStart={onTouchStartPdf}
              onTouchEnd={onTouchEndPdf}
              title="Swipe for next file"
            />
          </>
        )}

        {opening && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
            <SpinnerGap size={32} className="animate-spin text-white" />
          </div>
        )}

        <div className="absolute inset-0 z-[5] overflow-hidden">
          {kind === 'image' ? (
            <div className="w-full h-full flex items-center justify-center overflow-hidden px-8 sm:px-14 py-[3.75rem] sm:py-[4.5rem]">
              <img
                ref={imgRef}
                src={file.url}
                alt={file.fileName}
                className={`max-w-full max-h-full object-contain object-center shadow-[0_0_80px_rgba(0,0,0,0.65)] origin-center select-none ${
                  pinching || panning ? '' : 'transition-transform duration-150'
                }`}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  touchAction: 'none',
                }}
                draggable={false}
              />
            </div>
          ) : (
            <div className="w-full h-full min-h-0 bg-[#525659]">
              <MozillaPdfEmbed
                fileUrl={file.url}
                onBack={onClose}
                onDelete={showDelete ? onDelete : undefined}
                onPrevFile={onPrev}
                onNextFile={onNext}
              />
            </div>
          )}
        </div>

        {kind === 'image' && (
          <div
            className={`absolute bottom-[3.5rem] sm:bottom-[4.25rem] left-1/2 -translate-x-1/2 z-20 pointer-events-none transition-opacity ${
              chromeDim ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <div className="px-3 py-1 rounded-full bg-black/55 text-white/95 text-[11px] sm:text-[12px] font-medium shadow-lg max-w-[80vw] truncate backdrop-blur-sm border border-white/10">
              {displayName(file.fileName)}
              {counter}
              {zoom !== 1 ? ` · ${Math.round(zoom * 100)}%` : ''}
            </div>
          </div>
        )}

        {kind === 'image' && items.length > 0 && (
          <div
            className={`absolute inset-x-0 bottom-0 z-20 pointer-events-none transition-opacity ${
              chromeDim ? 'opacity-40' : 'opacity-100'
            }`}
            onClick={(e) => e.stopPropagation()}
            data-filmstrip
          >
            <div
              ref={filmstripRef}
              className="pointer-events-auto flex gap-1.5 sm:gap-2 overflow-x-auto justify-start sm:justify-center scroll-smooth px-2 sm:px-4 pt-2 bg-gradient-to-t from-black/50 to-transparent"
              style={
                {
                  scrollbarWidth: 'none',
                  WebkitOverflowScrolling: 'touch',
                  paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))',
                } as CSSProperties
              }
            >
              {items.map((item) => {
                const active = item.id === file.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-file-id={item.id}
                    onClick={() => onSelectItem?.(item.id)}
                    className={`shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-md overflow-hidden transition-all shadow-md ${
                      active
                        ? `${ACCENT_RING} scale-105`
                        : 'opacity-70 hover:opacity-100 ring-1 ring-white/35'
                    }`}
                    title={displayName(item.fileName)}
                    aria-current={active ? 'true' : undefined}
                  >
                    <div className="w-full h-full bg-black/40 flex items-center justify-center">
                      {renderStripThumb ? (
                        renderStripThumb(item, active)
                      ) : (
                        <DefaultStripThumb item={item} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
