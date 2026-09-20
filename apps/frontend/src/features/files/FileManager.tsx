/**
 * File Manager — Explorer-style, operator UX.
 * Folders = customers · click file = open preview · right-click = actions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen, Folder, MagnifyingGlass, UploadSimple, ArrowsClockwise,
  File as FileIcon, Image as ImageIcon, FilePdf, CaretRight, CaretLeft, X,
  SquaresFour, ListBullets, DownloadSimple, Trash, Camera, SpinnerGap,
  ArrowLeft, ArrowRight, ArrowBendUpLeft, MagnifyingGlassPlus, DotsThree,
  PencilSimple,
} from '@phosphor-icons/react';
import api, { API_URL } from '../../shared/api';
import { toast } from '../../shared/toast';
import { getCachedBlob } from '../../shared/fileCache';
import { useAuthStore } from '../auth/store';

type DriveFile = {
  id: string;
  fileName: string;
  fileUrl?: string;
  customerId?: string;
  customerName?: string;
  timestamp?: string;
  tag?: string;
  source?: string;
  mimeType?: string;
  driveFileId?: string;
};

type FolderRow = { phone: string; name: string; count: number };

function isImage(f: DriveFile) {
  const n = (f.fileName || '').toLowerCase();
  const m = (f.mimeType || '').toLowerCase();
  return m.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(n);
}
function isPdf(f: DriveFile) {
  const n = (f.fileName || '').toLowerCase();
  const m = (f.mimeType || '').toLowerCase();
  return m.includes('pdf') || n.endsWith('.pdf');
}

/** Strip noisy WA prefixes like 9198…_1699…_ for display */
function displayName(fileName: string) {
  if (!fileName) return 'Untitled';
  let n = fileName;
  n = n.replace(/^\d{10,15}_\d{10,13}_/, '');
  n = n.replace(/^[0-9a-f]{8}-[0-9a-f-]{27}_/i, '');
  return n || fileName;
}

function folderLabel(phone: string, name: string) {
  if (phone === '__unassigned__') return 'Unassigned';
  const nm = (name || '').trim();
  if (nm && nm !== phone && !/^\d{10,15}$/.test(nm)) return nm;
  return phone;
}

function FileGlyph({ f, size = 36 }: { f: DriveFile; size?: number }) {
  if (isPdf(f)) return <FilePdf size={size} className="text-red-400" weight="fill" />;
  if (isImage(f)) return <ImageIcon size={size} className="text-sky-400" weight="fill" />;
  return <FileIcon size={size} className="text-gray-400" weight="fill" />;
}

/** Authenticated thumbnail — Google Drive thumbnail URLs often fail in-app. */
function authFileUrl(fileId: string) {
  const token = useAuthStore.getState().accessToken || '';
  return `${API_URL}/drive/download/${fileId}?token=${encodeURIComponent(token)}`;
}

function driveIdOf(f: DriveFile) {
  return f.driveFileId || f.id;
}

function Thumb({ f }: { f: DriveFile }) {
  const [broken, setBroken] = useState(false);
  if (isImage(f) && !broken) {
    return (
      <img
        src={authFileUrl(driveIdOf(f))}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return <FileGlyph f={f} size={40} />;
}

export default function FileManager() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [folderPhone, setFolderPhone] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: DriveFile; url: string; kind: 'image' | 'pdf' } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; file: DriveFile } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewerMore, setViewerMore] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const blobUrlCache = useRef<Map<string, string>>(new Map());
  const filmstripRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/drive/files/ws');
      setFiles(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || 'Failed to load files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Revoke blob URLs on unmount
  useEffect(() => () => {
    blobUrlCache.current.forEach((url) => URL.revokeObjectURL(url));
    blobUrlCache.current.clear();
  }, []);

  useEffect(() => {
    const close = () => setCtx(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const folders: FolderRow[] = useMemo(() => {
    const map = new Map<string, FolderRow>();
    for (const f of files) {
      const phone = (f.customerId || '').trim() || '__unassigned__';
      const cur = map.get(phone);
      if (cur) {
        cur.count += 1;
        // Prefer a real name over phone digits when we see one
        if (f.customerName && f.customerName !== phone && !/^\d{10,15}$/.test(f.customerName)) {
          cur.name = f.customerName;
        }
      } else {
        map.set(phone, {
          phone,
          name: folderLabel(phone, f.customerName || ''),
          count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.phone === '__unassigned__') return 1;
      if (b.phone === '__unassigned__') return -1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [files]);

  const visibleFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files
      .filter((f) => {
        const phone = (f.customerId || '').trim() || '__unassigned__';
        if (folderPhone && phone !== folderPhone) return false;
        if (!q) return true;
        return (
          (f.fileName || '').toLowerCase().includes(q)
          || displayName(f.fileName || '').toLowerCase().includes(q)
          || (f.customerName || '').toLowerCase().includes(q)
          || (f.customerId || '').toLowerCase().includes(q)
          || (f.tag || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  }, [files, folderPhone, search]);

  const filteredFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || folderPhone) return folders;
    return folders.filter(
      (f) => f.name.toLowerCase().includes(q) || f.phone.toLowerCase().includes(q),
    );
  }, [folders, search, folderPhone]);

  const activeFolder = folderPhone ? folders.find((f) => f.phone === folderPhone) : null;
  const atRoot = !folderPhone;

  const fetchBlob = async (f: DriveFile) => {
    const id = driveIdOf(f);
    return getCachedBlob(id, async () => {
      const res = await api.get(`/drive/download/${id}`, { responseType: 'blob' });
      // Axios may give JSON error body as blob on 4xx
      if (res.status >= 400) throw new Error('Download failed');
      const type = String(res.headers['content-type'] ?? 'application/octet-stream');
      if (type.includes('application/json')) {
        const text = await (res.data as Blob).text();
        let msg = 'Download failed';
        try { msg = JSON.parse(text).error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      return new Blob([res.data], { type });
    });
  };

  const ensureBlobUrl = async (f: DriveFile) => {
    const id = driveIdOf(f);
    const cached = blobUrlCache.current.get(id);
    if (cached) return cached;
    const blob = await fetchBlob(f);
    const url = URL.createObjectURL(blob);
    blobUrlCache.current.set(id, url);
    return url;
  };

  const openFile = async (f: DriveFile) => {
    setCtx(null);
    setSelectedId(f.id);
    setOpeningId(f.id);
    try {
      if (!isImage(f) && !isPdf(f)) {
        const url = await ensureBlobUrl(f);
        window.open(url, '_blank', 'noopener');
        return;
      }
      const url = await ensureBlobUrl(f);
      setPreview({ file: f, url, kind: isImage(f) ? 'image' : 'pdf' });
      // Keep filmstrip thumb in view
      requestAnimationFrame(() => {
        const el = filmstripRef.current?.querySelector(`[data-file-id="${f.id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
    } catch (e: any) {
      toast.error(e.message || 'Could not open file');
    } finally {
      setOpeningId(null);
    }
  };

  const closePreview = () => {
    setPreview(null);
    setOpeningId(null);
    setZoom(1);
    setViewerMore(false);
  };

  const openInPhotoEditor = (f: DriveFile) => {
    const q = new URLSearchParams();
    q.set('fileId', driveIdOf(f));
    if (f.customerId) q.set('phone', f.customerId);
    if (f.customerName) q.set('name', f.customerName);
    window.location.href = `/app/photos/portal?${q}`;
  };

  const previewIndex = preview
    ? visibleFiles.findIndex((f) => f.id === preview.file.id)
    : -1;

  const goPreviewDelta = async (delta: number) => {
    if (previewIndex < 0 || !visibleFiles.length) return;
    const next = visibleFiles[(previewIndex + delta + visibleFiles.length) % visibleFiles.length];
    if (next) {
      setZoom(1);
      setViewerMore(false);
      await openFile(next);
    }
  };

  // Viewer keyboard: Esc back, ← → navigate
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePreview();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        void goPreviewDelta(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        void goPreviewDelta(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate uses latest previewIndex/visibleFiles via closure refresh
  }, [preview?.file.id, previewIndex, visibleFiles.length]);

  const downloadFile = async (f: DriveFile) => {
    setCtx(null);
    try {
      const blob = await fetchBlob(f);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = f.fileName || 'file';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e: any) {
      toast.error(e.message || 'Download failed');
    }
  };

  const deleteFile = async (f: DriveFile) => {
    setCtx(null);
    if (!confirm(`Delete "${displayName(f.fileName)}"?`)) return;
    try {
      await api.delete(`/drive/files/${f.id}`);
      setFiles((prev) => prev.filter((x) => x.id !== f.id));
      if (selectedId === f.id) setSelectedId(null);
      if (preview?.file.id === f.id) {
        closePreview();
        // After delete, jump to neighbour if any remain
        const rest = visibleFiles.filter((x) => x.id !== f.id);
        if (rest.length) void openFile(rest[Math.max(0, previewIndex - 1)] || rest[0]);
      }
      toast.success('Deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  const goRoot = () => {
    setFolderPhone(null);
    setSelectedId(null);
    setSearch('');
  };

  const openFolder = (phone: string) => {
    setFolderPhone(phone);
    setSelectedId(null);
    setSearch('');
  };

  const uploadLocal = async (list: FileList | null) => {
    if (!list?.length) return;
    if (!folderPhone || folderPhone === '__unassigned__') {
      toast.error('Open a customer folder first, then upload into it');
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('phone', folderPhone);
        fd.append('personName', activeFolder?.name || '');
        fd.append('source', 'manual-upload');
        await api.post('/customers/upload', fd);
      }
      toast.success(`Uploaded ${list.length} file(s) to ${activeFolder?.name || folderPhone}`);
      await load();
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onContextMenu = (e: React.MouseEvent, f: DriveFile) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(f.id);
    const pad = 8;
    const menuW = 180;
    const menuH = 160;
    const x = Math.min(e.clientX, window.innerWidth - menuW - pad);
    const y = Math.min(e.clientY, window.innerHeight - menuH - pad);
    setCtx({ x, y, file: f });
  };

  return (
    <div className="h-full md:h-[calc(100vh-4rem)] flex flex-col min-h-0 bg-[hsl(var(--background))]">
      {/* Toolbar */}
      <div
        className="shrink-0 border-b px-3 py-2 flex flex-wrap items-center gap-2"
        style={{ borderColor: 'var(--border)', background: 'hsl(var(--pt-card, var(--card)))' }}
      >
        {!atRoot && (
          <button type="button" className="btn-secondary text-xs py-1.5 px-2 flex items-center gap-1" onClick={goRoot} title="Back to customers">
            <CaretLeft size={14} /> Back
          </button>
        )}
        <FolderOpen size={18} weight="fill" className="text-[hsl(27_95%_55%)]" />
        <span className="text-sm font-semibold hidden sm:inline">File Manager</span>

        <nav className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] min-w-0 flex-1">
          <button type="button" className="hover:text-[hsl(27_95%_55%)] truncate" onClick={goRoot}>
            Customers
          </button>
          {activeFolder && (
            <>
              <CaretRight size={12} className="shrink-0" />
              <span className="text-[var(--foreground)] truncate font-medium">{activeFolder.name}</span>
            </>
          )}
        </nav>

        <div className="relative w-40 sm:w-52">
          <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input-field text-xs w-full pl-7 py-1.5"
            placeholder={atRoot ? 'Search customers…' : 'Search files…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {!atRoot && (
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <button type="button" className={`p-1.5 ${view === 'grid' ? 'bg-[hsl(27_95%_55%/0.2)]' : ''}`} title="Icons" onClick={() => setView('grid')}>
              <SquaresFour size={15} />
            </button>
            <button type="button" className={`p-1.5 ${view === 'list' ? 'bg-[hsl(27_95%_55%/0.2)]' : ''}`} title="List" onClick={() => setView('list')}>
              <ListBullets size={15} />
            </button>
          </div>
        )}

        <button type="button" className="btn-secondary text-xs py-1.5 px-2" onClick={load} disabled={loading} title="Refresh">
          <ArrowsClockwise size={13} className={loading ? 'animate-spin' : ''} />
        </button>

        <button
          type="button"
          className="btn-primary text-xs py-1.5 px-2.5 flex items-center gap-1"
          disabled={uploading || atRoot || folderPhone === '__unassigned__'}
          title={atRoot ? 'Open a customer folder to upload into it' : 'Upload from this PC into this folder'}
          onClick={() => fileRef.current?.click()}
        >
          <UploadSimple size={13} /> Upload
        </button>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => uploadLocal(e.target.files)} />
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Sidebar folders */}
        <aside
          className="w-56 shrink-0 border-r overflow-y-auto hidden sm:block"
          style={{ borderColor: 'var(--border)', background: 'hsl(var(--pt-card, var(--card)) / 0.45)' }}
        >
          <p className="text-[10px] uppercase tracking-wider text-gray-500 px-3 pt-3 pb-1">Customers</p>
          <button
            type="button"
            onClick={goRoot}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs ${atRoot ? 'bg-[hsl(27_95%_55%/0.15)] text-[hsl(27_95%_55%)]' : 'hover:bg-white/5'}`}
          >
            <FolderOpen size={16} weight={atRoot ? 'fill' : 'regular'} />
            <span className="truncate flex-1">All customers</span>
            <span className="text-[10px] opacity-60">{files.length}</span>
          </button>
          {folders.map((fol) => (
            <button
              key={fol.phone}
              type="button"
              onClick={() => openFolder(fol.phone)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs ${folderPhone === fol.phone ? 'bg-[hsl(27_95%_55%/0.15)] text-[hsl(27_95%_55%)]' : 'hover:bg-white/5'}`}
              title={fol.phone === '__unassigned__' ? 'Files without a customer phone' : fol.phone}
            >
              <Folder size={16} weight={folderPhone === fol.phone ? 'fill' : 'regular'} className={fol.phone === '__unassigned__' ? 'text-gray-500' : ''} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{fol.name}</span>
                {fol.phone !== '__unassigned__' && fol.name !== fol.phone && (
                  <span className="block truncate text-[10px] opacity-50">{fol.phone}</span>
                )}
              </span>
              <span className="text-[10px] opacity-60">{fol.count}</span>
            </button>
          ))}
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-4" onClick={() => setSelectedId(null)}>
          {/* Mobile folder strip */}
          <div className="flex gap-1.5 overflow-x-auto mb-3 sm:hidden pb-1">
            <button
              type="button"
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${atRoot ? 'border-[hsl(27_95%_55%)] text-[hsl(27_95%_55%)]' : ''}`}
              style={{ borderColor: 'var(--border)' }}
              onClick={goRoot}
            >
              All
            </button>
            {folders.map((fol) => (
              <button
                key={fol.phone}
                type="button"
                className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border max-w-[140px] truncate ${folderPhone === fol.phone ? 'border-[hsl(27_95%_55%)] text-[hsl(27_95%_55%)]' : ''}`}
                style={{ borderColor: 'var(--border)' }}
                onClick={() => openFolder(fol.phone)}
              >
                {fol.name}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-[var(--muted-foreground)]">
              <SpinnerGap size={18} className="animate-spin" /> Loading files…
            </div>
          )}

          {/* ROOT: customer folders */}
          {!loading && atRoot && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredFolders.map((fol) => (
                <button
                  key={fol.phone}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openFolder(fol.phone); }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-[var(--border)] text-center transition"
                >
                  <Folder size={52} weight="fill" className={fol.phone === '__unassigned__' ? 'text-gray-500' : 'text-amber-400/90'} />
                  <span className="text-xs font-medium truncate w-full">{fol.name}</span>
                  <span className="text-[10px] text-[var(--muted-foreground)]">
                    {fol.count} item{fol.count === 1 ? '' : 's'}
                    {fol.phone !== '__unassigned__' && fol.name !== fol.phone ? '' : fol.phone !== '__unassigned__' ? '' : ''}
                  </span>
                  {fol.phone !== '__unassigned__' && (
                    <span className="text-[10px] text-[var(--muted-foreground)]/70 truncate w-full">{fol.phone}</span>
                  )}
                </button>
              ))}
              {filteredFolders.length === 0 && (
                <div className="col-span-full text-center py-16 px-4">
                  <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {search ? 'No customers match your search.' : 'No files yet. Receive documents on WhatsApp or open a customer and upload.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* INSIDE FOLDER: files */}
          {!loading && !atRoot && view === 'grid' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {visibleFiles.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openFile(f); }}
                  onContextMenu={(e) => onContextMenu(e, f)}
                  className={`relative flex flex-col items-stretch rounded-xl border p-2 text-left transition ${
                    selectedId === f.id || openingId === f.id
                      ? 'border-[hsl(27_95%_55%)] bg-[hsl(27_95%_55%/0.12)]'
                      : 'border-transparent hover:bg-white/5 hover:border-[var(--border)]'
                  }`}
                  title={`${displayName(f.fileName)} — click to open`}
                >
                  <div className="aspect-square rounded-lg bg-black/25 flex items-center justify-center overflow-hidden mb-2 relative">
                    <Thumb f={f} />
                    {openingId === f.id && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <SpinnerGap size={22} className="animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-medium truncate">{displayName(f.fileName)}</span>
                  <span className="text-[10px] text-[var(--muted-foreground)] truncate">
                    {(f.source || 'whatsapp').replace('-', ' ')}
                    {f.timestamp ? ` · ${new Date(f.timestamp).toLocaleDateString()}` : ''}
                  </span>
                </button>
              ))}
              {visibleFiles.length === 0 && (
                <div className="col-span-full text-center py-16 px-4">
                  <Folder size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm text-[var(--muted-foreground)] mb-3">
                    {search ? 'No files match your search in this folder.' : 'This folder is empty.'}
                  </p>
                  <button type="button" className="btn-secondary text-xs" onClick={goRoot}>
                    ← Back to all customers
                  </button>
                </div>
              )}
            </div>
          )}

          {!loading && !atRoot && view === 'list' && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div
                className="grid grid-cols-[1fr_100px_110px_70px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                <span>Name</span><span>Source</span><span>Date</span><span>Type</span>
              </div>
              {visibleFiles.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openFile(f); }}
                  onContextMenu={(e) => onContextMenu(e, f)}
                  className={`w-full grid grid-cols-[1fr_100px_110px_70px] gap-2 px-3 py-2.5 text-left text-xs items-center border-b last:border-0 ${
                    selectedId === f.id ? 'bg-[hsl(27_95%_55%/0.12)]' : 'hover:bg-white/5'
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {openingId === f.id ? <SpinnerGap size={16} className="animate-spin shrink-0" /> : (
                      isImage(f) ? (
                        <img src={authFileUrl(driveIdOf(f))} alt="" className="w-7 h-7 rounded object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <FileGlyph f={f} size={18} />
                      )
                    )}
                    <span className="truncate">{displayName(f.fileName)}</span>
                  </span>
                  <span className="truncate text-[var(--muted-foreground)]">{(f.source || 'whatsapp').replace('-', ' ')}</span>
                  <span className="text-[var(--muted-foreground)]">{f.timestamp ? new Date(f.timestamp).toLocaleDateString() : '—'}</span>
                  <span className="text-[var(--muted-foreground)]">{isPdf(f) ? 'PDF' : isImage(f) ? 'Image' : 'File'}</span>
                </button>
              ))}
              {visibleFiles.length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)] text-center py-12">No files in this folder.</p>
              )}
            </div>
          )}
        </main>
      </div>

      <div
        className="shrink-0 border-t px-3 py-1.5 text-[10px] text-[var(--muted-foreground)] flex flex-wrap justify-between gap-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <span>
          {atRoot
            ? `${filteredFolders.length} customer folder(s) · ${files.length} file(s) total`
            : `${visibleFiles.length} item(s) in ${activeFolder?.name || 'folder'}`}
        </span>
        <span className="hidden sm:inline">Click to open · Right-click for Download / Delete</span>
      </div>

      {ctx && (
        <div
          className="fixed z-[80] min-w-[170px] rounded-lg border shadow-xl py-1 text-xs"
          style={{ left: ctx.x, top: ctx.y, background: 'hsl(var(--pt-card, var(--card)))', borderColor: 'var(--border)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="w-full px-3 py-2 text-left hover:bg-white/5" onClick={() => openFile(ctx.file)}>Open</button>
          <button type="button" className="w-full px-3 py-2 text-left hover:bg-white/5 flex items-center gap-2" onClick={() => downloadFile(ctx.file)}>
            <DownloadSimple size={13} /> Download
          </button>
          {isImage(ctx.file) && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left hover:bg-white/5 flex items-center gap-2"
              onClick={() => {
                setCtx(null);
                const q = new URLSearchParams();
                q.set('fileId', ctx.file.id);
                if (ctx.file.customerId) q.set('phone', ctx.file.customerId);
                if (ctx.file.customerName) q.set('name', ctx.file.customerName);
                window.location.href = `/app/photos/portal?${q}`;
              }}
            >
              <Camera size={13} /> Open in Photo Editor
            </button>
          )}
          <div className="border-t my-1" style={{ borderColor: 'var(--border)' }} />
          <button type="button" className="w-full px-3 py-2 text-left hover:bg-red-500/10 text-red-400 flex items-center gap-2" onClick={() => deleteFile(ctx.file)}>
            <Trash size={13} /> Delete
          </button>
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-[70] bg-[#0a0a0a] flex flex-col"
          onClick={closePreview}
        >
          {/* Stage — full-bleed photo like Windows Photos */}
          <div
            className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Soft vignette behind image */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse at center, rgba(40,40,45,0.9) 0%, rgba(10,10,10,1) 70%)',
              }}
            />

            {/* Floating controls — high-contrast frosted pills (readable on any photo) */}
            <button
              type="button"
              onClick={closePreview}
              className="absolute top-4 left-4 z-20 h-11 px-3.5 rounded-full bg-white/90 hover:bg-white text-black flex items-center justify-center gap-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white/80"
              title="Back (Esc)"
            >
              <ArrowBendUpLeft size={18} weight="bold" />
              <span className="text-xs font-semibold pr-0.5">Back</span>
            </button>

            <div className="absolute top-4 right-4 z-20 flex items-center gap-2.5">
              <button
                type="button"
                className="w-11 h-11 rounded-full bg-white/90 hover:bg-white text-black flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white/80"
                title="Zoom"
                onClick={() => setZoom((z) => (z >= 2 ? 1 : Number((z + 0.5).toFixed(1))))}
              >
                <MagnifyingGlassPlus size={20} weight="bold" />
              </button>
              {isImage(preview.file) && (
                <button
                  type="button"
                  className="w-11 h-11 rounded-full bg-white/90 hover:bg-white text-black flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white/80"
                  title="Edit in Photo Editor"
                  onClick={() => openInPhotoEditor(preview.file)}
                >
                  <PencilSimple size={20} weight="bold" />
                </button>
              )}
              <button
                type="button"
                className="w-11 h-11 rounded-full bg-white/90 hover:bg-white text-black flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white/80"
                title="Delete"
                onClick={() => void deleteFile(preview.file)}
              >
                <Trash size={20} weight="bold" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  className="w-11 h-11 rounded-full bg-white/90 hover:bg-white text-black flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white/80"
                  title="More"
                  onClick={() => setViewerMore((v) => !v)}
                >
                  <DotsThree size={24} weight="bold" />
                </button>
                {viewerMore && (
                  <div
                    className="absolute right-0 top-13 min-w-[170px] rounded-xl border border-white/20 bg-[#2c2c2e] shadow-2xl py-1.5 text-sm text-white z-30"
                    style={{ top: '3.25rem' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button type="button" className="w-full px-3.5 py-2.5 text-left hover:bg-white/10 flex items-center gap-2.5" onClick={() => { setViewerMore(false); void downloadFile(preview.file); }}>
                      <DownloadSimple size={16} /> Download
                    </button>
                    {isImage(preview.file) && (
                      <button type="button" className="w-full px-3.5 py-2.5 text-left hover:bg-white/10 flex items-center gap-2.5" onClick={() => { setViewerMore(false); openInPhotoEditor(preview.file); }}>
                        <Camera size={16} /> Photo Editor
                      </button>
                    )}
                    <button type="button" className="w-full px-3.5 py-2.5 text-left hover:bg-white/10" onClick={() => { setZoom(1); setViewerMore(false); }}>
                      Reset zoom
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Large circular side chevrons — bright so they never vanish into the photo */}
            {visibleFiles.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-20 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/90 hover:bg-white text-black flex items-center justify-center border border-white shadow-[0_6px_28px_rgba(0,0,0,0.55)]"
                  onClick={() => void goPreviewDelta(-1)}
                  title="Previous (Left arrow)"
                >
                  <CaretLeft size={32} weight="bold" />
                </button>
                <button
                  type="button"
                  className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-20 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/90 hover:bg-white text-black flex items-center justify-center border border-white shadow-[0_6px_28px_rgba(0,0,0,0.55)]"
                  onClick={() => void goPreviewDelta(1)}
                  title="Next (Right arrow)"
                >
                  <CaretRight size={32} weight="bold" />
                </button>
              </>
            )}

            {openingId && openingId !== preview.file.id && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
                <SpinnerGap size={32} className="animate-spin text-white" />
              </div>
            )}

            {/* Photo / PDF */}
            <div className="relative z-[5] max-w-[min(92vw,1100px)] max-h-[calc(100%-7rem)] flex items-center justify-center px-14 sm:px-20">
              {preview.kind === 'image' ? (
                <img
                  src={preview.url}
                  alt={preview.file.fileName}
                  className="max-w-full max-h-[calc(100vh-11rem)] object-contain rounded-md shadow-[0_0_80px_rgba(0,0,0,0.65)] transition-transform duration-200"
                  style={{ transform: `scale(${zoom})` }}
                  draggable={false}
                />
              ) : (
                <iframe
                  title={preview.file.fileName}
                  src={preview.url}
                  className="w-[min(92vw,900px)] h-[calc(100vh-11rem)] rounded-md bg-white shadow-2xl"
                />
              )}
            </div>

            {/* Filename chip — high contrast */}
            <div className="absolute bottom-[5.75rem] left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="px-3.5 py-1.5 rounded-full bg-white/90 text-[12px] font-medium text-black shadow-lg max-w-[70vw] truncate">
                {displayName(preview.file.fileName)}
                {previewIndex >= 0 ? ` · ${previewIndex + 1} of ${visibleFiles.length}` : ''}
              </div>
            </div>
          </div>

          {/* Bottom filmstrip — brighter thumbs */}
          {visibleFiles.length > 0 && (
            <div
              className="shrink-0 pb-5 pt-3 px-4 bg-black"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                ref={filmstripRef}
                className="flex gap-3 overflow-x-auto justify-center scroll-smooth py-1"
                style={{ scrollbarWidth: 'none' }}
              >
                {visibleFiles.map((f) => {
                  const active = f.id === preview.file.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      data-file-id={f.id}
                      onClick={() => { setZoom(1); void openFile(f); }}
                      className={`shrink-0 w-[76px] h-[76px] sm:w-[84px] sm:h-[84px] rounded-xl overflow-hidden transition-all ${
                        active
                          ? 'ring-[3px] ring-[#4da3ff] ring-offset-2 ring-offset-black scale-105'
                          : 'opacity-80 hover:opacity-100 ring-1 ring-white/30'
                      }`}
                      title={displayName(f.fileName)}
                    >
                      <div className="w-full h-full bg-[#222] flex items-center justify-center">
                        {isImage(f) ? (
                          <img src={authFileUrl(driveIdOf(f))} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <FileGlyph f={f} size={32} />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
