import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { io } from 'socket.io-client';
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
    socket.on('connection:status', (s: { connected: boolean; qrCode?: string }) => {
      setConnected(s.connected);
      const newQr = s.connected ? null : (s.qrCode ?? null);
      setQrCodeSync(newQr);
      if (newQr) setTimeout(async () => { const ok = await fetchWhatsAppStatus().catch(() => false); if (ok) { useWhatsAppStore.getState().setConnected(true); setQrCodeSync(null); } }, 3000);
    });
    socket.on('new_whatsapp_file', (file: WhatsAppFile) => {
      newIds.current.add(file.id); addFile(file);
      notification.success({ message: `${file.customerName}: ${file.fileName}`, placement: 'topRight', duration: 3 });
      setTimeout(() => newIds.current.delete(file.id), 3000);
    });
    load(); loadDriveFiles();
    let qrPollTimer: ReturnType<typeof setTimeout>;
    async function pollQr() {
      if (!useWhatsAppStore.getState().connected) {
        try {
          const [{ data }, ok] = await Promise.all([axios.get<{ qrCode: string | null }>(`${API_BASE_URL}/whatsapp/qr`), fetchWhatsAppStatus()]);
          useWhatsAppStore.getState().setConnected(ok);
          if (ok) setQrCodeSync(null); else if (data.qrCode) setQrCodeSync(data.qrCode);
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
      const merged = incoming.map(f => { const ex = byId.get(f.id) ?? byName.get(f.fileName); if (!ex) return f; return { ...f, customerName: (ex.customerName && !ex.customerName.startsWith('Guest')) ? ex.customerName : f.customerName, profilePicUrl: ex.profilePicUrl ?? f.profilePicUrl ?? null }; });
      const driveIds = new Set(incoming.map(f => f.id));
      const socketOnly = current.filter(f => !driveIds.has(f.id) && !merged.find(m => m.fileName === f.fileName));
      useWhatsAppStore.getState().setFiles([...socketOnly, ...merged].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch { /* ignore */ }
  }

  async function load() {
    setLoading(true); setError(null);
    try { const [fetched, ok] = await Promise.all([fetchWhatsAppFiles(), fetchWhatsAppStatus()]); if (fetched.length > 0) setFiles(fetched); setConnected(ok); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }

  const handleDelete = useCallback(async (file: WhatsAppFile) => {
    try { await axios.delete(`${API_BASE_URL}/drive/files/${file.id}`); } catch { try { await deleteWhatsAppFile(file.id); } catch { /* ignore */ } }
    removeFile(file.id); if (selectedFile?.id === file.id) setIsPreviewOpen(false);
    notification.success({ message: 'File deleted', placement: 'topRight' });
  }, [selectedFile]);

  const handleDownload = useCallback((file: WhatsAppFile) => {
    const a = document.createElement('a'); a.href = getPreviewUrl(file.fileUrl); a.download = file.fileName; a.target = '_blank';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }, []);

  const handlePrint = useCallback((file: WhatsAppFile) => {
    const win = window.open(getPreviewUrl(file.fileUrl), '_blank');
    win?.addEventListener('load', () => win.print());
  }, []);

  const allFiles = useMemo(() => (Array.isArray(files) ? files : []).map(f => normalizeWhatsAppFile(f)).filter((f): f is WhatsAppFile => f !== null), [files]);

  // Unique senders for chat list
  const senders = useMemo(() => {
    const map = new Map<string, { name: string; lastFile: WhatsAppFile }>();
    [...allFiles].reverse().forEach(f => { map.set(f.customerId, { name: f.customerName, lastFile: f }); });
    return Array.from(map.values()).reverse();
  }, [allFiles]);

  const visibleFiles = useMemo(() => {
    let result = allFiles;
    if (activeSender) result = result.filter(f => f.customerId === activeSender);
    if (activeFilter !== 'all') result = result.filter(f => EXT_FILTER(f.fileName) === activeFilter);
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); result = result.filter(f => f.fileName.toLowerCase().includes(q) || f.customerName.toLowerCase().includes(q)); }
    return result;
  }, [allFiles, activeSender, activeFilter, searchQuery]);

  const currentIndex = useMemo(() => selectedFile ? visibleFiles.findIndex(f => f.id === selectedFile.id) : -1, [selectedFile, visibleFiles]);
  const activeSenderInfo = activeSender ? senders.find(s => s.lastFile.customerId === activeSender) : null;

  return (
    <div className="bg-[#0c1322] text-[#dce2f7] h-screen flex flex-col overflow-hidden font-['Inter',sans-serif]">

      {/* TopNav */}
      <nav className="bg-slate-950 border-b border-slate-800 flex justify-between items-center px-6 h-14 shrink-0 z-50">
        <div className="flex items-center gap-6">
          <span className="text-lg font-bold text-slate-100 uppercase tracking-widest">CyberNet WhatsApp</span>
          <div className="hidden md:flex gap-1">
            {['Inbox','Media Hub','Direct Print'].map((t,i) => (
              <a key={t} href="#" className={`text-sm px-3 py-1 border-b-2 transition-colors ${i===0 ? 'text-blue-500 border-blue-500' : 'text-slate-400 border-transparent hover:bg-slate-900 rounded'}`}>{t}</a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative hidden lg:block">
            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">search</span>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="w-56 bg-[#232a3a] border border-[#434655] rounded py-1 pl-8 pr-3 text-sm text-[#dce2f7] focus:outline-none focus:border-blue-600" />
          </div>
          <div className="flex items-center gap-2 border-l border-[#434655] pl-3 ml-1">
            <span className={`text-xs flex items-center gap-1 ${connected ? 'text-green-400' : 'text-red-400'}`}>
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              {connected ? 'Connected' : 'Disconnected'}
            </span>
            <GoogleDriveLogin />
            <button onClick={load} disabled={loading} className="p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors">
              <span className={`material-symbols-outlined text-[20px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
            </button>
            {!connected && (
              <button onClick={async () => { setQrCodeSync(null); await axios.post(`${API_BASE_URL}/whatsapp/reinit`).catch(() => {}); }}
                className="p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors" title="Refresh QR">
                <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* QR overlay when disconnected */}
      {!connected && qrCode && (
        <div className="absolute inset-0 z-40 bg-black/70 flex items-center justify-center" style={{top:'56px'}}>
          <div className="bg-[#191f2f] border border-[#434655] rounded-xl p-8 flex flex-col items-center gap-4 max-w-xs w-full">
            <span className="text-2xl">📱</span>
            <p className="text-[#dce2f7] font-semibold">Link your WhatsApp</p>
            <img src={qrCode} alt="QR" className="w-48 h-48 rounded-lg bg-white p-2" />
            <p className="text-[#8d90a0] text-xs text-center">WhatsApp → Linked Devices → Link a Device</p>
          </div>
        </div>
      )}

      {/* Main workspace */}
      <main className="flex-1 flex overflow-hidden">

        {/* Col 1: Chat list */}
        <div className="w-72 bg-[#191f2f] border-r border-[#434655] flex flex-col shrink-0">
          <div className="p-3 border-b border-[#434655] bg-[#232a3a]">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-[16px]">search</span>
              <input placeholder="Search chats..." className="w-full bg-[#141b2b] border border-[#434655] rounded py-1.5 pl-7 pr-3 text-sm text-[#dce2f7] focus:outline-none focus:border-blue-600" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* All files entry */}
            <div onClick={() => setActiveSender(null)}
              className={`p-3 border-b border-[#434655]/50 cursor-pointer transition-colors relative ${!activeSender ? 'bg-[#2e3545]' : 'hover:bg-[#232a3a]'}`}>
              {!activeSender && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-600" />}
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-semibold text-[#dce2f7] truncate">All Files</span>
                <span className="text-[11px] text-[#8d90a0]">{allFiles.length} files</span>
              </div>
            </div>
            {senders.map(({ name, lastFile }) => (
              <div key={lastFile.customerId} onClick={() => setActiveSender(lastFile.customerId)}
                className={`p-3 border-b border-[#434655]/50 cursor-pointer transition-colors relative ${activeSender === lastFile.customerId ? 'bg-[#2e3545]' : 'hover:bg-[#232a3a]'}`}>
                {activeSender === lastFile.customerId && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-600" />}
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-semibold text-[#dce2f7] truncate pr-2">{name}</span>
                  <span className="text-[11px] text-[#8d90a0] shrink-0">{new Date(lastFile.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px] text-[#8d90a0]">{fileIcon(lastFile.fileName)}</span>
                  <span className="text-xs text-[#8d90a0] truncate">{lastFile.fileName}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Col 2: Media grid */}
        <div className="flex-1 flex flex-col bg-[#0c1322] overflow-hidden">
          {/* Context header */}
          <div className="px-5 py-3 border-b border-[#434655]/50 flex justify-between items-center bg-[#070e1d] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#2e3545] flex items-center justify-center">
                <span className="material-symbols-outlined text-[#8d90a0]">person</span>
              </div>
              <div>
                <h2 className="text-base font-semibold text-[#dce2f7]">{activeSenderInfo?.name ?? 'All Files'}</h2>
                <p className="text-xs text-[#8d90a0]">{visibleFiles.length} file{visibleFiles.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {['all','image','video','audio','pdf','document'].map(f => (
                <button key={f} onClick={() => setActiveFilter(f)}
                  className={`px-2 py-1 rounded text-xs border transition-colors ${activeFilter === f ? 'bg-blue-600/20 border-blue-600/50 text-blue-400' : 'border-[#434655] text-[#8d90a0] hover:border-[#8d90a0]'}`}>
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {visibleFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-[#8d90a0]">
                <span className="material-symbols-outlined text-[48px]">inbox</span>
                <p className="text-sm">{connected ? 'No files yet' : 'WhatsApp not connected'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {visibleFiles.map(file => {
                  const selected = selectedIds.has(file.id);
                  const isNew = newIds.current.has(file.id);
                  const thumb = getPreviewUrl(file.fileUrl);
                  return (
                    <div key={file.id}
                      className={`bg-[#191f2f] border rounded-lg overflow-hidden group relative cursor-pointer transition-all
                        ${selected ? 'border-blue-500 ring-1 ring-blue-500' : isNew ? 'border-green-500/60' : 'border-[#434655] hover:border-[#8d90a0]'}`}>
                      {/* Checkbox */}
                      <div className="absolute top-2 left-2 z-10" onClick={e => { e.stopPropagation(); toggleSelect(file.id); }}>
                        <input type="checkbox" checked={selected} onChange={() => {}}
                          className={`w-4 h-4 cursor-pointer accent-blue-500 ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`} />
                      </div>
                      {/* Thumbnail */}
                      <div className="h-36 bg-[#2e3545] relative" onClick={() => { setSelectedFile(file); setIsPreviewOpen(true); }}>
                        {isImage(file.fileName) ? (
                          <img src={thumb} alt={file.fileName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-[40px] text-[#434655] group-hover:text-[#8d90a0] transition-colors">{fileIcon(file.fileName)}</span>
                          </div>
                        )}
                        <div className="absolute top-2 right-2 bg-[#232a3a]/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] text-[#dce2f7] border border-[#434655]/30 uppercase">
                          {file.fileName.split('.').pop()}
                        </div>
                      </div>
                      {/* Info */}
                      <div className="p-2 flex justify-between items-end border-t border-[#434655]/50">
                        <div className="truncate pr-1 min-w-0">
                          <p className="text-xs font-medium text-[#dce2f7] truncate">{file.fileName}</p>
                          <p className="text-[10px] text-[#8d90a0] mt-0.5">{file.customerName}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={e => { e.stopPropagation(); handleDownload(file); }} className="text-[#8d90a0] hover:text-[#dce2f7] shrink-0 transition-colors">
                            <span className="material-symbols-outlined text-[18px]">download</span>
                          </button>
                          <button onClick={e => { e.stopPropagation(); handleDelete(file); }} className="text-[#8d90a0] hover:text-red-400 shrink-0 transition-colors">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Col 3: Actions panel */}
        <div className="w-64 bg-[#191f2f] border-l border-[#434655] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#434655] bg-[#232a3a]">
            <p className="text-[10px] text-[#8d90a0] uppercase tracking-wider mb-1">Selection</p>
            <p className="text-lg font-semibold text-[#dce2f7]">{selectedIds.size} File{selectedIds.size !== 1 ? 's' : ''} Selected</p>
            {selectedIds.size > 0 && <p className="text-xs text-[#8d90a0]">Click files to select</p>}
          </div>
          <div className="p-4 flex flex-col gap-2 flex-1">
            <p className="text-[10px] text-[#8d90a0] uppercase tracking-wider mt-1 mb-1">Primary Workflows</p>
            <button onClick={handleAadhaarLayout} disabled={selectedIds.size !== 2 || aadhaarLoading}
              className="w-full bg-blue-600 disabled:bg-blue-600/30 disabled:cursor-not-allowed text-white py-4 px-3 rounded font-semibold hover:bg-blue-700 transition-colors flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-[28px]">layers</span>
              <span className="text-sm">{aadhaarLoading ? 'Processing…' : selectedIds.size === 2 ? 'Aadhaar Layout' : `Aadhaar Layout (${selectedIds.size}/2)`}</span>
            </button>
            <button disabled={selectedIds.size === 0} onClick={() => { const f = visibleFiles.find(f => selectedIds.has(f.id)); if (f) handlePrint(f); }}
              className="w-full bg-[#2e3545] disabled:opacity-40 text-[#dce2f7] py-2 px-3 rounded border border-[#434655] text-sm hover:border-[#8d90a0] hover:bg-[#232a3a] transition-colors flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">print</span> Print Selected
            </button>
            <div className="h-px bg-[#434655]/50 my-2" />
            <p className="text-[10px] text-[#8d90a0] uppercase tracking-wider mb-1">Utility</p>
            <button disabled={selectedIds.size === 0} onClick={() => { visibleFiles.filter(f => selectedIds.has(f.id)).forEach(handleDownload); }}
              className="w-full bg-transparent disabled:opacity-40 text-[#dce2f7] py-2 px-3 rounded border border-[#434655] text-sm hover:bg-[#2e3545] transition-colors flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">download</span> Download Selected
            </button>
            {selectedIds.size > 0 && (
              <button onClick={() => setSelectedIds(new Set())} className="w-full text-[#8d90a0] py-1 text-xs hover:text-[#dce2f7] transition-colors">
                Clear selection
              </button>
            )}
            <div className="mt-auto flex flex-col gap-2 pt-4">
              <button onClick={() => { setSelectedIds(new Set(visibleFiles.map(f => f.id))); }}
                className="w-full text-[#8d90a0] py-2 px-3 rounded border border-[#434655]/50 text-xs hover:text-[#dce2f7] hover:border-[#434655] transition-colors flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[16px]">done_all</span> Select All ({visibleFiles.length})
              </button>
              <button onClick={() => visibleFiles.forEach(handleDownload)}
                className="w-full text-[#8d90a0] py-2 px-3 rounded border border-[#434655]/50 text-xs hover:text-[#dce2f7] hover:border-[#434655] transition-colors flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[16px]">archive</span> Download All ({visibleFiles.length})
              </button>
            </div>
          </div>
        </div>
      </main>

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
