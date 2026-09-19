/**
 * Print sheet — medicine for P4: physical 8-up from a framed photo.
 */
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DownloadSimple, Printer, UploadSimple } from '@phosphor-icons/react';
import { mm, PAPER_4X6_L, PASSPORT_SLOT } from './sheetGeometry';
import { downloadBlob, loadImageFromFile } from './imageOps';
import { printBlob } from '../../shared/fileCache';
import { toast } from '../../shared/toast';

async function buildPassport4x6Sheet(img: HTMLImageElement): Promise<Blob> {
  const paper = PAPER_4X6_L;
  const slotW = PASSPORT_SLOT.w;
  const slotH = PASSPORT_SLOT.h;
  const cols = 4;
  const rows = 2;
  const gap = mm(3);
  const gridW = cols * slotW + (cols - 1) * gap;
  const gridH = rows * slotH + (rows - 1) * gap;
  const ox = Math.round((paper.w - gridW) / 2);
  const oy = Math.round((paper.h - gridH) / 2);

  const c = document.createElement('canvas');
  c.width = paper.w;
  c.height = paper.h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = ox + col * (slotW + gap);
      const y = oy + r * (slotH + gap);
      // cover-fit into slot
      const sa = img.naturalWidth / img.naturalHeight;
      const da = slotW / slotH;
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
      if (sa > da) {
        sw = img.naturalHeight * da;
        sx = (img.naturalWidth - sw) / 2;
      } else {
        sh = img.naturalWidth / da;
        sy = (img.naturalHeight - sh) * 0.35;
      }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, slotW, slotH);
      // cut guide
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, slotW - 1, slotH - 1);
    }
  }

  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92);
  });
}

export default function PrintSheet() {
  const [params] = useSearchParams();
  const q = params.toString();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const makeSheet = async (file: File) => {
    setBusy(true);
    try {
      const img = await loadImageFromFile(file);
      const blob = await buildPassport4x6Sheet(img);
      if (sheetUrl) URL.revokeObjectURL(sheetUrl);
      setSheetUrl(URL.createObjectURL(blob));
      toast.success('8-up 4×6 ready');
    } catch (e: any) {
      toast.error(e.message || 'Sheet failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-3 md:p-4 h-full min-h-0">
      <div className="w-full lg:w-80 shrink-0 space-y-3">
        <div>
          <h1 className="text-base font-semibold">Print sheet</h1>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            8 passport photos on 4×6 glossy. Frame the face in Portal photo first for best results.
          </p>
        </div>
        <Link
          to={`../portal${q ? `?${q}` : ''}`}
          className="btn-secondary w-full text-sm flex items-center justify-center py-2.5"
        >
          Open Portal photo (frame first)
        </Link>
        <button
          type="button"
          className="btn-primary w-full text-sm flex items-center justify-center gap-2 py-2.5"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <UploadSimple size={16} /> Upload framed photo
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && makeSheet(e.target.files[0])} />
        {sheetUrl && (
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5 py-2.5"
              onClick={async () => { printBlob(await (await fetch(sheetUrl)).blob()); }}>
              <Printer size={16} /> Print
            </button>
            <button type="button" className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1.5 py-2.5"
              onClick={async () => { downloadBlob(await (await fetch(sheetUrl)).blob(), 'passport_sheet_4x6.jpg'); }}>
              <DownloadSimple size={16} /> Download
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-[320px] card flex items-center justify-center">
        {sheetUrl ? (
          <img src={sheetUrl} alt="Sheet" className="max-h-full max-w-full object-contain shadow" />
        ) : (
          <p className="text-sm text-[var(--muted-foreground)] px-6 text-center">
            Upload a framed passport photo → 8 copies on 4×6 with cut guides
          </p>
        )}
      </div>
    </div>
  );
}
