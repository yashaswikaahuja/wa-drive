/**
 * PDF Scan — Adobe Scan–style for cybercafé:
 * add pages → enhance → reorder → export multi-page PDF → Download / Save.
 */
import { useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  ArrowDown, ArrowUp, Camera, DownloadSimple, FloppyDisk,
  Plus, Trash, UploadSimple, FilePdf,
} from '@phosphor-icons/react';
import api from '../../shared/api';
import { toast } from '../../shared/toast';
import { downloadBlob, loadImageFromFile } from './imageOps';

type Enhance = 'original' | 'clean' | 'contrast';

type Page = {
  id: string;
  /** data URL of processed page (JPEG) */
  dataUrl: string;
  name: string;
};

function enhanceImage(img: HTMLImageElement, mode: Enhance): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const ctx = c.getContext('2d')!;
  if (mode === 'original') {
    ctx.drawImage(img, 0, 0);
    return c;
  }
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (mode === 'clean') {
      // Mild bleach / paper whitening
      const avg = (r + g + b) / 3;
      const lift = avg > 160 ? 1.08 : 1.02;
      r = Math.min(255, r * lift + 8);
      g = Math.min(255, g * lift + 8);
      b = Math.min(255, b * lift + 8);
    } else if (mode === 'contrast') {
      const f = 1.25;
      r = Math.min(255, Math.max(0, (r - 128) * f + 128));
      g = Math.min(255, Math.max(0, (g - 128) * f + 128));
      b = Math.min(255, Math.max(0, (b - 128) * f + 128));
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

async function pageFromFile(file: File, mode: Enhance): Promise<Page> {
  const img = await loadImageFromFile(file);
  const canvas = enhanceImage(img, mode);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dataUrl: canvas.toDataURL('image/jpeg', 0.88),
    name: file.name || 'page.jpg',
  };
}

function buildPdf(pages: Page[]): Blob {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  pages.forEach((p, i) => {
    if (i > 0) pdf.addPage();
    // Fit image into A4 with margins
    const props = (pdf as any).getImageProperties(p.dataUrl);
    const iw = props.width as number;
    const ih = props.height as number;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const scale = Math.min(maxW / iw, maxH / ih);
    const w = iw * scale;
    const h = ih * scale;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(p.dataUrl, 'JPEG', x, y, w, h);
  });
  return pdf.output('blob');
}

export default function PdfScan() {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [enhance, setEnhance] = useState<Enhance>('clean');
  const [phone, setPhone] = useState('');
  const [docName, setDocName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list || !list.length) return;
    setBusy('Adding pages…');
    try {
      const next: Page[] = [];
      for (const f of Array.from(list)) {
        if (!f.type.startsWith('image/')) continue;
        next.push(await pageFromFile(f, enhance));
      }
      if (!next.length) { toast.error('No images selected'); return; }
      setPages((p) => [...p, ...next]);
      setActive((pages.length + next.length) - 1);
      toast.success(`Added ${next.length} page(s)`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to add pages');
    } finally {
      setBusy(null);
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= pages.length) return;
    const copy = [...pages];
    [copy[idx], copy[j]] = [copy[j], copy[idx]];
    setPages(copy);
    setActive(j);
  };

  const remove = (idx: number) => {
    setPages((p) => p.filter((_, i) => i !== idx));
    setActive((a) => Math.max(0, Math.min(a, pages.length - 2)));
  };

  const reEnhanceAll = async () => {
    // Re-apply enhance requires originals — for v1 we only apply on add.
    toast.info('Enhance applies to newly added pages. Re-upload a page to change enhance.');
  };

  const exportPdf = (): Blob | null => {
    if (!pages.length) { toast.error('Add at least one page'); return null; }
    return buildPdf(pages);
  };

  const doDownload = () => {
    const blob = exportPdf();
    if (!blob) return;
    const name = (docName || 'scan').replace(/\s+/g, '_').toLowerCase() + '.pdf';
    downloadBlob(blob, name);
    toast.success('PDF downloaded');
  };

  const doSave = async () => {
    const blob = exportPdf();
    if (!blob) return;
    if (!phone.trim()) { toast.error('Enter customer phone to save on server'); return; }
    setBusy('Saving PDF…');
    try {
      const name = (docName || 'scan').replace(/\s+/g, '_').toLowerCase() + '.pdf';
      const fd = new FormData();
      fd.append('file', blob, name);
      fd.append('phone', phone.trim());
      fd.append('personName', docName || '');
      await api.post('/customers/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`Saved ${name} on server`);
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-3 md:p-4 h-full min-h-0">
      <div className="w-full lg:w-80 shrink-0 space-y-3 overflow-y-auto">
        <div>
          <h1 className="text-base font-semibold">PDF Scan</h1>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Like Adobe Scan — pages in, clean PDF out
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary text-xs flex items-center gap-1.5" onClick={() => fileRef.current?.click()}>
            <Plus size={14} /> Add pages
          </button>
          <button type="button" className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => camRef.current?.click()}>
            <Camera size={14} /> Camera
          </button>
          <button type="button" className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => fileRef.current?.click()}>
            <UploadSimple size={14} /> Upload
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Enhance (new pages)</p>
          <div className="flex gap-1">
            {([
              ['original', 'Original'],
              ['clean', 'Clean'],
              ['contrast', 'Contrast'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setEnhance(id)}
                className="flex-1 text-xs rounded-lg py-2 border"
                style={{
                  borderColor: enhance === id ? 'hsl(27 95% 55%)' : 'var(--border)',
                  background: enhance === id ? 'hsl(27 95% 55% / 0.15)' : 'transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="text-[11px] text-[var(--muted-foreground)]" onClick={reEnhanceAll}>
            Tip: enhance applies when you add a page
          </button>
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Pages ({pages.length})</p>
          {pages.length === 0 && (
            <p className="text-xs text-[var(--muted-foreground)]">No pages yet — add photos of the document.</p>
          )}
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {pages.map((p, i) => (
              <li
                key={p.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer ${active === i ? 'bg-[var(--card-hover)]' : ''}`}
                onClick={() => setActive(i)}
              >
                <img src={p.dataUrl} alt="" className="w-8 h-10 object-cover rounded border" style={{ borderColor: 'var(--border)' }} />
                <span className="text-xs flex-1 truncate">Page {i + 1}</span>
                <button type="button" className="p-1 opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); move(i, -1); }}><ArrowUp size={12} /></button>
                <button type="button" className="p-1 opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); move(i, 1); }}><ArrowDown size={12} /></button>
                <button type="button" className="p-1 text-red-400" onClick={(e) => { e.stopPropagation(); remove(i); }}><Trash size={12} /></button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Save</p>
          <input className="input-field text-sm w-full" placeholder="Document name (e.g. residence_scan)" value={docName} onChange={(e) => setDocName(e.target.value)} />
          <input className="input-field text-sm w-full" placeholder="Customer phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5 py-2.5" onClick={doDownload} disabled={!pages.length}>
              <DownloadSimple size={16} /> Download PDF
            </button>
            <button type="button" className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1.5 py-2.5" onClick={doSave} disabled={!pages.length || !!busy}>
              <FloppyDisk size={16} /> Save
            </button>
          </div>
        </div>

        {busy && <p className="text-xs text-[var(--muted-foreground)] animate-pulse">{busy}</p>}
      </div>

      <div className="flex-1 min-h-[320px] card flex items-center justify-center bg-[var(--card)]">
        {pages[active] ? (
          <img src={pages[active].dataUrl} alt={`Page ${active + 1}`} className="max-h-full max-w-full object-contain rounded shadow" />
        ) : (
          <div className="text-center text-[var(--muted-foreground)] px-6">
            <FilePdf size={40} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Add document photos to build a PDF</p>
            <p className="text-xs mt-1 opacity-70">Camera or upload · Clean enhance · Download / Save</p>
          </div>
        )}
      </div>
    </div>
  );
}
