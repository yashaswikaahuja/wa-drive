/**
 * CyberControl Photo Tool
 *
 * SERVER NEVER SEES PIXELS. All rendering happens here in the browser.
 * See /ARCHITECTURE.md §3.1 and §3.2.
 *
 * Phase 2b: 5 built-in templates loaded from templates.ts.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { TEMPLATES, TPL_FREE, TEMPLATE_GROUPS } from './templates';
import type { Slot, Template } from './templates';
import { Printer, Crop, RotateCw, Contrast, Scissors, Download, FolderOpen, Upload, Plus, LayoutGrid } from 'lucide-react';
import { printBlob } from '../../shared/fileCache';
import api from '../../shared/api';
import DrivePicker from './DrivePicker';
import CropModal from './CropModal';

const DISPLAY_MAX = 720;

// Layer for Free Compose mode — independent draggable/resizable image rect
// in canvas (paper) coordinates.
type Layer = { id: number; imageIndex: number; x: number; y: number; w: number; h: number };
let _layerSeq = 1;

function makeDefaultLayer(imageIndex: number, img: ImageBitmap, paperW: number, paperH: number, cascadeIndex: number): Layer {
  // Default size: ~40% of paper width, preserving aspect ratio
  const targetW = paperW * 0.4;
  const targetH = targetW * (img.height / img.width);
  // Cascade: each new layer offset by 100px right + 100px down
  const offset = (cascadeIndex % 6) * 100;
  const x = Math.max(0, Math.min(paperW - targetW, paperW * 0.1 + offset));
  const y = Math.max(0, Math.min(paperH - targetH, paperH * 0.1 + offset));
  return { id: _layerSeq++, imageIndex, x, y, w: targetW, h: targetH };
}

function displaySize(paperW: number, paperH: number, maxW: number = DISPLAY_MAX) {
  const aspect = paperW / paperH;
  // Fit to available width, then cap height so tall portraits stay reasonable.
  let w = maxW;
  let h = Math.round(maxW / aspect);
  if (h > DISPLAY_MAX) { h = DISPLAY_MAX; w = Math.round(DISPLAY_MAX * aspect); }
  return { w, h };
}

// Mini SVG preview of a template's real slot geometry, used in the picker.
function TemplateThumb({ template }: { template: Template }) {
  const { paper, slots } = template;
  return (
    <div
      className="w-full overflow-hidden rounded-md border"
      style={{ aspectRatio: `${paper.w} / ${paper.h}`, borderColor: 'hsl(38 20% 88%)', background: '#fff' }}
    >
      <svg viewBox={`0 0 ${paper.w} ${paper.h}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {slots.length === 0 ? (
          <rect x={paper.w * 0.12} y={paper.h * 0.12} width={paper.w * 0.76} height={paper.h * 0.76}
            fill="none" stroke="hsl(35 18% 72%)" strokeWidth="14" strokeDasharray="48 34" rx="20" />
        ) : (
          slots.map((s, i) => (
            <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx="10"
              fill="hsl(27 70% 90%)" stroke="hsl(27 55% 66%)" strokeWidth="7" />
          ))
        )}
      </svg>
    </div>
  );
}

export default function PhotoTool() {
  const [images, setImages] = useState<ImageBitmap[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('passport-4x6-8');
  const [grayscale, setGrayscale] = useState<boolean>(false);
  const [cutLines, setCutLines] = useState<boolean>(true);
  const [tplOpen, setTplOpen] = useState<boolean>(false);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [drivePickerOpen, setDrivePickerOpen] = useState<boolean>(false);
  const [cropModalOpen, setCropModalOpen] = useState<boolean>(false);
  // Per-slot transforms: zoom + pan offset within each slot.
  // Keyed by slot index in the active template.
  const [transforms, setTransforms] = useState<Record<number, { zoom: number; offsetX: number; offsetY: number }>>({});
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  // Free Compose layers — each image becomes a freely positioned/sized rect
  // when the active template is the Free Compose mode.
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null);
  const isCompose = templateId.startsWith('compose-');

  const template = TEMPLATES.find(t => t.id === templateId) || TPL_FREE;
  const hasImage = images.length > 0;

  // Reset transforms when template changes (slot indices may differ)
  useEffect(() => {
    setTransforms({});
    setSelectedSlot(null);
    setLayers([]);
    setSelectedLayer(null);
  }, [templateId]);

  const handleFile = useCallback(async (file: File, mode: 'replace' | 'append' = 'replace') => {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Please drop an image file');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      let newImageIdx = 0;
      setImages(prev => {
        if (mode === 'append') { newImageIdx = prev.length; return [...prev, bitmap]; }
        prev.forEach(b => b.close());
        newImageIdx = 0;
        return [bitmap];
      });
      setFileName(file.name);
      if (mode === 'replace') {
        setRotation(0);
        setTransforms({});
        setSelectedSlot(null);
        // In compose mode, replace = also reset layers + add one for this image
        if (isCompose) {
          const paper = TEMPLATES.find(t => t.id === templateId)?.paper;
          if (paper) setLayers([makeDefaultLayer(0, bitmap, paper.w, paper.h, 0)]);
          setSelectedLayer(null);
        }
      } else if (isCompose) {
        // Append in compose mode → add a cascaded layer for the new image
        const paper = TEMPLATES.find(t => t.id === templateId)?.paper;
        if (paper) {
          setLayers(prev => [...prev, makeDefaultLayer(newImageIdx, bitmap, paper.w, paper.h, prev.length)]);
        }
      }
    } catch (e: any) {
      setError('Could not read image: ' + (e.message || 'unknown'));
    }
  }, [isCompose, templateId]);

  // Multi-file upload — replaces existing images. In compose mode also creates
  // a cascaded layer per image.
  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    if (files.length === 1) { await handleFile(files[0], 'replace'); return; }
    setError('');
    try {
      const bitmaps = await Promise.all(files.filter(f => f.type.startsWith('image/'))
        .map(f => createImageBitmap(f, { imageOrientation: 'from-image' })));
      if (bitmaps.length === 0) { setError('No image files'); return; }
      setImages(prev => { prev.forEach(b => b.close()); return bitmaps; });
      setFileName(`${bitmaps.length} images`);
      setRotation(0);
      setTransforms({});
      setSelectedSlot(null);
      if (isCompose) {
        const paper = TEMPLATES.find(t => t.id === templateId)?.paper;
        if (paper) setLayers(bitmaps.map((b, i) => makeDefaultLayer(i, b, paper.w, paper.h, i)));
        setSelectedLayer(null);
      }
    } catch (e: any) {
      setError('Could not read images: ' + (e.message || 'unknown'));
    }
  }, [handleFile, isCompose, templateId]);

  // Load the most recently received Drive file — operator's most common need:
  // "customer just sent it on WhatsApp, give me that one."
  const loadLatest = useCallback(async () => {
    setError('');
    try {
      const res = await api.get('/drive/files/ws');
      const files = Array.isArray(res.data) ? res.data : [];
      if (files.length === 0) { setError('No files in Drive yet'); return; }
      const latest = files[0]; // backend returns newest first
      const dl = await api.get(`/drive/download/${latest.id}`, { responseType: 'blob' });
      const blob = new Blob([dl.data], { type: dl.headers['content-type'] || 'image/jpeg' });
      const file = new File([blob], latest.fileName || 'latest', { type: blob.type });
      await handleFile(file);
    } catch (e: any) {
      setError('Could not load latest: ' + (e.response?.data?.error || e.message || 'unknown'));
    }
  }, [handleFile]);

  const handlePrint = useCallback(() => {
    const canvas = document.getElementById('cc-photo-canvas') as HTMLCanvasElement | null;
    if (!canvas) { setError('Canvas not ready'); return; }
    const dataUrl = canvas.toDataURL('image/png');
    // @page size matches the active template's paper (A4 portrait/landscape, 4x6, etc).
    // Express paper size in mm so any printer respects it.
    const paperWmm = (template.paper.w / 300) * 25.4;
    const paperHmm = (template.paper.h / 300) * 25.4;
    const orientation = template.paper.w >= template.paper.h ? 'landscape' : 'portrait';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Print</title><style>
@page { size: ${paperWmm}mm ${paperHmm}mm; margin: 0; }
html, body { margin: 0; padding: 0; }
img { display: block; width: ${paperWmm}mm; height: ${paperHmm}mm; }
</style></head><body><img src="${dataUrl}"/></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    printBlob(blob);
    void orientation;
  }, [template]);

  useEffect(() => {
    return () => { images.forEach(b => b.close()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clipboard paste — operator hits Ctrl+V anywhere on page.
  // Captures image from clipboard (screenshot, copy-from-website, etc.).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            return;
          }
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [handleFile]);

  // URL params: ?fileId=X&template=Y — preload from a Drive file
  // (used by WhatsApp deep-link, future external integrations).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tplParam = params.get('template');
    if (tplParam && TEMPLATES.some(t => t.id === tplParam)) {
      setTemplateId(tplParam);
    }
    const fileId = params.get('fileId');
    if (fileId) {
      api.get(`/drive/download/${fileId}`, { responseType: 'blob' })
        .then(res => {
          const blob = new Blob([res.data], { type: res.headers['content-type'] || 'image/jpeg' });
          const file = new File([blob], 'drive-file', { type: blob.type });
          handleFile(file);
        })
        .catch(e => setError('Could not load Drive file: ' + (e.message || 'unknown')));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts — operators expect speed.
  // Ctrl+P print · R rotate · B B&W · 1-9 pick template by index · Esc close picker
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (hasImage) handlePrint();
        return;
      }
      if (e.key === 'Escape') {
        if (drivePickerOpen) setDrivePickerOpen(false);
        if (cropModalOpen) setCropModalOpen(false);
        if (selectedSlot !== null) setSelectedSlot(null);
        return;
      }
      if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
        if (hasImage) setCropModalOpen(true);
        return;
      }
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        if (hasImage) setRotation(r => ((r + 90) % 360) as 0 | 90 | 180 | 270);
        return;
      }
      if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey) {
        setGrayscale(g => !g);
        return;
      }
      if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey) {
        loadLatest();
        return;
      }
      if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < TEMPLATES.length) setTemplateId(TEMPLATES[idx].id);
        return;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImage, drivePickerOpen, cropModalOpen, selectedSlot]);

  return (
    <div className="pt-paper flex flex-col h-full md:h-[calc(100vh-4rem)] w-full max-w-full overflow-x-hidden">
      <header className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between px-3 sm:px-4 py-2 border-b" style={{ borderColor: 'hsl(var(--pt-border))' }}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]" style={{ background: 'hsl(var(--pt-ink))' }}>
            <Printer className="h-5 w-5" style={{ color: 'hsl(var(--pt-bg))' }} />
          </span>
          <div className="leading-tight min-w-0">
            <div className="pt-display text-[15px] font-bold">Photo Tool</div>
            <div className="pt-muted text-[11px] truncate max-w-[280px]">
              {fileName || 'documents · passport · ID prints'}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto sm:justify-end">
          <button onClick={() => setTplOpen(true)} className="pt-chip md:hidden shrink-0" title="Templates">
            <LayoutGrid className="h-4 w-4" /> Templates
          </button>
          <button onClick={() => setCropModalOpen(true)} disabled={!hasImage} className="pt-toolbtn" title="Crop image (C)">
            <Crop className="h-4 w-4" />
          </button>
          <button onClick={() => setRotation(r => ((r + 90) % 360) as 0 | 90 | 180 | 270)} disabled={!hasImage} className="pt-toolbtn" title="Rotate 90°">
            <RotateCw className="h-4 w-4" />
          </button>
          <button onClick={() => setGrayscale(g => !g)} data-active={grayscale} className="pt-toolbtn" title="Black & white">
            <Contrast className="h-4 w-4" />
          </button>
          <button onClick={() => setCutLines(v => !v)} data-active={cutLines} className="pt-toolbtn" title="Cut guides">
            <Scissors className="h-4 w-4" />
          </button>
          <span className="mx-1 h-6 w-px" style={{ background: 'hsl(var(--pt-border))' }} />
          <button onClick={loadLatest} className="pt-chip" title="Latest WhatsApp file (L)">
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Latest</span>
          </button>
          <button onClick={() => setDrivePickerOpen(true)} className="pt-chip" title="Pick a file from Drive">
            <FolderOpen className="h-4 w-4" /> <span className="hidden sm:inline">Drive</span>
          </button>
          <FilePicker onFiles={handleFiles} onAppend={f => handleFile(f, 'append')} />
          <button onClick={handlePrint} disabled={!hasImage} className="btn-marigold" title="Print (Ctrl+P)">
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {tplOpen && <div className="md:hidden fixed inset-0 z-30 bg-black/30" onClick={() => setTplOpen(false)} />}
        <aside
          className={`overflow-y-auto space-y-5 z-40 transition-transform duration-200 bg-[hsl(var(--pt-card))] md:bg-transparent
            fixed inset-x-0 bottom-0 max-h-[72vh] w-full rounded-t-2xl border-t px-4 py-4 shadow-lift
            md:static md:bottom-auto md:w-[280px] md:max-h-none md:shrink-0 md:rounded-none md:border-t-0 md:border-r md:py-5 md:shadow-none md:translate-y-0
            ${tplOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}`}
          style={{ borderColor: 'hsl(var(--pt-border))' }}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="pt-display text-[20px] font-bold leading-tight">Templates</h2>
              <p className="pt-muted text-xs mt-0.5">Pick a layout to start printing</p>
            </div>
            <button onClick={() => setTplOpen(false)} className="md:hidden pt-toolbtn text-lg leading-none" aria-label="Close templates">✕</button>
          </div>
          {TEMPLATE_GROUPS.map(group => (
            <section key={group.title}>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="pt-label text-[11px] font-semibold pt-ink-soft">{group.title}</h3>
                <span className="pt-muted text-[10px]">{group.hint}</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {group.templates.map(t => {
                  const isActive = templateId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setTemplateId(t.id); setTplOpen(false); }}
                      title={t.description}
                      className={`paper-card text-left p-2 transition ${isActive ? '' : 'hover:-translate-y-0.5'}`}
                      style={isActive ? { outline: '2px solid hsl(var(--pt-marigold))', outlineOffset: '1px' } : undefined}
                    >
                      <TemplateThumb template={t} />
                      <div className="mt-1.5">
                        <div className="text-[12px] font-semibold leading-tight">{t.name}</div>
                        <div className="pt-muted text-[10px] mt-0.5 truncate">{t.paper.name}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </aside>

        <main className="flex-1 flex items-center justify-center overflow-auto p-4 sm:p-8">
          <A4Canvas
            images={images}
            template={template}
            grayscale={grayscale}
            rotation={rotation}
            cutLines={cutLines}
            transforms={transforms}
            selectedSlot={selectedSlot}
            onSelectSlot={setSelectedSlot}
            onTransformSlot={(idx, fn) => setTransforms(t => {
              const cur = t[idx] || { zoom: 1, offsetX: 0, offsetY: 0 };
              return { ...t, [idx]: fn(cur) };
            })}
            layers={layers}
            selectedLayer={selectedLayer}
            onSelectLayer={setSelectedLayer}
            onUpdateLayer={(id, fn) => setLayers(prev => prev.map(L => L.id === id ? fn(L) : L))}
            onDrop={handleFile}
          />
        </main>
      </div>

      <footer className="px-4 py-1.5 border-t flex justify-between text-xs pt-muted" style={{ borderColor: 'hsl(var(--pt-border))' }}>
        <span>{template.name} · {template.paper.name} · {template.slots.length} slot{template.slots.length === 1 ? '' : 's'}</span>
        <span style={error ? { color: 'hsl(0 70% 45%)' } : undefined} className={error ? '' : 'italic'}>
          {error || (selectedSlot !== null
            ? 'Slot ' + (selectedSlot + 1) + ' selected — drag to pan · scroll to zoom · Esc to deselect'
            : 'L latest · C crop · R rotate · B B&W · click slot to adjust · Ctrl+P print · 1-9 templates')}
        </span>
      </footer>

      <DrivePicker
        open={drivePickerOpen}
        onClose={() => setDrivePickerOpen(false)}
        onPick={handleFile}
      />

      <CropModal
        open={cropModalOpen}
        source={images[0] || null}
        onClose={() => setCropModalOpen(false)}
        onCrop={(cropped) => {
          setImages(prev => {
            const next = [...prev];
            if (next[0]) next[0].close();
            next[0] = cropped;
            return next;
          });
          setRotation(0);
        }}
      />
    </div>
  );
}

function FilePicker({ onFiles, onAppend }: { onFiles: (files: File[]) => void; onAppend: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const appendRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) onFiles(fs); e.target.value = ''; }}
      />
      <input
        ref={appendRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onAppend(f); e.target.value = ''; }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="pt-chip"
        title="Choose one or more images"
      >
        <Upload className="h-4 w-4" /> <span className="hidden sm:inline">Choose</span>
      </button>
      <button
        onClick={() => appendRef.current?.click()}
        className="pt-chip"
        title="Add another image to the current set"
      >
        <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add</span>
      </button>
    </>
  );
}

type SlotXf = { zoom: number; offsetX: number; offsetY: number };
type XfMap = Record<number, SlotXf>;

function A4Canvas({ images, template, grayscale, rotation, cutLines, transforms, selectedSlot, onSelectSlot, onTransformSlot, layers, selectedLayer, onSelectLayer, onUpdateLayer, onDrop }: {
  images: ImageBitmap[];
  template: Template;
  grayscale: boolean;
  rotation: 0 | 90 | 180 | 270;
  cutLines: boolean;
  transforms: XfMap;
  selectedSlot: number | null;
  onSelectSlot: (idx: number | null) => void;
  onTransformSlot: (idx: number, fn: (cur: SlotXf) => SlotXf) => void;
  layers: Layer[];
  selectedLayer: number | null;
  onSelectLayer: (id: number | null) => void;
  onUpdateLayer: (id: number, fn: (cur: Layer) => Layer) => void;
  onDrop: (f: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragRef = useRef<{ slotIdx: number; startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);
  const paperW = template.paper.w;
  const paperH = template.paper.h;
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostW, setHostW] = useState<number>(DISPLAY_MAX);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    setHostW(el.clientWidth);
    const ro = new ResizeObserver(entries => { for (const e of entries) setHostW(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const maxW = Math.max(160, Math.min(DISPLAY_MAX, hostW - 8));
  const disp = displaySize(paperW, paperH, maxW);
  const scale = paperW / disp.w; // display→canvas scale
  const isCompose = template.id.startsWith('compose-');
  // For "N copies of one photo" templates, every slot shares a single
  // crop/zoom/pan entry (keyed 0) so the operator crops ONCE.
  const xfKeyFor = (i: number) => (template.sharedCrop ? 0 : i);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = paperW;
    canvas.height = paperH;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, paperW, paperH);
    if (isCompose) {
      // Compose mode: render layers (no slot fitting, pure positions)
      ctx.filter = grayscale ? 'grayscale(1) contrast(1.1)' : 'none';
      for (const L of layers) {
        const img = images[L.imageIndex];
        if (!img) continue;
        ctx.drawImage(img, L.x, L.y, L.w, L.h);
      }
      ctx.filter = 'none';
      // Selected layer border
      if (selectedLayer !== null) {
        const L = layers.find(l => l.id === selectedLayer);
        if (L) {
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 8;
          ctx.setLineDash([]);
          ctx.strokeRect(L.x, L.y, L.w, L.h);
        }
      }
    } else if (images.length > 0) {
      // Pre-rotate each image once (avoids re-rotating per slot)
      const rotated: ImageBitmap[] = [];
      const temps: ImageBitmap[] = [];
      for (const img of images) {
        if (rotation === 0) { rotated.push(img); continue; }
        const swapped = rotation === 90 || rotation === 270;
        const w = swapped ? img.height : img.width;
        const h = swapped ? img.width : img.height;
        const oc = new OffscreenCanvas(w, h);
        const octx = oc.getContext('2d')!;
        octx.translate(w / 2, h / 2);
        octx.rotate((rotation * Math.PI) / 180);
        octx.drawImage(img, -img.width / 2, -img.height / 2);
        const bm = oc.transferToImageBitmap();
        rotated.push(bm);
        temps.push(bm);
      }
      ctx.filter = grayscale ? 'grayscale(1) contrast(1.1)' : 'none';
      for (let i = 0; i < template.slots.length; i++) {
        const slot = template.slots[i];
        const img = rotated[slot.imageIndex] || rotated[0];
        if (!img) continue;
        const xf = transforms[xfKeyFor(i)] || { zoom: 1, offsetX: 0, offsetY: 0 };
        drawIntoSlot(ctx, img, slot, xf);
      }
      ctx.filter = 'none';
      temps.forEach(t => t.close());
    } else {
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 4;
      ctx.setLineDash([20, 10]);
      for (const slot of template.slots) {
        ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);
      }
      ctx.setLineDash([]);
    }
    // Cut guides between cells (for trimming)
    if (cutLines && !isCompose && template.slots.length > 0) {
      ctx.strokeStyle = 'rgba(90,90,90,0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      for (const slot of template.slots) {
        ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);
      }
    }
    // Selection border on top. For shared-crop templates, highlight every
    // copy so it's clear one adjustment moves them all.
    if (selectedSlot !== null && template.slots.length > 0) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 8;
      ctx.setLineDash([]);
      if (template.sharedCrop) {
        for (const s of template.slots) ctx.strokeRect(s.x, s.y, s.w, s.h);
      } else if (template.slots[selectedSlot]) {
        const s = template.slots[selectedSlot];
        ctx.strokeRect(s.x, s.y, s.w, s.h);
      }
    }
  }, [images, template, grayscale, rotation, cutLines, transforms, selectedSlot, layers, selectedLayer, isCompose, paperW, paperH]);

  // Translate display coords to canvas (paper) coords
  const eventToCanvas = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * scale,
      y: (e.clientY - rect.top) * scale,
    };
  };
  const slotAt = (x: number, y: number) => {
    for (let i = template.slots.length - 1; i >= 0; i--) {
      const s = template.slots[i];
      if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return i;
    }
    return null;
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (images.length === 0) return;
    const { x, y } = eventToCanvas(e);
    const idx = slotAt(x, y);
    onSelectSlot(idx);
    if (idx !== null) {
      const key = xfKeyFor(idx);
      const cur = transforms[key] || { zoom: 1, offsetX: 0, offsetY: 0 };
      dragRef.current = { slotIdx: key, startX: e.clientX, startY: e.clientY, startOffset: { x: cur.offsetX, y: cur.offsetY } };
    }
  };
  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.startX) * scale;
    const dy = (e.clientY - dragRef.current.startY) * scale;
    const idx = dragRef.current.slotIdx;
    onTransformSlot(idx, () => ({
      zoom: (transforms[idx]?.zoom ?? 1),
      offsetX: dragRef.current!.startOffset.x + dx,
      offsetY: dragRef.current!.startOffset.y + dy,
    }));
  };
  const onCanvasMouseUp = () => { dragRef.current = null; };
  const onCanvasWheel = (e: React.WheelEvent) => {
    if (selectedSlot === null) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    onTransformSlot(xfKeyFor(selectedSlot), cur => ({
      ...cur,
      zoom: Math.max(0.2, Math.min(8, cur.zoom * factor)),
    }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onDrop(file);
  };

  return (
    <div ref={hostRef} className="w-full flex items-start justify-center">
      <div
        className={`relative shadow-2xl rounded-sm transition-shadow ${dragOver ? 'ring-2 ring-blue-500' : ''}`}
        style={{ width: disp.w, height: disp.h }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <canvas
          ref={canvasRef}
          id="cc-photo-canvas"
          style={{ width: disp.w, height: disp.h, display: 'block', cursor: images.length > 0 ? (selectedSlot !== null ? 'move' : 'pointer') : 'default' }}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
          onWheel={onCanvasWheel}
        />
        {images.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs sm:text-sm pointer-events-none select-none text-center px-3">
            Drop an image · paste · or "Choose"
          </div>
        )}
      </div>
    </div>
  );
}

// Fit + draw image into a slot, preserving aspect ratio.
// Optional transform: zoom + offset (operator pan/zoom within the slot).
function drawIntoSlot(ctx: CanvasRenderingContext2D, img: ImageBitmap, slot: Slot, xf: SlotXf = { zoom: 1, offsetX: 0, offsetY: 0 }) {
  const slotRatio = slot.w / slot.h;
  const imgRatio = img.width / img.height;
  let drawW: number, drawH: number;
  if (slot.fit === 'contain') {
    if (imgRatio > slotRatio) {
      drawW = slot.w;
      drawH = slot.w / imgRatio;
    } else {
      drawH = slot.h;
      drawW = slot.h * imgRatio;
    }
  } else { // cover
    if (imgRatio > slotRatio) {
      drawH = slot.h;
      drawW = slot.h * imgRatio;
    } else {
      drawW = slot.w;
      drawH = slot.w / imgRatio;
    }
  }
  drawW *= xf.zoom;
  drawH *= xf.zoom;
  const dx = slot.x + (slot.w - drawW) / 2 + xf.offsetX;
  const dy = slot.y + (slot.h - drawH) / 2 + xf.offsetY;
  ctx.save();
  ctx.beginPath();
  ctx.rect(slot.x, slot.y, slot.w, slot.h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
}
