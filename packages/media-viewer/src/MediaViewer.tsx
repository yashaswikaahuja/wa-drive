/**
 * Windows Photos–style media viewer overlay.
 * Dark stage (#0a0a0a), frosted white controls, filmstrip for images,
 * Mozilla PDF.js embed for PDFs. Shared by File Manager and WhatsApp Documents.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
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
  const [pinching, setPinching] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const stageElRef = useRef<HTMLDivElement | null>(null);
  const swipeStartX = useRef<number | null>(null);
  /** Two-finger / Safari gesture pinch → content scale (not browser page zoom). */
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef(1);
  const pinchActive = useRef(false);
  const kindRef = useRef<MediaKind>('image');
  const onPrevRef = useRef(onPrev);
  const onNextRef = useRef(onNext);
  const detachPinchRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    onPrevRef.current = onPrev;
    onNextRef.current = onNext;
  }, [onPrev, onNext]);

  useEffect(() => {
    setZoom(1);
    zoomRef.current = 1;
    setPinching(false);
    setMoreOpen(false);
    pinchStartDist.current = null;
    pinchActive.current = false;
  }, [file?.id]);

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
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onPrev?.();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNext?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file?.id, onClose, onPrev, onNext]);

  const kind = file?.kind ?? 'image';
  kindRef.current = kind;

  /** Bind pinch/swipe on the stage node as soon as it mounts (stable callback ref). */
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
    const clampZoom = (z: number) => Math.min(4, Math.max(0.5, Number(z.toFixed(2))));
    const applyZoom = (z: number) => {
      const next = clampZoom(z);
      zoomRef.current = next;
      setZoom(next);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (kindRef.current !== 'image') return;
      if (e.touches.length >= 2) {
        e.preventDefault();
        pinchActive.current = true;
        setPinching(true);
        pinchStartDist.current = touchDistance(e.touches[0], e.touches[1]);
        pinchStartZoom.current = zoomRef.current;
        swipeStartX.current = null;
        return;
      }
      if (e.touches.length === 1 && !pinchActive.current) {
        swipeStartX.current = e.touches[0].clientX;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (kindRef.current !== 'image') return;
      if (e.touches.length >= 2) {
        e.preventDefault();
        // Second finger may land after move started — (re)seed baseline.
        if (!pinchStartDist.current || pinchStartDist.current <= 0) {
          pinchStartDist.current = touchDistance(e.touches[0], e.touches[1]);
          pinchStartZoom.current = zoomRef.current;
        }
        pinchActive.current = true;
        setPinching(true);
        swipeStartX.current = null;
        const dist = touchDistance(e.touches[0], e.touches[1]);
        applyZoom(pinchStartZoom.current * (dist / pinchStartDist.current));
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (kindRef.current !== 'image') return;
      if (e.touches.length < 2) pinchStartDist.current = null;
      if (e.touches.length === 0) {
        const wasPinch = pinchActive.current;
        pinchActive.current = false;
        pinchStartDist.current = null;
        setPinching(false);
        if (wasPinch) {
          swipeStartX.current = null;
          return;
        }
      }
      if (swipeStartX.current == null || e.changedTouches.length === 0) return;
      if (pinchActive.current) return;
      const dx = e.changedTouches[0].clientX - swipeStartX.current;
      swipeStartX.current = null;
      if (Math.abs(dx) < 60) return;
      if (dx < 0) onNextRef.current?.();
      else onPrevRef.current?.();
    };

    // Safari / iOS Safari expose non-standard gesture* events for pinch.
    const onGestureStart = (e: Event) => {
      if (kindRef.current !== 'image') return;
      e.preventDefault();
      pinchActive.current = true;
      setPinching(true);
      pinchStartZoom.current = zoomRef.current;
      swipeStartX.current = null;
    };
    const onGestureChange = (e: Event) => {
      if (kindRef.current !== 'image') return;
      e.preventDefault();
      const scale = (e as Event & { scale?: number }).scale;
      if (typeof scale !== 'number' || !Number.isFinite(scale)) return;
      pinchActive.current = true;
      setPinching(true);
      applyZoom(pinchStartZoom.current * scale);
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      pinchActive.current = false;
      setPinching(false);
      pinchStartDist.current = null;
      swipeStartX.current = null;
    };

    const opts = { capture: true, passive: false } as const;
    el.addEventListener('touchstart', onTouchStart, opts);
    el.addEventListener('touchmove', onTouchMove, opts);
    el.addEventListener('touchend', onTouchEnd, opts);
    el.addEventListener('touchcancel', onTouchEnd, opts);
    el.addEventListener('gesturestart', onGestureStart, opts);
    el.addEventListener('gesturechange', onGestureChange, opts);
    el.addEventListener('gestureend', onGestureEnd, opts);

    detachPinchRef.current = () => {
      el.removeEventListener('touchstart', onTouchStart, true);
      el.removeEventListener('touchmove', onTouchMove, true);
      el.removeEventListener('touchend', onTouchEnd, true);
      el.removeEventListener('touchcancel', onTouchEnd, true);
      el.removeEventListener('gesturestart', onGestureStart, true);
      el.removeEventListener('gesturechange', onGestureChange, true);
      el.removeEventListener('gestureend', onGestureEnd, true);
    };
  }, []);

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

  const onTouchStart = (e: ReactTouchEvent) => {
    // PDF edge swipes still use React handlers; image pinch uses native listeners on stage.
    if (kind !== 'pdf') return;
    if (e.touches.length === 1) swipeStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    if (kind !== 'pdf') return;
    if (swipeStartX.current == null || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(dx) < 60) return;
    if (dx < 0) onNext?.();
    else onPrev?.();
  };

  const onWheel = (e: ReactWheelEvent) => {
    if (kind !== 'image') return;
    // Trackpad pinch arrives as ctrl/meta + wheel.
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const next = Math.min(4, Math.max(0.5, Number((zoomRef.current - e.deltaY * 0.002).toFixed(2))));
      zoomRef.current = next;
      setZoom(next);
    }
  };

  const counter =
    index >= 0 && items.length > 0 ? ` · File ${index + 1} of ${items.length}` : '';

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} bg-[#0a0a0a] flex flex-col overscroll-none`}
      style={{ touchAction: kind === 'pdf' ? 'auto' : 'none' }}
      onClick={onClose}
      onWheel={onWheel}
      role="dialog"
      aria-modal="true"
      aria-label={displayName(file.fileName)}
    >
      <div
        ref={bindPinchSurface}
        className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: kind === 'pdf' ? 'auto' : 'none' }}
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
              className="absolute top-2 left-2 sm:top-4 sm:left-4 z-20 h-9 sm:h-11 px-2.5 sm:px-3.5 rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center gap-1 shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white"
              title="Back (Esc)"
            >
              <ArrowBendUpLeft size={16} weight="bold" />
              <span className="text-[11px] sm:text-xs font-semibold">Back</span>
            </button>

            <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-20 flex items-center gap-1.5 sm:gap-2.5">
              <button
                type="button"
                className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white"
                title="Zoom"
                onClick={() => setZoom((z: number) => (z >= 2 ? 1 : Number((z + 0.5).toFixed(1))))}
              >
                <MagnifyingGlassPlus size={18} weight="bold" />
              </button>
              {showPrint && onPrint && (
                <button
                  type="button"
                  className="hidden sm:flex w-11 h-11 rounded-full bg-white/95 hover:bg-white text-black items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white"
                  title="Print"
                  onClick={onPrint}
                >
                  <Printer size={18} weight="bold" />
                </button>
              )}
              {showPhotoEditor && onOpenInPhotoEditor && (
                <button
                  type="button"
                  className="hidden sm:flex w-11 h-11 rounded-full bg-white/95 hover:bg-white text-black items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white"
                  title="Edit in Photo Editor"
                  onClick={onOpenInPhotoEditor}
                >
                  <PencilSimple size={20} weight="bold" />
                </button>
              )}
              {showDelete && onDelete && (
                <button
                  type="button"
                  className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white"
                  title="Delete"
                  onClick={onDelete}
                >
                  <Trash size={18} weight="bold" />
                </button>
              )}
              <div className="relative">
                <button
                  type="button"
                  className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white"
                  title="More"
                  onClick={() => setMoreOpen((v: boolean) => !v)}
                >
                  <DotsThree size={22} weight="bold" />
                </button>
                {moreOpen && (
                  <div
                    className="absolute right-0 min-w-[170px] rounded-xl border border-white/20 bg-[#2c2c2e] shadow-2xl py-1.5 text-sm text-white z-30"
                    style={{ top: '3.25rem' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onDownload && (
                      <button
                        type="button"
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
                        className="w-full px-3.5 py-2.5 text-left hover:bg-white/10 flex items-center gap-2.5"
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
                      className="w-full px-3.5 py-2.5 text-left hover:bg-white/10"
                      onClick={() => {
                        setZoom(1);
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

        {kind === 'image' && canNavigate && (
          <>
            <button
              type="button"
              className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center border border-white shadow-[0_6px_28px_rgba(0,0,0,0.55)]"
              onClick={onPrev}
              title="Previous file"
            >
              <CaretLeft size={22} weight="bold" className="sm:hidden" />
              <CaretLeft size={28} weight="bold" className="hidden sm:block" />
            </button>
            <button
              type="button"
              className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center border border-white shadow-[0_6px_28px_rgba(0,0,0,0.55)]"
              onClick={onNext}
              title="Next file"
            >
              <CaretRight size={22} weight="bold" className="sm:hidden" />
              <CaretRight size={28} weight="bold" className="hidden sm:block" />
            </button>
          </>
        )}

        {kind === 'pdf' && canNavigate && (
          <>
            <div
              className="absolute left-0 top-10 bottom-0 w-10 sm:w-6 z-40 md:hidden"
              style={{ touchAction: 'pan-y' }}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              title="Swipe for previous file"
            />
            <div
              className="absolute right-0 top-10 bottom-0 w-10 sm:w-6 z-40 md:hidden"
              style={{ touchAction: 'pan-y' }}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              title="Swipe for next file"
            />
          </>
        )}

        {opening && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
            <SpinnerGap size={32} className="animate-spin text-white" />
          </div>
        )}

        <div
          className={`absolute inset-0 z-[5] overflow-hidden ${
            kind === 'pdf' ? 'pt-0 pb-0' : 'pt-12 pb-0'
          }`}
        >
          {kind === 'image' ? (
            <div className="w-full h-full flex items-start justify-center overflow-hidden px-10 sm:px-14 pt-1 pb-[3.75rem] sm:pb-[4.5rem]">
              <img
                src={file.url}
                alt={file.fileName}
                className={`max-w-full max-h-full object-contain object-top shadow-[0_0_80px_rgba(0,0,0,0.65)] origin-center ${
                  pinching ? '' : 'transition-transform duration-150'
                }`}
                style={{ transform: `scale(${zoom})`, touchAction: 'none' }}
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
          <div className="absolute bottom-[3.25rem] sm:bottom-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="px-3 py-1 rounded-full bg-white/95 text-[11px] sm:text-[12px] font-medium text-black shadow-lg max-w-[80vw] truncate">
              {displayName(file.fileName)}
              {counter}
              {zoom !== 1 ? ` · ${Math.round(zoom * 100)}%` : ''}
            </div>
          </div>
        )}

        {kind === 'image' && items.length > 0 && (
          <div
            className="absolute inset-x-0 bottom-0 z-20 pointer-events-none safe-pb"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              ref={filmstripRef}
              className="pointer-events-auto flex gap-1.5 sm:gap-2 overflow-x-auto justify-start sm:justify-center scroll-smooth px-2 sm:px-4 py-2 bg-transparent"
              style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              {items.map((item) => {
                const active = item.id === file.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-file-id={item.id}
                    onClick={() => onSelectItem?.(item.id)}
                    className={`shrink-0 w-9 h-9 sm:w-12 sm:h-12 rounded-md overflow-hidden transition-all shadow-md ${
                      active
                        ? 'ring-2 ring-[#4da3ff] ring-offset-1 ring-offset-transparent scale-105'
                        : 'opacity-75 hover:opacity-100 ring-1 ring-white/40'
                    }`}
                    title={displayName(item.fileName)}
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
