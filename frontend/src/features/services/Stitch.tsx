import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Printer, DownloadSimple, Sparkle, Check, Camera, ArrowLeft, ArrowCounterClockwise, Warning } from '@phosphor-icons/react';
import api, { SOCKET_URL } from '../../shared/api';
import { useAuthStore } from '../auth/store';

interface StitchFile { id: string; fileName: string; fileUrl: string; customerName: string; }

type Mode = 'aadhaar' | 'passport';
type BgColor = 'white' | 'lightblue' | 'red' | 'custom';
type PhotoSpec = 'standard' | 'small' | 'stamp';
type SheetPreset = '4x6-8' | '4x6-12' | '4x6-4' | 'a4-24' | 'single';

const PRESETS: { key: SheetPreset; label: string; sub: string }[] = [
  { key: '4x6-8',  label: '8 Photos',  sub: '4×6 · Standard (Passport/PAN/Aadhaar)' },
  { key: '4x6-4',  label: '4 Photos',  sub: '4×6 · Large size' },
  { key: '4x6-12', label: '12 Photos', sub: '4×6 · Small (School/College)' },
  { key: 'a4-24',  label: '24 Photos', sub: 'A4 · Bulk (Job applications)' },
  { key: 'single', label: '1 Photo',   sub: '4×6 · Full size (ID card)' },
];

const SPECS: { key: PhotoSpec; label: string }[] = [
  { key: 'standard', label: '35×45mm — Passport / PAN / Aadhaar / Voter ID' },
  { key: 'small',    label: '25×30mm — School / College admission' },
  { key: 'stamp',    label: '20×25mm — Stamp size (some govt forms)' },
];

const BG_HEX: Record<BgColor, string> = { white: '#ffffff', lightblue: '#a8c8e8', red: '#c8102e', custom: '#ffffff' };

function getDriveId(url: string) { return url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ?? null; }
function getFullUrl(url: string) { const id = getDriveId(url); return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : url; }

async function compositeOnColor(fgDataUrl: string, color: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = reject;
    img.src = fgDataUrl;
  });
}

async function buildSheet(fileId: string, preset: SheetPreset, spec: PhotoSpec, text?: { name?: string; date?: string; signature?: boolean; font?: string }, processedBlob?: Blob): Promise<string> {
  let res: any;
  if (processedBlob) {
    const form = new FormData();
    form.append('image_file', processedBlob, 'photo.png');
    form.append('preset', preset);
    form.append('spec', spec);
    if (text?.name) form.append('name', text.name);
    if (text?.date) form.append('date', text.date);
    if (text?.signature) form.append('signature', 'true');
    if (text?.font) form.append('font', text.font);
    res = await api.post('/process/passport-sheet', form, { responseType: 'blob', headers: { 'Content-Type': 'multipart/form-data' } });
  } else {
    res = await api.post('/process/passport-sheet', { fileId, preset, spec, ...text }, { responseType: 'blob' });
  }
  return URL.createObjectURL(res.data);
}

function printUrl(url: string) {
  if (!url) { alert('Nothing to print — generate the sheet first.'); return; }
  // Print via hidden iframe in the SAME document. Cross-window blob URLs
  // are blocked by Chrome's same-origin policy (since ~2020), so we can't
  // navigate window.open() to a blob URL. iframe sharing the parent's
  // document context CAN load blob URLs.
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:-9999px;bottom:0;width:210mm;height:297mm;border:0';
  iframe.src = url;
  let printed = false;
  const cleanup = () => { try { document.body.removeChild(iframe); } catch (e) {} };
  iframe.onload = () => {
    if (printed) return;
    printed = true;
    // Slight delay so the image is rendered
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        // Fallback to download
        const a = document.createElement('a');
        a.href = url; a.download = 'photo-sheet.jpg';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
      // Keep iframe around long enough for print dialog
      setTimeout(cleanup, 5000);
    }, 200);
  };
  iframe.onerror = () => {
    cleanup();
    alert('Failed to load print preview. Try Download and print manually.');
  };
  document.body.appendChild(iframe);
}
function downloadUrl(url: string, name: string) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

export default function Stitch() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [files, setFiles] = useState<StitchFile[]>([]);
  const [mode, setMode] = useState<Mode>('passport');

  // Aadhaar
  const [layoutUrl, setLayoutUrl] = useState<string | null>(null);
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const autoRan = useRef(false);

  // Passport
  const [activeFile, setActiveFile] = useState<StitchFile | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [fgDataUrl, setFgDataUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState<BgColor>('white');
  const [customColor, setCustomColor] = useState('#ffffff');
  const [preset, setPreset] = useState<SheetPreset>('4x6-8');
  const [spec, setSpec] = useState<PhotoSpec>('standard');
  const [textName, setTextName] = useState('');
  const [textDate, setTextDate] = useState('');
  const [textSig, setTextSig] = useState(false);
  const [textFont, setTextFont] = useState<'bold' | 'normal' | 'italic'>('bold');
  const [bgLoading, setBgLoading] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  useEffect(() => {
    const raw = params.get('files');
    if (!raw) return;
    try {
      const parsed: StitchFile[] = JSON.parse(decodeURIComponent(raw));
      setFiles(parsed);
      if (parsed.length === 1) { setMode('passport'); setActiveFile(parsed[0]); setOriginalUrl(getFullUrl(parsed[0].fileUrl)); }
      else if (parsed.length === 2) { setMode('aadhaar'); }
    } catch {}
  }, [params]);

  useEffect(() => {
    if (mode === 'aadhaar' && files.length === 2 && !autoRan.current && !layoutUrl) {
      autoRan.current = true; runAadhaarLayout(files);
    }
  }, [files, mode]);

  async function runAadhaarLayout(f: StitchFile[]) {
    setLayoutLoading(true); setLayoutError(null);
    try {
      const res = await fetch(`${SOCKET_URL}/api/process`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${useAuthStore.getState().accessToken}` },
        body: JSON.stringify({ fileIds: f.map(x => getDriveId(x.fileUrl) ?? x.id), action: 'aadhaar_layout' }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setLayoutUrl(URL.createObjectURL(await res.blob()));
    } catch (e: any) { setLayoutError(e.message); }
    finally { setLayoutLoading(false); }
  }

  async function removeBackground() {
    if (!activeFile) return;
    setBgLoading(true); setBgError(null); setFgDataUrl(null); setProcessedUrl(null); setSheetUrl(null);
    try {
      const fileId = getDriveId(activeFile.fileUrl);
      if (!fileId) throw new Error('No Drive file ID');
      const res = await fetch(`${SOCKET_URL}/api/remove-bg`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${useAuthStore.getState().accessToken}` },
        body: JSON.stringify({ fileId, fileName: activeFile.fileName }),
      });
      if (!res.ok) throw new Error(await res.text() || `Error ${res.status}`);
      const pngBlob = await res.blob();
      const pngDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(pngBlob);
      });
      setFgDataUrl(pngDataUrl);
      const color = bgColor === 'custom' ? customColor : BG_HEX[bgColor];
      setProcessedUrl(await compositeOnColor(pngDataUrl, color));
    } catch (e: any) { setBgError(e.message); }
    finally { setBgLoading(false); }
  }

  async function applyBgColor(color: string) {
    if (!fgDataUrl) return;
    try { setProcessedUrl(await compositeOnColor(fgDataUrl, color)); setSheetUrl(null); } catch {}
  }

  async function generateSheet() {
    if (!activeFile) return;
    const fileId = getDriveId(activeFile.fileUrl);
    if (!fileId) return;
    setSheetLoading(true);
    setSheetError(null);
    let processedBlob: Blob | undefined;
    if (processedUrl) { const r = await fetch(processedUrl); processedBlob = await r.blob(); }
    try {
      setSheetUrl(await buildSheet(fileId, preset, spec, { name: textName || undefined, date: textDate || undefined, signature: textSig || undefined, font: textFont }, processedBlob));
    }
    catch (e: any) {
      // Axios error body is a Blob (we requested responseType:'blob'). Read it to get the real error.
      let msg = e.message || 'Sheet generation failed';
      if (e.response?.data instanceof Blob) {
        try { const text = await e.response.data.text(); const j = JSON.parse(text); if (j.error) msg = j.error; } catch {}
      }
      if (e.response?.status === 404) msg = 'File not found (404). The photo may have been deleted from Drive — re-pick it from WhatsApp.';
      setSheetError(msg);
    }
    finally { setSheetLoading(false); }
  }

  const previewSrc = sheetUrl ?? processedUrl ?? originalUrl;

  const panelBg = { background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))' } as const;
  const fieldBg = { background: 'hsl(var(--pt-secondary))', borderColor: 'hsl(var(--pt-border))' } as const;
  const marigold = { background: 'linear-gradient(180deg, hsl(27 95% 58%), hsl(22 92% 50%))' } as const;
  const marigoldSoft = { background: 'hsl(var(--pt-marigold) / 0.12)', borderColor: 'hsl(var(--pt-marigold))', color: 'hsl(var(--pt-ink))' } as const;

  return (
    <div className="pt-paper flex flex-col h-full w-full max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="border-b px-4 h-12 flex items-center justify-between shrink-0 rounded-t-xl" style={panelBg}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h1 className="text-sm font-bold pt-display leading-tight truncate" style={{ color: 'hsl(var(--pt-ink))' }}>Photo Processing</h1>
            <p className="text-[10px] pt-muted leading-tight truncate">Background removal · Aadhaar layout</p>
          </div>
          <div className="flex gap-1">
            {(['aadhaar', 'passport'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className="px-3 py-1 rounded-full text-[10px] font-bold uppercase border tracking-wide"
                style={mode === m ? { ...marigold, color: '#fff', borderColor: 'transparent' } : { color: 'hsl(var(--pt-muted))', borderColor: 'hsl(var(--pt-border))' }}>
                {m === 'aadhaar' ? 'Aadhaar' : 'Passport'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {mode === 'aadhaar' && layoutUrl && <>
            <button onClick={() => printUrl(layoutUrl)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-semibold" style={marigold}><Printer size={14} weight="bold" /> Print</button>
            <button onClick={() => downloadUrl(layoutUrl, 'aadhaar_layout.jpg')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs" style={fieldBg}><DownloadSimple size={14} /> <span className="hidden sm:inline">Download</span></button>
          </>}
          {mode === 'passport' && sheetUrl && <>
            <button onClick={() => printUrl(sheetUrl)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-semibold" style={marigold}><Printer size={14} weight="bold" /> <span className="hidden sm:inline">Print Sheet</span><span className="sm:hidden">Print</span></button>
            <button onClick={() => downloadUrl(sheetUrl, `passport_${preset}.jpg`)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs" style={fieldBg}><DownloadSimple size={14} /> <span className="hidden sm:inline">Download</span></button>
          </>}
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 md:overflow-hidden">
        {/* ═══ AADHAAR MODE ═══ */}
        {mode === 'aadhaar' && <>
          <div className="w-full md:w-48 border-b md:border-b-0 md:border-r p-3 flex md:flex-col gap-2 shrink-0" style={panelBg}>
            <p className="pt-label text-[10px] pt-muted w-full">Files ({files.length})</p>
            {files.map((f, i) => (
              <div key={f.id} className="rounded-lg overflow-hidden border flex-1 md:flex-none" style={fieldBg}>
                <div className="h-16 relative">
                  <img src={getFullUrl(f.fileUrl)} alt={i === 0 ? 'Front' : 'Back'} className="w-full h-full object-cover" />
                  <span className="absolute top-1 left-1 text-white text-[8px] font-bold px-1 rounded" style={marigold}>{i === 0 ? 'FRONT' : 'BACK'}</span>
                </div>
              </div>
            ))}
            {files.length === 2 && <button onClick={() => { setLayoutUrl(null); runAadhaarLayout(files); }} disabled={layoutLoading} className="py-2 px-3 text-white text-xs font-semibold rounded-full md:mt-auto disabled:opacity-50 shrink-0" style={marigold}>{layoutLoading ? 'Generating…' : 'Regenerate'}</button>}
          </div>
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto min-h-[40vh]">
            {layoutLoading && <p className="pt-muted animate-pulse">Generating layout…</p>}
            {layoutError && <p className="text-red-500 text-sm">{layoutError} <button onClick={() => runAadhaarLayout(files)} className="ml-2 text-xs border border-red-400/40 px-2 py-0.5 rounded">Retry</button></p>}
            {layoutUrl && <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full"><img src={layoutUrl} alt="Aadhaar layout" className="w-full" /></div>}
            {!layoutUrl && !layoutLoading && !layoutError && <p className="pt-muted text-sm text-center">Select 2 Aadhaar images from WhatsApp → Build Profile → Stitch</p>}
          </div>
        </>}

        {/* ═══ PASSPORT MODE ═══ */}
        {mode === 'passport' && <>
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r flex flex-col shrink-0 md:overflow-y-auto" style={panelBg}>
            {/* Step 1 */}
            <div className="p-3 border-b" style={{ borderColor: 'hsl(var(--pt-border))' }}>
              <p className="pt-label text-[10px] pt-muted mb-2">① Remove Background</p>
              <button onClick={removeBackground} disabled={bgLoading || !activeFile}
                className="w-full py-2 inline-flex items-center justify-center gap-1.5 border text-xs rounded-lg disabled:opacity-40" style={{ ...fieldBg, color: 'hsl(var(--pt-ink))' }}>
                <Sparkle size={14} weight="fill" style={{ color: 'hsl(var(--pt-marigold-deep))' }} /> {bgLoading ? 'Removing…' : 'Remove Background'}
              </button>
              {bgError && <p className="text-[9px] text-red-500 mt-1">{bgError}</p>}
              {fgDataUrl && !bgError && <p className="text-[9px] mt-1 inline-flex items-center gap-1" style={{ color: 'hsl(158 60% 30%)' }}><Check size={11} weight="bold" /> Done</p>}
            </div>
            {/* Step 2 */}
            <div className={`p-3 border-b ${!fgDataUrl ? 'opacity-40 pointer-events-none' : ''}`} style={{ borderColor: 'hsl(var(--pt-border))' }}>
              <p className="pt-label text-[10px] pt-muted mb-2">② Background Color</p>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {([['white', '#ffffff', 'White'], ['lightblue', '#a8c8e8', 'Blue'], ['red', '#c8102e', 'Red']] as [BgColor, string, string][]).map(([key, hex, label]) => (
                  <button key={key} onClick={() => { setBgColor(key); applyBgColor(hex); }}
                    className="h-7 rounded border-2 text-[8px] font-bold"
                    style={{ background: hex, color: key === 'red' ? '#fff' : '#333', borderColor: bgColor === key ? 'hsl(var(--pt-marigold))' : 'hsl(var(--pt-border))' }}>{label}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={customColor} onChange={e => { setCustomColor(e.target.value); setBgColor('custom'); applyBgColor(e.target.value); }} className="w-7 h-7 rounded border cursor-pointer" style={{ borderColor: 'hsl(var(--pt-border))' }} />
                <span className="text-[10px] pt-muted">Custom</span>
              </div>
            </div>
            {/* Step 3 */}
            <div className="p-3 border-b" style={{ borderColor: 'hsl(var(--pt-border))' }}>
              <p className="pt-label text-[10px] pt-muted mb-2">③ Layout</p>
              <div className="flex flex-col gap-1">
                {PRESETS.map(p => (
                  <button key={p.key} onClick={() => { setPreset(p.key); setSheetUrl(null); }}
                    className="w-full py-1.5 px-2 rounded-lg text-left border text-[10px]"
                    style={preset === p.key ? marigoldSoft : { ...fieldBg, color: 'hsl(var(--pt-muted))' }}>
                    <span className="font-bold" style={{ color: 'hsl(var(--pt-ink))' }}>{p.label}</span> <span className="text-[8px] opacity-80">{p.sub}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Photo spec */}
            <div className="p-3 border-b" style={{ borderColor: 'hsl(var(--pt-border))' }}>
              <p className="pt-label text-[10px] pt-muted mb-2">Photo Size</p>
              {SPECS.map(s => (
                <button key={s.key} onClick={() => { setSpec(s.key); setSheetUrl(null); }}
                  className="w-full py-1 px-2 rounded-lg text-left text-[9px] border mb-1"
                  style={spec === s.key ? marigoldSoft : { ...fieldBg, color: 'hsl(var(--pt-muted))' }}>
                  {s.label}
                </button>
              ))}
            </div>
            {/* Text */}
            <div className="p-3 border-b" style={{ borderColor: 'hsl(var(--pt-border))' }}>
              <p className="pt-label text-[10px] pt-muted mb-2">Text (optional)</p>
              <input placeholder="Name" value={textName} onChange={e => setTextName(e.target.value)} className="w-full mb-1 px-2 py-1.5 border rounded-lg text-[10px] outline-none" style={{ ...fieldBg, color: 'hsl(var(--pt-ink))' }} />
              <input placeholder="Date" value={textDate} onChange={e => setTextDate(e.target.value)} className="w-full mb-1.5 px-2 py-1.5 border rounded-lg text-[10px] outline-none" style={{ ...fieldBg, color: 'hsl(var(--pt-ink))' }} />
              <div className="flex gap-1 mb-1.5">
                {(['bold', 'normal', 'italic'] as const).map(f => (
                  <button key={f} onClick={() => setTextFont(f)} className="flex-1 py-1 rounded-lg text-[9px] border"
                    style={{ ...(textFont === f ? marigoldSoft : { ...fieldBg, color: 'hsl(var(--pt-muted))' }), fontWeight: f === 'bold' ? 'bold' : 'normal', fontStyle: f === 'italic' ? 'italic' : 'normal' }}>{f}</button>
                ))}
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={textSig} onChange={e => setTextSig(e.target.checked)} style={{ accentColor: 'hsl(var(--pt-marigold))' }} /><span className="text-[9px] pt-muted">Signature line</span></label>
            </div>
            {/* Generate */}
            <div className="p-3">
              <button onClick={generateSheet} disabled={sheetLoading || (!processedUrl && !originalUrl)}
                className="w-full py-2.5 disabled:opacity-40 text-white text-xs font-bold rounded-full" style={marigold}>
                {sheetLoading ? 'Generating…' : `Generate ${PRESETS.find(p => p.key === preset)?.label}`}
              </button>
              {sheetError && (
                <div className="mt-2 p-2 rounded-lg text-[11px]" style={{ background: 'hsl(0 70% 50% / 0.1)', border: '1px solid hsl(0 70% 50% / 0.3)', color: 'hsl(0 65% 42%)' }}>
                  <div className="font-medium mb-0.5 inline-flex items-center gap-1"><Warning size={12} weight="fill" /> Sheet generation failed</div>
                  <div className="opacity-80">{sheetError}</div>
                  <button onClick={generateSheet} className="mt-1 text-[10px] underline">retry</button>
                </div>
              )}
              {(fgDataUrl || processedUrl) && <button onClick={() => { setFgDataUrl(null); setProcessedUrl(null); setSheetUrl(null); setBgError(null); setSheetError(null); }} className="w-full mt-2 py-1 pt-muted text-[10px] border rounded-lg inline-flex items-center justify-center gap-1" style={{ borderColor: 'hsl(var(--pt-border))' }}><ArrowCounterClockwise size={11} /> Reset</button>}
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto min-h-[40vh]">
            {previewSrc ? (
              <div className="flex flex-col items-center gap-3 max-w-2xl w-full">
                <p className="pt-label text-[10px] pt-muted">{sheetUrl ? 'Print Sheet' : processedUrl ? 'Processed' : 'Original'}</p>
                <div className="rounded-lg shadow-xl overflow-hidden w-full bg-white">
                  <img src={previewSrc} alt="Preview" className="w-full" />
                </div>
              </div>
            ) : (
              <div className="text-center px-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'hsl(var(--pt-marigold) / 0.12)' }}>
                  <Camera size={26} weight="fill" style={{ color: 'hsl(var(--pt-marigold-deep))' }} />
                </div>
                <p className="text-sm pt-muted max-w-xs mx-auto">Select a photo from WhatsApp → Documents → Build Profile with Stitch</p>
                <button onClick={() => navigate('/app/whatsapp')} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 border text-xs rounded-full" style={{ ...fieldBg, color: 'hsl(var(--pt-ink))' }}><ArrowLeft size={13} /> Go to WhatsApp</button>
              </div>
            )}
          </div>
        </>}
      </div>
    </div>
  );
}
