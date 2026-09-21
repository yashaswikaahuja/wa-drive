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
  PencilSimple, CheckSquare,
} from '@phosphor-icons/react';
import api, { API_URL } from '../../shared/api';
import { toast } from '../../shared/toast';
import { getCachedBlob } from '../../shared/fileCache';
import { useAuthStore } from '../auth/store';
import PdfThumb from './PdfThumb';
import MozillaPdfEmbed from './MozillaPdfEmbed';

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

/** Cap visible folders so 500–600 customers stay usable; search finds the rest. */
const FOLDER_CAP = 50;

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
  if (isPdf(f)) {
    return (
      <PdfThumb
        fileId={driveIdOf(f)}
        driveThumbUrl={f.fileUrl}
      />
    );
  }
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: DriveFile; url: string; kind: 'image' | 'pdf' } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; file: DriveFile } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewerMore, setViewerMore] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false); // phone / small tablet portrait
  const fileRef = useRef<HTMLInputElement>(null);
  const blobUrlCache = useRef<Map<string, string>>(new Map());
  const filmstripRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

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

  const folderMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter(
      (f) => f.name.toLowerCase().includes(q) || f.phone.toLowerCase().includes(q),
    );
  }, [folders, search]);

  /** At root: search → autocomplete matches (capped). No search → first 50 only. */
  const filteredFolders = useMemo(() => {
    if (folderPhone) return folderMatches; // unused at folder level for grid
    const q = search.trim();
    const list = q ? folderMatches : folders.filter((f) => f.phone !== '__unassigned__');
    const capped = list.slice(0, FOLDER_CAP);
    // Keep Unassigned reachable when not searching
    if (!q) {
      const un = folders.find((f) => f.phone === '__unassigned__');
      if (un && !capped.some((f) => f.phone === un.phone)) capped.push(un);
    }
    return capped;
  }, [folders, folderMatches, folderPhone, search]);

  const activeFolder = folderPhone ? folders.find((f) => f.phone === folderPhone) : null;
  const atRoot = !folderPhone;
  const totalFolders = folders.length;

  const autocompleteFolders = useMemo(() => {
    if (folderPhone || search.trim().length < 1) return [];
    return folderMatches.slice(0, FOLDER_CAP);
  }, [folderPhone, search, folderMatches]);

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectedId(null);
    setAnchorId(null);
  };

  const selectOnly = (id: string) => {
    setSelectedIds(new Set([id]));
    setSelectedId(id);
    setAnchorId(id);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedId(id);
    setAnchorId(id);
  };

  const selectRange = (toId: string) => {
    const ids = visibleFiles.map((f) => f.id);
    const from = anchorId ? ids.indexOf(anchorId) : ids.indexOf(toId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) {
      selectOnly(toId);
      return;
    }
    const [a, b] = from < to ? [from, to] : [to, from];
    setSelectedIds(new Set(ids.slice(a, b + 1)));
    setSelectedId(toId);
  };

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  /**
   * Desktop: click opens; Ctrl/Shift multi-select.
   * Phone: tap opens; long-press starts selection; once selecting, tap toggles more files.
   */
  const onFileActivate = (e: React.MouseEvent, f: DriveFile) => {
    e.stopPropagation();
    if (isNarrow && longPressFired.current) {
      longPressFired.current = false;
      return; // long-press already selected — ignore synthetic click
    }
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(f.id);
      return;
    }
    if (e.shiftKey) {
      selectRange(f.id);
      return;
    }
    // Mobile selection mode: after long-press selected something, further taps toggle
    if (isNarrow && selectedIds.size > 0) {
      toggleSelect(f.id);
      return;
    }
    selectOnly(f.id);
    void openFile(f);
  };

  const onFilePointerDown = (f: DriveFile) => {
    if (!isNarrow) return;
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      selectOnly(f.id);
      try { navigator.vibrate?.(12); } catch { /* ignore */ }
      toast.success('Selection mode — tap more files, then Delete / Open');
    }, 450);
  };

  const onFilePointerUpOrCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

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

  // Desktop: ← → switch files (PDF.js handles pages itself). Esc = back.
  // Phone: swipe left/right switches files. Don't steal keys when typing in PDF.js find box.
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.file.id, previewIndex, visibleFiles.length]);

  // Phone swipe between files (PDF or photo)
  const swipeStartX = useRef<number | null>(null);
  const onViewerTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) swipeStartX.current = e.touches[0].clientX;
  };
  const onViewerTouchEnd = (e: React.TouchEvent) => {
    if (swipeStartX.current == null || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(dx) < 60) return; // ignore taps
    if (dx < 0) void goPreviewDelta(1);  // swipe left → next
    else void goPreviewDelta(-1);         // swipe right → prev
  };

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
    clearSelection();
    setSearch('');
  };

  const openFolder = (phone: string) => {
    setFolderPhone(phone);
    clearSelection();
    setSearch('');
  };

  const deleteSelected = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected file(s)?`)) return;
    let ok = 0;
    for (const id of ids) {
      try {
        await api.delete(`/drive/files/${id}`);
        ok += 1;
      } catch { /* continue */ }
    }
    setFiles((prev) => prev.filter((x) => !selectedIds.has(x.id)));
    clearSelection();
    if (preview && selectedIds.has(preview.file.id)) closePreview();
    toast.success(`Deleted ${ok} file(s)`);
  };

  // Folder view: Shift+Arrow extends selection; Delete removes; arrows move focus
  useEffect(() => {
    if (preview || atRoot) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const ids = visibleFiles.map((f) => f.id);
      if (!ids.length) return;
      const cur = selectedId && ids.includes(selectedId) ? ids.indexOf(selectedId) : 0;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.size) {
          e.preventDefault();
          void deleteSelected();
        }
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const cols = view === 'grid' ? Math.max(2, Math.min(6, Math.floor((mainRef.current?.clientWidth || 800) / 140))) : 1;
        let next = cur;
        if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1);
        if (e.key === 'ArrowRight') next = Math.min(ids.length - 1, cur + 1);
        if (e.key === 'ArrowUp') next = Math.max(0, cur - cols);
        if (e.key === 'ArrowDown') next = Math.min(ids.length - 1, cur + cols);
        const nextId = ids[next];
        if (e.shiftKey) {
          // Hold Shift + move = grow/shrink selection from anchor (Explorer-style)
          if (!anchorId) setAnchorId(selectedId || ids[0]);
          const from = ids.indexOf(anchorId || ids[0]);
          const [a, b] = from < next ? [from, next] : [next, from];
          setSelectedIds(new Set(ids.slice(a, b + 1)));
          setSelectedId(nextId);
        } else {
          selectOnly(nextId);
        }
        return;
      }

      if (e.key === 'Enter' && selectedId) {
        const f = visibleFiles.find((x) => x.id === selectedId);
        if (f) void openFile(f);
      }

      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSelectedIds(new Set(ids));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
    /* Phone (<md): fixed under mobile top bar. md+: fill Layout main (sidebar present). */
    <div
      className="
        flex flex-col min-h-0 overflow-hidden bg-[hsl(var(--background))]
        max-md:fixed max-md:z-20 max-md:inset-x-0 max-md:top-12 max-md:bottom-0
        md:relative md:-mx-6 md:-mb-6 md:h-[calc(100vh-1.25rem)]
      "
    >
      {/* Toolbar — stacks cleanly on phone */}
      <div
        className="shrink-0 border-b px-2 sm:px-3 py-2 flex flex-col gap-2"
        style={{ borderColor: 'var(--border)', background: 'hsl(var(--pt-card, var(--card)))' }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {!atRoot && (
            <button type="button" className="btn-secondary text-xs py-1.5 px-2 flex items-center gap-1 shrink-0" onClick={goRoot} title="Back to customers">
              <CaretLeft size={14} /> <span className="hidden xs:inline sm:inline">Back</span>
            </button>
          )}
          <FolderOpen size={18} weight="fill" className="text-[hsl(27_95%_55%)] shrink-0" />
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
          {/* Grey icon buttons — clearer on phone than tiny labeled pills */}
          <button
            type="button"
            className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-200 hover:bg-white/10 disabled:opacity-40"
            onClick={load}
            disabled={loading}
            title="Refresh"
            aria-label="Refresh"
          >
            <ArrowsClockwise size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-200 hover:bg-white/10 disabled:opacity-40"
            disabled={uploading || atRoot || folderPhone === '__unassigned__'}
            title={atRoot ? 'Open a customer folder to upload into it' : 'Upload'}
            aria-label="Upload"
            onClick={() => fileRef.current?.click()}
          >
            <UploadSimple size={20} />
          </button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => uploadLocal(e.target.files)} />
        </div>
        <div className="flex items-center gap-2 relative">
          <div className="relative flex-1 min-w-0">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="input-field text-sm sm:text-xs w-full pl-8 py-2 sm:py-1.5"
              placeholder={atRoot ? 'Search name or phone…' : 'Search files…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            {/* Autocomplete for customer folders */}
            {atRoot && autocompleteFolders.length > 0 && search.trim().length > 0 && (
              <ul
                className="absolute left-0 right-0 top-full mt-1 z-40 max-h-64 overflow-y-auto rounded-xl border shadow-xl py-1"
                style={{ borderColor: 'var(--border)', background: 'hsl(var(--pt-card, var(--card)))' }}
              >
                {autocompleteFolders.map((fol) => (
                  <li key={fol.phone}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-white/5"
                      onClick={() => {
                        openFolder(fol.phone);
                        setSearch('');
                      }}
                    >
                      <Folder size={16} weight="fill" className="text-amber-400/90 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{fol.name}</span>
                        {fol.phone !== '__unassigned__' && fol.name !== fol.phone && (
                          <span className="block truncate text-[11px] text-[var(--muted-foreground)]">{fol.phone}</span>
                        )}
                      </span>
                      <span className="text-[11px] text-[var(--muted-foreground)]">{fol.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!atRoot && (
            <div className="flex rounded-lg border overflow-hidden shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button type="button" className={`p-1.5 ${view === 'grid' ? 'bg-[hsl(27_95%_55%/0.2)]' : ''}`} title="Icons" onClick={() => setView('grid')}>
                <SquaresFour size={15} />
              </button>
              <button type="button" className={`p-1.5 ${view === 'list' ? 'bg-[hsl(27_95%_55%/0.2)]' : ''}`} title="List" onClick={() => setView('list')}>
                <ListBullets size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Sidebar folders */}
        <aside
          className={`w-52 lg:w-56 shrink-0 border-r overflow-y-auto ${isNarrow ? 'hidden' : 'block'}`}
          style={{ borderColor: 'var(--border)', background: 'hsl(var(--pt-card, var(--card)) / 0.45)' }}
        >
          <p className="text-[10px] uppercase tracking-wider text-gray-500 px-3 pt-3 pb-1">
            Customers{totalFolders > FOLDER_CAP ? ` · top ${FOLDER_CAP}` : ''}
          </p>
          <button
            type="button"
            onClick={goRoot}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs ${atRoot ? 'bg-[hsl(27_95%_55%/0.15)] text-[hsl(27_95%_55%)]' : 'hover:bg-white/5'}`}
          >
            <FolderOpen size={16} weight={atRoot ? 'fill' : 'regular'} />
            <span className="truncate flex-1">All customers</span>
            <span className="text-[10px] opacity-60">{totalFolders}</span>
          </button>
          {filteredFolders.map((fol) => (
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

        <main
          ref={mainRef as any}
          className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-4"
          onClick={() => clearSelection()}
        >
          {/* Phone folder chips when sidebar is hidden */}
          {isNarrow && (
          <div className="flex gap-1.5 overflow-x-auto mb-3 pb-1 -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' } as any}>
            <button
              type="button"
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${atRoot ? 'border-[hsl(27_95%_55%)] text-[hsl(27_95%_55%)]' : ''}`}
              style={{ borderColor: 'var(--border)' }}
              onClick={goRoot}
            >
              All
            </button>
            {filteredFolders.slice(0, 20).map((fol) => (
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
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-[var(--muted-foreground)]">
              <SpinnerGap size={18} className="animate-spin" /> Loading files…
            </div>
          )}

          {/* ROOT: customer folders (capped — search for the rest) */}
          {!loading && atRoot && (
            <>
              {totalFolders > FOLDER_CAP && !search.trim() && (
                <p className="text-[11px] text-[var(--muted-foreground)] mb-2 px-1">
                  Showing {FOLDER_CAP} of {totalFolders} customers — type a name or phone to find others.
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
                {filteredFolders.map((fol) => (
                  <button
                    key={fol.phone}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openFolder(fol.phone); setSearch(''); }}
                    className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-[var(--border)] text-center transition"
                  >
                    <Folder size={44} weight="fill" className={fol.phone === '__unassigned__' ? 'text-gray-500' : 'text-amber-400/90'} />
                    <span className="text-xs font-medium truncate w-full">{fol.name}</span>
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {fol.count} item{fol.count === 1 ? '' : 's'}
                    </span>
                    {fol.phone !== '__unassigned__' && fol.name !== fol.phone && (
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
            </>
          )}

          {/* INSIDE FOLDER: files */}
          {!loading && !atRoot && view === 'grid' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2">
              {visibleFiles.map((f) => {
                const isSel = selectedIds.has(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={(e) => onFileActivate(e, f)}
                    onContextMenu={(e) => onContextMenu(e, f)}
                    onPointerDown={() => onFilePointerDown(f)}
                    onPointerUp={onFilePointerUpOrCancel}
                    onPointerLeave={onFilePointerUpOrCancel}
                    onPointerCancel={onFilePointerUpOrCancel}
                    className={`relative flex flex-col items-stretch rounded-xl border p-2 text-left transition select-none ${
                      isSel || openingId === f.id
                        ? 'border-[hsl(27_95%_55%)] bg-[hsl(27_95%_55%/0.14)]'
                        : 'border-transparent hover:bg-white/5 hover:border-[var(--border)]'
                    }`}
                    title={isNarrow ? 'Tap to open · Long-press to select' : 'Click open · Ctrl+click select'}
                  >
                    {isSel && (
                      <span className="absolute top-2 left-2 z-10 w-5 h-5 rounded bg-[hsl(27_95%_55%)] text-white flex items-center justify-center shadow">
                        <CheckSquare size={12} weight="bold" />
                      </span>
                    )}
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
                );
              })}
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
                  onClick={(e) => onFileActivate(e, f)}
                  onContextMenu={(e) => onContextMenu(e, f)}
                  className={`w-full grid grid-cols-[1fr_100px_110px_70px] gap-2 px-3 py-2.5 text-left text-xs items-center border-b last:border-0 ${
                    selectedIds.has(f.id) ? 'bg-[hsl(27_95%_55%/0.14)]' : 'hover:bg-white/5'
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {openingId === f.id ? <SpinnerGap size={16} className="animate-spin shrink-0" /> : (
                      <span className="w-7 h-7 rounded overflow-hidden shrink-0 bg-black/20 flex items-center justify-center">
                        <Thumb f={f} />
                      </span>
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

      {/* Multi-select action bar */}
      {!preview && selectedIds.size > 0 && (
        <div
          className="shrink-0 border-t px-3 py-2 flex flex-wrap items-center gap-2"
          style={{ borderColor: 'var(--border)', background: 'hsl(27 95% 55% / 0.12)' }}
        >
          <CheckSquare size={16} className="text-[hsl(27_95%_55%)]" weight="fill" />
          <span className="text-xs font-medium">{selectedIds.size} selected</span>
          <button type="button" className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1" onClick={() => {
            const first = visibleFiles.find((f) => selectedIds.has(f.id));
            if (first) void openFile(first);
          }}>
            Open
          </button>
          <button type="button" className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1" onClick={async () => {
            for (const id of selectedIds) {
              const f = files.find((x) => x.id === id);
              if (f) await downloadFile(f);
            }
          }}>
            <DownloadSimple size={13} /> Download
          </button>
          <button type="button" className="text-xs py-1.5 px-2.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 flex items-center gap-1" onClick={() => void deleteSelected()}>
            <Trash size={13} /> Delete
          </button>
          <button type="button" className="text-xs text-[var(--muted-foreground)] ml-auto px-2" onClick={clearSelection}>Clear</button>
        </div>
      )}

      <div
        className="shrink-0 border-t px-3 py-1.5 text-[10px] text-[var(--muted-foreground)] flex flex-wrap justify-between gap-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <span>
          {atRoot
            ? `${filteredFolders.length}${totalFolders > FOLDER_CAP && !search.trim() ? `/${totalFolders}` : ''} customers · ${files.length} files`
            : `${visibleFiles.length} item(s) in ${activeFolder?.name || 'folder'}${selectedIds.size ? ` · ${selectedIds.size} selected` : ''}`}
        </span>
        <span className="hidden sm:inline">
          {isNarrow ? 'Tap open · Long-press select' : 'Click open · Ctrl+click select · Search finds any customer'}
        </span>
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
                q.set('fileId', driveIdOf(ctx.file));
                if (ctx.file.customerId) q.set('phone', ctx.file.customerId);
                if (ctx.file.customerName) q.set('name', ctx.file.customerName);
                window.location.href = `/app/photos/portal?${q}`;
              }}
            >
              <Camera size={13} /> Open in Photo Editor
            </button>
          )}
          {(isImage(ctx.file) || isPdf(ctx.file)) && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left hover:bg-white/5 flex items-center gap-2"
              onClick={() => {
                setCtx(null);
                const q = new URLSearchParams();
                q.set('fileId', driveIdOf(ctx.file));
                if (ctx.file.fileName) q.set('fileName', ctx.file.fileName);
                if (ctx.file.customerId) q.set('phone', ctx.file.customerId);
                if (ctx.file.customerName) q.set('name', ctx.file.customerName);
                window.location.href = `/app/photos/scan?${q}`;
              }}
            >
              <FilePdf size={13} /> Open in PDF Tool
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
          className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col overscroll-none"
          style={{ touchAction: preview.kind === 'pdf' ? 'auto' : 'none' }}
          onClick={closePreview}
          onWheel={(e) => {
            // Images only: Ctrl+wheel zooms our stage. PDF.js owns its own zoom.
            if (preview.kind !== 'image') return;
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              setZoom((z) => Math.min(3, Math.max(0.5, Number((z - e.deltaY * 0.002).toFixed(2)))));
            }
          }}
        >
          {/* Stage — full-bleed (PDF gets max space: no filmstrip) */}
          <div
            className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onViewerTouchStart}
            onTouchEnd={onViewerTouchEnd}
            style={{ touchAction: preview.kind === 'pdf' ? 'auto' : 'none' }}
          >
            {/* Soft vignette behind image */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse at center, rgba(40,40,45,0.9) 0%, rgba(10,10,10,1) 70%)',
              }}
            />

            {/* Floating controls — compact on phone, full on tablet/desktop */}
            <button
              type="button"
              onClick={closePreview}
              className="absolute top-2 left-2 sm:top-4 sm:left-4 z-20 h-9 sm:h-11 px-2.5 sm:px-3.5 rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center gap-1 shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white"
              title="Back (Esc)"
            >
              <ArrowBendUpLeft size={16} weight="bold" />
              <span className="text-[11px] sm:text-xs font-semibold">Back</span>
            </button>

            <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-20 flex items-center gap-1.5 sm:gap-2.5">
              {preview.kind === 'image' && (
                <button
                  type="button"
                  className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white"
                  title="Zoom"
                  onClick={() => setZoom((z) => (z >= 2 ? 1 : Number((z + 0.5).toFixed(1))))}
                >
                  <MagnifyingGlassPlus size={18} weight="bold" />
                </button>
              )}
              {isImage(preview.file) && (
                <button
                  type="button"
                  className="hidden sm:flex w-11 h-11 rounded-full bg-white/95 hover:bg-white text-black items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white"
                  title="Edit in Photo Editor"
                  onClick={() => openInPhotoEditor(preview.file)}
                >
                  <PencilSimple size={20} weight="bold" />
                </button>
              )}
              <button
                type="button"
                className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white"
                title="Delete"
                onClick={() => void deleteFile(preview.file)}
              >
                <Trash size={18} weight="bold" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.55)] border border-white"
                  title="More"
                  onClick={() => setViewerMore((v) => !v)}
                >
                  <DotsThree size={22} weight="bold" />
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

            {/* Side chevrons for photos only — PDF uses keys (desktop) / swipe (phone) for file switch */}
            {preview.kind === 'image' && visibleFiles.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center border border-white shadow-[0_6px_28px_rgba(0,0,0,0.55)]"
                  onClick={() => void goPreviewDelta(-1)}
                  title="Previous file"
                >
                  <CaretLeft size={22} weight="bold" className="sm:hidden" />
                  <CaretLeft size={28} weight="bold" className="hidden sm:block" />
                </button>
                <button
                  type="button"
                  className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-white/95 hover:bg-white text-black flex items-center justify-center border border-white shadow-[0_6px_28px_rgba(0,0,0,0.55)]"
                  onClick={() => void goPreviewDelta(1)}
                  title="Next file"
                >
                  <CaretRight size={22} weight="bold" className="sm:hidden" />
                  <CaretRight size={28} weight="bold" className="hidden sm:block" />
                </button>
              </>
            )}
            {/* Phone edge strips — swipe zone for PDF file switch without covering the doc */}
            {preview.kind === 'pdf' && visibleFiles.length > 1 && isNarrow && (
              <>
                <div
                  className="absolute left-0 top-12 bottom-0 w-5 z-30"
                  onTouchStart={onViewerTouchStart}
                  onTouchEnd={onViewerTouchEnd}
                />
                <div
                  className="absolute right-0 top-12 bottom-0 w-5 z-30"
                  onTouchStart={onViewerTouchStart}
                  onTouchEnd={onViewerTouchEnd}
                />
              </>
            )}

            {openingId && openingId !== preview.file.id && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
                <SpinnerGap size={32} className="animate-spin text-white" />
              </div>
            )}

            {/* Photo: leave room for chrome. PDF: edge-to-edge (no black gap above Mozilla toolbar). */}
            <div
              className={`absolute inset-0 z-[5] overflow-hidden ${
                preview.kind === 'pdf' ? 'pt-0 pb-0' : 'pt-12 pb-[4.5rem] sm:pb-20'
              }`}
            >
              {preview.kind === 'image' ? (
                <div className="w-full h-full flex items-center justify-center overflow-hidden px-10 sm:px-14">
                  <img
                    src={preview.url}
                    alt={preview.file.fileName}
                    className="max-w-full max-h-full object-contain rounded-md shadow-[0_0_80px_rgba(0,0,0,0.65)] transition-transform duration-150 origin-center"
                    style={{ transform: `scale(${zoom})`, touchAction: 'none' }}
                    draggable={false}
                  />
                </div>
              ) : (
                <div className="w-full h-full min-h-0 bg-[#525659]">
                  <MozillaPdfEmbed fileUrl={preview.url} />
                </div>
              )}
            </div>

            {/* Filename chip — photos only (PDF.js has its own chrome) */}
            {preview.kind === 'image' && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none sm:bottom-3">
                <div className="px-3 py-1 rounded-full bg-white/95 text-[11px] sm:text-[12px] font-medium text-black shadow-lg max-w-[80vw] truncate">
                  {displayName(preview.file.fileName)}
                  {previewIndex >= 0 ? ` · ${previewIndex + 1} of ${visibleFiles.length}` : ''}
                  {zoom !== 1 ? ` · ${Math.round(zoom * 100)}%` : ''}
                </div>
              </div>
            )}
          </div>

          {/* Filmstrip — hidden for PDF so document gets max space */}
          {preview.kind === 'image' && visibleFiles.length > 0 && (
            <div
              className="shrink-0 pb-3 pt-2 px-2 sm:px-4 bg-black safe-pb"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                ref={filmstripRef}
                className="flex gap-2 sm:gap-3 overflow-x-auto justify-start sm:justify-center scroll-smooth py-1 px-1"
                style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as any}
              >
                {visibleFiles.map((f) => {
                  const active = f.id === preview.file.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      data-file-id={f.id}
                      onClick={() => { setZoom(1); void openFile(f); }}
                      className={`shrink-0 w-14 h-14 sm:w-[84px] sm:h-[84px] rounded-lg sm:rounded-xl overflow-hidden transition-all ${
                        active
                          ? 'ring-[3px] ring-[#4da3ff] ring-offset-2 ring-offset-black scale-105'
                          : 'opacity-80 hover:opacity-100 ring-1 ring-white/30'
                      }`}
                      title={displayName(f.fileName)}
                    >
                      <div className="w-full h-full bg-[#222] flex items-center justify-center">
                        <Thumb f={f} />
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
