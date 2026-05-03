import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL, BACKEND_BASE_URL } from '../utils/helpers';
const PRESETS = [
    { key: '4x6-8', label: '8 Photos', sub: '4×6 · Standard (Passport/PAN/Aadhaar)' },
    { key: '4x6-4', label: '4 Photos', sub: '4×6 · Large size' },
    { key: '4x6-12', label: '12 Photos', sub: '4×6 · Small (School/College)' },
    { key: 'a4-24', label: '24 Photos', sub: 'A4 · Bulk (Job applications)' },
    { key: 'single', label: '1 Photo', sub: '4×6 · Full size (ID card)' },
];
const SPECS = [
    { key: 'standard', label: '35×45mm — Passport / PAN / Aadhaar / Voter ID' },
    { key: 'small', label: '25×30mm — School / College admission' },
    { key: 'stamp', label: '20×25mm — Stamp size (some govt forms)' },
];
const BG_HEX = {
    white: '#ffffff', lightblue: '#a8c8e8', red: '#c8102e', custom: '#ffffff',
};
function getDriveId(url) {
    return url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ?? null;
}
function getFullUrl(url) {
    const id = getDriveId(url);
    return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : url;
}
/** Composite a foreground dataURL onto a solid color background — safe because fgDataUrl is always a local blob: URL */
async function compositeOnColor(fgDataUrl, color) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d');
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
async function buildSheet(fileId, preset, spec) {
    const res = await fetch(`${API_BASE_URL}/process/passport-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, preset, spec }),
    });
    if (!res.ok)
        throw new Error(`Sheet generation failed: ${await res.text()}`);
    return URL.createObjectURL(await res.blob());
}
function printDataUrl(dataUrl) {
    const win = window.open('', '_blank');
    if (!win)
        return;
    win.document.write(`<html><body style="margin:0"><img src="${dataUrl}" style="width:100%" onload="window.print()"/></body></html>`);
    win.document.close();
}
function downloadDataUrl(dataUrl, name) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
export default function FileStitchPage() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const [files, setFiles] = useState([]);
    const [mode, setMode] = useState('aadhaar');
    // ── Aadhaar state ──────────────────────────────────────────────────────────
    const [layoutUrl, setLayoutUrl] = useState(null);
    const [layoutLoading, setLayoutLoading] = useState(false);
    const [layoutError, setLayoutError] = useState(null);
    const autoRan = useRef(false);
    // ── Passport state ─────────────────────────────────────────────────────────
    const [activeFile, setActiveFile] = useState(null);
    const [originalUrl, setOriginalUrl] = useState(null); // full-res original
    const [fgDataUrl, setFgDataUrl] = useState(null); // after bg removal (PNG, transparent)
    const [processedUrl, setProcessedUrl] = useState(null); // fg + bg color applied
    const [sheetUrl, setSheetUrl] = useState(null);
    const [bgColor, setBgColor] = useState('white');
    const [customColor, setCustomColor] = useState('#ffffff');
    const [preset, setPreset] = useState('4x6-8');
    const [spec, setSpec] = useState('standard');
    const [bgLoading, setBgLoading] = useState(false);
    const [bgError, setBgError] = useState(null);
    const [sheetLoading, setSheetLoading] = useState(false);
    // ── Init from URL params ───────────────────────────────────────────────────
    useEffect(() => {
        const raw = params.get('files');
        if (!raw)
            return;
        try {
            const parsed = JSON.parse(decodeURIComponent(raw));
            setFiles(parsed);
            if (parsed.length === 1) {
                setMode('passport');
                setActiveFile(parsed[0]);
                setOriginalUrl(getFullUrl(parsed[0].fileUrl));
            }
            else {
                setMode('aadhaar');
            }
        }
        catch { /* ignore */ }
    }, [params]);
    useEffect(() => {
        if (mode === 'aadhaar' && files.length === 2 && !autoRan.current && !layoutUrl) {
            autoRan.current = true;
            runAadhaarLayout(files);
        }
    }, [files, mode]);
    // ── Aadhaar layout ─────────────────────────────────────────────────────────
    async function runAadhaarLayout(filesToProcess) {
        setLayoutLoading(true);
        setLayoutError(null);
        try {
            const res = await fetch(`${API_BASE_URL}/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileIds: filesToProcess.map(f => getDriveId(f.fileUrl) ?? f.id),
                    action: 'aadhaar_layout',
                }),
            });
            if (!res.ok)
                throw new Error(`Server error ${res.status}`);
            const blob = await res.blob();
            setLayoutUrl(URL.createObjectURL(blob));
        }
        catch (e) {
            setLayoutError(`Layout failed: ${e.message}. Ensure Drive is connected.`);
        }
        finally {
            setLayoutLoading(false);
        }
    }
    // ── Background removal (via hub proxy) ────────────────────────────────────
    async function removeBackground() {
        if (!activeFile)
            return;
        setBgLoading(true);
        setBgError(null);
        setFgDataUrl(null);
        setProcessedUrl(null);
        setSheetUrl(null);
        try {
            const fileId = getDriveId(activeFile.fileUrl);
            if (!fileId)
                throw new Error('No Drive file ID found');
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
            const pngDataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(pngBlob);
            });
            setFgDataUrl(pngDataUrl);
            const color = bgColor === 'custom' ? customColor : BG_HEX[bgColor];
            const withBg = await compositeOnColor(pngDataUrl, color);
            setProcessedUrl(withBg);
        }
        catch (e) {
            setBgError(`Background removal failed: ${e.message}`);
        }
        finally {
            setBgLoading(false);
        }
    }
    /** Re-apply a new background color to the already-removed foreground */
    async function applyBgColor(color) {
        if (!fgDataUrl)
            return;
        try {
            const withBg = await compositeOnColor(fgDataUrl, color);
            setProcessedUrl(withBg);
            setSheetUrl(null);
        }
        catch { /* ignore */ }
    }
    async function generatePassportSheet() {
        if (!activeFile)
            return;
        const fileId = getDriveId(activeFile.fileUrl);
        if (!fileId) {
            setBgError('No Drive file ID found');
            return;
        }
        setSheetLoading(true);
        try {
            setSheetUrl(await buildSheet(fileId, preset, spec));
        }
        catch (e) {
            setBgError(e.message);
        }
        finally {
            setSheetLoading(false);
        }
    }
    function resetToOriginal() {
        setFgDataUrl(null);
        setProcessedUrl(null);
        setSheetUrl(null);
        setBgError(null);
    }
    const previewSrc = sheetUrl ?? processedUrl ?? originalUrl;
    const photoCount = PRESETS.find(p => p.key === preset)?.label ?? 'Sheet';
    return (_jsxs("div", { className: "min-h-screen bg-[#0c1322] text-[#dce2f7] font-['Inter',sans-serif] flex flex-col", children: [_jsxs("div", { className: "bg-[#1e293b] border-b border-[#334155] px-4 h-10 flex items-center justify-between shrink-0", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => navigate('/'), className: "text-[#94a3b8] hover:text-white", children: _jsx("span", { className: "material-symbols-outlined text-[20px]", children: "arrow_back" }) }), _jsx("span", { className: "text-sm font-bold uppercase tracking-wider", children: "Photo Processing" }), _jsx("div", { className: "flex gap-1 ml-2", children: ['aadhaar', 'passport'].map(m => (_jsx("button", { onClick: () => setMode(m), className: `px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors
                  ${mode === m ? 'bg-blue-600 text-white' : 'text-[#94a3b8] hover:text-white border border-[#334155]'}`, children: m === 'aadhaar' ? 'Aadhaar Layout' : 'Passport Photo' }, m))) })] }), _jsxs("div", { className: "flex gap-2", children: [mode === 'aadhaar' && layoutUrl && (_jsxs(_Fragment, { children: [_jsxs("button", { onClick: () => printDataUrl(layoutUrl), className: "px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-1.5", children: [_jsx("span", { className: "material-symbols-outlined text-[16px]", children: "print" }), " Print Now"] }), _jsx("button", { onClick: () => downloadDataUrl(layoutUrl, 'aadhaar_layout.jpg'), className: "px-3 py-1.5 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded flex items-center gap-1.5", children: _jsx("span", { className: "material-symbols-outlined text-[16px]", children: "download" }) })] })), mode === 'passport' && sheetUrl && (_jsxs(_Fragment, { children: [_jsxs("button", { onClick: () => printDataUrl(sheetUrl), className: "px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-1.5", children: [_jsx("span", { className: "material-symbols-outlined text-[16px]", children: "print" }), " Print Sheet"] }), _jsx("button", { onClick: () => downloadDataUrl(sheetUrl, `passport_${sheet}.jpg`), className: "px-3 py-1.5 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded flex items-center gap-1.5", children: _jsx("span", { className: "material-symbols-outlined text-[16px]", children: "download" }) })] })), mode === 'passport' && processedUrl && !sheetUrl && (_jsxs("button", { onClick: () => printDataUrl(processedUrl), className: "px-3 py-1.5 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded flex items-center gap-1.5", children: [_jsx("span", { className: "material-symbols-outlined text-[16px]", children: "print" }), " Print Photo"] }))] })] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [mode === 'aadhaar' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "w-52 bg-[#141b2b] border-r border-[#334155] flex flex-col shrink-0 p-2 gap-2", children: [_jsxs("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider px-1", children: ["Files (", files.length, ")"] }), files.map((f, i) => (_jsxs("div", { className: "bg-[#1e293b] border border-[#334155] rounded overflow-hidden", children: [_jsxs("div", { className: "h-20 relative", children: [_jsx("img", { src: getFullUrl(f.fileUrl), alt: f.fileName, className: "w-full h-full object-cover" }), _jsx("div", { className: "absolute top-1 left-1 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded", children: i === 0 ? 'FRONT' : 'BACK' })] }), _jsx("p", { className: "text-[9px] text-[#94a3b8] truncate px-1.5 py-1", children: f.fileName })] }, f.id))), files.length === 2 && (_jsx("button", { onClick: () => { setLayoutUrl(null); runAadhaarLayout(files); }, disabled: layoutLoading, className: "w-full py-2 bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded hover:bg-blue-500 mt-auto", children: layoutLoading ? 'Generating…' : 'Regenerate' }))] }), _jsxs("div", { className: "flex-1 flex items-center justify-center bg-[#0c1322] p-6 overflow-auto", children: [layoutLoading && (_jsxs("div", { className: "flex flex-col items-center gap-3 text-[#94a3b8]", children: [_jsx("span", { className: "material-symbols-outlined text-[48px] animate-spin", children: "sync" }), _jsx("p", { children: "Generating layout\u2026" })] })), layoutError && (_jsxs("div", { className: "bg-red-500/10 border border-red-500/30 rounded p-4 text-red-400 text-sm max-w-sm text-center", children: [layoutError, _jsx("br", {}), _jsx("button", { onClick: () => runAadhaarLayout(files), className: "mt-2 px-3 py-1 border border-red-500/50 rounded text-xs", children: "Retry" })] })), layoutUrl && !layoutLoading && (_jsxs("div", { className: "flex flex-col items-center gap-3 max-w-2xl w-full", children: [_jsx("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider", children: "A4 Landscape \u2014 Front \u00B7 Back" }), _jsx("div", { className: "bg-white rounded shadow-2xl overflow-hidden w-full", children: _jsx("img", { src: layoutUrl, alt: "Aadhaar Layout", className: "w-full h-auto" }) })] })), !layoutLoading && !layoutUrl && !layoutError && (_jsxs("div", { className: "flex flex-col items-center gap-3 text-[#94a3b8]", children: [_jsx("span", { className: "material-symbols-outlined text-[48px]", children: "layers" }), _jsx("p", { className: "text-sm", children: "Select 2 Aadhaar images from inbox" }), _jsx("button", { onClick: () => navigate('/'), className: "px-4 py-2 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded", children: "\u2190 Back to Inbox" })] }))] })] })), mode === 'passport' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "w-60 bg-[#141b2b] border-r border-[#334155] flex flex-col shrink-0 overflow-y-auto", children: [_jsxs("div", { className: "p-3 border-b border-[#334155]", children: [_jsxs("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2 flex items-center gap-1", children: [_jsx("span", { className: "bg-blue-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center", children: "1" }), "Remove Background"] }), _jsx("button", { onClick: removeBackground, disabled: bgLoading || !activeFile, className: "w-full py-2.5 bg-[#1e293b] border border-[#334155] disabled:opacity-40 text-[#dce2f7] text-xs font-semibold rounded hover:bg-[#334155] transition-colors flex items-center justify-center gap-1.5", children: bgLoading
                                                    ? _jsxs(_Fragment, { children: [_jsx("span", { className: "material-symbols-outlined text-[14px] animate-spin", children: "sync" }), "Removing\u2026"] })
                                                    : _jsxs(_Fragment, { children: [_jsx("span", { className: "material-symbols-outlined text-[14px]", children: "auto_fix_high" }), "Remove Background"] }) }), bgError && (_jsxs("div", { className: "mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded", children: [_jsx("p", { className: "text-[9px] text-red-400 mb-1", children: bgError }), _jsx("button", { onClick: removeBackground, className: "text-[9px] text-red-400 border border-red-500/40 px-2 py-0.5 rounded hover:bg-red-500/10", children: "Retry" })] })), fgDataUrl && !bgError && _jsxs("p", { className: "text-[9px] text-green-400 mt-1.5 flex items-center gap-1", children: [_jsx("span", { className: "material-symbols-outlined text-[12px]", children: "check_circle" }), "Background removed"] })] }), _jsxs("div", { className: `p-3 border-b border-[#334155] transition-opacity ${!fgDataUrl ? 'opacity-40 pointer-events-none' : ''}`, children: [_jsxs("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2 flex items-center gap-1", children: [_jsx("span", { className: "bg-blue-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center", children: "2" }), "Background Color"] }), _jsx("div", { className: "grid grid-cols-3 gap-1.5 mb-2", children: [['white', '#ffffff', 'White'], ['lightblue', '#a8c8e8', 'Light Blue'], ['red', '#c8102e', 'Red']].map(([key, hex, label]) => (_jsx("button", { onClick: () => { setBgColor(key); applyBgColor(hex); }, className: `h-8 rounded border-2 text-[8px] font-bold transition-colors flex items-end justify-center pb-0.5
                        ${bgColor === key ? 'border-blue-500' : 'border-[#334155]'}`, style: { background: hex, color: key === 'white' || key === 'lightblue' ? '#333' : '#fff' }, children: label }, key))) }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { type: "color", value: customColor, onChange: e => { setCustomColor(e.target.value); setBgColor('custom'); applyBgColor(e.target.value); }, className: "w-8 h-8 rounded border border-[#334155] cursor-pointer bg-transparent p-0.5" }), _jsx("span", { className: "text-[10px] text-[#94a3b8]", children: "Custom color" }), bgColor === 'custom' && _jsx("span", { className: "text-[9px] text-blue-400", children: "\u2713 active" })] })] }), _jsxs("div", { className: "p-3 border-b border-[#334155]", children: [_jsxs("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2 flex items-center gap-1", children: [_jsx("span", { className: "bg-blue-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center", children: "3" }), "Layout"] }), _jsx("div", { className: "flex flex-col gap-1", children: PRESETS.map(p => (_jsxs("button", { onClick: () => { setPreset(p.key); setSheetUrl(null); }, className: `w-full py-2 px-2.5 rounded text-left border transition-colors
                        ${preset === p.key ? 'bg-blue-600 border-blue-600 text-white' : 'border-[#334155] text-[#94a3b8] hover:text-white'}`, children: [_jsx("span", { className: "text-[11px] font-bold", children: p.label }), _jsx("span", { className: `text-[9px] block ${preset === p.key ? 'text-blue-200' : 'text-[#64748b]'}`, children: p.sub })] }, p.key))) })] }), _jsxs("div", { className: "p-3 border-b border-[#334155]", children: [_jsxs("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2 flex items-center gap-1", children: [_jsx("span", { className: "bg-blue-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center", children: "\u21B3" }), "Photo Size"] }), _jsx("div", { className: "flex flex-col gap-1", children: SPECS.map(s => (_jsx("button", { onClick: () => { setSpec(s.key); setSheetUrl(null); }, className: `w-full py-1.5 px-2.5 rounded text-left text-[10px] border transition-colors
                        ${spec === s.key ? 'bg-blue-600 border-blue-600 text-white' : 'border-[#334155] text-[#94a3b8] hover:text-white'}`, children: s.label }, s.key))) })] }), _jsxs("div", { className: "p-3 border-b border-[#334155]", children: [_jsxs("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2 flex items-center gap-1", children: [_jsx("span", { className: "bg-blue-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center", children: "4" }), "Generate Sheet"] }), _jsx("button", { onClick: generatePassportSheet, disabled: sheetLoading || (!processedUrl && !originalUrl), className: "w-full py-2.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-colors", children: sheetLoading
                                                    ? _jsxs(_Fragment, { children: [_jsx("span", { className: "material-symbols-outlined text-[14px] animate-spin", children: "sync" }), "Generating\u2026"] })
                                                    : _jsxs(_Fragment, { children: [_jsx("span", { className: "material-symbols-outlined text-[14px]", children: "grid_on" }), "Generate ", photoCount, " Photos"] }) }), sheetUrl && (_jsxs("div", { className: "mt-2 flex gap-1.5", children: [_jsxs("button", { onClick: () => printDataUrl(sheetUrl), className: "flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1", children: [_jsx("span", { className: "material-symbols-outlined text-[13px]", children: "print" }), " Print"] }), _jsxs("button", { onClick: () => downloadDataUrl(sheetUrl, `passport_${sheet}.jpg`), className: "flex-1 py-2 border border-[#334155] text-[#94a3b8] hover:text-white text-[10px] rounded flex items-center justify-center gap-1", children: [_jsx("span", { className: "material-symbols-outlined text-[13px]", children: "download" }), " Save"] })] }))] }), (fgDataUrl || processedUrl) && (_jsx("div", { className: "p-3", children: _jsx("button", { onClick: resetToOriginal, className: "w-full py-1.5 text-[#94a3b8] hover:text-white text-[10px] border border-[#334155] rounded transition-colors", children: "\u21BA Reset to Original" }) }))] }), _jsx("div", { className: "flex-1 flex flex-col items-center justify-center bg-[#0c1322] p-6 overflow-auto gap-3", children: previewSrc ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider", children: sheetUrl ? `${sheet.toUpperCase()} Sheet · ${photoCount} photos` : processedUrl ? 'Processed Photo' : 'Original Photo' }), _jsx("div", { className: `rounded shadow-2xl overflow-hidden max-w-2xl w-full ${sheetUrl || processedUrl ? 'bg-white' : 'bg-[#2e3545]'}`, children: _jsx("img", { src: previewSrc, alt: "Preview", className: "w-full h-auto" }) }), !sheetUrl && (_jsx("p", { className: "text-[10px] text-[#475569]", children: processedUrl ? 'Background removed — choose a color above, then generate sheet' : 'Click "Remove Background" to start' }))] })) : (_jsxs("div", { className: "flex flex-col items-center gap-3 text-[#94a3b8]", children: [_jsx("span", { className: "material-symbols-outlined text-[48px]", children: "portrait" }), _jsx("p", { className: "text-sm", children: "Select a photo from inbox" }), _jsx("button", { onClick: () => navigate('/'), className: "px-4 py-2 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded", children: "\u2190 Back to Inbox" })] })) })] }))] })] }));
}
