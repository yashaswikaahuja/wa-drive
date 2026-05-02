import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../utils/helpers';

interface StitchFile { id: string; fileName: string; fileUrl: string; customerName: string; }

type Mode = 'aadhaar' | 'passport';
type BgColor = 'white' | 'lightblue' | 'red' | 'custom';
type Sheet = '4x6' | 'a4';

const BG_COLORS: Record<BgColor, string> = {
  white: '#ffffff', lightblue: '#a8c8e8', red: '#c8102e', custom: '#ffffff',
};

function getDriveId(url: string) {
  return url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ?? null;
}

function getFullUrl(url: string) {
  const id = getDriveId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : url;
}

// Fetch image as blob from Drive
async function fetchImageBlob(url: string): Promise<Blob> {
  const id = getDriveId(url);
  const fetchUrl = id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
  const res = await fetch(fetchUrl);
  if (!res.ok) throw new Error('Failed to fetch image');
  return res.blob();
}

// Apply background color to transparent PNG using canvas
async function applyBackground(pngDataUrl: string, color: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = reject;
    img.src = pngDataUrl;
  });
}

// Generate passport photo sheet on canvas
async function generateSheet(imageDataUrl: string, sheet: Sheet): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Sheet dimensions in px at 300dpi
      const configs = {
        '4x6': { w: 1800, h: 1200, cols: 3, rows: 2, photoW: 525, photoH: 675, margin: 50 },
        'a4':  { w: 2480, h: 3508, cols: 4, rows: 6, photoW: 525, photoH: 675, margin: 60 },
      };
      const c = configs[sheet];
      const canvas = document.createElement('canvas');
      canvas.width = c.w; canvas.height = c.h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.w, c.h);

      const totalW = c.cols * c.photoW + (c.cols + 1) * c.margin;
      const totalH = c.rows * c.photoH + (c.rows + 1) * c.margin;
      const offsetX = (c.w - totalW) / 2;
      const offsetY = (c.h - totalH) / 2;

      for (let row = 0; row < c.rows; row++) {
        for (let col = 0; col < c.cols; col++) {
          const x = offsetX + c.margin + col * (c.photoW + c.margin);
          const y = offsetY + c.margin + row * (c.photoH + c.margin);
          ctx.drawImage(img, x, y, c.photoW, c.photoH);
        }
      }
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}

export default function FileStitchPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [files, setFiles] = useState<StitchFile[]>([]);
  const [mode, setMode] = useState<Mode>('aadhaar');

  // Aadhaar layout state
  const [layoutUrl, setLayoutUrl] = useState<string | null>(null);
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [autoApplied, setAutoApplied] = useState(false);

  // Passport photo state
  const [activeFile, setActiveFile] = useState<StitchFile | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState<BgColor>('white');
  const [customColor, setCustomColor] = useState('#ffffff');
  const [sheet, setSheet] = useState<Sheet>('4x6');
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [bgLoading, setBgLoading] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  useEffect(() => {
    const raw = params.get('files');
    if (!raw) return;
    try {
      const parsed: StitchFile[] = JSON.parse(decodeURIComponent(raw));
      setFiles(parsed);
      if (parsed.length === 2) { setMode('aadhaar'); }
      else if (parsed.length === 1) { setMode('passport'); setActiveFile(parsed[0]); setOriginalUrl(getFullUrl(parsed[0].fileUrl)); }
    } catch { /* ignore */ }
  }, [params]);

  useEffect(() => {
    if (mode === 'aadhaar' && files.length === 2 && !autoApplied && !layoutUrl) {
      setAutoApplied(true);
      applyAadhaarLayout(files);
    }
  }, [files, mode]);

  async function applyAadhaarLayout(filesToProcess: StitchFile[]) {
    setLayoutLoading(true); setLayoutError(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/process`, {
        fileIds: filesToProcess.map(f => getDriveId(f.fileUrl) ?? f.id),
        action: 'aadhaar_layout',
      }, { responseType: 'blob' });
      setLayoutUrl(URL.createObjectURL(res.data));
    } catch { setLayoutError('Layout failed. Ensure Drive is connected.'); }
    finally { setLayoutLoading(false); }
  }

  async function removeBackground() {
    if (!activeFile) return;
    setBgLoading(true); setBgError(null); setProcessedUrl(null); setSheetUrl(null);
    try {
      const blob = await fetchImageBlob(activeFile.fileUrl);
      const formData = new FormData();
      formData.append('image_file', blob, activeFile.fileName);
      formData.append('size', 'auto');
      const res = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': 'YOUR_REMOVE_BG_KEY' }, // user must set this
        body: formData,
      });
      if (!res.ok) throw new Error(`remove.bg: ${res.status}`);
      const resultBlob = await res.blob();
      const pngUrl = URL.createObjectURL(resultBlob);
      const color = bgColor === 'custom' ? customColor : BG_COLORS[bgColor];
      const withBg = await applyBackground(pngUrl, color);
      setProcessedUrl(withBg);
    } catch (e) {
      setBgError(`Background removal failed: ${(e as Error).message}`);
    } finally { setBgLoading(false); }
  }

  async function changeBackground(color: string) {
    if (!processedUrl) return;
    try {
      const withBg = await applyBackground(processedUrl, color);
      setProcessedUrl(withBg);
      setSheetUrl(null);
    } catch { /* ignore */ }
  }

  async function generatePassportSheet() {
    const src = processedUrl ?? originalUrl;
    if (!src) return;
    setSheetLoading(true);
    try {
      const url = await generateSheet(src, sheet);
      setSheetUrl(url);
    } catch { /* ignore */ }
    finally { setSheetLoading(false); }
  }

  function handlePrint(url: string) {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><body style="margin:0"><img src="${url}" style="width:100%" onload="window.print()"/></body></html>`);
    win.document.close();
  }

  function handleDownload(url: string, name: string) {
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  const previewSrc = sheetUrl ?? processedUrl ?? originalUrl;

  return (
    <div className="min-h-screen bg-[#0c1322] text-[#dce2f7] font-['Inter',sans-serif] flex flex-col">
      {/* Header */}
      <div className="bg-[#1e293b] border-b border-[#334155] px-4 h-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-[#94a3b8] hover:text-white">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <span className="text-sm font-bold uppercase tracking-wider">File Stitch Pro</span>
          {/* Mode tabs */}
          <div className="flex gap-1 ml-2">
            {(['aadhaar', 'passport'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'text-[#94a3b8] hover:text-white border border-[#334155]'}`}>
                {m === 'aadhaar' ? 'Aadhaar Layout' : 'Passport Photo'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {mode === 'aadhaar' && layoutUrl && (
            <>
              <button onClick={() => handlePrint(layoutUrl)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">print</span> Print Now
              </button>
              <button onClick={() => handleDownload(layoutUrl, 'aadhaar_layout.jpg')} className="px-3 py-1.5 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">download</span>
              </button>
            </>
          )}
          {mode === 'passport' && sheetUrl && (
            <>
              <button onClick={() => handlePrint(sheetUrl)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">print</span> Print Sheet
              </button>
              <button onClick={() => handleDownload(sheetUrl, `passport_${sheet}.jpg`)} className="px-3 py-1.5 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">download</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── AADHAAR MODE ── */}
        {mode === 'aadhaar' && (
          <>
            {/* Left: file list */}
            <div className="w-52 bg-[#141b2b] border-r border-[#334155] flex flex-col shrink-0 p-2 gap-2">
              <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider px-1">Files ({files.length})</p>
              {files.map((f, i) => (
                <div key={f.id} className="bg-[#1e293b] border border-[#334155] rounded overflow-hidden">
                  <div className="h-20 relative"><img src={getFullUrl(f.fileUrl)} alt={f.fileName} className="w-full h-full object-cover" />
                    <div className="absolute top-1 left-1 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">{i === 0 ? 'FRONT' : 'BACK'}</div>
                  </div>
                  <p className="text-[9px] text-[#94a3b8] truncate px-1.5 py-1">{f.fileName}</p>
                </div>
              ))}
              {files.length === 2 && (
                <button onClick={() => { setLayoutUrl(null); setAutoApplied(false); applyAadhaarLayout(files); }} disabled={layoutLoading}
                  className="w-full py-2 bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded hover:bg-blue-500 mt-auto">
                  {layoutLoading ? 'Generating…' : 'Regenerate'}
                </button>
              )}
            </div>
            {/* Center: preview */}
            <div className="flex-1 flex items-center justify-center bg-[#0c1322] p-6 overflow-auto">
              {layoutLoading && <div className="flex flex-col items-center gap-3 text-[#94a3b8]"><span className="material-symbols-outlined text-[48px] animate-spin">sync</span><p>Generating layout…</p></div>}
              {layoutError && <div className="bg-red-500/10 border border-red-500/30 rounded p-4 text-red-400 text-sm max-w-sm text-center">{layoutError}<br/><button onClick={() => applyAadhaarLayout(files)} className="mt-2 px-3 py-1 border border-red-500/50 rounded text-xs">Retry</button></div>}
              {layoutUrl && !layoutLoading && (
                <div className="flex flex-col items-center gap-3 max-w-2xl w-full">
                  <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider">A4 Landscape — Front (left) · Back (right)</p>
                  <div className="bg-white rounded shadow-2xl overflow-hidden w-full"><img src={layoutUrl} alt="Layout" className="w-full h-auto" /></div>
                </div>
              )}
              {!layoutLoading && !layoutUrl && !layoutError && files.length !== 2 && (
                <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
                  <span className="material-symbols-outlined text-[48px]">layers</span>
                  <p className="text-sm">Select 2 files from inbox</p>
                  <button onClick={() => navigate('/')} className="px-4 py-2 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded">← Back to Inbox</button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── PASSPORT MODE ── */}
        {mode === 'passport' && (
          <>
            {/* Left: controls */}
            <div className="w-56 bg-[#141b2b] border-r border-[#334155] flex flex-col shrink-0">
              <div className="p-3 border-b border-[#334155]">
                <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2">Background Removal</p>
                <button onClick={removeBackground} disabled={bgLoading || !activeFile}
                  className="w-full py-2 bg-[#1e293b] border border-[#334155] disabled:opacity-40 text-[#dce2f7] text-xs font-semibold rounded hover:bg-[#334155] transition-colors flex items-center justify-center gap-1.5">
                  {bgLoading ? <><span className="material-symbols-outlined text-[14px] animate-spin">sync</span>Removing…</> : <><span className="material-symbols-outlined text-[14px]">auto_fix_high</span>Remove Background</>}
                </button>
                {bgError && <p className="text-[9px] text-red-400 mt-1">{bgError}</p>}
                {processedUrl && <p className="text-[9px] text-green-400 mt-1">✓ Background removed</p>}
              </div>

              {processedUrl && (
                <div className="p-3 border-b border-[#334155]">
                  <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2">Background Color</p>
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {(Object.entries(BG_COLORS) as [BgColor, string][]).filter(([k]) => k !== 'custom').map(([key, color]) => (
                      <button key={key} onClick={() => { setBgColor(key); changeBackground(color); }}
                        className={`h-7 rounded border-2 transition-colors ${bgColor === key ? 'border-blue-500' : 'border-[#334155]'}`}
                        style={{ background: color }} title={key} />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="color" value={customColor} onChange={e => { setCustomColor(e.target.value); setBgColor('custom'); changeBackground(e.target.value); }}
                      className="w-7 h-7 rounded border border-[#334155] cursor-pointer bg-transparent" />
                    <span className="text-[10px] text-[#94a3b8]">Custom color</span>
                  </div>
                </div>
              )}

              <div className="p-3 border-b border-[#334155]">
                <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2">Sheet Size</p>
                <div className="flex gap-2">
                  {(['4x6', 'a4'] as Sheet[]).map(s => (
                    <button key={s} onClick={() => { setSheet(s); setSheetUrl(null); }}
                      className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase border transition-colors ${sheet === s ? 'bg-blue-600 border-blue-600 text-white' : 'border-[#334155] text-[#94a3b8] hover:text-white'}`}>
                      {s === '4x6' ? '4×6 (6 photos)' : 'A4 (24 photos)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3">
                <button onClick={generatePassportSheet} disabled={sheetLoading || (!processedUrl && !originalUrl)}
                  className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-colors">
                  {sheetLoading ? <><span className="material-symbols-outlined text-[14px] animate-spin">sync</span>Generating…</> : <><span className="material-symbols-outlined text-[14px]">grid_on</span>Generate Sheet</>}
                </button>
                {processedUrl && (
                  <button onClick={() => { setProcessedUrl(null); setSheetUrl(null); setBgError(null); }}
                    className="w-full mt-2 py-1 text-[#94a3b8] hover:text-white text-[10px] border border-[#334155] rounded transition-colors">
                    Reset to Original
                  </button>
                )}
              </div>
            </div>

            {/* Center: preview */}
            <div className="flex-1 flex items-center justify-center bg-[#0c1322] p-6 overflow-auto">
              {previewSrc ? (
                <div className="flex flex-col items-center gap-3 max-w-2xl w-full">
                  <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider">
                    {sheetUrl ? `${sheet.toUpperCase()} Sheet Preview` : processedUrl ? 'Processed Photo' : 'Original Photo'}
                  </p>
                  <div className={`rounded shadow-2xl overflow-hidden w-full ${sheetUrl ? 'bg-white' : 'bg-[#2e3545]'}`}>
                    <img src={previewSrc} alt="Preview" className="w-full h-auto" />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
                  <span className="material-symbols-outlined text-[48px]">portrait</span>
                  <p className="text-sm">Select a photo from inbox</p>
                  <button onClick={() => navigate('/')} className="px-4 py-2 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded">← Back to Inbox</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
