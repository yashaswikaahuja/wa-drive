import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { notification } from 'antd';
import { useWhatsAppStore } from '../stores/whatsappStore';
import { deleteWhatsAppFile, fetchWhatsAppFiles, fetchWhatsAppStatus, normalizeWhatsAppFile } from '../services/whatsapp.api';
import { API_BASE_URL, SOCKET_URL, getPreviewUrl } from '../utils/helpers';
import { Header } from '../components/dashboard/header';
import { FilterBar } from '../components/dashboard/filter-bar';
import { FilesGrid } from '../components/dashboard/files-grid';
import { PreviewModal } from '../components/dashboard/preview-modal';
const EXT_FILTER = (name) => {
    const e = name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'tiff', 'tif'].includes(e))
        return 'image';
    if (['mp4', '3gp', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v'].includes(e))
        return 'video';
    if (['mp3', 'ogg', 'wav', 'aac', 'm4a', 'flac', 'opus', 'wma', 'amr'].includes(e))
        return 'audio';
    if (e === 'pdf')
        return 'pdf';
    return 'document';
};
export default function WhatsAppInboxPage() {
    const [qrCode, setQrCode] = useState(null);
    const qrCodeRef = useRef(null);
    const setQrCodeSync = (v) => { qrCodeRef.current = v; setQrCode(v); };
    const newIds = useRef(new Set());
    const socketRef = useRef(null);
    const { files, connected, loading, error, setFiles, addFile, removeFile, setConnected, setLoading, setError } = useWhatsAppStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [activeFilter, setActiveFilter] = useState('all');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    useEffect(() => {
        if (socketRef.current)
            return;
        const socket = io(SOCKET_URL);
        socketRef.current = socket;
        socket.on('connection:status', (s) => {
            setConnected(s.connected);
            const newQr = s.connected ? null : (s.qrCode ?? null);
            setQrCodeSync(newQr);
            if (newQr) {
                setTimeout(async () => {
                    const ok = await fetchWhatsAppStatus().catch(() => false);
                    if (ok) {
                        useWhatsAppStore.getState().setConnected(true);
                        setQrCodeSync(null);
                    }
                }, 3000);
            }
        });
        socket.on('new_whatsapp_file', (file) => {
            newIds.current.add(file.id);
            addFile(file);
            notification.success({ message: 'New file received', description: `${file.customerName}: ${file.fileName}`, placement: 'topRight', duration: 4 });
            setTimeout(() => newIds.current.delete(file.id), 3000);
        });
        load();
        loadDriveFiles();
        let qrPollTimer;
        async function pollQr() {
            if (!useWhatsAppStore.getState().connected) {
                try {
                    const [{ data }, ok] = await Promise.all([
                        axios.get(`${API_BASE_URL}/whatsapp/qr`),
                        fetchWhatsAppStatus(),
                    ]);
                    useWhatsAppStore.getState().setConnected(ok);
                    if (ok)
                        setQrCodeSync(null);
                    else if (data.qrCode)
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
            // Index current files by both Drive ID and fileName for merging
            const byId = new Map(current.map(f => [f.id, f]));
            const byName = new Map(current.map(f => [f.fileName, f]));
            const merged = incoming.map(f => {
                const ex = byId.get(f.id) ?? byName.get(f.fileName);
                if (!ex)
                    return f;
                // Prefer socket-received data for name/pic (richer), fall back to Drive description
                return {
                    ...f,
                    customerName: (ex.customerName && !ex.customerName.startsWith('Guest')) ? ex.customerName : f.customerName,
                    profilePicUrl: ex.profilePicUrl ?? f.profilePicUrl ?? null,
                };
            });
            // Also keep any socket-received files not yet in Drive (uploaded < 10s ago)
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
    const handleDownload = useCallback((file) => {
        const a = document.createElement('a');
        a.href = getPreviewUrl(file.fileUrl);
        a.download = file.fileName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }, []);
    const handlePrint = useCallback((file) => {
        const win = window.open(getPreviewUrl(file.fileUrl), '_blank');
        win?.addEventListener('load', () => win.print());
    }, []);
    const visibleFiles = useMemo(() => {
        let result = (Array.isArray(files) ? files : []).map(f => normalizeWhatsAppFile(f)).filter((f) => f !== null);
        if (activeFilter !== 'all')
            result = result.filter(f => EXT_FILTER(f.fileName) === activeFilter);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(f => f.fileName.toLowerCase().includes(q) || f.customerName.toLowerCase().includes(q) || f.customerId.includes(q));
        }
        return result;
    }, [files, activeFilter, searchQuery]);
    const fileCounts = useMemo(() => {
        const all = (Array.isArray(files) ? files : []).map(f => normalizeWhatsAppFile(f)).filter((f) => f !== null);
        const c = { all: all.length, image: 0, video: 0, audio: 0, pdf: 0, document: 0 };
        all.forEach(f => { c[EXT_FILTER(f.fileName)]++; });
        return c;
    }, [files]);
    const currentIndex = useMemo(() => selectedFile ? visibleFiles.findIndex(f => f.id === selectedFile.id) : -1, [selectedFile, visibleFiles]);
    const handlePreview = useCallback((file) => { setSelectedFile(file); setIsPreviewOpen(true); }, []);
    const handleClosePreview = useCallback(() => { setIsPreviewOpen(false); setTimeout(() => setSelectedFile(null), 200); }, []);
    return (_jsxs("div", { className: "min-h-screen bg-background", children: [_jsx("style", { children: `@keyframes slideDown { from { opacity:0; transform:translateY(-16px); } to { opacity:1; transform:translateY(0); } }` }), _jsx(Header, { fileCount: visibleFiles.length, isConnected: connected, driveConnected: false, viewMode: viewMode, onViewModeChange: setViewMode, searchQuery: searchQuery, onSearchChange: setSearchQuery, onRefresh: load, onDisconnect: async () => { await axios.post(`${API_BASE_URL}/whatsapp/logout`).catch(() => { }); setConnected(false); }, loading: loading }), !connected && (_jsx("div", { className: "flex flex-col items-center justify-center py-10 px-4", children: _jsxs("div", { className: "bg-card border border-border rounded-xl p-8 flex flex-col items-center gap-4 max-w-sm w-full", children: [_jsx("div", { className: "w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center", children: _jsx("span", { className: "text-accent text-xl", children: "\uD83D\uDCF1" }) }), _jsxs("div", { className: "text-center", children: [_jsx("p", { className: "text-foreground font-semibold text-lg", children: "Link your WhatsApp" }), _jsx("p", { className: "text-muted-foreground text-sm mt-1", children: "Scan the QR code to start receiving customer files" })] }), qrCode ? (_jsx("img", { src: qrCode, alt: "QR Code", className: "w-52 h-52 rounded-lg border border-border bg-white p-2" })) : (_jsx("div", { className: "w-52 h-52 rounded-lg border border-border bg-secondary/50 flex items-center justify-center", children: _jsx("p", { className: "text-muted-foreground text-sm", children: "Loading QR..." }) })), _jsx("p", { className: "text-muted-foreground text-xs text-center", children: "Open WhatsApp \u2192 Linked Devices \u2192 Link a Device" }), _jsx("button", { onClick: async () => { setQrCodeSync(null); await axios.post(`${API_BASE_URL}/whatsapp/reinit`).catch(() => { }); }, className: "text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 transition-colors", children: "Refresh QR" })] }) })), connected && (_jsxs("div", { className: "mx-4 lg:mx-6 mt-4 px-4 py-2 bg-accent/10 border border-accent/20 rounded-lg text-sm text-accent flex items-center gap-2", children: [_jsx("span", { className: "w-2 h-2 rounded-full bg-accent animate-pulse" }), "WhatsApp connected \u2014 receiving files in real time"] })), error && (_jsx("div", { className: "mx-4 lg:mx-6 mt-4 px-4 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive", children: error })), _jsxs("main", { className: "p-4 lg:p-6", children: [_jsx("div", { className: "mb-6", children: _jsx(FilterBar, { activeFilter: activeFilter, onFilterChange: setActiveFilter, counts: fileCounts }) }), _jsx(FilesGrid, { files: visibleFiles, newIds: newIds.current, viewMode: viewMode, onPreview: handlePreview, onDownload: handleDownload, onPrint: handlePrint, onDelete: handleDelete })] }), _jsx(PreviewModal, { file: selectedFile, isOpen: isPreviewOpen, onClose: handleClosePreview, onDownload: handleDownload, onPrint: handlePrint, onPrevious: () => currentIndex > 0 && setSelectedFile(visibleFiles[currentIndex - 1]), onNext: () => currentIndex < visibleFiles.length - 1 && setSelectedFile(visibleFiles[currentIndex + 1]), hasPrevious: currentIndex > 0, hasNext: currentIndex < visibleFiles.length - 1 })] }));
}
