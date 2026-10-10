/**
 * Print sheet — free N copies (#317 / #319). Auto-pack starting layout; count is editable.
 */
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DownloadSimple, Printer, UploadSimple } from '@phosphor-icons/react';
import { downloadBlob, loadImageFromFile } from './imageOps';
import { printBlob } from '../../shared/fileCache';
import { toast } from '../../shared/toast';
import { buildPassportSheet, type PaperId } from './printSheetBuild';

export default function PrintSheet() {
  const [params] = useSearchParams();
  const q = params.toString();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(8);
  const [paper, setPaper] = useState<PaperId>('4x6');
  const [srcImg, setSrcImg] = useState<HTMLImageElement | null>(null);

  const remake = async (img: HTMLImageElement, n: number, p: PaperId) => {
    setBusy(true);
    try {
      const blob = await buildPassportSheet(img, Math.max(1, Math.min(100, n)), p);
      if (sheetUrl) URL.revokeObjectURL(sheetUrl);
      setSheetUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      toast.error(e.message || 'Sheet failed');
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    const img = await loadImageFromFile(file);
    setSrcImg(img);
    await remake(img, count, paper);
    toast.success(`${count} copies on ${paper === 'a4' ? 'A4' : '4×6'}`);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-3 md:p-4 h-full min-h-0">
      <div className="w-full lg:w-80 shrink-0 space-y-3">
        <div>
          <h1 className="text-base font-semibold">Print sheet</h1>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Free copy count — not locked to 8. Auto-pack, then Print / Download.
          </p>
        </div>
        <Link to={`../portal${q ? `?${q}` : ''}`} className="btn-secondary w-full text-sm flex items-center justify-center py-2.5">
          Open Photo Editor (frame first)
        </Link>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Copies (free)</p>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary px-3" onClick={() => {
              const n = Math.max(1, count - 1); setCount(n); if (srcImg) remake(srcImg, n, paper);
            }}>−</button>
            <input
              type="number" min={1} max={100} value={count}
              className="input-field text-sm text-center flex-1"
              onChange={(e) => {
                const n = Math.max(1, Math.min(100, +e.target.value || 1));
                setCount(n);
                if (srcImg) remake(srcImg, n, paper);
              }}
            />
            <button type="button" className="btn-secondary px-3" onClick={() => {
              const n = Math.min(100, count + 1); setCount(n); if (srcImg) remake(srcImg, n, paper);
            }}>+</button>
          </div>
          <div className="flex gap-1">
            {([
              ['4x6', '4×6'],
              ['a4', 'A4'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="flex-1 text-xs rounded-lg py-2 border"
                style={{
                  borderColor: paper === id ? 'hsl(27 95% 55%)' : 'var(--border)',
                  background: paper === id ? 'hsl(27 95% 55% / 0.12)' : 'transparent',
                }}
                onClick={() => { setPaper(id); if (srcImg) remake(srcImg, count, id); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="btn-primary w-full text-sm flex items-center justify-center gap-2 py-2.5"
          onClick={() => fileRef.current?.click()} disabled={busy}>
          <UploadSimple size={16} /> Upload framed photo
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />

        {sheetUrl && (
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5 py-2.5"
              onClick={async () => { printBlob(await (await fetch(sheetUrl)).blob()); }}>
              <Printer size={16} /> Print
            </button>
            <button type="button" className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1.5 py-2.5"
              onClick={async () => { downloadBlob(await (await fetch(sheetUrl)).blob(), `passport_sheet_x${count}.jpg`); }}>
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
            Set copy count, pick paper, upload a framed photo
          </p>
        )}
      </div>
    </div>
  );
}
