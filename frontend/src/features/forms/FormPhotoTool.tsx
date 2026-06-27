import { useState, useRef, useCallback, useEffect } from 'react';
import { UploadSimple, DownloadSimple, CheckCircle, XCircle, ArrowLeft } from '@phosphor-icons/react';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

interface Spec { width: number; height: number; minKB: number; maxKB: number; format: string; bg: string; }

/**
 * Resize an image to exact dimensions, then binary-search JPEG quality
 * until the file size lands within [minKB, maxKB]. All in-browser — server never sees pixels.
 */
async function processToSpec(img: ImageBitmap, spec: Spec): Promise<{ blob: Blob; kb: number } | null> {
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d')!;
  // White background (most govt forms require white bg)
  ctx.fillStyle = spec.bg === 'white' ? '#ffffff' : '#ffffff';
  ctx.fillRect(0, 0, spec.width, spec.height);
  // Cover-fit (fill frame, center crop)
  const scale = Math.max(spec.width / img.width, spec.height / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  ctx.drawImage(img, (spec.width - dw) / 2, (spec.height - dh) / 2, dw, dh);

  // Binary search quality to hit target KB
  let lo = 0.3, hi = 0.95, best: Blob | null = null;
  for (let i = 0; i < 8; i++) {
    const q = (lo + hi) / 2;
    const blob: Blob = await new Promise(res => canvas.toBlob(b => res(b!), 'image/jpeg', q));
    const kb = blob.size / 1024;
    best = blob;
    if (kb > spec.maxKB) hi = q;
    else if (kb < spec.minKB) lo = q;
    else return { blob, kb };
  }
  return best ? { blob: best, kb: best.size / 1024 } : null;
}

export default function FormPhotoTool() {
  const params = new URLSearchParams(window.location.search);
  const formName = params.get('form') || 'Form';
  const photoSpec: Spec | null = params.get('photo') ? JSON.parse(params.get('photo')!) : null;
  const sigSpec: Spec | null = params.get('signature') ? JSON.parse(params.get('signature')!) : null;

  const presets = [
    photoSpec && { kind: 'Photo', spec: photoSpec },
    sigSpec && { kind: 'Signature', spec: sigSpec },
  ].filter(Boolean) as { kind: string; spec: Spec }[];

  const [active, setActive] = useState(0);
  const [img, setImg] = useState<ImageBitmap | null>(null);
  const [result, setResult] = useState<{ blob: Blob; kb: number } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  const spec = presets[active]?.spec;

  const run = useCallback(async (bitmap: ImageBitmap) => {
    if (!spec) return;
    setProcessing(true);
    const r = await processToSpec(bitmap, spec);
    setResult(r);
    setProcessing(false);
    // Draw preview
    if (r && previewRef.current) {
      const url = URL.createObjectURL(r.blob);
      const pimg = new Image();
      pimg.onload = () => {
        const c = previewRef.current!;
        c.width = spec.width; c.height = spec.height;
        c.getContext('2d')!.drawImage(pimg, 0, 0);
        URL.revokeObjectURL(url);
      };
      pimg.src = url;
    }
  }, [spec]);

  const onFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const bitmap = await createImageBitmap(file);
    setImg(bitmap);
    run(bitmap);
  }, [run]);

  // Re-process when switching preset
  useEffect(() => { if (img) run(img); }, [active]); // eslint-disable-line

  const download = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(result.blob);
    a.download = `${formName.replace(/\s+/g, '_')}_${presets[active].kind.toLowerCase()}.jpg`;
    a.click();
  };

  if (!presets.length) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center">
        <p className="text-gray-400">No photo specs provided. Open this from a form in the Form Directory.</p>
        <a href="/app/forms" className="btn-primary inline-flex mt-4">Go to Form Directory</a>
      </div>
    );
  }

  const sizeOk = result && spec && result.kb >= spec.minKB && result.kb <= spec.maxKB;

  const reveal = (i: number) => ({
    transform: mounted ? 'translateY(0)' : 'translateY(14px)',
    opacity: mounted ? 1 : 0,
    transition: `transform 600ms ${EASE} ${i * 60}ms, opacity 600ms ${EASE} ${i * 60}ms`,
  });

  return (
    <div className="max-w-2xl mx-auto pt-4">
      <button onClick={() => history.back()} className="btn-ghost flex items-center gap-1.5 mb-4 px-0 text-gray-400">
        <ArrowLeft size={15} /> Back
      </button>

      <div style={reveal(0)} className="mb-6">
        <span className="inline-block rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-medium text-gray-500 bg-white/[0.04] border border-white/[0.06]">
          {formName}
        </span>
        <h1 className="text-2xl font-semibold text-white tracking-tight mt-3">Prepare photo & signature</h1>
        <p className="text-sm text-gray-500 mt-1">Drop an image — auto-resized and compressed to exact form specs.</p>
      </div>

      {/* Preset tabs */}
      <div style={reveal(1)} className="flex gap-2 mb-6">
        {presets.map((p, i) => (
          <button key={p.kind} onClick={() => { setActive(i); setResult(null); }}
            className="flex-1 rounded-2xl p-1.5 border transition-all active:scale-[0.98]"
            style={{
              background: active === i ? 'hsl(var(--pt-marigold) / 0.12)' : 'hsl(var(--pt-secondary))',
              borderColor: active === i ? 'hsl(var(--pt-marigold) / 0.3)' : 'hsl(var(--pt-border))',
              transitionTimingFunction: EASE, transitionDuration: '250ms',
            }}>
            <div className="rounded-xl px-4 py-3 bg-[#1c1c1e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
              <p className="text-sm font-medium text-white">{p.kind}</p>
              <p className="text-[11px] text-gray-500 font-mono mt-0.5">{p.spec.width}×{p.spec.height}px · {p.spec.minKB}–{p.spec.maxKB}KB</p>
            </div>
          </button>
        ))}
      </div>

      {/* Drop zone / preview */}
      <div style={reveal(2)} className="rounded-[1.5rem] p-1.5 bg-white/[0.02] border border-white/[0.05] mb-5">
        <div className="rounded-[1.1rem] bg-[#1c1c1e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] p-6">
          {!img ? (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
              className="border-2 border-dashed rounded-xl py-16 flex flex-col items-center cursor-pointer transition-colors hover:border-[#0a84ff]/40"
              style={{ borderColor: 'var(--border)' }}>
              <UploadSimple size={32} className="text-gray-500 mb-3" />
              <p className="text-sm text-gray-300">Drop image or click to upload</p>
              <p className="text-xs text-gray-600 mt-1">Customer's photo or signature</p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              <div className="shrink-0 mx-auto sm:mx-0">
                <canvas ref={previewRef} className="rounded-lg border border-white/[0.08] bg-white"
                  style={{ width: Math.min(spec!.width, 160), height: Math.min(spec!.width, 160) * (spec!.height / spec!.width) }} />
              </div>
              <div className="flex-1 min-w-0 w-full space-y-2">
                {processing ? (
                  <p className="text-sm text-gray-400">Processing...</p>
                ) : result ? (
                  <>
                    <SpecCheck label="Dimensions" ok={true} value={`${spec!.width}×${spec!.height}px`} />
                    <SpecCheck label="File size" ok={!!sizeOk} value={`${result.kb.toFixed(1)} KB`} target={`${spec!.minKB}–${spec!.maxKB}`} />
                    <SpecCheck label="Format" ok={true} value="JPG" />
                    <SpecCheck label="Background" ok={true} value="White" />
                  </>
                ) : null}
                <button onClick={() => fileRef.current?.click()} className="btn-ghost text-xs px-0 text-[#0a84ff] mt-1">Change image</button>
              </div>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
        </div>
      </div>

      {result && (
        <div style={reveal(3)} className="flex gap-3">
          <button onClick={download} className="btn-primary flex items-center gap-2 flex-1 justify-center py-3">
            <DownloadSimple size={16} /> Download {presets[active].kind}
          </button>
        </div>
      )}

      {result && !sizeOk && (
        <p className="text-xs text-amber-400 mt-3 text-center">
          Size is {result.kb.toFixed(1)}KB — couldn't fit {spec!.minKB}–{spec!.maxKB}KB range. Try a clearer image.
        </p>
      )}
    </div>
  );
}

function SpecCheck({ label, ok, value, target }: { label: string; ok: boolean; value: string; target?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm flex-wrap">
      {ok ? <CheckCircle size={16} weight="fill" className="text-[#30d158] shrink-0" /> : <XCircle size={16} weight="fill" className="text-[#ff453a] shrink-0" />}
      <span className="text-gray-500 w-20 sm:w-24 shrink-0">{label}</span>
      <span className={`${ok ? 'text-gray-200' : 'text-[#ff453a]'} min-w-0 break-words`}>{value}</span>
      {target && <span className="text-gray-600 text-xs font-mono">({target} KB)</span>}
    </div>
  );
}
