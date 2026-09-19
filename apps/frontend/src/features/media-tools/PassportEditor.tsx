/**
 * Passport Image Editor — rebuilt for cybercafé counters.
 * Load → remove BG → pick any background → light face tone → crop/export → Download + Save.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowClockwise, DownloadSimple, FloppyDisk, Image as ImageIcon,
  MagicWand, UploadSimple, Camera, FolderOpen,
} from '@phosphor-icons/react';
import api from '../../shared/api';
import { toast } from '../../shared/toast';
import { BG_PRESETS, PORTAL_PRESETS, type BgPresetId } from './bgPresets';
import {
  applyTone, canvasToBlob, compositeOnColor, cropCoverToSize, downloadBlob,
  encodeJpegToKb, flipCanvas, loadImageFromFile, rotateCanvas, type ToneAdjust,
} from './imageOps';

type Stage = 'idle' | 'loaded' | 'cutout' | 'ready';

export default function PassportEditor() {
  const [params] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>('idle');
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cutoutCanvas, setCutoutCanvas] = useState<HTMLCanvasElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [bgId, setBgId] = useState<BgPresetId>('white');
  const [customHex, setCustomHex] = useState('#ffffff');
  const [tone, setTone] = useState<ToneAdjust>({ brightness: 0, contrast: 5, smooth: 25 });
  const [presetId, setPresetId] = useState<string>('bihar_rtps');
  const [phone, setPhone] = useState(params.get('phone') || '');
  const [personName, setPersonName] = useState(params.get('name') || '');
  const [busy, setBusy] = useState<string | null>(null);
  const [exportInfo, setExportInfo] = useState<{ w: number; h: number; kb: number } | null>(null);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);

  const preset = useMemo(
    () => PORTAL_PRESETS.find((p) => p.id === presetId) || PORTAL_PRESETS[0],
    [presetId],
  );

  const bgHex = useMemo(() => {
    if (bgId === 'custom') return customHex;
    const p = BG_PRESETS.find((x) => x.id === bgId);
    return p?.hex ?? '#ffffff';
  }, [bgId, customHex]);

  const setFromImage = async (img: HTMLImageElement) => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    c.getContext('2d')!.drawImage(img, 0, 0);
    setSourceCanvas(c);
    setCutoutCanvas(null);
    setStage('loaded');
    setExportInfo(null);
    setLastBlob(null);
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    try {
      const img = await loadImageFromFile(file);
      await setFromImage(img);
      toast.success('Photo loaded');
    } catch (e: any) {
      toast.error(e.message || 'Load failed');
    }
  };

  // Deep-link: ?fileId=
  useEffect(() => {
    const fileId = params.get('fileId');
    if (!fileId) return;
    let cancelled = false;
    (async () => {
      try {
        setBusy('Loading from Drive…');
        const res = await api.get(`/drive/download/${fileId}`, { responseType: 'blob' });
        if (cancelled) return;
        const img = await loadImageFromFile(new Blob([res.data]));
        await setFromImage(img);
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
      const img = await loadImageFromFile(new Blob([dl.data]));
      await setFromImage(img);
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
      const blob = await canvasToBlob(sourceCanvas, 'image/png');
      const fd = new FormData();
      fd.append('image_file', blob, 'photo.png');
      const res = await api.post('/process/remove-bg', fd, { responseType: 'blob' });
      const img = await loadImageFromFile(new Blob([res.data], { type: 'image/png' }));
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      c.getContext('2d')!.drawImage(img, 0, 0);
      setCutoutCanvas(c);
      setStage('cutout');
      toast.success('Background removed — pick a colour');
    } catch (e: any) {
      const status = e.response?.status;
      let msg = e.message || 'Remove BG failed';
      if (e.response?.data instanceof Blob) {
        try {
          const t = await e.response.data.text();
          const j = JSON.parse(t);
          if (j.error) msg = j.error;
        } catch { /* ignore */ }
      }
      if (status === 503) msg = 'Background removal not configured on server (API key)';
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  /** Rebuild preview from cutout (or source) + bg + tone + crop */
  const rebuildPreview = useCallback(async () => {
    const base = cutoutCanvas || sourceCanvas;
    if (!base) { setPreviewUrl(null); return; }
    let working: HTMLCanvasElement = base;
    if (cutoutCanvas) {
      working = await compositeOnColor(cutoutCanvas, bgHex);
    } else if (bgId !== 'transparent' && bgHex) {
      // No cutout yet — still allow tinted backdrop under original (honest: not a real remove)
      working = base;
    }
    working = applyTone(working, tone);
    const framed = cropCoverToSize(working, preset.width, preset.height, 0.5, 0.38);
    const url = framed.toDataURL('image/jpeg', 0.92);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setStage(cutoutCanvas ? 'ready' : 'loaded');

    // Pre-encode for checklist
    try {
      const { blob, kb } = await encodeJpegToKb(
        framed,
        preset.maxKb,
        'minKb' in preset ? (preset as any).minKb : undefined,
      );
      setExportInfo({ w: framed.width, h: framed.height, kb: Math.round(kb * 10) / 10 });
      setLastBlob(blob);
    } catch {
      setExportInfo({ w: framed.width, h: framed.height, kb: 0 });
    }
  }, [cutoutCanvas, sourceCanvas, bgHex, bgId, tone, preset]);

  useEffect(() => {
    rebuildPreview();
  }, [rebuildPreview]);

  const rotate = (deg: 90 | -90) => {
    if (cutoutCanvas) setCutoutCanvas(rotateCanvas(cutoutCanvas, deg));
    else if (sourceCanvas) setSourceCanvas(rotateCanvas(sourceCanvas, deg));
  };
  const flip = () => {
    if (cutoutCanvas) setCutoutCanvas(flipCanvas(cutoutCanvas, true));
    else if (sourceCanvas) setSourceCanvas(flipCanvas(sourceCanvas, true));
  };

  const doDownload = () => {
    if (!lastBlob) { toast.error('Nothing to download yet'); return; }
    const safe = (personName || 'photo').replace(/\s+/g, '_').toLowerCase();
    const ext = bgId === 'transparent' ? 'png' : 'jpg';
    downloadBlob(lastBlob, `${safe}_${preset.id}.${ext}`);
    toast.success('Downloaded');
  };

  const doSave = async () => {
    if (!lastBlob) { toast.error('Export a photo first'); return; }
    if (!phone.trim()) { toast.error('Enter customer phone to save on server'); return; }
    setBusy('Saving to customer…');
    try {
      const safe = (personName || 'photo').replace(/\s+/g, '_').toLowerCase();
      const fileName = `${safe}_${preset.id}_photo.jpg`;
      const fd = new FormData();
      fd.append('file', lastBlob, fileName);
      fd.append('phone', phone.trim());
      fd.append('personName', personName || '');
      await api.post('/customers/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`Saved ${fileName} on server`);
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const kbOk = exportInfo
    && exportInfo.kb > 0
    && exportInfo.kb <= preset.maxKb
    && (!('minKb' in preset) || exportInfo.kb >= (preset as any).minKb);

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-3 md:p-4 h-full min-h-0">
      {/* Controls */}
      <div className="w-full lg:w-80 shrink-0 space-y-3 overflow-y-auto">
        <div>
          <h1 className="text-base font-semibold text-[var(--foreground)]">Passport photo</h1>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Background · face tone · portal size — then Download or Save
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
          {!cutoutCanvas && sourceCanvas && (
            <p className="text-[11px] text-amber-500/90">Remove background first — then pick any colour below.</p>
          )}
          <div className="grid grid-cols-4 gap-1.5">
            {BG_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!cutoutCanvas && p.id !== 'transparent'}
                onClick={() => setBgId(p.id)}
                className="rounded-lg border px-1 py-2 text-[10px] flex flex-col items-center gap-1 disabled:opacity-40"
                style={{
                  borderColor: bgId === p.id ? 'hsl(27 95% 55%)' : 'var(--border)',
                  background: p.hex
                    ? p.hex
                    : 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px',
                  color: p.id === 'black' || p.id === 'navy' || p.id === 'green' || p.id === 'red' ? '#fff' : '#222',
                }}
                title={p.label}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <input
              type="color"
              value={customHex}
              onChange={(e) => { setCustomHex(e.target.value); setBgId('custom'); }}
              className="w-8 h-8 rounded cursor-pointer border-0"
            />
            Custom colour
          </label>
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">2. Face tone & edits</p>
          <label className="block text-xs">Brightness
            <input type="range" min={-40} max={40} value={tone.brightness}
              onChange={(e) => setTone({ ...tone, brightness: +e.target.value })} className="w-full" />
          </label>
          <label className="block text-xs">Contrast
            <input type="range" min={-40} max={40} value={tone.contrast}
              onChange={(e) => setTone({ ...tone, contrast: +e.target.value })} className="w-full" />
          </label>
          <label className="block text-xs">Light polish
            <input type="range" min={0} max={80} value={tone.smooth}
              onChange={(e) => setTone({ ...tone, smooth: +e.target.value })} className="w-full" />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-xs flex-1" onClick={() => rotate(-90)} disabled={!sourceCanvas}>
              <ArrowClockwise size={14} className="-scale-x-100 inline" /> Left
            </button>
            <button type="button" className="btn-secondary text-xs flex-1" onClick={() => rotate(90)} disabled={!sourceCanvas}>
              <ArrowClockwise size={14} className="inline" /> Right
            </button>
            <button type="button" className="btn-secondary text-xs flex-1" onClick={flip} disabled={!sourceCanvas}>Flip</button>
          </div>
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">3. Portal size</p>
          <select
            className="input-field text-sm w-full"
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
          >
            {PORTAL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label} — {p.note}</option>
            ))}
          </select>
          {exportInfo && (
            <ul className="text-xs space-y-1">
              <li className={exportInfo.w === preset.width && exportInfo.h === preset.height ? 'text-emerald-400' : 'text-amber-400'}>
                Size {exportInfo.w}×{exportInfo.h} {exportInfo.w === preset.width ? '✓' : ''}
              </li>
              <li className={kbOk ? 'text-emerald-400' : 'text-amber-400'}>
                {exportInfo.kb} KB (max {preset.maxKb}) {kbOk ? '✓' : '— adjust'}
              </li>
              <li className={cutoutCanvas ? 'text-emerald-400' : 'text-amber-400'}>
                Background {cutoutCanvas ? 'removed ✓' : 'not removed yet'}
              </li>
            </ul>
          )}
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">4. Save for customer / extension</p>
          <input
            className="input-field text-sm w-full"
            placeholder="Customer phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <input
            className="input-field text-sm w-full"
            placeholder="Name (for filename)"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5 py-2.5" onClick={doDownload} disabled={!lastBlob}>
              <DownloadSimple size={16} /> Download
            </button>
            <button type="button" className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1.5 py-2.5" onClick={doSave} disabled={!lastBlob || !!busy}>
              <FloppyDisk size={16} /> Save
            </button>
          </div>
        </div>

        {busy && <p className="text-xs text-[var(--muted-foreground)] animate-pulse">{busy}</p>}
      </div>

      {/* Preview */}
      <div className="flex-1 min-h-[320px] card flex items-center justify-center bg-[var(--card)] relative">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Preview"
            className="max-h-full max-w-full object-contain rounded shadow-lg"
            style={{ aspectRatio: `${preset.width} / ${preset.height}`, background: bgHex || '#fff' }}
          />
        ) : (
          <div className="text-center text-[var(--muted-foreground)] px-6">
            <ImageIcon size={40} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Upload a selfie or pull Latest from WhatsApp</p>
            <p className="text-xs mt-1 opacity-70">Then remove background and pick any colour</p>
          </div>
        )}
        {stage === 'ready' && (
          <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-full">
            Ready
          </span>
        )}
      </div>
    </div>
  );
}
