import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { notification } from 'antd';
import { useWhatsAppStore } from '../stores/whatsappStore';
import type { WhatsAppFile } from '../types/whatsapp';
import { deleteWhatsAppFile, fetchWhatsAppFiles, fetchWhatsAppStatus, normalizeWhatsAppFile } from '../services/whatsapp.api';
import { API_BASE_URL, SOCKET_URL, getPreviewUrl } from '../utils/helpers';
import { PreviewModal } from '../components/dashboard/preview-modal';
import GoogleDriveLogin from '../components/GoogleDriveLogin';

const EXT_FILTER = (name: string) => {
  const e = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg','jpeg','png','gif','webp','bmp','svg','heic','heif','tiff'].includes(e)) return 'image';
  if (['mp4','3gp','mov','avi','mkv','webm'].includes(e)) return 'video';
  if (['mp3','ogg','wav','aac','m4a','flac','opus'].includes(e)) return 'audio';
  if (e === 'pdf') return 'pdf';
  return 'document';
};

const FILE_ICON: Record<string, string> = {
  image: 'image', video: 'videocam', audio: 'audio_file',
  pdf: 'picture_as_pdf', document: 'description',
};

function fileIcon(name: string) { return FILE_ICON[EXT_FILTER(name)] ?? 'insert_drive_file'; }
function isImage(name: string) { return EXT_FILTER(name) === 'image'; }

export default function WhatsAppInboxPage() {
  const navigate = useNavigate();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const qrCodeRef = useRef<string | null>(null);
  const setQrCodeSync = (v: string | null) => { qrCodeRef.current = v; setQrCode(v); };
  const newIds = useRef<Set<string>>(new Set());
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const { files, connected, loading, setFiles, addFile, removeFile, setConnected, setLoading, setError } = useWhatsAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedFile, setSelectedFile] = useState<WhatsAppFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [aadhaarLoading, setAadhaarLoading] = useState(false);
  const [activeSender, setActiveSender] = useState<string | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);
  const [showChatList, setShowChatList] = useState(false);

  type QueueItem = { fileName: string; phone: string; status: 'queued' | 'uploading' | 'done' | 'failed'; reason?: string };
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);

  type DetectionResult = { type: 'aadhaar' | 'pan' | 'passport' | null; front: string | null; back: string | null; confidence: number };

  const detectDocuments = useCallback((files: typeof visibleFiles): DetectionResult => {
    const AADHAAR_FRONT = /aadhaar.*(front|f\b)|front.*(aadhaar|adhar)|adhar.*(front|f\b)/i;
    const AADHAAR_BACK  = /aadhaar.*(back|b\b)|back.*(aadhaar|adhar)|adhar.*(back|b\b)/i;
    const AADHAAR_ANY   = /aadhaar|adhar|aadhar/i;
    const PAN_PATTERN   = /pan.*(card)?|income.tax/i;
    const PASSPORT_PHOTO = /passport.*(photo|pic|size)|photo.*passport/i;

    const images = files.filter(f => EXT_FILTER(f.fileName) === 'image');
    const front = images.find(f => AADHAAR_FRONT.test(f.fileName));
    const back  = images.find(f => AADHAAR_BACK.test(f.fileName));
    if (front && back) return { type: 'aadhaar', front: front.id, back: back.id, confidence: 95 };

    const aadhaarFiles = images.filter(f => AADHAAR_ANY.test(f.fileName));
    if (aadhaarFiles.length >= 2) return { type: 'aadhaar', front: aadhaarFiles[0].id, back: aadhaarFiles[1].id, confidence: 85 };

    const pan = images.find(f => PAN_PATTERN.test(f.fileName));
    if (pan) return { type: 'pan', front: pan.id, back: null, confidence: 90 };

    const passport = images.find(f => PASSPORT_PHOTO.test(f.fileName));
    if (passport) return { type: 'passport', front: passport.id, back: null, confidence: 88 };

    if (images.length >= 2) {
      const bySender = new Map<string, typeof images>();
      images.forEach(f => { const arr = bySender.get(f.customerId) ?? []; arr.push(f); bySender.set(f.customerId, arr); });
      for (const [, arr] of bySender) {
        if (arr.length >= 2) return { type: 'aadhaar', front: arr[0].id, back: arr[1].id, confidence: 65 };
      }
    }
    return { type: null, front: null, back: null, confidence: 0 };
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const handleAadhaarLayout = useCallback(async () => {
    if (selectedIds.size !== 2) return;
    setAadhaarLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/process`, { fileIds: Array.from(selectedIds), action: 'aadhaar_layout' }, { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
      setSelectedIds(new Set());
    } catch { notification.error({ message: 'Aadhaar layout failed', placement: 'topRight' }); }
    finally { setAadhaarLoading(false); }
  }, [selectedIds]);

  useEffect(() => {
    if (socketRef.current) return;
    const socket = io(SOCKET_URL);
    socketRef.current = socket;
    socket.on("connection:status", (s: { connected: boolean; qrCode?: string }) => {
      setConnected(s.connected);
      const newQr = s.connected ? null : (s.qrCode ?? null);
      if (s.connected || !qrCodeRef.current) setQrCodeSync(newQr);
      if (newQr) setTimeout(async () => { const ok = await fetchWhatsAppStatus().catch(() => false); if (ok) { useWhatsAppStore.getState().setConnected(true); setQrCodeSync(null); } }, 3000);
    });
    socket.on("new_whatsapp_file", (file: WhatsAppFile) => {
      newIds.current.add(file.id); addFile(file);
      notification.success({ message: `${file.customerName}: ${file.fileName}`, placement: "topRight", duration: 3 });
      setTimeout(() => newIds.current.delete(file.id), 3000);
      setTimeout(() => {
        const current = useWhatsAppStore.getState().files.map(f => normalizeWhatsAppFile(f)).filter(Boolean) as typeof visibleFiles;
        const det = detectDocuments(current);
        if (det.type === "aadhaar" && det.confidence >= 80 && det.front && det.back) {
          setSelectedIds(new Set([det.front, det.back]));
        }
      }, 500);
    });
    socket.on("upload:queued", ({ fileName, phone }: { fileName: string; phone: string }) => {
      setUploadQueue(q => [...q.slice(-19), { fileName, phone, status: "queued" }]);
    });
    socket.on("upload:start", ({ fileName }: { fileName: string }) => {
      setUploadQueue(q => q.map(i => i.fileName === fileName ? { ...i, status: "uploading" } : i));
    });
    socket.on("upload:done", ({ fileName }: { fileName: string }) => {
      setUploadQueue(q => q.map(i => i.fileName === fileName ? { ...i, status: "done" } : i));
      setTimeout(() => setUploadQueue(q => q.filter(i => i.fileName !== fileName || i.status !== "done")), 5000);
    });
    socket.on("upload:fail", ({ fileName, reason }: { fileName: string; reason: string }) => {
      setUploadQueue(q => q.map(i => i.fileName === fileName ? { ...i, status: "failed", reason } : i));
    });
    load(); loadDriveFiles();
    let qrPollTimer: ReturnType<typeof setTimeout>;
    async function pollQr() {
      if (!useWhatsAppStore.getState().connected) {
        try {
          const [{ data }, ok] = await Promise.all([axios.get<{ qrCode: string | null }>(`${API_BASE_URL}/whatsapp/qr`), fetchWhatsAppStatus()]);
          useWhatsAppStore.getState().setConnected(ok);
          if (ok) setQrCodeSync(null); else if (data.qrCode && !qrCodeRef.current) setQrCodeSync(data.qrCode);
        } catch { /* ignore */ }
      }
      qrPollTimer = setTimeout(pollQr, qrCodeRef.current ? 2000 : 5000);
    }
    qrPollTimer = setTimeout(pollQr, 500);
    const drivePoll = setInterval(loadDriveFiles, 10000);
    return () => { socket.disconnect(); socketRef.current = null; clearInterval(drivePoll); clearTimeout(qrPollTimer); };
  }, []);

  async function loadDriveFiles() {
    try {
      const { data } = await axios.get<unknown[]>(`${API_BASE_URL}/drive/files`);
      const incoming = data.map(f => normalizeWhatsAppFile(f as Parameters<typeof normalizeWhatsAppFile>[0])).filter((f): f is WhatsAppFile => f !== null);
      if (!incoming.length) return;
      const current = useWhatsAppStore.getState().files;
      const byId = new Map(current.map(f => [f.id, f]));
      const byName = new Map(current.map(f => [f.fileName, f]));
      const merged = incoming.map(f => { const ex = byId.get(f.id) ?? byName.get(f.fileName); if (!ex) return f; return { ...f, customerName: (ex.customerName && !ex.customerName.startsWith("Guest")) ? ex.customerName : f.customerName, profilePicUrl: ex.profilePicUrl ?? f.profilePicUrl ?? null }; });
      const driveIds = new Set(incoming.map(f => f.id));
      const socketOnly = current.filter(f => !driveIds.has(f.id) && !merged.find(m => m.fileName === f.fileName));
      useWhatsAppStore.getState().setFiles([...socketOnly, ...merged].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch { /* ignore */ }
  }

  async function load() {
    setLoading(true); setError(null);
    try { const [fetched, ok] = await Promise.all([fetchWhatsAppFiles(), fetchWhatsAppStatus()]); if (fetched.length > 0) setFiles(fetched); setConnected(ok); setStatusChecked(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }

  const handleDelete = useCallback(async (file: WhatsAppFile) => {
    try { await axios.delete(`${API_BASE_URL}/drive/files/${file.id}`); } catch { try { await deleteWhatsAppFile(file.id); } catch { /* ignore */ } }
    removeFile(file.id); if (selectedFile?.id === file.id) setIsPreviewOpen(false);
    notification.success({ message: "File deleted", placement: "topRight" });
  }, [selectedFile]);

  const getDownloadUrl = (fileUrl: string) => {
    const m = fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
    return fileUrl;
  };

  const handleDownload = useCallback((file: WhatsAppFile) => {
    const url = getDownloadUrl(file.fileUrl);
    const a = document.createElement("a");
    a.href = url; a.download = file.fileName; a.target = "_blank";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }, []);

  const handlePrint = useCallback((file: WhatsAppFile) => {
    const m = file.fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const ext = file.fileName.split(".").pop()?.toLowerCase();
    if (m && ext === "pdf") {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        const a = document.createElement("a");
        a.href = `https://drive.google.com/uc?export=download&id=${m[1]}`;
        a.download = file.fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } else {
        window.open(`https://drive.google.com/file/d/${m[1]}/view`, "_blank");
      }
      return;
    }
    const fullUrl = m
      ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1600`
      : getPreviewUrl(file.fileUrl);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><body style="margin:0"><img src="${fullUrl}" style="max-width:100%" onload="window.print()"/></body></html>`);
    win.document.close();
  }, []);

  const allFiles = useMemo(() => (Array.isArray(files) ? files : []).map(f => normalizeWhatsAppFile(f)).filter((f): f is WhatsAppFile => f !== null), [files]);

  const senders = useMemo(() => {
    const map = new Map<string, { name: string; lastFile: WhatsAppFile }>();
    [...allFiles].reverse().forEach(f => { map.set(f.customerId, { name: f.customerName, lastFile: f }); });
    return Array.from(map.values()).reverse();
  }, [allFiles]);

  const visibleFiles = useMemo(() => {
    let result = allFiles;
    if (activeSender) result = result.filter(f => f.customerId === activeSender);
    if (activeFilter !== "all") result = result.filter(f => EXT_FILTER(f.fileName) === activeFilter);
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); result = result.filter(f => f.fileName.toLowerCase().includes(q) || f.customerName.toLowerCase().includes(q)); }
    return result;
  }, [allFiles, activeSender, activeFilter, searchQuery]);

  const currentIndex = useMemo(() => selectedFile ? visibleFiles.findIndex(f => f.id === selectedFile.id) : -1, [selectedFile, visibleFiles]);
  const activeSenderInfo = activeSender ? senders.find(s => s.lastFile.customerId === activeSender) : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* QR overlay when disconnected */}
      {statusChecked && !connected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-[320px] bg-card rounded-2xl border border-border shadow-2xl flex flex-col p-5 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#25D366]/10 border border-[#25D366]/30 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#25D366] text-[20px]" style={{fontVariationSettings:"'FILL' 1"}}>chat</span>
              </div>
              <div>
                <h2 className="text-white text-base font-bold leading-tight">Scan to Connect</h2>
                <p className="text-muted-foreground text-[11px]">WhatsApp &rarr; Linked Devices &rarr; Scan</p>
              </div>
            </div>
            <div className="relative bg-white rounded-xl flex items-center justify-center p-3 border-2 border-[#25D366]">
              {qrCode ? (
                <img src={qrCode} alt="QR" className="w-52 h-52 object-contain" />
              ) : (
                <div className="w-52 h-52 flex flex-col items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[40px] text-[#25D366] animate-pulse">qr_code_2</span>
                  <p className="text-muted-foreground text-xs">Loading QR...</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={async () => { setQrCodeSync(null); await axios.post(`${API_BASE_URL}/whatsapp/reinit`).catch(() => {}); }}
                className="flex-1 btn-secondary text-xs flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-[14px]">refresh</span> Refresh
              </button>
              <button onClick={async () => { setQrCodeSync(null); await axios.post(`${API_BASE_URL}/whatsapp/logout`).catch(() => {}); setTimeout(async () => { await axios.post(`${API_BASE_URL}/whatsapp/reinit`).catch(() => {}); }, 1000); }}
                className="flex-1 py-2 rounded-lg bg-transparent border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/10 transition-all flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-[14px]">restart_alt</span> Restart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="px-4 md:px-6 py-3 border-b border-border flex items-center justify-between gap-3 shrink-0 bg-[#0d1220]/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowChatList(!showChatList)} className="md:hidden p-1.5 rounded-lg hover:bg-white/5">
            <span className="material-symbols-outlined text-[20px] text-[#94a3b8]">chat</span>
          </button>
          <div>
            <h1 className="text-base font-bold text-white">{activeSenderInfo?.name ?? "All Files"}</h1>
            <p className="text-xs text-muted-foreground">{visibleFiles.length} file{visibleFiles.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-[16px]">search</span>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search files..."
              className="input-field pl-8 w-48 lg:w-64" />
          </div>
          <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium ${connected ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
            {connected ? "Live" : "Off"}
          </span>
          <GoogleDriveLogin />
          <button onClick={load} disabled={loading} className="btn-ghost p-1.5">
            <span className={`material-symbols-outlined text-[18px] ${loading ? "animate-spin" : ""}`}>refresh</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Mobile chat list overlay */}
        {showChatList && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setShowChatList(false)} />}

        {/* Chat list sidebar */}
        <div className={`absolute md:static inset-y-0 left-0 z-30 w-64 bg-card border-r border-border flex flex-col shrink-0 transition-transform duration-300 ${showChatList ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
          <div className="p-3 border-b border-border">
            <input placeholder="Search chats..." className="input-field text-xs" />
          </div>
          <div className="flex-1 overflow-y-auto">
            <div onClick={() => { setActiveSender(null); setShowChatList(false); }}
              className={`px-3 py-2.5 border-b border-border/50 cursor-pointer transition-colors ${!activeSender ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-white/5"}`}>
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-foreground">All Files</span>
                <span className="text-[10px] text-muted-foreground">{allFiles.length}</span>
              </div>
            </div>
            {senders.map(({ name, lastFile }) => (
              <div key={lastFile.customerId} onClick={() => { setActiveSender(lastFile.customerId); setShowChatList(false); }}
                className={`px-3 py-2.5 border-b border-border/50 cursor-pointer transition-colors ${activeSender === lastFile.customerId ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-white/5"}`}>
                <div className="flex justify-between items-center mb-0.5">
                  <span className="text-xs font-semibold text-foreground truncate pr-2">{name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{new Date(lastFile.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px] text-muted-foreground">{fileIcon(lastFile.fileName)}</span>
                  <span className="text-[11px] text-muted-foreground truncate">{lastFile.fileName}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Files area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filter bar */}
          <div className="px-4 py-2 border-b border-border/50 flex items-center gap-2 overflow-x-auto shrink-0">
            {["all","image","video","audio","pdf","document"].map(f => (
              <button key={f} onClick={() => setActiveFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeFilter === f ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}>
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            {/* Mobile search */}
            <div className="sm:hidden ml-auto">
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..."
                className="input-field text-xs w-32" />
            </div>
          </div>

          {/* Smart detection banner */}
          {(() => {
            const det = detectDocuments(visibleFiles);
            if (!det.type) return null;
            const isSelected = det.front && selectedIds.has(det.front) && (!det.back || selectedIds.has(det.back));
            const labels: Record<string, string> = { aadhaar: "Aadhaar Layout", pan: "PAN Card", passport: "Passport Photo" };
            const label = labels[det.type] ?? "Document";

            if (isSelected) return (
              <div className="mx-4 mt-2 px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg flex items-center justify-between shrink-0">
                <span className="text-xs text-primary font-medium">✅ {label} ready</span>
                <div className="flex gap-2">
                  <button onClick={handleAadhaarLayout} disabled={aadhaarLoading} className="btn-primary text-xs py-1 px-3">
                    {aadhaarLoading ? "..." : "PRINT"}
                  </button>
                  <button onClick={() => setSelectedIds(new Set())} className="btn-ghost text-xs py-1">Change</button>
                </div>
              </div>
            );
            if (det.confidence >= 80) return (
              <div className="mx-4 mt-2 px-3 py-2 bg-green-500/5 border border-green-500/20 rounded-lg flex items-center justify-between shrink-0">
                <span className="text-xs text-green-400">💡 {label} detected ({det.confidence}%)</span>
                <button onClick={() => setSelectedIds(new Set([det.front!, ...(det.back ? [det.back] : [])]))}
                  className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-lg">Select</button>
              </div>
            );
            return null;
          })()}

          {/* File grid */}
          <div className="flex-1 overflow-y-auto p-4" style={{ paddingBottom: selectedIds.size > 0 ? "80px" : "16px" }}>
            {visibleFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
                <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[32px] text-muted-foreground">inbox</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">{connected ? "No files yet" : "WhatsApp not connected"}</p>
                  <p className="text-xs text-muted-foreground max-w-[240px]">
                    {connected ? "Files sent via WhatsApp will appear here automatically" : "Connect WhatsApp to start receiving files"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {visibleFiles.map(file => {
                  const selected = selectedIds.has(file.id);
                  const isNew = newIds.current.has(file.id);
                  const thumb = getPreviewUrl(file.fileUrl);
                  return (
                    <div key={file.id}
                      onDoubleClick={() => handleDownload(file)}
                      onContextMenu={e => { e.preventDefault(); if (window.confirm(`Delete ${file.fileName}?`)) handleDelete(file); }}
                      className={`card p-0 overflow-hidden group cursor-pointer
                        ${selected ? "!border-primary ring-1 ring-primary" : isNew ? "!border-green-500/50" : ""}`}>
                      {/* Checkbox */}
                      <div className="absolute top-2 left-2 z-10" onClick={e => { e.stopPropagation(); toggleSelect(file.id); }}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all
                          ${selected ? "bg-primary border-primary" : "border-white/30 opacity-0 group-hover:opacity-100 bg-black/40"}`}>
                          {selected && <span className="material-symbols-outlined text-white text-[14px]">check</span>}
                        </div>
                      </div>
                      {/* Thumbnail */}
                      <div className="h-28 sm:h-32 bg-secondary relative" onClick={() => { setSelectedFile(file); setIsPreviewOpen(true); }}>
                        {isImage(file.fileName) ? (
                          <img src={thumb} alt={file.fileName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-[32px] text-muted-foreground">{fileIcon(file.fileName)}</span>
                          </div>
                        )}
                        <div className="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] text-white/80 uppercase font-medium">
                          {file.fileName.split(".").pop()}
                        </div>
                      </div>
                      {/* Info */}
                      <div className="px-2.5 py-2 border-t border-border">
                        <p className="text-[11px] font-medium text-foreground truncate">{file.fileName}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(file.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom action bar */}
          {selectedIds.size > 0 && (
            <div className="absolute bottom-0 left-0 right-0 z-20 px-4 py-3 bg-card/95 backdrop-blur-sm border-t border-border flex items-center gap-3">
              <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{selectedIds.size} selected</span>
              <div className="flex-1 flex gap-2 overflow-x-auto">
                <button onClick={handleAadhaarLayout} disabled={selectedIds.size !== 2 || aadhaarLoading}
                  className="btn-primary text-xs whitespace-nowrap flex items-center gap-1.5 disabled:opacity-40">
                  <span className="material-symbols-outlined text-[16px]">badge</span>
                  {aadhaarLoading ? "..." : "Aadhaar"}
                </button>
                <button disabled={selectedIds.size === 0} onClick={() => { const f = visibleFiles.find(f => selectedIds.has(f.id)); if (f) handlePrint(f); }}
                  className="btn-secondary text-xs whitespace-nowrap flex items-center gap-1.5 disabled:opacity-40">
                  <span className="material-symbols-outlined text-[16px]">print</span> Print
                </button>
                <button disabled={selectedIds.size === 0} onClick={() => { visibleFiles.filter(f => selectedIds.has(f.id)).forEach(handleDownload); }}
                  className="btn-secondary text-xs whitespace-nowrap flex items-center gap-1.5 disabled:opacity-40">
                  <span className="material-symbols-outlined text-[16px]">download</span> Download
                </button>
                <button disabled={selectedIds.size === 0} onClick={() => {
                  const selected = visibleFiles.filter(f => selectedIds.has(f.id)).map(f => ({ id: f.id, fileName: f.fileName, fileUrl: f.fileUrl, customerName: f.customerName }));
                  navigate(`/stitch?files=${encodeURIComponent(JSON.stringify(selected))}`);
                }} className="px-3 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg whitespace-nowrap flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">layers</span> Stitch
                </button>
                <button disabled={selectedIds.size === 0} onClick={() => {
                  const selected = visibleFiles.filter(f => selectedIds.has(f.id)).map(f => ({ id: f.id, fileName: f.fileName, fileUrl: f.fileUrl, customerName: f.customerName }));
                  navigate(`/form-ready?files=${encodeURIComponent(JSON.stringify(selected))}`);
                }} className="px-3 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg whitespace-nowrap flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">description</span> Form
                </button>
              </div>
              <button onClick={() => setSelectedIds(new Set())} className="btn-ghost p-1.5 shrink-0">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Upload queue */}
      {uploadQueue.length > 0 && (
        <div className="fixed bottom-4 right-4 w-[240px] bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2 flex justify-between items-center border-b border-border bg-secondary">
            <span className="text-[10px] font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <span className={`material-symbols-outlined text-[12px] text-primary ${uploadQueue.some(i => i.status === "uploading") ? "animate-spin" : ""}`}>sync</span>
              Queue ({uploadQueue.length})
            </span>
            <button onClick={() => setUploadQueue([])} className="text-muted-foreground hover:text-white text-xs">✕</button>
          </div>
          <div className="flex flex-col max-h-28 overflow-y-auto">
            {uploadQueue.slice(-6).map((item, i) => (
              <div key={i} className="px-3 py-1.5 flex items-center gap-2 border-b border-border/30 last:border-0">
                {item.status === "uploading" && <span className="material-symbols-outlined text-primary text-[12px] animate-spin">sync</span>}
                {item.status === "queued" && <span className="material-symbols-outlined text-muted-foreground text-[12px]">schedule</span>}
                {item.status === "done" && <span className="material-symbols-outlined text-green-400 text-[12px]">check_circle</span>}
                {item.status === "failed" && <span className="material-symbols-outlined text-red-400 text-[12px]">error</span>}
                <span className="text-[10px] truncate flex-1" style={{color: item.status === "failed" ? "#ef4444" : "#e8ecf4"}}>{item.fileName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <PreviewModal
        file={selectedFile} isOpen={isPreviewOpen} onClose={() => { setIsPreviewOpen(false); setTimeout(() => setSelectedFile(null), 200); }}
        onDownload={handleDownload} onPrint={handlePrint}
        onPrevious={() => currentIndex > 0 && setSelectedFile(visibleFiles[currentIndex - 1])}
        onNext={() => currentIndex < visibleFiles.length - 1 && setSelectedFile(visibleFiles[currentIndex + 1])}
        hasPrevious={currentIndex > 0} hasNext={currentIndex < visibleFiles.length - 1}
      />
    </div>
  );
}
