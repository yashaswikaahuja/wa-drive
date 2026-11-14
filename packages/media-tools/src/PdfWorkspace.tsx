/**
 * PDF Tool desk — the screen at /app/photos/pdf.
 *
 * One place to bring in photos or a PDF, clean the page, and export.
 * Merge, split, compress, resize, and organize stay on their own routes
 * and open from the mode bar. Save uses source=printdoc.
 */
import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import {
  ArrowClockwise, ArrowLeft, Camera, CaretDown, Crop, DownloadSimple,
  Eraser, File, FilePdf, FloppyDisk, FolderOpen, GoogleDriveLogo,
  Hand, MagnifyingGlassMinus, MagnifyingGlassPlus, Plus, Printer,
  Trash, UploadSimple, WhatsappLogo,
} from '@phosphor-icons/react';
import { api, DrivePicker, printBlob, toast, useIsNarrow } from './hub';
import { downloadBlob, flipCanvas, loadImageFromFile, rotateCanvas, applyTone, type ToneAdjust } from './imageOps';
import { applyDocFilter, DOC_SCAN_FILTERS, type DocScanFilter } from './docScanFilters';
import { detectDocumentQuad, warpQuad, type QuadPoint } from './docEdgeDetect';
import { cloneCanvas, makeId } from './documentPrintLayout';
import { savePdfToDrive } from './pdfDriveIo';
import CleanupModal from './CleanupModal';

const ACCENT = '#2563eb';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]';
const MAX_EDGE = 1400;
const ZOOMS = [50, 75, 100, 125, 150, 200];

type Pt = QuadPoint;
type Tone = { brightness: number; contrast: number };

type ScanPage = {
  id: string;
  name: string;
  source: HTMLCanvasElement;
  filter: DocScanFilter;
  tone: Tone;
  quad: Pt[];
  preview: string;
};

const ZERO_TONE: Tone = { brightness: 0, contrast: 0 };

function insetQuad(): Pt[] {
  const m = 0.045;
  return [
    { x: m, y: m },
    { x: 1 - m, y: m },
    { x: 1 - m, y: 1 - m },
    { x: m, y: 1 - m },
  ];
}

function downscale(src: HTMLCanvasElement): HTMLCanvasElement {
  const long = Math.max(src.width, src.height);
  if (long <= MAX_EDGE) return src;
  const s = MAX_EDGE / long;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * s));
  c.height = Math.max(1, Math.round(src.height * s));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function canvasFromImage(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return downscale(c);
}

function blankCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1000;
  c.height = 1414;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function renderPreview(source: HTMLCanvasElement, filter: DocScanFilter): string {
  const out = filter === 'original' ? source : applyDocFilter(source, filter);
  return out.toDataURL('image/jpeg', 0.82);
}

function makePage(source: HTMLCanvasElement, name: string, filter: DocScanFilter): ScanPage {
  return {
    id: makeId('pg'),
    name,
    source,
    filter,
    tone: { ...ZERO_TONE },
    quad: insetQuad(),
    preview: renderPreview(source, filter),
  };
}

function straighten(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const quad = detectDocumentQuad(source);
  if (!quad) return null;
  try {
    return warpQuad(source, quad);
  } catch {
    return null;
  }
}

function quadArea(q: Pt[]) {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    const n = q[(i + 1) % q.length];
    a += p.x * n.y - n.x * p.y;
  }
  return a / 2;
}

function exportCanvas(page: ScanPage): HTMLCanvasElement {
  const tone: ToneAdjust = { brightness: page.tone.brightness, contrast: page.tone.contrast, smooth: 0 };
  const toned = tone.brightness || tone.contrast ? applyTone(page.source, tone) : page.source;
  return page.filter === 'original' ? toned : applyDocFilter(toned, page.filter);
}

function composePdf(pages: ScanPage[]): Blob {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  pages.forEach((page, i) => {
    if (i > 0) pdf.addPage();
    const canvas = exportCanvas(page);
    const data = canvas.toDataURL('image/jpeg', 0.9);
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const scale = Math.min(maxW / canvas.width, maxH / canvas.height);
    const w = canvas.width * scale;
    const h = canvas.height * scale;
    pdf.addImage(data, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h, undefined, 'FAST');
  });
  return new Blob([pdf.output('blob')], { type: 'application/pdf' });
}

async function rasterPdf(data: ArrayBuffer): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import('pdfjs-dist');
  const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
  const pdf = await pdfjs.getDocument({ data }).promise;
  const count = Math.min(pdf.numPages, 20);
  const pages: HTMLCanvasElement[] = [];
  for (let i = 1; i <= count; i++) {
    const pg = await pdf.getPage(i);
    const base = pg.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_EDGE / Math.max(base.width, base.height));
    const viewport = pg.getViewport({ scale });
    const rendered = document.createElement('canvas');
    rendered.width = Math.max(1, Math.floor(viewport.width));
    rendered.height = Math.max(1, Math.floor(viewport.height));
    const ctx = rendered.getContext('2d');
    if (!ctx) continue;
    const task = pg.render({ canvasContext: ctx, viewport, canvas: rendered });
    await task.promise;
    pages.push(rendered);
  }
  if (pdf.numPages > 20) toast.info('Opened the first 20 pages');
  if (!pages.length) throw new Error('PDF has no pages');
  return pages;
}

async function pagesFromBytes(bytes: Uint8Array, name: string, mime: string, autoEdges: boolean): Promise<ScanPage[]> {
  const head = new TextDecoder().decode(bytes.slice(0, 5));
  const isPdf = mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf') || head.startsWith('%PDF');
  if (isPdf) {
    const canvases = await rasterPdf(bytes.slice().buffer);
    return canvases.map((c, i) => makePage(downscale(c), canvases.length > 1 ? `${name} ${i + 1}` : name, 'auto'));
  }
  const img = await loadImageFromFile(new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime || 'image/jpeg' }));
  let source = canvasFromImage(img);
  if (autoEdges) {
    const straight = straighten(source);
    if (straight) source = straight;
  }
  return [makePage(source, name || 'page.jpg', 'auto')];
}

function thumbOf(src: HTMLCanvasElement): HTMLCanvasElement {
  const edge = 180;
  const s = Math.min(1, edge / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * s));
  c.height = Math.max(1, Math.round(src.height * s));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function CropOverlay({ quad, onChange }: { quad: Pt[]; onChange: (next: Pt[]) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'corner' | 'edge'; index: number } | null>(null);

  const at = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / Math.max(1, r.height))),
    };
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    const next = quad.map((q) => ({ ...q }));
    if (d.kind === 'corner') next[d.index] = p;
    else if (d.index === 0) { next[0].y = p.y; next[1].y = p.y; }
    else if (d.index === 1) { next[1].x = p.x; next[2].x = p.x; }
    else if (d.index === 2) { next[2].y = p.y; next[3].y = p.y; }
    else { next[3].x = p.x; next[0].x = p.x; }
    onChange(next);
  };

  const edgePos = (i: number) => {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  return (
    <div ref={boxRef} className="absolute inset-0" data-pdf-crop="1">
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon
          points={quad.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
          fill="rgba(37,99,235,0.06)"
          stroke={ACCENT}
          strokeWidth="0.8"
        />
      </svg>
      {quad.map((p, i) => (
        <button
          key={`c${i}`}
          type="button"
          data-crop-handle={['tl', 'tr', 'br', 'bl'][i]}
          aria-label={`Crop corner ${i + 1}`}
          className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white border-2"
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, borderColor: ACCENT, touchAction: 'none' }}
          onPointerDown={(e) => { drag.current = { kind: 'corner', index: i }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={move}
          onPointerUp={() => { drag.current = null; }}
        />
      ))}
      {[0, 1, 2, 3].map((i) => {
        const p = edgePos(i);
        return (
          <button
            key={`e${i}`}
            type="button"
            aria-label={`Crop edge ${i + 1}`}
            className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-sm"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, background: ACCENT, touchAction: 'none' }}
            onPointerDown={(e) => { drag.current = { kind: 'edge', index: i }; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={move}
            onPointerUp={() => { drag.current = null; }}
          />
        );
      })}
    </div>
  );
}

export default function PdfWorkspace() {
  const narrow = useIsNarrow();
  const [params] = useSearchParams();
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const pagesRef = useRef<ScanPage[]>([]);
  const activeRef = useRef(0);
  const autoEdgesRef = useRef(true);

  const [pages, setPages] = useState<ScanPage[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [desk, setDesk] = useState<'edit' | 'scan'>('edit');
  const [panel, setPanel] = useState<'enhance' | 'organize' | 'edit' | 'output'>('enhance');
  const [zoom, setZoom] = useState(100);
  const [cropOn, setCropOn] = useState(true);
  const [autoEdges, setAutoEdges] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toolMenu, setToolMenu] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [phone, setPhone] = useState(params.get('phone') || '');
  const [personName, setPersonName] = useState(params.get('name') || '');
  const [docName, setDocName] = useState('document');
  const [presets, setPresets] = useState<Partial<Record<DocScanFilter, string>>>({});

  pagesRef.current = pages;
  activeRef.current = active;
  autoEdgesRef.current = autoEdges;

  const page = pages[active] ?? null;

  const patchActive = useCallback((fn: (p: ScanPage) => ScanPage) => {
    const i = activeRef.current;
    setPages((list) => list.map((p, idx) => (idx === i ? fn(p) : p)));
  }, []);

  const addPages = useCallback((next: ScanPage[]) => {
    if (!next.length) return;
    setActive(pagesRef.current.length + next.length - 1);
    setPages((list) => [...list, ...next]);
  }, []);

  const ingestFiles = useCallback(async (list: FileList | File[] | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    setBusy('Adding pages…');
    try {
      const next: ScanPage[] = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        next.push(...await pagesFromBytes(bytes, file.name || 'page', file.type, autoEdgesRef.current));
      }
      addPages(next);
      toast.success(next.length === 1 ? 'Page added' : `Added ${next.length} pages`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not add that file');
    } finally {
      setBusy(null);
    }
  }, [addPages]);

  const fileId = params.get('fileId');
  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    (async () => {
      try {
        setBusy('Opening from Drive…');
        const [dl, meta] = await Promise.all([
          api.get(`/drive/download/${fileId}`, { responseType: 'arraybuffer' }),
          api.get('/drive/files/ws').catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        const row = (meta.data || []).find((f: { id?: string; driveFileId?: string }) => f.id === fileId || f.driveFileId === fileId);
        const name = String(row?.fileName || params.get('fileName') || 'document.pdf');
        const mime = String(row?.mimeType || (name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'));
        if (row?.customerId) setPhone((p) => p || String(row.customerId));
        if (row?.customerName) setPersonName((p) => p || String(row.customerName));
        const made = await pagesFromBytes(new Uint8Array(dl.data as ArrayBuffer), name, mime, autoEdgesRef.current);
        if (cancelled) return;
        setPages(made);
        setActive(0);
        setDocName(name.replace(/\.(pdf|jpe?g|png|webp)$/i, '') || 'document');
      } catch (e: unknown) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Could not open that file');
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => { cancelled = true; };
    // Reload only when the opened file changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  useEffect(() => {
    if (!page) { setPresets({}); return; }
    const thumb = thumbOf(page.source);
    const urls: Partial<Record<DocScanFilter, string>> = {};
    for (const f of DOC_SCAN_FILTERS) urls[f.id] = renderPreview(thumb, f.id);
    setPresets(urls);
    // Preview changes when the pixels change. Quad drags do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, page?.preview]);

  const setFilter = (filter: DocScanFilter) => {
    patchActive((p) => ({ ...p, filter, preview: renderPreview(p.source, filter) }));
  };

  const applyCrop = () => {
    if (!page) return;
    if (quadArea(page.quad) < 0.02) {
      toast.error('Keep the four corners in order');
      return;
    }
    try {
      const source = warpQuad(page.source, page.quad);
      patchActive((p) => ({ ...makePage(source, p.name, p.filter), tone: p.tone }));
      toast.success('Crop applied');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not crop');
    }
  };

  const rotate = () => {
    patchActive((p) => {
      const source = rotateCanvas(p.source, 90);
      return { ...p, source, quad: insetQuad(), preview: renderPreview(source, p.filter) };
    });
  };

  const flip = () => {
    patchActive((p) => {
      const source = flipCanvas(p.source, true);
      return { ...p, source, preview: renderPreview(source, p.filter) };
    });
  };

  const removeActive = () => {
    const i = activeRef.current;
    setPages((list) => list.filter((_, idx) => idx !== i));
    setActive((a) => Math.max(0, Math.min(a, pagesRef.current.length - 2)));
  };

  const moveActive = (dir: -1 | 1) => {
    const i = activeRef.current;
    const j = i + dir;
    setPages((list) => {
      if (j < 0 || j >= list.length) return list;
      const next = list.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setActive((a) => {
      const j2 = a + dir;
      const n = pagesRef.current.length;
      if (j2 < 0 || j2 >= n) return a;
      return j2;
    });
  };

  const duplicate = () => {
    const i = activeRef.current;
    const p = pagesRef.current[i];
    if (!p) return;
    const copy = makePage(cloneCanvas(p.source), p.name, p.filter);
    copy.tone = { ...p.tone };
    setPages((list) => {
      const next = list.slice();
      next.splice(i + 1, 0, copy);
      return next;
    });
    setActive(i + 1);
  };

  const addBlank = () => {
    addPages([makePage(blankCanvas(), 'Blank page', 'original')]);
  };

  const latestWhatsApp = async () => {
    setBusy('Opening latest WhatsApp file…');
    try {
      const res = await api.get('/drive/files/ws', { params: { source: 'whatsapp' } });
      const files = (res.data || []).filter((f: { fileName?: string; mimeType?: string }) => {
        const name = f.fileName || '';
        const mime = f.mimeType || '';
        return mime.startsWith('image/') || mime === 'application/pdf' || /\.(jpe?g|png|webp|pdf)$/i.test(name);
      });
      const f = files[0];
      if (!f) { toast.error('No WhatsApp photo or PDF yet'); return; }
      const dl = await api.get(`/drive/download/${f.driveFileId || f.id}`, { responseType: 'arraybuffer' });
      if (f.customerId) setPhone((p) => p || String(f.customerId));
      if (f.customerName) setPersonName((p) => p || String(f.customerName));
      const made = await pagesFromBytes(new Uint8Array(dl.data as ArrayBuffer), f.fileName || 'whatsapp', f.mimeType || '', autoEdgesRef.current);
      addPages(made);
      toast.success('Added the latest WhatsApp file');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not open WhatsApp');
    } finally {
      setBusy(null);
    }
  };

  const requirePages = () => {
    if (pagesRef.current.length) return true;
    toast.error('Add a page first');
    return false;
  };

  const doDownload = () => {
    if (!requirePages()) return;
    try {
      downloadBlob(composePdf(pagesRef.current), `${docName || 'document'}.pdf`);
      toast.success('PDF downloaded');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not build the PDF');
    }
  };

  const doPrint = () => {
    if (!requirePages()) return;
    try {
      printBlob(composePdf(pagesRef.current), { widthMm: 210, heightMm: 297, fileName: `${docName || 'document'}.pdf` });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not print');
    }
  };

  const doSave = async () => {
    if (!requirePages()) return;
    if (!phone.trim()) {
      setPanel('output');
      toast.error('Enter the customer phone to save to Drive');
      setTimeout(() => phoneRef.current?.focus(), 50);
      return;
    }
    try {
      setBusy('Saving to Drive…');
      const blob = composePdf(pagesRef.current);
      await savePdfToDrive(blob, docName || 'document', phone, personName, {
        tool: 'pdf-workspace',
        from: fileId || undefined,
        op: { pages: pagesRef.current.length },
      });
      toast.success('Saved to Drive. It stays out of WhatsApp.');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err?.response?.data?.error || err?.message || 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const goScan = () => {
    setDesk('scan');
    importRef.current?.scrollIntoView({ block: 'nearest' });
  };

  const toneStyle = page
    ? { filter: `brightness(${100 + page.tone.brightness}%) contrast(${100 + page.tone.contrast}%)` }
    : undefined;

  const modeCls = (on: boolean) =>
    `inline-flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium ${FOCUS}`;

  return (
    <div
      className={`flex flex-col h-full min-h-0 w-full max-w-full ${narrow ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'}`}
      style={{ background: '#fff', color: 'hsl(var(--ink))' }}
      data-pdf-workspace="1"
    >
      <header className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b shrink-0" style={{ borderColor: 'hsl(var(--pt-border))' }}>
        <Link to={`/app/photos${suffix}`} aria-label="Photos" className={`grid place-items-center w-9 h-9 rounded-lg shrink-0 ${FOCUS}`} style={{ color: 'hsl(var(--pt-muted))' }}>
          <ArrowLeft size={18} />
        </Link>
        <span className="grid place-items-center w-10 h-10 rounded-lg text-white shrink-0" style={{ background: '#e11d48' }} aria-hidden>
          <FilePdf size={22} weight="fill" />
        </span>
        <div className="min-w-0 mr-auto">
          <h1 className="text-base font-semibold leading-tight">PDF Tool</h1>
          <p className="text-[11px] truncate" style={{ color: 'hsl(var(--pt-muted))' }}>
            Scan, edit, merge, split, convert and manage PDF documents
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setDriveOpen(true)} className={`btn-secondary text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5 ${FOCUS}`}>
            <FolderOpen size={15} /> Open from Drive
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className={`btn-secondary text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5 ${FOCUS}`}>
            <UploadSimple size={15} /> Upload Files
          </button>
          <button type="button" onClick={() => camRef.current?.click()} className={`text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5 rounded-lg text-white ${FOCUS}`} style={{ background: ACCENT }}>
            <Camera size={15} weight="fill" /> Scan with Camera
          </button>
          <button type="button" onClick={latestWhatsApp} className={`text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5 rounded-lg border ${FOCUS}`} style={{ borderColor: 'hsl(var(--whatsapp))', color: 'hsl(var(--whatsapp))' }}>
            <WhatsappLogo size={15} weight="fill" /> Latest from WhatsApp
          </button>
          <button type="button" onClick={doSave} className={`text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5 rounded-lg text-white ${FOCUS}`} style={{ background: ACCENT }}>
            <FloppyDisk size={15} weight="fill" /> Save to Drive
          </button>
        </div>
      </header>

      <div className="flex items-center gap-1 px-2 py-1.5 border-b shrink-0 overflow-x-auto" style={{ borderColor: 'hsl(var(--pt-border))' }} data-pdf-modes="1">
        <button type="button" className={modeCls(desk === 'edit')} style={{ background: desk === 'edit' ? '#eff6ff' : 'transparent', color: desk === 'edit' ? ACCENT : 'hsl(var(--pt-muted))' }} onClick={() => setDesk('edit')}>
          Edit
        </button>
        <button type="button" className={modeCls(desk === 'scan')} style={{ background: desk === 'scan' ? '#eff6ff' : 'transparent', color: desk === 'scan' ? ACCENT : 'hsl(var(--pt-muted))' }} onClick={goScan}>
          <Camera size={14} /> Scan
        </button>
        <Link to={`/app/photos/pdf/merge${suffix}`} data-pdf-tool-card="merge" className={modeCls(false)} style={{ color: 'hsl(var(--pt-muted))' }}>Merge</Link>
        <Link to={`/app/photos/pdf/split${suffix}`} data-pdf-tool-card="split" className={modeCls(false)} style={{ color: 'hsl(var(--pt-muted))' }}>Split</Link>
        <Link to={`/app/photos/pdf/compress${suffix}`} data-pdf-tool-card="compress" className={modeCls(false)} style={{ color: 'hsl(var(--pt-muted))' }}>Compress</Link>
        <Link to={`/app/photos/pdf/resize${suffix}`} data-pdf-tool-card="resize" className={modeCls(false)} style={{ color: 'hsl(var(--pt-muted))' }}>Convert</Link>
        <Link to={`/app/photos/aadhaar${suffix}`} className={modeCls(false)} style={{ color: 'hsl(var(--pt-muted))' }}>Aadhaar Layout</Link>
        <div className="relative shrink-0">
          <button type="button" className={modeCls(moreOpen)} style={{ color: 'hsl(var(--pt-muted))' }} aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
            More <CaretDown size={12} />
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 min-w-[10rem] rounded-lg border bg-white p-1 shadow-lg" style={{ borderColor: 'hsl(var(--pt-border))' }}>
              <Link to={`/app/photos/pdf/organize${suffix}`} data-pdf-tool-card="organize" className={`block rounded-md px-2.5 py-2 text-xs ${FOCUS}`} onClick={() => setMoreOpen(false)}>
                Organize PDF
              </Link>
            </div>
          )}
        </div>
      </div>

      {busy && (
        <p className="px-3 py-1 text-[11px] shrink-0" style={{ color: 'hsl(var(--pt-muted))' }}>{busy}</p>
      )}

      <div className={narrow ? 'flex flex-col' : 'flex flex-1 min-h-0'}>
        <aside
          ref={importRef}
          className={narrow ? 'border-b p-2' : 'w-[228px] shrink-0 border-r overflow-y-auto p-3'}
          style={{ borderColor: 'hsl(var(--pt-border))' }}
          data-pdf-import="1"
        >
          <p className="text-[11px] font-semibold mb-2" style={{ color: 'hsl(var(--pt-muted))' }}>Import Pages</p>
          <div className={narrow ? 'flex gap-2 overflow-x-auto pb-2' : 'grid grid-cols-2 gap-2'}>
            <ImportTile label="From Camera" icon={<Camera size={18} />} onClick={() => camRef.current?.click()} />
            <ImportTile label="Upload Files" icon={<UploadSimple size={18} />} onClick={() => fileRef.current?.click()} />
            <ImportTile label="From Drive" icon={<GoogleDriveLogo size={18} />} onClick={() => setDriveOpen(true)} />
            <ImportTile label="From WhatsApp" icon={<WhatsappLogo size={18} />} onClick={latestWhatsApp} />
            <ImportTile label="Blank Page" icon={<File size={18} />} onClick={addBlank} data-pdf-blank="1" />
          </div>
          <div className="flex items-center justify-between mt-3 mb-2">
            <p className="text-[11px] font-semibold" style={{ color: 'hsl(var(--pt-muted))' }}>Pages ({pages.length})</p>
          </div>
          <div className={narrow ? 'flex gap-2 overflow-x-auto' : 'flex flex-col gap-2'}>
            {pages.map((p, i) => (
              <button
                key={p.id}
                type="button"
                data-pdf-page={i}
                onClick={() => setActive(i)}
                className={`relative rounded-lg border-2 bg-white overflow-hidden text-left ${FOCUS} ${narrow ? 'w-16 shrink-0' : ''}`}
                style={{ borderColor: i === active ? ACCENT : 'hsl(var(--pt-border))' }}
              >
                <img src={p.preview} alt="" className="w-full h-14 object-contain bg-[#f8fafc]" style={i === active ? toneStyle : undefined} />
                <span className="absolute bottom-0.5 right-1 text-[10px] font-medium">{i + 1}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => fileRef.current?.click()} className={`mt-3 w-full rounded-lg border text-xs py-2 inline-flex items-center justify-center gap-1.5 ${FOCUS}`} style={{ borderColor: 'hsl(var(--pt-border))' }} data-pdf-add="1">
            <Plus size={14} /> Add Pages
          </button>
        </aside>

        <main className={narrow ? 'min-h-[420px] flex flex-col' : 'flex-1 min-w-0 min-h-0 flex flex-col'} style={{ background: '#eef2f6' }}>
          <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto shrink-0" style={{ background: '#fff', borderBottom: '1px solid hsl(var(--pt-border))' }}>
            <IconBtn label="Zoom out" onClick={() => setZoom((z) => Math.max(50, z - 25))}><MagnifyingGlassMinus size={16} /></IconBtn>
            <IconBtn label="Zoom in" onClick={() => setZoom((z) => Math.min(200, z + 25))}><MagnifyingGlassPlus size={16} /></IconBtn>
            <select aria-label="Zoom" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className={`text-xs rounded-md border px-1.5 py-1 ${FOCUS}`} style={{ borderColor: 'hsl(var(--pt-border))' }}>
              {ZOOMS.map((z) => <option key={z} value={z}>{z}%</option>)}
            </select>
            <IconBtn label="Move the page" on={ !cropOn } onClick={() => setCropOn(false)}><Hand size={16} /></IconBtn>
            <IconBtn label="Crop" on={cropOn} onClick={() => setCropOn(true)}><Crop size={16} /></IconBtn>
            <IconBtn label="Rotate" disabled={!page} onClick={rotate}><ArrowClockwise size={16} /></IconBtn>
            <IconBtn label="Enhance" disabled={!page} onClick={() => { setFilter('auto'); setPanel('enhance'); }}>
              <span className="text-[11px] font-semibold px-0.5">Auto</span>
            </IconBtn>
            <IconBtn label="Clean up" disabled={!page} onClick={() => setCleanupOpen(true)}><Eraser size={16} /></IconBtn>
            <IconBtn label="Delete page" disabled={!page} onClick={removeActive}><Trash size={16} /></IconBtn>
            <div className="relative">
              <IconBtn label="More page actions" on={toolMenu} onClick={() => setToolMenu((v) => !v)}><CaretDown size={14} /></IconBtn>
              {toolMenu && (
                <div className="absolute right-0 top-full z-30 mt-1 min-w-[9rem] rounded-lg border bg-white p-1 shadow-lg" style={{ borderColor: 'hsl(var(--pt-border))' }}>
                  <MenuBtn onClick={() => { flip(); setToolMenu(false); }}>Flip</MenuBtn>
                  <MenuBtn onClick={() => { duplicate(); setToolMenu(false); }}>Duplicate</MenuBtn>
                  <MenuBtn onClick={() => { applyCrop(); setToolMenu(false); }}>Apply crop</MenuBtn>
                </div>
              )}
            </div>
            {cropOn && page && (
              <button type="button" onClick={applyCrop} className={`ml-auto text-xs px-2.5 py-1.5 rounded-lg text-white shrink-0 ${FOCUS}`} style={{ background: ACCENT }}>
                Apply crop
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto grid place-items-center p-4">
            {!page ? (
              <div className="text-center max-w-xs">
                <FilePdf size={40} className="mx-auto mb-2" style={{ color: 'hsl(var(--pt-muted))' }} />
                <p className="text-sm font-medium">Add a photo or a PDF</p>
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--pt-muted))' }}>
                  Camera, this computer, Drive, or the latest WhatsApp file.
                </p>
              </div>
            ) : (
              <div className="relative bg-white shadow-md" style={{ width: `min(100%, ${Math.round(520 * zoom / 100)}px)` }}>
                <img src={page.preview} alt={page.name} className="block w-full h-auto" style={toneStyle} />
                {cropOn && <CropOverlay quad={page.quad} onChange={(quad) => patchActive((p) => ({ ...p, quad }))} />}
              </div>
            )}
          </div>

          <div className="flex gap-2 px-3 py-2 overflow-x-auto shrink-0" style={{ background: '#fff', borderTop: '1px solid hsl(var(--pt-border))' }}>
            {DOC_SCAN_FILTERS.map((f) => {
              const on = page?.filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={!page}
                  onClick={() => setFilter(f.id)}
                  className={`shrink-0 w-[72px] rounded-lg border p-1 text-center disabled:opacity-40 ${FOCUS}`}
                  style={{ borderColor: on ? ACCENT : 'hsl(var(--pt-border))', background: on ? '#eff6ff' : '#fff' }}
                >
                  <span className="block h-10 rounded bg-[#f8fafc] overflow-hidden mb-1">
                    {presets[f.id] && <img src={presets[f.id]} alt="" className="w-full h-full object-cover" />}
                  </span>
                  <span className="block text-[10px] leading-tight" style={{ color: on ? ACCENT : 'hsl(var(--ink))' }}>{f.label}</span>
                </button>
              );
            })}
          </div>
        </main>

        <aside className={narrow ? 'border-t' : 'w-[300px] shrink-0 border-l overflow-y-auto'} style={{ borderColor: 'hsl(var(--pt-border))', background: '#fff' }}>
          <div className="flex border-b" style={{ borderColor: 'hsl(var(--pt-border))' }} role="tablist">
            {([
              ['enhance', 'Enhance'],
              ['organize', 'Organize'],
              ['edit', 'Edit'],
              ['output', 'Output'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={panel === id}
                className={`flex-1 py-2.5 text-[11px] font-medium border-b-2 ${FOCUS}`}
                style={{ borderColor: panel === id ? ACCENT : 'transparent', color: panel === id ? ACCENT : 'hsl(var(--pt-muted))' }}
                onClick={() => setPanel(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-3">
            {panel === 'enhance' && (
              <div>
                <p className="text-xs font-semibold mb-2">Scan enhancement</p>
                <div className="grid grid-cols-5 gap-1.5 mb-3">
                  {DOC_SCAN_FILTERS.map((f) => {
                    const on = page?.filter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        disabled={!page}
                        onClick={() => setFilter(f.id)}
                        className={`rounded-md border p-0.5 disabled:opacity-40 ${FOCUS}`}
                        style={{ borderColor: on ? ACCENT : 'hsl(var(--pt-border))' }}
                      >
                        <span className="block h-9 rounded-sm overflow-hidden bg-[#f8fafc]">
                          {presets[f.id] && <img src={presets[f.id]} alt="" className="w-full h-full object-cover" />}
                        </span>
                        <span className="block text-[9px] leading-tight py-0.5 text-center" style={{ color: on ? ACCENT : 'hsl(var(--ink))' }}>{f.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-3 py-2 border-t" style={{ borderColor: 'hsl(var(--pt-border))' }}>
                  <span className="text-xs">Auto-detect document edges</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoEdges}
                    aria-label="Auto-detect document edges"
                    onClick={() => setAutoEdges((v) => !v)}
                    className="w-10 h-6 rounded-full relative shrink-0"
                    style={{ background: autoEdges ? ACCENT : '#cbd5e1' }}
                  >
                    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white" style={{ left: autoEdges ? '1.05rem' : '0.15rem' }} />
                  </button>
                </div>
                <p className="text-[11px] mb-2" style={{ color: 'hsl(var(--pt-muted))' }}>
                  New photos are straightened when a page edge is clear. A PDF page is left as it is.
                </p>
                <button
                  type="button"
                  disabled={!page}
                  onClick={() => {
                    if (!page) return;
                    const straight = straighten(page.source);
                    if (!straight) { toast.info('No page edge found. Drag the corners, then apply the crop.'); return; }
                    patchActive((p) => ({ ...makePage(straight, p.name, p.filter), tone: p.tone }));
                    toast.success('Page straightened');
                  }}
                  className={`w-full text-xs py-2 rounded-lg border disabled:opacity-40 ${FOCUS}`}
                  style={{ borderColor: 'hsl(var(--pt-border))' }}
                >
                  Straighten this page
                </button>
                <p className="text-xs font-semibold mt-4 mb-2">Cleanup</p>
                <button type="button" disabled={!page} onClick={() => setCleanupOpen(true)} className={`inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border disabled:opacity-40 ${FOCUS}`} style={{ borderColor: 'hsl(var(--pt-border))' }}>
                  <Eraser size={14} /> Erase
                </button>
                <p className="mt-3 text-[11px] rounded-lg px-2.5 py-2" style={{ background: '#eff6ff', color: '#1e3a8a' }}>
                  Auto lifts the paper toward white. Ink and a portrait stay as photographed.
                </p>
              </div>
            )}

            {panel === 'organize' && (
              <div className="flex flex-col gap-2">
                <p className="text-xs" style={{ color: 'hsl(var(--pt-muted))' }}>Order the pages in this document.</p>
                <button type="button" disabled={!page || active === 0} onClick={() => moveActive(-1)} className={`text-xs py-2 rounded-lg border disabled:opacity-40 ${FOCUS}`} style={{ borderColor: 'hsl(var(--pt-border))' }}>Move earlier</button>
                <button type="button" disabled={!page || active >= pages.length - 1} onClick={() => moveActive(1)} className={`text-xs py-2 rounded-lg border disabled:opacity-40 ${FOCUS}`} style={{ borderColor: 'hsl(var(--pt-border))' }}>Move later</button>
                <button type="button" disabled={!page} onClick={duplicate} className={`text-xs py-2 rounded-lg border disabled:opacity-40 ${FOCUS}`} style={{ borderColor: 'hsl(var(--pt-border))' }}>Duplicate</button>
                <button type="button" disabled={!page} onClick={removeActive} className={`text-xs py-2 rounded-lg border disabled:opacity-40 ${FOCUS}`} style={{ borderColor: 'hsl(var(--pt-border))' }}>Delete page</button>
              </div>
            )}

            {panel === 'edit' && page && (
              <div className="flex flex-col gap-3">
                <label className="text-xs">
                  Brightness
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    value={page.tone.brightness}
                    aria-label="Brightness"
                    onChange={(e) => patchActive((p) => ({ ...p, tone: { ...p.tone, brightness: Number(e.target.value) } }))}
                    className="w-full mt-1"
                  />
                </label>
                <label className="text-xs">
                  Contrast
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    value={page.tone.contrast}
                    aria-label="Contrast"
                    onChange={(e) => patchActive((p) => ({ ...p, tone: { ...p.tone, contrast: Number(e.target.value) } }))}
                    className="w-full mt-1"
                  />
                </label>
                <button type="button" onClick={rotate} className={`text-xs py-2 rounded-lg border ${FOCUS}`} style={{ borderColor: 'hsl(var(--pt-border))' }}>Rotate</button>
                <button type="button" onClick={flip} className={`text-xs py-2 rounded-lg border ${FOCUS}`} style={{ borderColor: 'hsl(var(--pt-border))' }}>Flip horizontal</button>
              </div>
            )}
            {panel === 'edit' && !page && <p className="text-xs" style={{ color: 'hsl(var(--pt-muted))' }}>Add a page to edit it.</p>}

            {panel === 'output' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs">
                  Customer phone
                  <input
                    ref={phoneRef}
                    className={`input-field text-sm mt-1 w-full ${FOCUS}`}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile"
                    aria-label="Customer phone"
                    data-pdf-phone="1"
                  />
                </label>
                <label className="text-xs">
                  Name
                  <input
                    className={`input-field text-sm mt-1 w-full ${FOCUS}`}
                    value={personName}
                    onChange={(e) => setPersonName(e.target.value)}
                    placeholder="Customer name"
                    aria-label="Customer name"
                    data-pdf-name="1"
                  />
                </label>
                <label className="text-xs">
                  File name
                  <input
                    className={`input-field text-sm mt-1 w-full ${FOCUS}`}
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    aria-label="File name"
                  />
                </label>
                <p className="text-[11px]" style={{ color: 'hsl(var(--pt-muted))' }}>
                  Save puts the PDF in that customer’s Drive folder. It does not show up in WhatsApp.
                </p>
              </div>
            )}
          </div>

          <div className="p-3 border-t flex gap-2" style={{ borderColor: 'hsl(var(--pt-border))' }}>
            <button type="button" onClick={doPrint} className={`flex-1 text-xs py-2 rounded-lg border inline-flex items-center justify-center gap-1 ${FOCUS}`} style={{ borderColor: 'hsl(var(--pt-border))' }}>
              <Printer size={14} /> Print
            </button>
            <button type="button" onClick={doDownload} data-pdf-download="1" className={`flex-1 text-xs py-2 rounded-lg border inline-flex items-center justify-center gap-1 ${FOCUS}`} style={{ borderColor: 'hsl(var(--pt-border))' }}>
              <DownloadSimple size={14} /> Download
            </button>
            <button type="button" onClick={doSave} data-pdf-save="1" className={`flex-1 text-xs py-2 rounded-lg text-white inline-flex items-center justify-center gap-1 ${FOCUS}`} style={{ background: ACCENT }}>
              <FloppyDisk size={14} weight="fill" /> Save
            </button>
          </div>
        </aside>
      </div>

      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { ingestFiles(e.target.files); e.target.value = ''; }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { ingestFiles(e.target.files); e.target.value = ''; }} />

      <DrivePicker
        open={driveOpen}
        onClose={() => setDriveOpen(false)}
        onPick={(file) => { setDriveOpen(false); void ingestFiles([file]); }}
      />
      <CleanupModal
        open={cleanupOpen}
        source={page?.source ?? null}
        onClose={() => setCleanupOpen(false)}
        onApply={(cleaned) => {
          patchActive((p) => ({ ...makePage(downscale(cleaned), p.name, p.filter), tone: p.tone }));
          setCleanupOpen(false);
        }}
      />
    </div>
  );
}

function ImportTile({ label, icon, onClick, ...rest }: { label: string; icon: ReactNode; onClick: () => void } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-[11px] bg-white ${FOCUS}`}
      style={{ borderColor: 'hsl(var(--pt-border))' }}
      {...rest}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function IconBtn({ label, on, disabled, onClick, children }: { label: string; on?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid place-items-center min-w-8 h-8 px-1.5 rounded-md disabled:opacity-40 ${FOCUS}`}
      style={{ background: on ? '#eff6ff' : 'transparent', color: on ? ACCENT : 'hsl(var(--ink))' }}
    >
      {children}
    </button>
  );
}

function MenuBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`block w-full text-left rounded-md px-2.5 py-2 text-xs ${FOCUS}`}>
      {children}
    </button>
  );
}
