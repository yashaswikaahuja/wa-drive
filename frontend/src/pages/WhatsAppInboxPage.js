import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { notification } from 'antd';
import { useWhatsAppStore } from '../stores/whatsappStore';
import { deleteWhatsAppFile, fetchWhatsAppFiles, fetchWhatsAppStatus, normalizeWhatsAppFile } from '../services/whatsapp.api';
import { API_BASE_URL, SOCKET_URL, getPreviewUrl } from '../utils/helpers';
import { PreviewModal } from '../components/dashboard/preview-modal';
import GoogleDriveLogin from '../components/GoogleDriveLogin';
const EXT_FILTER = (name) => {
    const e = name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'tiff'].includes(e))
        return 'image';
    if (['mp4', '3gp', 'mov', 'avi', 'mkv', 'webm'].includes(e))
        return 'video';
    if (['mp3', 'ogg', 'wav', 'aac', 'm4a', 'flac', 'opus'].includes(e))
        return 'audio';
    if (e === 'pdf')
        return 'pdf';
    return 'document';
};
const FILE_ICON = {
    image: 'image', video: 'videocam', audio: 'audio_file',
    pdf: 'picture_as_pdf', document: 'description',
};
function fileIcon(name) { return FILE_ICON[EXT_FILTER(name)] ?? 'insert_drive_file'; }
function isImage(name) { return EXT_FILTER(name) === 'image'; }
export default function WhatsAppInboxPage() {
    const navigate = useNavigate();
    const [qrCode, setQrCode] = useState(null);
    const qrCodeRef = useRef(null);
    const setQrCodeSync = (v) => { qrCodeRef.current = v; setQrCode(v); };
    const newIds = useRef(new Set());
    const socketRef = useRef(null);
    const { files, connected, loading, setFiles, addFile, removeFile, setConnected, setLoading, setError } = useWhatsAppStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [aadhaarLoading, setAadhaarLoading] = useState(false);
    const [activeSender, setActiveSender] = useState(null);
    const [statusChecked, setStatusChecked] = useState(false);
    const [uploadQueue, setUploadQueue] = useState([]);
    const detectDocuments = useCallback((files) => {
        const AADHAAR_FRONT = /aadhaar.*(front|f\b)|front.*(aadhaar|adhar)|adhar.*(front|f\b)/i;
        const AADHAAR_BACK = /aadhaar.*(back|b\b)|back.*(aadhaar|adhar)|adhar.*(back|b\b)/i;
        const AADHAAR_ANY = /aadhaar|adhar|aadhar/i;
        const PAN_PATTERN = /pan.*(card)?|income.tax/i;
        const PASSPORT_PHOTO = /passport.*(photo|pic|size)|photo.*passport/i;
        const images = files.filter(f => EXT_FILTER(f.fileName) === 'image');
        // Check for explicit Aadhaar front+back
        const front = images.find(f => AADHAAR_FRONT.test(f.fileName));
        const back = images.find(f => AADHAAR_BACK.test(f.fileName));
        if (front && back)
            return { type: 'aadhaar', front: front.id, back: back.id, confidence: 95 };
        // Check for any 2 Aadhaar images
        const aadhaarFiles = images.filter(f => AADHAAR_ANY.test(f.fileName));
        if (aadhaarFiles.length >= 2)
            return { type: 'aadhaar', front: aadhaarFiles[0].id, back: aadhaarFiles[1].id, confidence: 85 };
        // PAN card
        const pan = images.find(f => PAN_PATTERN.test(f.fileName));
        if (pan)
            return { type: 'pan', front: pan.id, back: null, confidence: 90 };
        // Passport photo
        const passport = images.find(f => PASSPORT_PHOTO.test(f.fileName));
        if (passport)
            return { type: 'passport', front: passport.id, back: null, confidence: 88 };
        // Fallback: 2 images from same sender = likely Aadhaar
        if (images.length >= 2) {
            const bySender = new Map();
            images.forEach(f => { const arr = bySender.get(f.customerId) ?? []; arr.push(f); bySender.set(f.customerId, arr); });
            for (const [, arr] of bySender) {
                if (arr.length >= 2)
                    return { type: 'aadhaar', front: arr[0].id, back: arr[1].id, confidence: 65 };
            }
        }
        return { type: null, front: null, back: null, confidence: 0 };
    }, []);
    const toggleSelect = useCallback((id) => {
        setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }, []);
    const handleAadhaarLayout = useCallback(async () => {
        if (selectedIds.size !== 2)
            return;
        setAadhaarLoading(true);
        try {
            const res = await axios.post(`${API_BASE_URL}/process`, { fileIds: Array.from(selectedIds), action: 'aadhaar_layout' }, { responseType: 'blob' });
            window.open(URL.createObjectURL(res.data), '_blank');
            setSelectedIds(new Set());
        }
        catch {
            notification.error({ message: 'Aadhaar layout failed', placement: 'topRight' });
        }
        finally {
            setAadhaarLoading(false);
        }
    }, [selectedIds]);
    useEffect(() => {
        if (socketRef.current)
            return;
        const socket = io(SOCKET_URL);
        socketRef.current = socket;
        socket.on('connection:status', (s) => {
            setConnected(s.connected);
            const newQr = s.connected ? null : (s.qrCode ?? null);
            // Only update QR if we don't already have one displayed (prevents rapid flicker)
            if (s.connected || !qrCodeRef.current)
                setQrCodeSync(newQr);
            if (newQr)
                setTimeout(async () => { const ok = await fetchWhatsAppStatus().catch(() => false); if (ok) {
                    useWhatsAppStore.getState().setConnected(true);
                    setQrCodeSync(null);
                } }, 3000);
        });
        socket.on('new_whatsapp_file', (file) => {
            newIds.current.add(file.id);
            addFile(file);
            notification.success({ message: `${file.customerName}: ${file.fileName}`, placement: 'topRight', duration: 3 });
            setTimeout(() => newIds.current.delete(file.id), 3000);
            // Auto-detect after new file arrives
            setTimeout(() => {
                const current = useWhatsAppStore.getState().files.map(f => normalizeWhatsAppFile(f)).filter(Boolean);
                const det = detectDocuments(current);
                if (det.type === 'aadhaar' && det.confidence >= 80 && det.front && det.back) {
                    setSelectedIds(new Set([det.front, det.back]));
                }
            }, 500);
        });
        socket.on('upload:queued', ({ fileName, phone }) => {
            setUploadQueue(q => [...q.slice(-19), { fileName, phone, status: 'queued' }]);
        });
        socket.on('upload:start', ({ fileName }) => {
            setUploadQueue(q => q.map(i => i.fileName === fileName ? { ...i, status: 'uploading' } : i));
        });
        socket.on('upload:done', ({ fileName }) => {
            setUploadQueue(q => q.map(i => i.fileName === fileName ? { ...i, status: 'done' } : i));
            setTimeout(() => setUploadQueue(q => q.filter(i => i.fileName !== fileName || i.status !== 'done')), 5000);
        });
        socket.on('upload:fail', ({ fileName, reason }) => {
            setUploadQueue(q => q.map(i => i.fileName === fileName ? { ...i, status: 'failed', reason } : i));
        });
        load();
        loadDriveFiles();
        let qrPollTimer;
        async function pollQr() {
            if (!useWhatsAppStore.getState().connected) {
                try {
                    const [{ data }, ok] = await Promise.all([axios.get(`${API_BASE_URL}/whatsapp/qr`), fetchWhatsAppStatus()]);
                    useWhatsAppStore.getState().setConnected(ok);
                    if (ok)
                        setQrCodeSync(null);
                    else if (data.qrCode && !qrCodeRef.current)
                        setQrCodeSync(data.qrCode);
                }
                catch { /* ignore */ }
            }
            qrPollTimer = setTimeout(pollQr, qrCodeRef.current ? 2000 : 5000);
        }
        qrPollTimer = setTimeout(pollQr, 500);
        const drivePoll = setInterval(loadDriveFiles, 10000);
        return () => { socket.disconnect(); socketRef.current = null; clearInterval(drivePoll); clearTimeout(qrPollTimer); };
    }, []);
    async function loadDriveFiles() {
        try {
            const { data } = await axios.get(`${API_BASE_URL}/drive/files`);
            const incoming = data.map(f => normalizeWhatsAppFile(f)).filter((f) => f !== null);
            if (!incoming.length)
                return;
            const current = useWhatsAppStore.getState().files;
            const byId = new Map(current.map(f => [f.id, f]));
            const byName = new Map(current.map(f => [f.fileName, f]));
            const merged = incoming.map(f => { const ex = byId.get(f.id) ?? byName.get(f.fileName); if (!ex)
                return f; return { ...f, customerName: (ex.customerName && !ex.customerName.startsWith('Guest')) ? ex.customerName : f.customerName, profilePicUrl: ex.profilePicUrl ?? f.profilePicUrl ?? null }; });
            const driveIds = new Set(incoming.map(f => f.id));
            const socketOnly = current.filter(f => !driveIds.has(f.id) && !merged.find(m => m.fileName === f.fileName));
            useWhatsAppStore.getState().setFiles([...socketOnly, ...merged].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        }
        catch { /* ignore */ }
    }
    async function load() {
        setLoading(true);
        setError(null);
        try {
            const [fetched, ok] = await Promise.all([fetchWhatsAppFiles(), fetchWhatsAppStatus()]);
            if (fetched.length > 0)
                setFiles(fetched);
            setConnected(ok);
            setStatusChecked(true);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load');
        }
        finally {
            setLoading(false);
        }
    }
    const handleDelete = useCallback(async (file) => {
        try {
            await axios.delete(`${API_BASE_URL}/drive/files/${file.id}`);
        }
        catch {
            try {
                await deleteWhatsAppFile(file.id);
            }
            catch { /* ignore */ }
        }
        removeFile(file.id);
        if (selectedFile?.id === file.id)
            setIsPreviewOpen(false);
        notification.success({ message: 'File deleted', placement: 'topRight' });
    }, [selectedFile]);
    const getDownloadUrl = (fileUrl) => {
        const m = fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (m)
            return `https://drive.google.com/uc?export=download&id=${m[1]}`;
        return fileUrl;
    };
    const handleDownload = useCallback((file) => {
        const url = getDownloadUrl(file.fileUrl);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.fileName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }, []);
    const handlePrint = useCallback((file) => {
        const m = file.fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        const ext = file.fileName.split('.').pop()?.toLowerCase();
        if (m && ext === 'pdf') {
            // On mobile: download opens native PDF viewer with print button
            // On desktop: open Drive viewer (user presses Ctrl+P)
            const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (isMobile) {
                const a = document.createElement('a');
                a.href = `https://drive.google.com/uc?export=download&id=${m[1]}`;
                a.download = file.fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
            else {
                window.open(`https://drive.google.com/file/d/${m[1]}/view`, '_blank');
            }
            return;
        }
        const fullUrl = m
            ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1600`
            : getPreviewUrl(file.fileUrl);
        const win = window.open('', '_blank');
        if (!win)
            return;
        win.document.write(`<html><body style="margin:0"><img src="${fullUrl}" style="max-width:100%" onload="window.print()"/></body></html>`);
        win.document.close();
    }, []);
    const allFiles = useMemo(() => (Array.isArray(files) ? files : []).map(f => normalizeWhatsAppFile(f)).filter((f) => f !== null), [files]);
    // Unique senders for chat list
    const senders = useMemo(() => {
        const map = new Map();
        [...allFiles].reverse().forEach(f => { map.set(f.customerId, { name: f.customerName, lastFile: f }); });
        return Array.from(map.values()).reverse();
    }, [allFiles]);
    const visibleFiles = useMemo(() => {
        let result = allFiles;
        if (activeSender)
            result = result.filter(f => f.customerId === activeSender);
        if (activeFilter !== 'all')
            result = result.filter(f => EXT_FILTER(f.fileName) === activeFilter);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(f => f.fileName.toLowerCase().includes(q) || f.customerName.toLowerCase().includes(q));
        }
        return result;
    }, [allFiles, activeSender, activeFilter, searchQuery]);
    const currentIndex = useMemo(() => selectedFile ? visibleFiles.findIndex(f => f.id === selectedFile.id) : -1, [selectedFile, visibleFiles]);
    const activeSenderInfo = activeSender ? senders.find(s => s.lastFile.customerId === activeSender) : null;
    return (_jsxs("div", { className: "bg-[#0c1322] text-[#dce2f7] h-screen flex flex-col overflow-hidden font-['Inter',sans-serif]", children: [_jsxs("nav", { className: "bg-[#1e293b] border-b border-[#334155] flex justify-between items-center px-3 h-8 shrink-0 z-50", children: [_jsxs("div", { className: "flex items-center gap-6", children: [_jsx("span", { className: "text-lg font-bold text-slate-100 uppercase tracking-widest", children: "CyberNet WhatsApp" }), _jsx("div", { className: "hidden md:flex gap-1", children: ['Inbox', 'Media Hub', 'Direct Print'].map((t, i) => (_jsx("a", { href: "#", className: `text-sm px-3 py-1 border-b-2 transition-colors ${i === 0 ? 'text-blue-500 border-blue-500' : 'text-slate-400 border-transparent hover:bg-slate-900 rounded'}`, children: t }, t))) })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "relative hidden lg:block", children: [_jsx("span", { className: "material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]", children: "search" }), _jsx("input", { value: searchQuery, onChange: e => setSearchQuery(e.target.value), placeholder: "Search...", className: "w-56 bg-[#232a3a] border border-[#434655] rounded py-1 pl-8 pr-3 text-sm text-[#dce2f7] focus:outline-none focus:border-blue-600" })] }), _jsxs("div", { className: "flex items-center gap-2 border-l border-[#434655] pl-3 ml-1", children: [_jsxs("span", { className: `text-xs flex items-center gap-1 ${connected ? 'text-green-400' : 'text-red-400'}`, children: [_jsx("span", { className: `w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}` }), connected ? 'Connected' : 'Disconnected'] }), _jsx(GoogleDriveLogin, {}), _jsx("button", { onClick: load, disabled: loading, className: "p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors", children: _jsx("span", { className: `material-symbols-outlined text-[20px] ${loading ? 'animate-spin' : ''}`, children: "refresh" }) }), !connected && (_jsx("button", { onClick: async () => { setQrCodeSync(null); await axios.post(`${API_BASE_URL}/whatsapp/reinit`).catch(() => { }); }, className: "p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors", title: "Refresh QR", children: _jsx("span", { className: "material-symbols-outlined text-[20px]", children: "qr_code_scanner" }) }))] })] })] }), statusChecked && !connected && (_jsx("div", { className: "fixed inset-0 z-40 flex items-center justify-center px-4", style: { background: 'rgba(0,0,0,0.88)', top: '32px' }, children: _jsxs("div", { className: "w-full max-w-[340px] bg-[#1a2035] rounded-[16px] border border-[#3b82f6]/30 shadow-[0_0_20px_rgba(59,130,246,0.15)] flex flex-col p-5 gap-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-9 h-9 rounded-full bg-[#25D366]/10 border border-[#25D366]/30 flex items-center justify-center shrink-0", children: _jsx("span", { className: "material-symbols-outlined text-[#25D366] text-[20px]", style: { fontVariationSettings: "'FILL' 1" }, children: "chat" }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-white text-base font-bold leading-tight", children: "Scan to Connect" }), _jsx("p", { className: "text-[#8892a4] text-[11px]", children: "Open WhatsApp \u2192 Linked Devices \u2192 Scan Code" })] })] }), _jsxs("div", { className: "relative bg-white rounded-[10px] flex items-center justify-center p-3 border-2 border-[#25D366] shadow-[0_0_16px_rgba(37,211,102,0.25)]", children: [_jsx("div", { className: "absolute top-1 left-1 w-4 h-4 border-t-[3px] border-l-[3px] border-[#25D366] rounded-tl-[8px]" }), _jsx("div", { className: "absolute top-1 right-1 w-4 h-4 border-t-[3px] border-r-[3px] border-[#25D366] rounded-tr-[8px]" }), _jsx("div", { className: "absolute bottom-1 left-1 w-4 h-4 border-b-[3px] border-l-[3px] border-[#25D366] rounded-bl-[8px]" }), _jsx("div", { className: "absolute bottom-1 right-1 w-4 h-4 border-b-[3px] border-r-[3px] border-[#25D366] rounded-br-[8px]" }), qrCode ? (_jsxs(_Fragment, { children: [_jsx("img", { src: qrCode, alt: "QR", className: "w-56 h-56 object-contain" }), _jsx("div", { className: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-0.5", children: _jsx("div", { className: "w-7 h-7 rounded-full bg-[#25D366] flex items-center justify-center", children: _jsx("span", { className: "material-symbols-outlined text-white text-[16px]", style: { fontVariationSettings: "'FILL' 1" }, children: "chat" }) }) })] })) : (_jsxs("div", { className: "w-56 h-56 flex flex-col items-center justify-center gap-2", children: [_jsx("span", { className: "material-symbols-outlined text-[40px] text-[#25D366] animate-pulse", children: "qr_code_2" }), _jsx("p", { className: "text-[#8892a4] text-xs", children: "Loading QR..." })] }))] }), _jsx("p", { className: "text-center text-sm text-[#8892a4]", children: "\uD83D\uDD04 Waiting for scan..." }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { onClick: async () => { setQrCodeSync(null); await axios.post(`${API_BASE_URL}/whatsapp/reinit`).catch(() => { }); }, className: "flex-1 py-2 rounded-[10px] bg-transparent border border-[#3b82f6]/40 text-white text-xs font-semibold hover:bg-[#3b82f6]/10 hover:border-[#3b82f6] transition-all flex items-center justify-center gap-1 group", children: [_jsx("span", { className: "material-symbols-outlined text-[15px] group-hover:rotate-180 transition-transform duration-500", children: "refresh" }), "Refresh QR"] }), _jsxs("button", { onClick: async () => { setQrCodeSync(null); await axios.post(`${API_BASE_URL}/whatsapp/logout`).catch(() => { }); setTimeout(async () => { await axios.post(`${API_BASE_URL}/whatsapp/reinit`).catch(() => { }); }, 1000); }, className: "flex-1 py-2 rounded-[10px] bg-transparent border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/10 hover:border-red-500/60 transition-all flex items-center justify-center gap-1", children: [_jsx("span", { className: "material-symbols-outlined text-[15px]", children: "restart_alt" }), "Restart"] })] })] }) })), _jsxs("main", { className: "flex-1 flex overflow-hidden", children: [_jsxs("div", { className: "w-72 bg-[#191f2f] border-r border-[#434655] flex flex-col shrink-0", children: [_jsx("div", { className: "p-3 border-b border-[#434655] bg-[#232a3a]", children: _jsxs("div", { className: "relative", children: [_jsx("span", { className: "material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-[16px]", children: "search" }), _jsx("input", { placeholder: "Search chats...", className: "w-full bg-[#141b2b] border border-[#434655] rounded py-1.5 pl-7 pr-3 text-sm text-[#dce2f7] focus:outline-none focus:border-blue-600" })] }) }), _jsxs("div", { className: "flex-1 overflow-y-auto", children: [_jsxs("div", { onClick: () => setActiveSender(null), className: `p-3 border-b border-[#434655]/50 cursor-pointer transition-colors relative ${!activeSender ? 'bg-[#2e3545]' : 'hover:bg-[#232a3a]'}`, children: [!activeSender && _jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-blue-600" }), _jsxs("div", { className: "flex justify-between items-baseline mb-1", children: [_jsx("span", { className: "text-xs font-semibold text-[#dce2f7] truncate", children: "All Files" }), _jsxs("span", { className: "text-[11px] text-[#8d90a0]", children: [allFiles.length, " files"] })] })] }), senders.map(({ name, lastFile }) => (_jsxs("div", { onClick: () => setActiveSender(lastFile.customerId), className: `p-3 border-b border-[#434655]/50 cursor-pointer transition-colors relative ${activeSender === lastFile.customerId ? 'bg-[#2e3545]' : 'hover:bg-[#232a3a]'}`, children: [activeSender === lastFile.customerId && _jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-blue-600" }), _jsxs("div", { className: "flex justify-between items-baseline mb-1", children: [_jsx("span", { className: "text-xs font-semibold text-[#dce2f7] truncate pr-2", children: name }), _jsx("span", { className: "text-[11px] text-[#8d90a0] shrink-0", children: new Date(lastFile.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { className: "material-symbols-outlined text-[13px] text-[#8d90a0]", children: fileIcon(lastFile.fileName) }), _jsx("span", { className: "text-xs text-[#8d90a0] truncate", children: lastFile.fileName })] })] }, lastFile.customerId)))] })] }), _jsxs("div", { className: "flex-1 flex flex-col bg-[#0c1322] overflow-hidden relative", children: [_jsxs("div", { className: "px-5 py-3 border-b border-[#434655]/50 flex justify-between items-center bg-[#070e1d] shrink-0", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-9 h-9 rounded-full bg-[#2e3545] flex items-center justify-center", children: _jsx("span", { className: "material-symbols-outlined text-[#8d90a0]", children: "person" }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-base font-semibold text-[#dce2f7]", children: activeSenderInfo?.name ?? 'All Files' }), _jsxs("p", { className: "text-xs text-[#8d90a0]", children: [visibleFiles.length, " file", visibleFiles.length !== 1 ? 's' : ''] })] })] }), _jsx("div", { className: "flex gap-2", children: ['all', 'image', 'video', 'audio', 'pdf', 'document'].map(f => (_jsx("button", { onClick: () => setActiveFilter(f), className: `px-2 py-1 rounded text-xs border transition-colors ${activeFilter === f ? 'bg-blue-600/20 border-blue-600/50 text-blue-400' : 'border-[#434655] text-[#8d90a0] hover:border-[#8d90a0]'}`, children: f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) }, f))) })] }), (() => {
                                const det = detectDocuments(visibleFiles);
                                if (!det.type)
                                    return null;
                                const isReady = det.confidence >= 80 && det.front && det.back !== undefined;
                                const isSelected = det.front && selectedIds.has(det.front) && (!det.back || selectedIds.has(det.back));
                                const labels = { aadhaar: 'Aadhaar Layout', pan: 'PAN Card', passport: 'Passport Photo' };
                                const label = labels[det.type] ?? 'Document';
                                const readyText = det.type === 'aadhaar' ? `${label} (2/2 ready)` : `${label} detected`;
                                if (isSelected) {
                                    // Active state — print now
                                    return (_jsxs("div", { className: "mx-4 mt-2 px-3 py-2 bg-blue-600/20 border border-blue-500 rounded-lg flex items-center justify-between shrink-0", children: [_jsxs("span", { className: "text-xs text-blue-200 font-semibold", children: ["\u2705 ", readyText, " \u2014 Print now"] }), _jsxs("div", { className: "flex gap-2 ml-3 shrink-0", children: [_jsx("button", { onClick: handleAadhaarLayout, disabled: aadhaarLoading, className: "px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded transition-colors", children: aadhaarLoading ? '…' : 'PRINT NOW' }), _jsx("button", { onClick: () => setSelectedIds(new Set()), className: "px-2 py-1 border border-[#434655] text-[#8d90a0] hover:text-white text-xs rounded transition-colors", children: "CHANGE" })] })] }));
                                }
                                if (isReady) {
                                    // High confidence — auto-select suggestion
                                    return (_jsxs("div", { className: "mx-4 mt-2 px-3 py-2 bg-green-600/10 border border-green-600/30 rounded-lg flex items-center justify-between shrink-0", children: [_jsxs("span", { className: "text-xs text-green-300", children: ["\uD83D\uDCA1 ", readyText, " \u2014 Auto-detected (", det.confidence, "%)"] }), _jsx("button", { onClick: () => {
                                                    const ids = [det.front, ...(det.back ? [det.back] : [])];
                                                    setSelectedIds(new Set(ids));
                                                }, className: "ml-3 px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded transition-colors shrink-0", children: "AUTO SELECT" })] }));
                                }
                                // Low confidence — soft suggestion
                                return (_jsxs("div", { className: "mx-4 mt-2 px-3 py-2 bg-[#1e293b] border border-[#334155] rounded-lg flex items-center justify-between shrink-0", children: [_jsxs("span", { className: "text-xs text-[#94a3b8]", children: ["\uD83D\uDCA1 Possible ", label, " detected"] }), _jsx("button", { onClick: () => {
                                                const ids = [det.front, ...(det.back ? [det.back] : [])];
                                                setSelectedIds(new Set(ids));
                                            }, className: "ml-3 px-2 py-1 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded transition-colors shrink-0", children: "SELECT" })] }));
                            })(), _jsx("div", { className: "flex-1 overflow-y-auto p-5", style: { paddingBottom: selectedIds.size > 0 ? '80px' : '20px' }, children: visibleFiles.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center h-full gap-3 text-[#8d90a0]", children: [_jsx("span", { className: "material-symbols-outlined text-[48px]", children: "inbox" }), _jsx("p", { className: "text-sm", children: connected ? 'No files yet' : 'WhatsApp not connected' })] })) : (_jsx("div", { className: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3", children: visibleFiles.map(file => {
                                        const selected = selectedIds.has(file.id);
                                        const isNew = newIds.current.has(file.id);
                                        const thumb = getPreviewUrl(file.fileUrl);
                                        return (_jsxs("div", { onDoubleClick: () => handleDownload(file), onContextMenu: e => { e.preventDefault(); if (window.confirm(`Delete ${file.fileName}?`))
                                                handleDelete(file); }, className: `bg-[#191f2f] border rounded-lg overflow-hidden group relative cursor-pointer transition-all select-none
                        ${selected ? 'border-blue-500 ring-1 ring-blue-500' : isNew ? 'border-green-500/60' : 'border-[#434655] hover:border-[#8d90a0]'}`, children: [_jsx("div", { className: "absolute top-2 left-2 z-10", onClick: e => { e.stopPropagation(); toggleSelect(file.id); }, children: _jsx("input", { type: "checkbox", checked: selected, onChange: () => { }, className: `w-4 h-4 cursor-pointer accent-blue-500 ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity` }) }), _jsxs("div", { className: "h-32 bg-[#2e3545] relative", onClick: () => { setSelectedFile(file); setIsPreviewOpen(true); }, children: [isImage(file.fileName) ? (_jsx("img", { src: thumb, alt: file.fileName, className: "w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" })) : (_jsx("div", { className: "w-full h-full flex items-center justify-center", children: _jsx("span", { className: "material-symbols-outlined text-[36px] text-[#434655] group-hover:text-[#8d90a0] transition-colors", children: fileIcon(file.fileName) }) })), _jsx("div", { className: "absolute top-1.5 right-1.5 bg-[#232a3a]/80 px-1.5 py-0.5 rounded text-[9px] text-[#8d90a0] uppercase", children: file.fileName.split('.').pop() })] }), _jsxs("div", { className: "px-2 py-1.5 border-t border-[#434655]/50", children: [_jsx("p", { className: "text-[11px] font-medium text-[#dce2f7] truncate", children: file.fileName }), _jsx("p", { className: "text-[10px] text-[#434655] mt-0.5", children: new Date(file.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })] })] }, file.id));
                                    }) })) }), selectedIds.size > 0 && (_jsxs("div", { className: "absolute bottom-0 left-0 right-0 z-20 px-5 py-3 bg-[#070e1d]/95 backdrop-blur-sm border-t border-[#434655] flex items-center gap-3", children: [_jsxs("span", { className: "text-xs text-[#8d90a0] shrink-0", children: [selectedIds.size, " selected"] }), _jsxs("div", { className: "flex-1 flex gap-2", children: [_jsxs("button", { onClick: handleAadhaarLayout, disabled: selectedIds.size !== 2 || aadhaarLoading, className: "flex-1 bg-blue-600 disabled:bg-blue-600/30 disabled:cursor-not-allowed text-white py-2.5 px-3 rounded font-semibold text-sm hover:bg-blue-500 transition-colors flex items-center justify-center gap-2", children: [_jsx("span", { className: "material-symbols-outlined text-[18px]", children: "layers" }), aadhaarLoading ? 'Processing…' : 'Aadhaar Layout'] }), _jsxs("button", { disabled: selectedIds.size === 0, onClick: () => { const f = visibleFiles.find(f => selectedIds.has(f.id)); if (f)
                                                    handlePrint(f); }, className: "flex-1 bg-[#2e3545] disabled:opacity-40 text-[#dce2f7] py-2.5 px-3 rounded text-sm border border-[#434655] hover:bg-[#3a4255] transition-colors flex items-center justify-center gap-2", children: [_jsx("span", { className: "material-symbols-outlined text-[18px]", children: "print" }), " Print"] }), _jsxs("button", { disabled: selectedIds.size === 0, onClick: () => { visibleFiles.filter(f => selectedIds.has(f.id)).forEach(handleDownload); }, className: "flex-1 bg-[#2e3545] disabled:opacity-40 text-[#dce2f7] py-2.5 px-3 rounded text-sm border border-[#434655] hover:bg-[#3a4255] transition-colors flex items-center justify-center gap-2", children: [_jsx("span", { className: "material-symbols-outlined text-[18px]", children: "download" }), " Download"] }), _jsxs("button", { disabled: selectedIds.size === 0, onClick: () => {
                                                    const selected = visibleFiles.filter(f => selectedIds.has(f.id)).map(f => ({ id: f.id, fileName: f.fileName, fileUrl: f.fileUrl, customerName: f.customerName }));
                                                    navigate(`/stitch?files=${encodeURIComponent(JSON.stringify(selected))}`);
                                                }, className: "flex-1 bg-green-700 disabled:opacity-40 text-white py-2.5 px-3 rounded text-sm hover:bg-green-600 transition-colors flex items-center justify-center gap-2", children: [_jsx("span", { className: "material-symbols-outlined text-[18px]", children: "layers" }), " File Stitch"] }), _jsxs("button", { disabled: selectedIds.size === 0, onClick: () => {
                                                    const selected = visibleFiles.filter(f => selectedIds.has(f.id)).map(f => ({ id: f.id, fileName: f.fileName, fileUrl: f.fileUrl, customerName: f.customerName }));
                                                    navigate(`/form-ready?files=${encodeURIComponent(JSON.stringify(selected))}`);
                                                }, className: "flex-1 bg-purple-700 disabled:opacity-40 text-white py-2.5 px-3 rounded text-sm hover:bg-purple-600 transition-colors flex items-center justify-center gap-2", children: [_jsx("span", { className: "material-symbols-outlined text-[18px]", children: "description" }), " Form Ready"] }), "              "] }), _jsx("button", { onClick: () => setSelectedIds(new Set()), className: "text-[#8d90a0] hover:text-[#dce2f7] p-1 transition-colors shrink-0", children: _jsx("span", { className: "material-symbols-outlined text-[20px]", children: "close" }) })] }))] }), _jsxs("div", { className: "hidden lg:flex w-[200px] bg-[#0f172a] border-l border-[#334155] flex-col shrink-0", children: [_jsx("div", { className: "px-3 py-2 border-b border-[#334155] flex justify-between items-center", children: _jsx("span", { className: "text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider", children: selectedIds.size > 0 ? `${selectedIds.size} SELECTED` : 'SELECTION' }) }), _jsxs("div", { className: "p-2 flex flex-col gap-1.5 flex-1", children: [_jsxs("button", { onClick: handleAadhaarLayout, disabled: selectedIds.size !== 2 || aadhaarLoading, className: "w-full bg-blue-600 disabled:bg-blue-600/30 disabled:cursor-not-allowed text-white py-2.5 px-2 rounded-sm text-xs font-bold hover:bg-blue-500 transition-colors flex items-center justify-center gap-1.5 h-10", children: [_jsx("span", { className: "material-symbols-outlined text-[16px]", children: "badge" }), _jsx("span", { className: "uppercase tracking-wide", children: aadhaarLoading ? 'Processing…' : 'Print Aadhaar' })] }), _jsxs("button", { disabled: selectedIds.size === 0, onClick: () => { const f = visibleFiles.find(f => selectedIds.has(f.id)); if (f)
                                            handlePrint(f); }, className: "w-full bg-[#1e293b] disabled:opacity-40 text-[#f1f5f9] py-1.5 px-2 rounded-sm border border-[#334155] text-[10px] font-semibold hover:bg-[#334155] transition-colors flex items-center justify-center gap-1 uppercase tracking-wide", children: [_jsx("span", { className: "material-symbols-outlined text-[12px]", children: "print" }), " Print Selected"] }), _jsxs("button", { disabled: selectedIds.size === 0, onClick: () => { visibleFiles.filter(f => selectedIds.has(f.id)).forEach(handleDownload); }, className: "w-full bg-transparent disabled:opacity-40 text-[#f1f5f9] py-1 px-2 rounded-sm text-[10px] font-medium hover:bg-[#1e293b] transition-colors flex items-center justify-center gap-1 uppercase tracking-wide", children: [_jsx("span", { className: "material-symbols-outlined text-[12px]", children: "download" }), " Download Selected"] }), selectedIds.size > 0 && (_jsx("button", { onClick: () => setSelectedIds(new Set()), className: "w-full text-[#ef4444] py-1 text-[9px] font-medium hover:opacity-80 transition-opacity uppercase tracking-wider", children: "Clear Selection" })), _jsxs("div", { className: "mt-auto flex flex-col gap-1 pt-2 border-t border-[#334155]", children: [_jsxs("button", { onClick: () => setSelectedIds(new Set(visibleFiles.map(f => f.id))), className: "w-full text-left text-[#94a3b8] hover:text-[#f1f5f9] text-[10px] font-medium py-1 px-1.5 rounded-sm hover:bg-[#1e293b] flex items-center justify-between transition-colors uppercase tracking-wide", children: ["Select All (", visibleFiles.length, ") ", _jsx("span", { className: "material-symbols-outlined text-[12px]", children: "done_all" })] }), _jsxs("button", { onClick: () => visibleFiles.forEach(handleDownload), className: "w-full text-left text-[#94a3b8] hover:text-[#f1f5f9] text-[10px] font-medium py-1 px-1.5 rounded-sm hover:bg-[#1e293b] flex items-center justify-between transition-colors uppercase tracking-wide", children: ["Download All ", _jsx("span", { className: "material-symbols-outlined text-[12px]", children: "folder_zip" })] })] })] })] })] }), uploadQueue.length > 0 && (_jsxs("div", { className: "fixed bottom-0 right-0 w-[260px] bg-[#0f172a] border border-[#334155] rounded-tl-sm shadow-lg z-50", children: [_jsxs("div", { className: "px-2 py-1 flex justify-between items-center border-b border-[#334155] bg-[#1e293b]", children: [_jsxs("span", { className: "text-[10px] font-bold text-[#f1f5f9] flex items-center gap-1 uppercase tracking-wide", children: [_jsx("span", { className: `material-symbols-outlined text-[12px] text-blue-400 ${uploadQueue.some(i => i.status === 'uploading') ? 'animate-spin' : ''}`, children: "sync" }), "Queue (", uploadQueue.length, ")"] }), _jsx("button", { onClick: () => setUploadQueue([]), className: "text-[#94a3b8] hover:text-white text-[10px]", children: "\u2715" })] }), _jsx("div", { className: "flex flex-col font-mono max-h-32 overflow-y-auto", children: uploadQueue.slice(-8).map((item, i) => (_jsxs("div", { className: "px-2 py-1 flex items-center gap-1.5 border-b border-[#334155]/30 last:border-0", children: [item.status === 'uploading' && _jsx("span", { className: "material-symbols-outlined text-blue-400 text-[10px] animate-spin", children: "sync" }), item.status === 'queued' && _jsx("span", { className: "material-symbols-outlined text-[#94a3b8] text-[10px]", children: "schedule" }), item.status === 'done' && _jsx("span", { className: "material-symbols-outlined text-[#22c55e] text-[10px]", children: "check_circle" }), item.status === 'failed' && _jsx("span", { className: "material-symbols-outlined text-[#ef4444] text-[10px]", children: "error" }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-[9px] truncate", style: { color: item.status === 'failed' ? '#ef4444' : item.status === 'done' ? '#94a3b8' : '#f1f5f9' }, children: item.fileName }), item.status === 'failed' && _jsx("div", { className: "text-[8px] text-[#ef4444]/70", children: item.reason })] })] }, i))) })] })), _jsx(PreviewModal, { file: selectedFile, isOpen: isPreviewOpen, onClose: () => { setIsPreviewOpen(false); setTimeout(() => setSelectedFile(null), 200); }, onDownload: handleDownload, onPrint: handlePrint, onPrevious: () => currentIndex > 0 && setSelectedFile(visibleFiles[currentIndex - 1]), onNext: () => currentIndex < visibleFiles.length - 1 && setSelectedFile(visibleFiles[currentIndex + 1]), hasPrevious: currentIndex > 0, hasNext: currentIndex < visibleFiles.length - 1 })] }));
}
