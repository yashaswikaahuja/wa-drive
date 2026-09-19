/**
 * Aadhaar front + back on one A4 — medicine for P5.
 */
import { useRef, useState } from 'react';
import { DownloadSimple, Printer, UploadSimple } from '@phosphor-icons/react';
import { jsPDF } from 'jspdf';
import { mm, PAPER_A4_P } from './sheetGeometry';
import { downloadBlob, loadImageFromFile } from './imageOps';
import { printBlob } from '../../shared/fileCache';
import api from '../../shared/api';
import { toast } from '../../shared/toast';

async function layoutAadhaar(front: HTMLImageElement, back: HTMLImageElement): Promise<Blob> {
  const paper = PAPER_A4_P;
  const c = document.createElement('canvas');
  c.width = paper.w;
  c.height = paper.h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);

  const margin = mm(12);
  const gap = mm(10);
  const cardW = paper.w - margin * 2;
  const cardH = (paper.h - margin * 2 - gap) / 2;

  const drawCover = (img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const sa = img.naturalWidth / img.naturalHeight;
    const da = w / h;
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (sa > da) { sw = sh * da; sx = (img.naturalWidth - sw) / 2; }
    else { sh = sw / da; sy = (img.naturalHeight - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };

  drawCover(front, margin, margin, cardW, cardH);
  drawCover(back, margin, margin + cardH + gap, cardW, cardH);

  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92);
  });
}

export default function AadhaarLayout() {
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const [front, setFront] = useState<HTMLImageElement | null>(null);
  const [back, setBack] = useState<HTMLImageElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async (which: 'front' | 'back', file: File | null) => {
    if (!file) return;
    const img = await loadImageFromFile(file);
    if (which === 'front') setFront(img);
    else setBack(img);
  };

  const build = async () => {
    if (!front || !back) { toast.error('Add front and back'); return; }
    setBusy(true);
    try {
      const b = await layoutAadhaar(front, back);
      setBlob(b);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(b));
      toast.success('Aadhaar A4 ready');
    } catch (e: any) {
      toast.error(e.message || 'Layout failed');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!blob) return;
    if (!phone.trim()) { toast.error('Enter customer phone'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', blob, 'aadhaar_front_back.jpg');
      fd.append('phone', phone.trim());
      await api.post('/customers/upload', fd);
      toast.success('Saved on server');
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.addImage(url, 'JPEG', 0, 0, 210, 297);
    downloadBlob(pdf.output('blob'), 'aadhaar_front_back.pdf');
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-3 md:p-4 h-full min-h-0">
      <div className="w-full lg:w-80 shrink-0 space-y-3">
        <div>
          <h1 className="text-base font-semibold">Aadhaar card</h1>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Front + back on one A4 — for Xerox / attachment
          </p>
        </div>
        <button type="button" className="btn-secondary w-full text-sm py-2.5" onClick={() => frontRef.current?.click()}>
          <UploadSimple size={14} className="inline mr-1" /> {front ? 'Front ✓' : 'Add front'}
        </button>
        <button type="button" className="btn-secondary w-full text-sm py-2.5" onClick={() => backRef.current?.click()}>
          <UploadSimple size={14} className="inline mr-1" /> {back ? 'Back ✓' : 'Add back'}
        </button>
        <input ref={frontRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick('front', e.target.files?.[0] || null)} />
        <input ref={backRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick('back', e.target.files?.[0] || null)} />
        <button type="button" className="btn-primary w-full text-sm py-2.5" onClick={build} disabled={!front || !back || busy}>
          Make A4 layout
        </button>
        {blob && (
          <>
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1 text-sm py-2.5 flex items-center justify-center gap-1"
                onClick={() => printBlob(blob)}><Printer size={16} /> Print</button>
              <button type="button" className="btn-secondary flex-1 text-sm py-2.5 flex items-center justify-center gap-1"
                onClick={() => downloadBlob(blob, 'aadhaar_front_back.jpg')}><DownloadSimple size={16} /> JPG</button>
            </div>
            <button type="button" className="btn-secondary w-full text-sm py-2" onClick={downloadPdf}>Download PDF</button>
            <input className="input-field text-sm w-full" placeholder="Customer phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button type="button" className="btn-primary w-full text-sm py-2.5" onClick={save} disabled={busy}>Save to customer</button>
          </>
        )}
      </div>
      <div className="flex-1 min-h-[320px] card flex items-center justify-center">
        {preview ? (
          <img src={preview} alt="Aadhaar A4" className="max-h-full max-w-full object-contain shadow" />
        ) : (
          <p className="text-sm text-[var(--muted-foreground)] text-center px-6">Add front and back photos of the Aadhaar card</p>
        )}
      </div>
    </div>
  );
}
