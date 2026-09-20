/**
 * Portal photo — medicine for rejected uploads + wrong framing.
 * Load → Remove BG → Colour → Tone → Frame → traffic lights → Save / Download
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowClockwise, Crop, DownloadSimple, FloppyDisk, Image as ImageIcon,
  MagicWand, UploadSimple, Camera, FolderOpen,
} from '@phosphor-icons/react';
import api from '../../shared/api';
import { toast } from '../../shared/toast';
import { BG_PRESETS, PORTAL_PRESETS, type BgPresetId } from './bgPresets';
import AspectCropModal from './AspectCropModal';
import { removeBackgroundSmart } from './removeBg';
import {
  applyTone, compositeOnColor, downloadBlob,
  encodeJpegToKb, flipCanvas, loadImageFromFile, rotateCanvas, type ToneAdjust,
} from './imageOps';

export default function PassportEditor() {
  const [params] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cutoutCanvas, setCutoutCanvas] = useState<HTMLCanvasElement | null>(null);
  const [framedCanvas, setFramedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [bgId, setBgId] = useState<BgPresetId>('white');
  const [customHex, setCustomHex] = useState('#ffffff');
  const [tone, setTone] = useState<ToneAdjust>({ brightness: 0, contrast: 5, smooth: 20 });
  const [presetId, setPresetId] = useState<string>('bihar_rtps');
  const [phone, setPhone] = useState(params.get('phone') || '');
  const [personName, setPersonName] = useState(params.get('name') || '');
  const [busy, setBusy] = useState<string | null>(null);
  const [exportInfo, setExportInfo] = useState<{ w: number; h: number; kb: number } | null>(null);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [bgVia, setBgVia] = useState<'server' | 'client' | null>(null);

  const preset = useMemo(
    () => PORTAL_PRESETS.find((p) => p.id === presetId) || PORTAL_PRESETS[0],
    [presetId],
  );

  const bgHex = useMemo(() => {
    if (bgId === 'custom') return customHex;
    return BG_PRESETS.find((x) => x.id === bgId)?.hex ?? '#ffffff';
  }, [bgId, customHex]);

  const aspect = preset.width / preset.height;

  const setFromImage = async (img: HTMLImageElement) => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    c.getContext('2d')!.drawImage(img, 0, 0);
    setSourceCanvas(c);
    setCutoutCanvas(null);
    setFramedCanvas(null);
    setBgVia(null);
    setExportInfo(null);
    setLastBlob(null);
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    try {
      await setFromImage(await loadImageFromFile(file));
      toast.success('Photo loaded — remove background, then frame the face');
    } catch (e: any) {
      toast.error(e.message || 'Load failed');
    }
  };

  useEffect(() => {
    const fileId = params.get('fileId');
    if (!fileId) return;
    let cancelled = false;
    (async () => {
      try {
        setBusy('Loading from Drive…');
        const res = await api.get(`/drive/download/${fileId}`, { responseType: 'blob' });
        if (cancelled) return;
        await setFromImage(await loadImageFromFile(new Blob([res.data])));
      } catch (e: any) {
        toast.error(e.message || 'Drive load failed');
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => { cancelled = true; };
  }, [params]);

  const loadLatestWa = async () => {
    try {
      setBusy('Loading latest…');
      const res = await api.get('/drive/files/ws');
      const files = (res.data || []).filter((f: any) => /\.(jpe?g|png|webp)$/i.test(f.fileName || ''));
      if (!files.length) { toast.error('No images in Drive yet'); return; }
      const latest = files[0];
      const dl = await api.get(`/drive/download/${latest.id}`, { responseType: 'blob' });
      await setFromImage(await loadImageFromFile(new Blob([dl.data])));
      if (latest.customerId) setPhone(String(latest.customerId));
      if (latest.customerName) setPersonName(String(latest.customerName));
      toast.success(latest.fileName || 'Loaded');
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    } finally {
      setBusy(null);
    }
  };

  const removeBg = async () => {
    if (!sourceCanvas) return;
    setBusy('Removing background…');
    try {
      const { canvas, via } = await removeBackgroundSmart(sourceCanvas, setBusy);
      setCutoutCanvas(canvas);
      setFramedCanvas(null);
      setBgVia(via);
      toast.success(via === 'server' ? 'Background removed' : 'Background removed (on-device)');
      setCropOpen(true);
    } catch (e: any) {
      toast.error(e.message || 'Remove BG failed');
    } finally {
      setBusy(null);
    }
  };

  /** Working bitmap before frame: cutout+bg+tone, or source+tone */
  const buildWorking = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const base = cutoutCanvas || sourceCanvas;
    if (!base) return null;
    let working = cutoutCanvas ? await compositeOnColor(cutoutCanvas, bgHex) : base;
    working = applyTone(working, tone);
    return working;
  }, [cutoutCanvas, sourceCanvas, bgHex, tone]);

  const rebuildPreview = useCallback(async () => {
    const working = await buildWorking();
    if (!working) { setPreviewUrl(null); return; }
    const show = framedCanvas || working;
    setPreviewUrl(show.toDataURL('image/jpeg', 0.92));

    if (framedCanvas) {
      try {
        const { blob, kb } = await encodeJpegToKb(
          framedCanvas,
          preset.maxKb,
          'minKb' in preset ? (preset as any).minKb : undefined,
        );
        setExportInfo({ w: framedCanvas.width, h: framedCanvas.height, kb: Math.round(kb * 10) / 10 });
        setLastBlob(blob);
      } catch {
        setExportInfo({ w: framedCanvas.width, h: framedCanvas.height, kb: 0 });
      }
    } else {
      setExportInfo(null);
      setLastBlob(null);
    }
  }, [buildWorking, framedCanvas, preset]);

  useEffect(() => { rebuildPreview(); }, [rebuildPreview]);

  // Tone/bg change invalidates frame (operator should re-frame lightly — keep frame if only tone?)
  // Keep framed; rebuild from cutout when applying frame again.
  useEffect(() => {
    // If tone/bg changes after frame, clear frame so checklist stays honest
    setFramedCanvas(null);
  }, [tone, bgId, customHex, cutoutCanvas]);

  const openCrop = async () => {
    if (!cutoutCanvas && !sourceCanvas) return;
    if (!cutoutCanvas) {
      toast.error('Remove background first — then frame the face');
      return;
    }
    setCropOpen(true);
  };

  const onFrameApply = (framed: HTMLCanvasElement) => {
    setFramedCanvas(framed);
    setCropOpen(false);
    toast.success('Face framed');
  };

  const rotate = (deg: 90 | -90) => {
    if (cutoutCanvas) { setCutoutCanvas(rotateCanvas(cutoutCanvas, deg)); setFramedCanvas(null); }
    else if (sourceCanvas) setSourceCanvas(rotateCanvas(sourceCanvas, deg));
  };
  const flip = () => {
    if (cutoutCanvas) { setCutoutCanvas(flipCanvas(cutoutCanvas, true)); setFramedCanvas(null); }
    else if (sourceCanvas) setSourceCanvas(flipCanvas(sourceCanvas, true));
  };

  const lights = {
    loaded: !!sourceCanvas,
    bg: !!cutoutCanvas,
    framed: !!framedCanvas,
    size: !!(framedCanvas && exportInfo && exportInfo.w === preset.width && exportInfo.h === preset.height),
    kb: !!(exportInfo && exportInfo.kb > 0 && exportInfo.kb <= preset.maxKb
      && (!('minKb' in preset) || exportInfo.kb >= (preset as any).minKb)),
  };
  const allGreen = lights.loaded && lights.bg && lights.framed && lights.size && lights.kb;

  const doDownload = () => {
    if (!allGreen || !lastBlob) { toast.error('Fix red lights before download'); return; }
    const safe = (personName || 'photo').replace(/\s+/g, '_').toLowerCase();
    downloadBlob(lastBlob, `${safe}_${preset.id}_photo.jpg`);
    toast.success('Downloaded');
  };

  const doSave = async () => {
    if (!allGreen || !lastBlob) { toast.error('Fix red lights before save'); return; }
    if (!phone.trim()) { toast.error('Enter customer phone — Save keeps the file for next visit'); return; }
    setBusy('Saving to customer…');
    try {
      const safe = (personName || 'photo').replace(/\s+/g, '_').toLowerCase();
      const fileName = `${safe}_${preset.id}_photo.jpg`;
      const fd = new FormData();
      fd.append('file', lastBlob, fileName);
      fd.append('phone', phone.trim());
      fd.append('personName', personName || '');
      fd.append('source', 'photo-editor');
      fd.append('sourceMetadata', JSON.stringify({ preset: preset.id, kb: exportInfo?.kb, w: exportInfo?.w, h: exportInfo?.h }));
      await api.post('/customers/upload', fd);
      toast.success(`Saved ${fileName} on server`);
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const Light = ({ ok, label }: { ok: boolean; label: string }) => (
    <li className={`text-xs flex items-center gap-2 ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
      <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      {label} {ok ? '✓' : ''}
    </li>
  );

  // Working canvas for crop modal (composited)
  const [cropSource, setCropSource] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!cropOpen) return;
    buildWorking().then(setCropSource);
  }, [cropOpen, buildWorking]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-3 md:p-4 h-full min-h-0">
      <div className="w-full lg:w-[22rem] shrink-0 space-y-3 overflow-y-auto">
        <div>
          <h1 className="text-base font-semibold">Portal photo</h1>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Remove BG → pick colour → frame face → green lights → Save
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <UploadSimple size={14} /> Upload
          </button>
          <button type="button" className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => cameraInputRef.current?.click()}>
            <Camera size={14} /> Camera
          </button>
          <button type="button" className="btn-secondary text-xs flex items-center gap-1.5" onClick={loadLatestWa}>
            <FolderOpen size={14} /> Latest WA
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0] || null)} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0] || null)} />
        </div>

        {/* Big job presets */}
        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Job preset</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PORTAL_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setPresetId(p.id); setFramedCanvas(null); }}
                className="rounded-lg border px-2 py-2 text-left text-[11px] leading-snug"
                style={{
                  borderColor: presetId === p.id ? 'hsl(27 95% 55%)' : 'var(--border)',
                  background: presetId === p.id ? 'hsl(27 95% 55% / 0.12)' : 'transparent',
                }}
              >
                <span className="font-semibold block">{p.label}</span>
                <span className="opacity-70">{p.note}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">1. Background</p>
          <button
            type="button"
            disabled={!sourceCanvas || !!busy}
            onClick={removeBg}
            className="btn-primary w-full text-sm flex items-center justify-center gap-2 py-2.5"
          >
            <MagicWand size={16} /> Remove background
          </button>
          {bgVia && <p className="text-[10px] text-[var(--muted-foreground)]">via {bgVia}</p>}
          <div className="grid grid-cols-4 gap-1.5">
            {BG_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!cutoutCanvas && p.id !== 'transparent'}
                onClick={() => setBgId(p.id)}
                className="rounded-lg border px-1 py-2 text-[10px] disabled:opacity-40"
                style={{
                  borderColor: bgId === p.id ? 'hsl(27 95% 55%)' : 'var(--border)',
                  background: p.hex
                    ? p.hex
                    : 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px',
                  color: ['black', 'navy', 'green', 'red'].includes(p.id) ? '#fff' : '#222',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <input type="color" value={customHex} onChange={(e) => { setCustomHex(e.target.value); setBgId('custom'); }} className="w-8 h-8 rounded cursor-pointer border-0" />
            Custom colour
          </label>
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">2. Tone & frame</p>
          <label className="block text-xs">Brightness
            <input type="range" min={-40} max={40} value={tone.brightness} onChange={(e) => setTone({ ...tone, brightness: +e.target.value })} className="w-full" />
          </label>
          <label className="block text-xs">Contrast
            <input type="range" min={-40} max={40} value={tone.contrast} onChange={(e) => setTone({ ...tone, contrast: +e.target.value })} className="w-full" />
          </label>
          <label className="block text-xs">Light polish
            <input type="range" min={0} max={80} value={tone.smooth} onChange={(e) => setTone({ ...tone, smooth: +e.target.value })} className="w-full" />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-xs flex-1" onClick={() => rotate(-90)} disabled={!sourceCanvas}>
              <ArrowClockwise size={14} className="-scale-x-100 inline" />
            </button>
            <button type="button" className="btn-secondary text-xs flex-1" onClick={() => rotate(90)} disabled={!sourceCanvas}>
              <ArrowClockwise size={14} className="inline" />
            </button>
            <button type="button" className="btn-secondary text-xs flex-1" onClick={flip} disabled={!sourceCanvas}>Flip</button>
          </div>
          <button type="button" className="btn-primary w-full text-sm flex items-center justify-center gap-2 py-2.5" onClick={openCrop} disabled={!cutoutCanvas}>
            <Crop size={16} /> Frame face ({preset.width}×{preset.height})
          </button>
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Traffic lights</p>
          <ul className="space-y-1.5">
            <Light ok={lights.loaded} label="Photo loaded" />
            <Light ok={lights.bg} label="Background removed" />
            <Light ok={lights.framed} label="Face framed" />
            <Light ok={lights.size} label={`Size ${preset.width}×${preset.height}${exportInfo ? ` (${exportInfo.w}×${exportInfo.h})` : ''}`} />
            <Light ok={lights.kb} label={`KB ≤ ${preset.maxKb}${exportInfo ? ` (now ${exportInfo.kb})` : ''}`} />
          </ul>
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Save for customer</p>
          <input className="input-field text-sm w-full" placeholder="Customer phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="input-field text-sm w-full" placeholder="Name (filename)" value={personName} onChange={(e) => setPersonName(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5 py-2.5" onClick={doSave} disabled={!allGreen || !!busy}>
              <FloppyDisk size={16} /> Save
            </button>
            <button type="button" className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1.5 py-2.5" onClick={doDownload} disabled={!allGreen}>
              <DownloadSimple size={16} /> Download
            </button>
          </div>
          {!allGreen && <p className="text-[10px] text-amber-400">All lights must be green before Save / Download.</p>}
        </div>

        {busy && <p className="text-xs text-[var(--muted-foreground)] animate-pulse">{busy}</p>}
      </div>

      <div className="flex-1 min-h-[320px] card flex items-center justify-center bg-[var(--card)] relative">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Preview"
            className="max-h-full max-w-full object-contain rounded shadow-lg"
            style={{ aspectRatio: framedCanvas ? `${preset.width}/${preset.height}` : undefined, background: bgHex || '#fff' }}
          />
        ) : (
          <div className="text-center text-[var(--muted-foreground)] px-6">
            <ImageIcon size={40} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Load a selfie → Remove background → Frame face</p>
          </div>
        )}
        {allGreen && (
          <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-full">
            Portal ready
          </span>
        )}
      </div>

      <AspectCropModal
        open={cropOpen}
        source={cropSource}
        aspect={aspect}
        targetW={preset.width}
        targetH={preset.height}
        onApply={onFrameApply}
        onClose={() => setCropOpen(false)}
      />
    </div>
  );
}
