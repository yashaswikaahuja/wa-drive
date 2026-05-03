import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL, BACKEND_BASE_URL } from '../utils/helpers';

interface StitchFile { id: string; fileName: string; fileUrl: string; customerName: string; }

type Mode = 'aadhaar' | 'passport';
type BgColor = 'white' | 'lightblue' | 'red' | 'custom';
type Sheet = '4x6' | 'a4';

const BG_HEX: Record<BgColor, string> = {
  white: '#ffffff', lightblue: '#a8c8e8', red: '#c8102e', custom: '#ffffff',
};

function getDriveId(url: string) {
  return url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ?? null;
}

function getFullUrl(url: string) {
  const id = getDriveId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : url;
}

/** Composite a foreground dataURL onto a solid color background — safe because fgDataUrl is always a local blob: URL */
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

/** Generate passport sheet via backend Sharp — avoids CORS/tainted canvas entirely */
async function buildSheet(fileId: string, sheet: Sheet, count: number): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/process/passport-sheet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, sheet, count, size: 'passport' }),
  });
  if (!res.ok) throw new Error(`Sheet generation failed: ${await res.text()}`);
  return URL.createObjectURL(await res.blob());
}

function printDataUrl(dataUrl: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<html><body style="margin:0"><img src="${dataUrl}" style="width:100%" onload="window.print()"/></body></html>`);
  win.document.close();
}

function downloadDataUrl(dataUrl: string, name: string) {
  const a = document.createElement('a'); a.href = dataUrl; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

export default function FileStitchPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [files, setFiles] = useState<StitchFile[]>([]);
  const [mode, setMode] = useState<Mode>('aadhaar');

  // ── Aadhaar state ──────────────────────────────────────────────────────────
  const [layoutUrl, setLayoutUrl] = useState<string | null>(null);
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const autoRan = useRef(false);

  // ── Passport state ─────────────────────────────────────────────────────────
  const [activeFile, setActiveFile] = useState<StitchFile | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);   // full-res original
  const [fgDataUrl, setFgDataUrl] = useState<string | null>(null);       // after bg removal (PNG, transparent)
  const [processedUrl, setProcessedUrl] = useState<string | null>(null); // fg + bg color applied
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  const [bgColor, setBgColor] = useState<BgColor>('white');
  const [customColor, setCustomColor] = useState('#ffffff');
  const [sheet, setSheet] = useState<Sheet>('4x6');

  const [bgLoading, setBgLoading] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  // ── Init from URL params ───────────────────────────────────────────────────
  useEffect(() => {
    const raw = params.get('files');
    if (!raw) return;
    try {
      const parsed: StitchFile[] = JSON.parse(decodeURIComponent(raw));
      setFiles(parsed);
      if (parsed.length === 1) {
        setMode('passport');
        setActiveFile(parsed[0]);
        setOriginalUrl(getFullUrl(parsed[0].fileUrl));
      } else {
        setMode('aadhaar');
      }
    } catch { /* ignore */ }
  }, [params]);

  useEffect(() => {
    if (mode === 'aadhaar' && files.length === 2 && !autoRan.current && !layoutUrl) {
      autoRan.current = true;
      runAadhaarLayout(files);
    }
  }, [files, mode]);

  // ── Aadhaar layout ─────────────────────────────────────────────────────────
  async function runAadhaarLayout(filesToProcess: StitchFile[]) {
    setLayoutLoading(true); setLayoutError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds: filesToProcess.map(f => getDriveId(f.fileUrl) ?? f.id),
          action: 'aadhaar_layout',
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const blob = await res.blob();
      setLayoutUrl(URL.createObjectURL(blob));
    } catch (e) {
      setLayoutError(`Layout failed: ${(e as Error).message}. Ensure Drive is connected.`);
    } finally { setLayoutLoading(false); }
  }

  // ── Background removal (via hub proxy) ────────────────────────────────────
  async function removeBackground() {
    if (!activeFile) return;
    setBgLoading(true); setBgError(null); setFgDataUrl(null); setProcessedUrl(null); setSheetUrl(null);
    try {
      const fileId = getDriveId(activeFile.fileUrl);
      if (!fileId) throw new Error('No Drive file ID found');

      // Send fileId as JSON — backend downloads from Drive server-side (no CORS)
      const res = await fetch(`${BACKEND_BASE_URL}/api/remove-bg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, fileName: activeFile.fileName }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `API error ${res.status}`);
      }
      const pngBlob = await res.blob();
      // Convert blob to dataURL so canvas compositing works (same-origin blob: URL)
      const pngDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(pngBlob);
      });
      setFgDataUrl(pngDataUrl);
      const color = bgColor === 'custom' ? customColor : BG_HEX[bgColor];
      const withBg = await compositeOnColor(pngDataUrl, color);
      setProcessedUrl(withBg);
    } catch (e) {
      setBgError(`Background removal failed: ${(e as Error).message}`);
    } finally { setBgLoading(false); }
  }

  /** Re-apply a new background color to the already-removed foreground */
  async function applyBgColor(color: string) {
    if (!fgDataUrl) return;
    try {
      const withBg = await compositeOnColor(fgDataUrl, color);
      setProcessedUrl(withBg);
      setSheetUrl(null);
    } catch { /* ignore */ }
  }

  async function generatePassportSheet() {
    if (!activeFile) return;
    const fileId = getDriveId(activeFile.fileUrl);
    if (!fileId) { setBgError('No Drive file ID found'); return; }
    setSheetLoading(true);
    try { setSheetUrl(await buildSheet(fileId, sheet, sheet === '4x6' ? 6 : 24)); }
    catch (e) { setBgError((e as Error).message); }
    finally { setSheetLoading(false); }
  }

  function resetToOriginal() {
    setFgDataUrl(null); setProcessedUrl(null); setSheetUrl(null); setBgError(null);
  }

  const previewSrc = sheetUrl ?? processedUrl ?? originalUrl;
  const photoCount = sheet === '4x6' ? 6 : 24;

  return (
    <div className="min-h-screen bg-[#0c1322] text-[#dce2f7] font-['Inter',sans-serif] flex flex-col">

      {/* ── Header ── */}
      <div className="bg-[#1e293b] border-b border-[#334155] px-4 h-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-[#94a3b8] hover:text-white">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <span className="text-sm font-bold uppercase tracking-wider">Photo Processing</span>
          <div className="flex gap-1 ml-2">
            {(['aadhaar', 'passport'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors
                  ${mode === m ? 'bg-blue-600 text-white' : 'text-[#94a3b8] hover:text-white border border-[#334155]'}`}>
                {m === 'aadhaar' ? 'Aadhaar Layout' : 'Passport Photo'}
              </button>
            ))}
          </div>
        </div>
        {/* Header actions */}
        <div className="flex gap-2">
          {mode === 'aadhaar' && layoutUrl && (
            <>
              <button onClick={() => printDataUrl(layoutUrl)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">print</span> Print Now
              </button>
              <button onClick={() => downloadDataUrl(layoutUrl, 'aadhaar_layout.jpg')}
                className="px-3 py-1.5 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">download</span>
              </button>
            </>
          )}
          {mode === 'passport' && sheetUrl && (
            <>
              <button onClick={() => printDataUrl(sheetUrl)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">print</span> Print Sheet
              </button>
              <button onClick={() => downloadDataUrl(sheetUrl, `passport_${sheet}.jpg`)}
                className="px-3 py-1.5 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">download</span>
              </button>
            </>
          )}
          {mode === 'passport' && processedUrl && !sheetUrl && (
            <button onClick={() => printDataUrl(processedUrl)}
              className="px-3 py-1.5 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">print</span> Print Photo
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ══════════════════ AADHAAR MODE ══════════════════ */}
        {mode === 'aadhaar' && (
          <>
            {/* Left: file list */}
            <div className="w-52 bg-[#141b2b] border-r border-[#334155] flex flex-col shrink-0 p-2 gap-2">
              <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider px-1">Files ({files.length})</p>
              {files.map((f, i) => (
                <div key={f.id} className="bg-[#1e293b] border border-[#334155] rounded overflow-hidden">
                  <div className="h-20 relative">
                    <img src={getFullUrl(f.fileUrl)} alt={f.fileName} className="w-full h-full object-cover" />
                    <div className="absolute top-1 left-1 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                      {i === 0 ? 'FRONT' : 'BACK'}
                    </div>
                  </div>
                  <p className="text-[9px] text-[#94a3b8] truncate px-1.5 py-1">{f.fileName}</p>
                </div>
              ))}
              {files.length === 2 && (
                <button onClick={() => { setLayoutUrl(null); runAadhaarLayout(files); }} disabled={layoutLoading}
                  className="w-full py-2 bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded hover:bg-blue-500 mt-auto">
                  {layoutLoading ? 'Generating…' : 'Regenerate'}
                </button>
              )}
            </div>

            {/* Center: preview */}
            <div className="flex-1 flex items-center justify-center bg-[#0c1322] p-6 overflow-auto">
              {layoutLoading && (
                <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
                  <span className="material-symbols-outlined text-[48px] animate-spin">sync</span>
                  <p>Generating layout…</p>
                </div>
              )}
              {layoutError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded p-4 text-red-400 text-sm max-w-sm text-center">
                  {layoutError}
                  <br />
                  <button onClick={() => runAadhaarLayout(files)} className="mt-2 px-3 py-1 border border-red-500/50 rounded text-xs">
                    Retry
                  </button>
                </div>
              )}
              {layoutUrl && !layoutLoading && (
                <div className="flex flex-col items-center gap-3 max-w-2xl w-full">
                  <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider">A4 Landscape — Front · Back</p>
                  <div className="bg-white rounded shadow-2xl overflow-hidden w-full">
                    <img src={layoutUrl} alt="Aadhaar Layout" className="w-full h-auto" />
                  </div>
                </div>
              )}
              {!layoutLoading && !layoutUrl && !layoutError && (
                <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
                  <span className="material-symbols-outlined text-[48px]">layers</span>
                  <p className="text-sm">Select 2 Aadhaar images from inbox</p>
                  <button onClick={() => navigate('/')} className="px-4 py-2 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded">
                    ← Back to Inbox
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════════════ PASSPORT MODE ══════════════════ */}
        {mode === 'passport' && (
          <>
            {/* Left: controls */}
            <div className="w-60 bg-[#141b2b] border-r border-[#334155] flex flex-col shrink-0 overflow-y-auto">

              {/* Step 1: Remove BG */}
              <div className="p-3 border-b border-[#334155]">
                <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2 flex items-center gap-1">
                  <span className="bg-blue-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">1</span>
                  Remove Background
                </p>
                <button onClick={removeBackground} disabled={bgLoading || !activeFile}
                  className="w-full py-2.5 bg-[#1e293b] border border-[#334155] disabled:opacity-40 text-[#dce2f7] text-xs font-semibold rounded hover:bg-[#334155] transition-colors flex items-center justify-center gap-1.5">
                  {bgLoading
                    ? <><span className="material-symbols-outlined text-[14px] animate-spin">sync</span>Removing…</>
                    : <><span className="material-symbols-outlined text-[14px]">auto_fix_high</span>Remove Background</>}
                </button>
                {bgError && (
                  <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded">
                    <p className="text-[9px] text-red-400 mb-1">{bgError}</p>
                    <button onClick={removeBackground} className="text-[9px] text-red-400 border border-red-500/40 px-2 py-0.5 rounded hover:bg-red-500/10">
                      Retry
                    </button>
                  </div>
                )}
                {fgDataUrl && !bgError && <p className="text-[9px] text-green-400 mt-1.5 flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">check_circle</span>Background removed</p>}
              </div>

              {/* Step 2: Background color */}
              <div className={`p-3 border-b border-[#334155] transition-opacity ${!fgDataUrl ? 'opacity-40 pointer-events-none' : ''}`}>
                <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2 flex items-center gap-1">
                  <span className="bg-blue-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">2</span>
                  Background Color
                </p>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {([['white','#ffffff','White'],['lightblue','#a8c8e8','Light Blue'],['red','#c8102e','Red']] as [BgColor,string,string][]).map(([key, hex, label]) => (
                    <button key={key} onClick={() => { setBgColor(key); applyBgColor(hex); }}
                      className={`h-8 rounded border-2 text-[8px] font-bold transition-colors flex items-end justify-center pb-0.5
                        ${bgColor === key ? 'border-blue-500' : 'border-[#334155]'}`}
                      style={{ background: hex, color: key === 'white' || key === 'lightblue' ? '#333' : '#fff' }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="color" value={customColor}
                    onChange={e => { setCustomColor(e.target.value); setBgColor('custom'); applyBgColor(e.target.value); }}
                    className="w-8 h-8 rounded border border-[#334155] cursor-pointer bg-transparent p-0.5" />
                  <span className="text-[10px] text-[#94a3b8]">Custom color</span>
                  {bgColor === 'custom' && <span className="text-[9px] text-blue-400">✓ active</span>}
                </div>
              </div>

              {/* Step 3: Sheet size */}
              <div className="p-3 border-b border-[#334155]">
                <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2 flex items-center gap-1">
                  <span className="bg-blue-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">3</span>
                  Sheet Size
                </p>
                <div className="flex gap-2">
                  {(['4x6', 'a4'] as Sheet[]).map(s => (
                    <button key={s} onClick={() => { setSheet(s); setSheetUrl(null); }}
                      className={`flex-1 py-2 rounded text-[10px] font-bold uppercase border transition-colors
                        ${sheet === s ? 'bg-blue-600 border-blue-600 text-white' : 'border-[#334155] text-[#94a3b8] hover:text-white'}`}>
                      {s === '4x6' ? '4×6 · 6 photos' : 'A4 · 24 photos'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 4: Generate */}
              <div className="p-3 border-b border-[#334155]">
                <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2 flex items-center gap-1">
                  <span className="bg-blue-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">4</span>
                  Generate Sheet
                </p>
                <button onClick={generatePassportSheet} disabled={sheetLoading || (!processedUrl && !originalUrl)}
                  className="w-full py-2.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-colors">
                  {sheetLoading
                    ? <><span className="material-symbols-outlined text-[14px] animate-spin">sync</span>Generating…</>
                    : <><span className="material-symbols-outlined text-[14px]">grid_on</span>Generate {photoCount} Photos</>}
                </button>
                {sheetUrl && (
                  <div className="mt-2 flex gap-1.5">
                    <button onClick={() => printDataUrl(sheetUrl)}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">print</span> Print
                    </button>
                    <button onClick={() => downloadDataUrl(sheetUrl, `passport_${sheet}.jpg`)}
                      className="flex-1 py-2 border border-[#334155] text-[#94a3b8] hover:text-white text-[10px] rounded flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">download</span> Save
                    </button>
                  </div>
                )}
              </div>

              {/* Reset */}
              {(fgDataUrl || processedUrl) && (
                <div className="p-3">
                  <button onClick={resetToOriginal}
                    className="w-full py-1.5 text-[#94a3b8] hover:text-white text-[10px] border border-[#334155] rounded transition-colors">
                    ↺ Reset to Original
                  </button>
                </div>
              )}
            </div>

            {/* Center: preview */}
            <div className="flex-1 flex flex-col items-center justify-center bg-[#0c1322] p-6 overflow-auto gap-3">
              {previewSrc ? (
                <>
                  <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider">
                    {sheetUrl ? `${sheet.toUpperCase()} Sheet · ${photoCount} photos` : processedUrl ? 'Processed Photo' : 'Original Photo'}
                  </p>
                  <div className={`rounded shadow-2xl overflow-hidden max-w-2xl w-full ${sheetUrl || processedUrl ? 'bg-white' : 'bg-[#2e3545]'}`}>
                    <img src={previewSrc} alt="Preview" className="w-full h-auto" />
                  </div>
                  {!sheetUrl && (
                    <p className="text-[10px] text-[#475569]">
                      {processedUrl ? 'Background removed — choose a color above, then generate sheet' : 'Click "Remove Background" to start'}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
                  <span className="material-symbols-outlined text-[48px]">portrait</span>
                  <p className="text-sm">Select a photo from inbox</p>
                  <button onClick={() => navigate('/')} className="px-4 py-2 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded">
                    ← Back to Inbox
                  </button>
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
