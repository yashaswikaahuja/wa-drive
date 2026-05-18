import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api, { API_URL, SOCKET_URL } from '../../shared/api';

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
  let res: Response;
  if (processedBlob) {
    const form = new FormData();
    form.append('image_file', processedBlob, 'photo.png');
    form.append('preset', preset);
    form.append('spec', spec);
    if (text?.name) form.append('name', text.name);
    if (text?.date) form.append('date', text.date);
    if (text?.signature) form.append('signature', 'true');
    if (text?.font) form.append('font', text.font);
    res = await fetch(`${SOCKET_URL}/api/process/passport-sheet`, { method: 'POST', body: form });
  } else {
    res = await fetch(`${SOCKET_URL}/api/process/passport-sheet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, preset, spec, ...text }),
    });
  }
  if (!res.ok) throw new Error(`Sheet generation failed: ${await res.text()}`);
  return URL.createObjectURL(await res.blob());
}

function printUrl(url: string) { const w = window.open('', '_blank'); if (!w) return; w.document.write(`<html><body style="margin:0"><img src="${url}" style="width:100%" onload="window.print()"/></body></html>`); w.document.close(); }
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    let processedBlob: Blob | undefined;
    if (processedUrl) { const r = await fetch(processedUrl); processedBlob = await r.blob(); }
    try { setSheetUrl(await buildSheet(fileId, preset, spec, { name: textName || undefined, date: textDate || undefined, signature: textSig || undefined, font: textFont }, processedBlob)); }
    catch (e: any) { setBgError(e.message); }
    finally { setSheetLoading(false); }
  }

  const previewSrc = sheetUrl ?? processedUrl ?? originalUrl;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="bg-[#0d1220] border-b border-white/5 px-4 h-12 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-white">Photo Processing</h1>
          <div className="flex gap-1 ml-2">
            {(['aadhaar', 'passport'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 rounded text-[10px] font-bold uppercase ${mode === m ? 'bg-blue-600 text-white' : 'text-gray-400 border border-white/10 hover:text-white'}`}>
                {m === 'aadhaar' ? 'Aadhaar Layout' : 'Passport Photo'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {mode === 'aadhaar' && layoutUrl && <>
            <button onClick={() => printUrl(layoutUrl)} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded">🖨️ Print</button>
            <button onClick={() => downloadUrl(layoutUrl, 'aadhaar_layout.jpg')} className="px-3 py-1.5 border border-white/10 text-gray-400 text-xs rounded">⬇ Download</button>
          </>}
          {mode === 'passport' && sheetUrl && <>
            <button onClick={() => printUrl(sheetUrl)} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded">🖨️ Print Sheet</button>
            <button onClick={() => downloadUrl(sheetUrl, `passport_${preset}.jpg`)} className="px-3 py-1.5 border border-white/10 text-gray-400 text-xs rounded">⬇ Download</button>
          </>}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ═══ AADHAAR MODE ═══ */}
        {mode === 'aadhaar' && <>
          <div className="w-48 bg-[#0d1220] border-r border-white/5 p-3 flex flex-col gap-2 shrink-0">
            <p className="text-[10px] text-gray-500 uppercase">Files ({files.length})</p>
            {files.map((f, i) => (
              <div key={f.id} className="bg-[#1a2236] border border-white/5 rounded overflow-hidden">
                <div className="h-16 relative">
                  <img src={getFullUrl(f.fileUrl)} className="w-full h-full object-cover" />
                  <span className="absolute top-1 left-1 bg-blue-600 text-white text-[8px] font-bold px-1 rounded">{i === 0 ? 'FRONT' : 'BACK'}</span>
                </div>
              </div>
            ))}
            {files.length === 2 && <button onClick={() => { setLayoutUrl(null); runAadhaarLayout(files); }} disabled={layoutLoading} className="py-2 bg-blue-600 text-white text-xs rounded mt-auto disabled:opacity-50">{layoutLoading ? 'Generating…' : 'Regenerate'}</button>}
          </div>
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
            {layoutLoading && <p className="text-gray-400 animate-pulse">Generating layout…</p>}
            {layoutError && <p className="text-red-400 text-sm">{layoutError} <button onClick={() => runAadhaarLayout(files)} className="ml-2 text-xs border border-red-500/30 px-2 py-0.5 rounded">Retry</button></p>}
            {layoutUrl && <div className="bg-white rounded shadow-xl max-w-2xl w-full"><img src={layoutUrl} className="w-full" /></div>}
            {!layoutUrl && !layoutLoading && !layoutError && <p className="text-gray-500 text-sm">Select 2 Aadhaar images from WhatsApp → Build Profile → Stitch</p>}
          </div>
        </>}

        {/* ═══ PASSPORT MODE ═══ */}
        {mode === 'passport' && <>
          <div className="w-56 bg-[#0d1220] border-r border-white/5 flex flex-col shrink-0 overflow-y-auto">
            {/* Step 1 */}
            <div className="p-3 border-b border-white/5">
              <p className="text-[10px] text-gray-500 uppercase mb-2">① Remove Background</p>
              <button onClick={removeBackground} disabled={bgLoading || !activeFile}
                className="w-full py-2 bg-[#1a2236] border border-white/10 text-white text-xs rounded disabled:opacity-40">
                {bgLoading ? 'Removing…' : '✨ Remove Background'}
              </button>
              {bgError && <p className="text-[9px] text-red-400 mt-1">{bgError}</p>}
              {fgDataUrl && !bgError && <p className="text-[9px] text-green-400 mt-1">✓ Done</p>}
            </div>
            {/* Step 2 */}
            <div className={`p-3 border-b border-white/5 ${!fgDataUrl ? 'opacity-40 pointer-events-none' : ''}`}>
              <p className="text-[10px] text-gray-500 uppercase mb-2">② Background Color</p>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {([['white', '#ffffff', 'White'], ['lightblue', '#a8c8e8', 'Blue'], ['red', '#c8102e', 'Red']] as [BgColor, string, string][]).map(([key, hex, label]) => (
                  <button key={key} onClick={() => { setBgColor(key); applyBgColor(hex); }}
                    className={`h-7 rounded border-2 text-[8px] font-bold ${bgColor === key ? 'border-blue-500' : 'border-white/10'}`}
                    style={{ background: hex, color: key === 'red' ? '#fff' : '#333' }}>{label}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={customColor} onChange={e => { setCustomColor(e.target.value); setBgColor('custom'); applyBgColor(e.target.value); }} className="w-7 h-7 rounded border border-white/10 cursor-pointer" />
                <span className="text-[10px] text-gray-500">Custom</span>
              </div>
            </div>
            {/* Step 3 */}
            <div className="p-3 border-b border-white/5">
              <p className="text-[10px] text-gray-500 uppercase mb-2">③ Layout</p>
              <div className="flex flex-col gap-1">
                {PRESETS.map(p => (
                  <button key={p.key} onClick={() => { setPreset(p.key); setSheetUrl(null); }}
                    className={`w-full py-1.5 px-2 rounded text-left border text-[10px] ${preset === p.key ? 'bg-blue-600 border-blue-600 text-white' : 'border-white/10 text-gray-400 hover:text-white'}`}>
                    <span className="font-bold">{p.label}</span> <span className="text-[8px] opacity-70">{p.sub}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Photo spec */}
            <div className="p-3 border-b border-white/5">
              <p className="text-[10px] text-gray-500 uppercase mb-2">Photo Size</p>
              {SPECS.map(s => (
                <button key={s.key} onClick={() => { setSpec(s.key); setSheetUrl(null); }}
                  className={`w-full py-1 px-2 rounded text-left text-[9px] border mb-1 ${spec === s.key ? 'bg-blue-600 border-blue-600 text-white' : 'border-white/10 text-gray-400'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            {/* Text */}
            <div className="p-3 border-b border-white/5">
              <p className="text-[10px] text-gray-500 uppercase mb-2">Text (optional)</p>
              <input placeholder="Name" value={textName} onChange={e => setTextName(e.target.value)} className="w-full mb-1 px-2 py-1.5 bg-[#1a2236] border border-white/10 rounded text-[10px] text-white placeholder-gray-600 outline-none" />
              <input placeholder="Date" value={textDate} onChange={e => setTextDate(e.target.value)} className="w-full mb-1.5 px-2 py-1.5 bg-[#1a2236] border border-white/10 rounded text-[10px] text-white placeholder-gray-600 outline-none" />
              <div className="flex gap-1 mb-1.5">
                {(['bold', 'normal', 'italic'] as const).map(f => (
                  <button key={f} onClick={() => setTextFont(f)} className={`flex-1 py-1 rounded text-[9px] border ${textFont === f ? 'bg-blue-600 border-blue-600 text-white' : 'border-white/10 text-gray-400'}`} style={{ fontWeight: f === 'bold' ? 'bold' : 'normal', fontStyle: f === 'italic' ? 'italic' : 'normal' }}>{f}</button>
                ))}
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={textSig} onChange={e => setTextSig(e.target.checked)} className="accent-blue-500" /><span className="text-[9px] text-gray-400">Signature line</span></label>
            </div>
            {/* Generate */}
            <div className="p-3">
              <button onClick={generateSheet} disabled={sheetLoading || (!processedUrl && !originalUrl)}
                className="w-full py-2.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-bold rounded">
                {sheetLoading ? 'Generating…' : `🖼️ Generate ${PRESETS.find(p => p.key === preset)?.label}`}
              </button>
              {(fgDataUrl || processedUrl) && <button onClick={() => { setFgDataUrl(null); setProcessedUrl(null); setSheetUrl(null); setBgError(null); }} className="w-full mt-2 py-1 text-gray-500 text-[10px] border border-white/5 rounded">↺ Reset</button>}
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
            {previewSrc ? (
              <div className="flex flex-col items-center gap-3 max-w-2xl w-full">
                <p className="text-[10px] text-gray-500 uppercase">{sheetUrl ? 'Print Sheet' : processedUrl ? 'Processed' : 'Original'}</p>
                <div className={`rounded shadow-xl overflow-hidden w-full ${sheetUrl || processedUrl ? 'bg-white' : 'bg-[#1a2236]'}`}>
                  <img src={previewSrc} className="w-full" />
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500">
                <p className="text-4xl mb-3">📷</p>
                <p className="text-sm">Select a photo from WhatsApp → Select Documents → Build Profile with Stitch</p>
                <button onClick={() => navigate('/app/whatsapp')} className="mt-3 px-4 py-2 border border-white/10 text-xs rounded hover:text-white">← Go to WhatsApp</button>
              </div>
            )}
          </div>
        </>}
      </div>
    </div>
  );
}
