import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../utils/helpers';
const BG_COLORS = {
    white: '#ffffff', lightblue: '#a8c8e8', red: '#c8102e', custom: '#ffffff',
};
function getDriveId(url) {
    return url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ?? null;
}
function getFullUrl(url) {
    const id = getDriveId(url);
    return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : url;
}
// Apply background color to transparent PNG using canvas
async function applyBackground(pngDataUrl, color) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = reject;
        img.src = pngDataUrl;
    });
}
// Generate passport sheet via backend Sharp — avoids CORS/tainted canvas
async function generateSheet(fileId, sheet) {
    const res = await fetch(`${API_BASE_URL}/process/passport-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, sheet }),
    });
    if (!res.ok) throw new Error(`Sheet generation failed: ${await res.text()}`);
    return URL.createObjectURL(await res.blob());
}
export default function FileStitchPage() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const [files, setFiles] = useState([]);
    const [mode, setMode] = useState('aadhaar');
    // Aadhaar layout state
    const [layoutUrl, setLayoutUrl] = useState(null);
    const [layoutLoading, setLayoutLoading] = useState(false);
    const [layoutError, setLayoutError] = useState(null);
    const [autoApplied, setAutoApplied] = useState(false);
    // Passport photo state
    const [activeFile, setActiveFile] = useState(null);
    const [originalUrl, setOriginalUrl] = useState(null);
    const [processedUrl, setProcessedUrl] = useState(null);
    const [bgColor, setBgColor] = useState('white');
    const [customColor, setCustomColor] = useState('#ffffff');
    const [sheet, setSheet] = useState('4x6');
    const [sheetUrl, setSheetUrl] = useState(null);
    const [bgLoading, setBgLoading] = useState(false);
    const [bgError, setBgError] = useState(null);
    const [sheetLoading, setSheetLoading] = useState(false);
    useEffect(() => {
        const raw = params.get('files');
        if (!raw)
            return;
        try {
            const parsed = JSON.parse(decodeURIComponent(raw));
            setFiles(parsed);
            if (parsed.length === 2) {
                setMode('aadhaar');
            }
            else if (parsed.length === 1) {
                setMode('passport');
                setActiveFile(parsed[0]);
                setOriginalUrl(getFullUrl(parsed[0].fileUrl));
            }
        }
        catch { /* ignore */ }
    }, [params]);
    useEffect(() => {
        if (mode === 'aadhaar' && files.length === 2 && !autoApplied && !layoutUrl) {
            setAutoApplied(true);
            applyAadhaarLayout(files);
        }
    }, [files, mode]);
    async function applyAadhaarLayout(filesToProcess) {
        setLayoutLoading(true);
        setLayoutError(null);
        try {
            const res = await axios.post(`${API_BASE_URL}/process`, {
                fileIds: filesToProcess.map(f => getDriveId(f.fileUrl) ?? f.id),
                action: 'aadhaar_layout',
            }, { responseType: 'blob' });
            setLayoutUrl(URL.createObjectURL(res.data));
        }
        catch {
            setLayoutError('Layout failed. Ensure Drive is connected.');
        }
        finally {
            setLayoutLoading(false);
        }
    }
    async function removeBackground() {
        if (!activeFile)
            return;
        setBgLoading(true);
        setBgError(null);
        setProcessedUrl(null);
        setSheetUrl(null);
        try {
            const driveId = getDriveId(activeFile.fileUrl);
            let pngUrl;
            if (driveId) {
                // Send fileId to hub — hub downloads from Drive server-side (no CORS)
                const res = await fetch(`${API_BASE_URL}/remove-bg`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileId: driveId, fileName: activeFile.fileName }),
                });
                if (!res.ok)
                    throw new Error(`${res.status}: ${await res.text()}`);
                pngUrl = URL.createObjectURL(await res.blob());
            }
            else {
                throw new Error('No Drive file ID found');
            }
            const color = bgColor === 'custom' ? customColor : BG_COLORS[bgColor];
            const withBg = await applyBackground(pngUrl, color);
            setProcessedUrl(withBg);
        }
        catch (e) {
            setBgError(`Background removal failed: ${e.message}`);
        }
        finally {
            setBgLoading(false);
        }
    }
    async function changeBackground(color) {
        if (!processedUrl)
            return;
        try {
            const withBg = await applyBackground(processedUrl, color);
            setProcessedUrl(withBg);
            setSheetUrl(null);
        }
        catch { /* ignore */ }
    }
    async function generatePassportSheet() {
        if (!activeFile)
            return;
        const fileId = getDriveId(activeFile.fileUrl);
        if (!fileId) { setBgError('No Drive file ID found'); return; }
        setSheetLoading(true);
        try {
            const url = await generateSheet(fileId, sheet);
            setSheetUrl(url);
        }
        catch (e) { setBgError(e.message); }
        finally {
            setSheetLoading(false);
        }
    }
    function handlePrint(url) {
        const win = window.open('', '_blank');
        if (!win)
            return;
        win.document.write(`<html><body style="margin:0"><img src="${url}" style="width:100%" onload="window.print()"/></body></html>`);
        win.document.close();
    }
    function handleDownload(url, name) {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    const previewSrc = sheetUrl ?? processedUrl ?? originalUrl;
    return (_jsxs("div", { className: "min-h-screen bg-[#0c1322] text-[#dce2f7] font-['Inter',sans-serif] flex flex-col", children: [_jsxs("div", { className: "bg-[#1e293b] border-b border-[#334155] px-4 h-10 flex items-center justify-between shrink-0", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => navigate('/'), className: "text-[#94a3b8] hover:text-white", children: _jsx("span", { className: "material-symbols-outlined text-[20px]", children: "arrow_back" }) }), _jsx("span", { className: "text-sm font-bold uppercase tracking-wider", children: "File Stitch Pro" }), _jsx("div", { className: "flex gap-1 ml-2", children: ['aadhaar', 'passport'].map(m => (_jsx("button", { onClick: () => setMode(m), className: `px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'text-[#94a3b8] hover:text-white border border-[#334155]'}`, children: m === 'aadhaar' ? 'Aadhaar Layout' : 'Passport Photo' }, m))) })] }), _jsxs("div", { className: "flex gap-2", children: [mode === 'aadhaar' && layoutUrl && (_jsxs(_Fragment, { children: [_jsxs("button", { onClick: () => handlePrint(layoutUrl), className: "px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-1.5", children: [_jsx("span", { className: "material-symbols-outlined text-[16px]", children: "print" }), " Print Now"] }), _jsx("button", { onClick: () => handleDownload(layoutUrl, 'aadhaar_layout.jpg'), className: "px-3 py-1.5 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded flex items-center gap-1.5", children: _jsx("span", { className: "material-symbols-outlined text-[16px]", children: "download" }) })] })), mode === 'passport' && sheetUrl && (_jsxs(_Fragment, { children: [_jsxs("button", { onClick: () => handlePrint(sheetUrl), className: "px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-1.5", children: [_jsx("span", { className: "material-symbols-outlined text-[16px]", children: "print" }), " Print Sheet"] }), _jsx("button", { onClick: () => handleDownload(sheetUrl, `passport_${sheet}.jpg`), className: "px-3 py-1.5 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded flex items-center gap-1.5", children: _jsx("span", { className: "material-symbols-outlined text-[16px]", children: "download" }) })] }))] })] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [mode === 'aadhaar' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "w-52 bg-[#141b2b] border-r border-[#334155] flex flex-col shrink-0 p-2 gap-2", children: [_jsxs("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider px-1", children: ["Files (", files.length, ")"] }), files.map((f, i) => (_jsxs("div", { className: "bg-[#1e293b] border border-[#334155] rounded overflow-hidden", children: [_jsxs("div", { className: "h-20 relative", children: [_jsx("img", { src: getFullUrl(f.fileUrl), alt: f.fileName, className: "w-full h-full object-cover" }), _jsx("div", { className: "absolute top-1 left-1 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded", children: i === 0 ? 'FRONT' : 'BACK' })] }), _jsx("p", { className: "text-[9px] text-[#94a3b8] truncate px-1.5 py-1", children: f.fileName })] }, f.id))), files.length === 2 && (_jsx("button", { onClick: () => { setLayoutUrl(null); setAutoApplied(false); applyAadhaarLayout(files); }, disabled: layoutLoading, className: "w-full py-2 bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded hover:bg-blue-500 mt-auto", children: layoutLoading ? 'Generating…' : 'Regenerate' }))] }), _jsxs("div", { className: "flex-1 flex items-center justify-center bg-[#0c1322] p-6 overflow-auto", children: [layoutLoading && _jsxs("div", { className: "flex flex-col items-center gap-3 text-[#94a3b8]", children: [_jsx("span", { className: "material-symbols-outlined text-[48px] animate-spin", children: "sync" }), _jsx("p", { children: "Generating layout\u2026" })] }), layoutError && _jsxs("div", { className: "bg-red-500/10 border border-red-500/30 rounded p-4 text-red-400 text-sm max-w-sm text-center", children: [layoutError, _jsx("br", {}), _jsx("button", { onClick: () => applyAadhaarLayout(files), className: "mt-2 px-3 py-1 border border-red-500/50 rounded text-xs", children: "Retry" })] }), layoutUrl && !layoutLoading && (_jsxs("div", { className: "flex flex-col items-center gap-3 max-w-2xl w-full", children: [_jsx("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider", children: "A4 Landscape \u2014 Front (left) \u00B7 Back (right)" }), _jsx("div", { className: "bg-white rounded shadow-2xl overflow-hidden w-full", children: _jsx("img", { src: layoutUrl, alt: "Layout", className: "w-full h-auto" }) })] })), !layoutLoading && !layoutUrl && !layoutError && files.length !== 2 && (_jsxs("div", { className: "flex flex-col items-center gap-3 text-[#94a3b8]", children: [_jsx("span", { className: "material-symbols-outlined text-[48px]", children: "layers" }), _jsx("p", { className: "text-sm", children: "Select 2 files from inbox" }), _jsx("button", { onClick: () => navigate('/'), className: "px-4 py-2 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded", children: "\u2190 Back to Inbox" })] }))] })] })), mode === 'passport' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "w-56 bg-[#141b2b] border-r border-[#334155] flex flex-col shrink-0", children: [_jsxs("div", { className: "p-3 border-b border-[#334155]", children: [_jsx("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2", children: "Background Removal" }), _jsx("button", { onClick: removeBackground, disabled: bgLoading || !activeFile, className: "w-full py-2 bg-[#1e293b] border border-[#334155] disabled:opacity-40 text-[#dce2f7] text-xs font-semibold rounded hover:bg-[#334155] transition-colors flex items-center justify-center gap-1.5", children: bgLoading ? _jsxs(_Fragment, { children: [_jsx("span", { className: "material-symbols-outlined text-[14px] animate-spin", children: "sync" }), "Removing\u2026"] }) : _jsxs(_Fragment, { children: [_jsx("span", { className: "material-symbols-outlined text-[14px]", children: "auto_fix_high" }), "Remove Background"] }) }), bgError && _jsx("p", { className: "text-[9px] text-red-400 mt-1", children: bgError }), processedUrl && _jsx("p", { className: "text-[9px] text-green-400 mt-1", children: "\u2713 Background removed" })] }), processedUrl && (_jsxs("div", { className: "p-3 border-b border-[#334155]", children: [_jsx("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2", children: "Background Color" }), _jsx("div", { className: "grid grid-cols-4 gap-1.5 mb-2", children: Object.entries(BG_COLORS).filter(([k]) => k !== 'custom').map(([key, color]) => (_jsx("button", { onClick: () => { setBgColor(key); changeBackground(color); }, className: `h-7 rounded border-2 transition-colors ${bgColor === key ? 'border-blue-500' : 'border-[#334155]'}`, style: { background: color }, title: key }, key))) }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { type: "color", value: customColor, onChange: e => { setCustomColor(e.target.value); setBgColor('custom'); changeBackground(e.target.value); }, className: "w-7 h-7 rounded border border-[#334155] cursor-pointer bg-transparent" }), _jsx("span", { className: "text-[10px] text-[#94a3b8]", children: "Custom color" })] })] })), _jsxs("div", { className: "p-3 border-b border-[#334155]", children: [_jsx("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider mb-2", children: "Sheet Size" }), _jsx("div", { className: "flex gap-2", children: ['4x6', 'a4'].map(s => (_jsx("button", { onClick: () => { setSheet(s); setSheetUrl(null); }, className: `flex-1 py-1.5 rounded text-[10px] font-bold uppercase border transition-colors ${sheet === s ? 'bg-blue-600 border-blue-600 text-white' : 'border-[#334155] text-[#94a3b8] hover:text-white'}`, children: s === '4x6' ? '4×6 (6 photos)' : 'A4 (24 photos)' }, s))) })] }), _jsxs("div", { className: "p-3", children: [_jsx("button", { onClick: generatePassportSheet, disabled: sheetLoading || (!processedUrl && !originalUrl), className: "w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-colors", children: sheetLoading ? _jsxs(_Fragment, { children: [_jsx("span", { className: "material-symbols-outlined text-[14px] animate-spin", children: "sync" }), "Generating\u2026"] }) : _jsxs(_Fragment, { children: [_jsx("span", { className: "material-symbols-outlined text-[14px]", children: "grid_on" }), "Generate Sheet"] }) }), processedUrl && (_jsx("button", { onClick: () => { setProcessedUrl(null); setSheetUrl(null); setBgError(null); }, className: "w-full mt-2 py-1 text-[#94a3b8] hover:text-white text-[10px] border border-[#334155] rounded transition-colors", children: "Reset to Original" }))] })] }), _jsx("div", { className: "flex-1 flex items-center justify-center bg-[#0c1322] p-6 overflow-auto", children: previewSrc ? (_jsxs("div", { className: "flex flex-col items-center gap-3 max-w-2xl w-full", children: [_jsx("p", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider", children: sheetUrl ? `${sheet.toUpperCase()} Sheet Preview` : processedUrl ? 'Processed Photo' : 'Original Photo' }), _jsx("div", { className: `rounded shadow-2xl overflow-hidden w-full ${sheetUrl ? 'bg-white' : 'bg-[#2e3545]'}`, children: _jsx("img", { src: previewSrc, alt: "Preview", className: "w-full h-auto" }) })] })) : (_jsxs("div", { className: "flex flex-col items-center gap-3 text-[#94a3b8]", children: [_jsx("span", { className: "material-symbols-outlined text-[48px]", children: "portrait" }), _jsx("p", { className: "text-sm", children: "Select a photo from inbox" }), _jsx("button", { onClick: () => navigate('/'), className: "px-4 py-2 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded", children: "\u2190 Back to Inbox" })] })) })] }))] })] }));
}
