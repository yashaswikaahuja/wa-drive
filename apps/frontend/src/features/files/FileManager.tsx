/**
 * File Manager — Explorer-style, operator UX.
 * Folders = customers · click file = open preview · right-click = actions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FolderOpen, Folder, MagnifyingGlass, UploadSimple, ArrowsClockwise,
  File as FileIcon, Image as ImageIcon, FilePdf, CaretRight, CaretLeft, SquaresFour,
  ListBullets, DownloadSimple, Trash, Camera, SpinnerGap, CheckSquare,
  House,
} from '@phosphor-icons/react';
import {
  MediaViewer,
  displayName as mediaDisplayName,
  type MediaViewerStripItem,
} from '@cybercontrol/media-viewer';
import api, { API_URL } from '../../shared/api';
import { toast } from '../../shared/toast';
import { getCachedBlob } from '../../shared/fileCache';
import { phonesMatch } from '../../shared/phone';
import { useAuthStore } from '../auth/store';
import PdfThumb from './PdfThumb';

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
  return mediaDisplayName(fileName);
}

function folderLabel(phone: string, name: string) {
  if (phone === '__unassigned__') return 'Unassigned';
  const nm = (name || '').trim();
  if (nm && nm !== phone && !/^\d{10,15}$/.test(nm)) return nm;
  return phone;
}

function FileGlyph({ f, size = 36 }: { f: DriveFile; size?: number }) {
  if (isPdf(f)) return <FilePdf size={size} weight="fill" style={{ color: 'hsl(0 65% 48%)' }} />;
  if (isImage(f)) return <ImageIcon size={size} weight="fill" style={{ color: 'hsl(200 65% 40%)' }} />;
  return <FileIcon size={size} weight="fill" style={{ color: 'hsl(var(--pt-muted))' }} />;
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [folderPhone, setFolderPhone] = useState<string | null>(null);
  const deepPhoneAppliedRef = useRef<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: DriveFile; url: string; kind: 'image' | 'pdf' } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; file: DriveFile } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false); // phone / small tablet portrait
  const fileRef = useRef<HTMLInputElement>(null);
  const blobUrlCache = useRef<Map<string, string>>(new Map());
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

  // Profile / Today deep-link: /app/files?phone=… opens that customer folder.
  useEffect(() => {
    const want = searchParams.get('phone');
    if (!want || folders.length === 0) return;
    if (deepPhoneAppliedRef.current === want) return;
    const match = folders.find(
      (f) => f.phone !== '__unassigned__' && phonesMatch(f.phone, want),
    );
    if (!match) return;
    deepPhoneAppliedRef.current = want;
    setFolderPhone(match.phone);
  }, [searchParams, folders]);

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
   * Desktop: plain click opens only (no select). Ctrl/Cmd toggles; Shift range-selects.
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
    } catch (e: any) {
      toast.error(e.message || 'Could not open file');
    } finally {
      setOpeningId(null);
    }
  };

  const closePreview = () => {
    setPreview(null);
    setOpeningId(null);
  };

  const openInPhotoEditor = (f: DriveFile) => {
    const q = new URLSearchParams();
    q.set('fileId', driveIdOf(f));
    if (f.customerId) q.set('phone', f.customerId);
    if (f.customerName) q.set('name', f.customerName);
    q.set('from', '/app/files');
    navigate(`/app/photos/portal?${q}`);
  };

  const previewIndex = preview
    ? visibleFiles.findIndex((f) => f.id === preview.file.id)
    : -1;

  const goPreviewDelta = async (delta: number) => {
    if (previewIndex < 0 || !visibleFiles.length) return;
    const next = visibleFiles[(previewIndex + delta + visibleFiles.length) % visibleFiles.length];
    if (next) await openFile(next);
  };

  const stripItems: MediaViewerStripItem[] = useMemo(
    () =>
      visibleFiles.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        thumbUrl: isImage(f) ? authFileUrl(driveIdOf(f)) : undefined,
        kind: isPdf(f) ? 'pdf' : isImage(f) ? 'image' : 'other',
      })),
    // authFileUrl reads token from store; files identity is enough for strip
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleFiles],
  );

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
    /* Phone (<md): fixed under mobile top bar. md+: fill Layout full-bleed main pane. */
    <div
      className="
        flex flex-col min-h-0 overflow-hidden
        max-md:fixed max-md:z-20 max-md:inset-x-0 max-md:top-12 max-md:bottom-0
        md:relative md:flex-1 md:h-full
      "
      style={{ background: 'hsl(var(--paper))' }}
    >
      {/* Explorer-style toolbar: Back/Up · address bar · search · view */}
      <div
        className="shrink-0 border-b px-2 sm:px-3 py-2 flex flex-col gap-2"
        style={{
          borderColor: 'hsl(var(--pt-border))',
          background: 'linear-gradient(180deg, hsl(var(--pt-card)) 0%, hsl(var(--paper)) 100%)',
        }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <div
            className="flex items-center rounded-lg overflow-hidden shrink-0"
            style={{ border: '1px solid hsl(var(--pt-border))', background: 'hsl(var(--pt-card))' }}
          >
            <button
              type="button"
              className="pt-toolbtn !rounded-none !h-9 !w-9 !p-0 disabled:opacity-35"
              disabled={atRoot}
              onClick={goRoot}
              title="Up to customers"
              aria-label="Up"
            >
              <CaretLeft size={16} weight="bold" />
            </button>
            <button
              type="button"
              className="pt-toolbtn !rounded-none !h-9 !w-9 !p-0 border-l disabled:opacity-35"
              style={{ borderColor: 'hsl(var(--pt-border))' }}
              disabled={atRoot}
              onClick={goRoot}
              title="Customers home"
              aria-label="Home"
            >
              <House size={15} weight="fill" />
            </button>
          </div>

          {/* Address bar */}
          <div
            className="flex items-center gap-1.5 min-w-0 flex-1 h-9 px-2.5 rounded-lg text-xs"
            style={{
              border: '1px solid hsl(var(--pt-border))',
              background: 'hsl(var(--pt-card))',
              boxShadow: 'inset 0 1px 0 hsl(var(--ink) / 0.03)',
            }}
          >
            <FolderOpen size={15} weight="fill" className="shrink-0" style={{ color: 'hsl(var(--marigold))' }} />
            <nav className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden" style={{ color: 'hsl(var(--pt-muted))' }}>
              <button
                type="button"
                className="truncate font-medium transition-colors shrink-0"
                style={{ color: atRoot ? 'hsl(var(--ink))' : 'hsl(var(--pt-muted))' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'hsl(var(--marigold-deep))'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = atRoot ? 'hsl(var(--ink))' : 'hsl(var(--pt-muted))'; }}
                onClick={goRoot}
              >
                Customers
              </button>
              {activeFolder && (
                <>
                  <CaretRight size={11} className="shrink-0 opacity-60" />
                  <span className="truncate font-semibold" style={{ color: 'hsl(var(--ink))' }}>{activeFolder.name}</span>
                </>
              )}
            </nav>
          </div>

          <button
            type="button"
            className="pt-toolbtn w-10 h-10 sm:w-9 sm:h-9 !p-0 shrink-0"
            onClick={load}
            disabled={loading}
            title="Refresh"
            aria-label="Refresh"
          >
            <ArrowsClockwise size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            className="pt-toolbtn w-10 h-10 sm:w-9 sm:h-9 !p-0 shrink-0"
            disabled={uploading || atRoot || folderPhone === '__unassigned__'}
            title={atRoot ? 'Open a customer folder to upload into it' : 'Upload'}
            aria-label="Upload"
            onClick={() => fileRef.current?.click()}
          >
            <UploadSimple size={18} />
          </button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => uploadLocal(e.target.files)} />
        </div>

        <div className="flex items-center gap-2 relative">
          <div className="relative flex-1 min-w-0">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--pt-muted))' }} />
            <input
              className="input-field text-sm sm:text-xs w-full pl-8 py-2 sm:py-1.5"
              placeholder={atRoot ? 'Search name or phone…' : 'Search files…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            {atRoot && autocompleteFolders.length > 0 && search.trim().length > 0 && (
              <ul
                className="absolute left-0 right-0 top-full mt-1 z-40 max-h-64 overflow-y-auto rounded-xl py-1"
                style={{
                  border: '1px solid hsl(var(--pt-border))',
                  background: 'hsl(var(--pt-card))',
                  boxShadow: 'var(--shadow-paper)',
                }}
              >
                {autocompleteFolders.map((fol) => (
                  <li key={fol.phone}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors"
                      style={{ color: 'hsl(var(--ink))' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--pt-secondary))'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      onClick={() => {
                        openFolder(fol.phone);
                        setSearch('');
                      }}
                    >
                      <Folder
                        size={16}
                        weight="fill"
                        className="shrink-0"
                        style={{ color: fol.phone === '__unassigned__' ? 'hsl(var(--pt-muted))' : 'hsl(var(--marigold))' }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{fol.name}</span>
                        {fol.phone !== '__unassigned__' && fol.name !== fol.phone && (
                          <span className="block truncate text-[11px]" style={{ color: 'hsl(var(--pt-muted))' }}>{fol.phone}</span>
                        )}
                      </span>
                      <span className="text-[11px]" style={{ color: 'hsl(var(--pt-muted))' }}>{fol.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!atRoot && (
            <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid hsl(var(--pt-border))' }}>
              <button
                type="button"
                className="pt-toolbtn !rounded-none !h-8 !px-2"
                data-active={view === 'grid' ? 'true' : undefined}
                title="Large icons"
                onClick={() => setView('grid')}
              >
                <SquaresFour size={15} />
              </button>
              <button
                type="button"
                className="pt-toolbtn !rounded-none !h-8 !px-2"
                data-active={view === 'list' ? 'true' : undefined}
                title="Details"
                onClick={() => setView('list')}
              >
                <ListBullets size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Navigation pane — Explorer-style */}
        <aside
          className={`w-56 lg:w-60 shrink-0 border-r overflow-y-auto ${isNarrow ? 'hidden' : 'block'}`}
          style={{
            borderColor: 'hsl(var(--pt-border))',
            background: 'hsl(var(--pt-secondary) / 0.35)',
          }}
        >
          <div className="px-3 pt-3 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'hsl(var(--pt-muted))' }}>
              Navigation
            </p>
          </div>
          <button
            type="button"
            onClick={goRoot}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs rounded-[10px] mx-0 transition-all ${
              atRoot ? 'sidebar-item active' : 'sidebar-item'
            }`}
            style={{ width: 'calc(100% - 0.5rem)', marginLeft: '0.25rem', marginRight: '0.25rem' }}
          >
            <FolderOpen size={16} weight={atRoot ? 'fill' : 'regular'} style={atRoot ? { color: 'hsl(var(--marigold-deep))' } : undefined} />
            <span className="truncate flex-1 font-medium">All customers</span>
            <span className="text-[10px] tabular-nums" style={{ color: 'hsl(var(--pt-muted))' }}>{totalFolders}</span>
          </button>
          <p className="pt-label text-[10px] px-3 pt-3 pb-1.5" style={{ color: 'hsl(var(--pt-muted))' }}>
            Folders{totalFolders > FOLDER_CAP ? ` · top ${FOLDER_CAP}` : ''}
          </p>
          {filteredFolders.map((fol) => {
            const active = folderPhone === fol.phone;
            const unassigned = fol.phone === '__unassigned__';
            return (
              <button
                key={fol.phone}
                type="button"
                onClick={() => openFolder(fol.phone)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs rounded-[10px] transition-all ${
                  active ? 'sidebar-item active' : 'sidebar-item'
                }`}
                style={{
                  width: 'calc(100% - 0.5rem)',
                  marginLeft: '0.25rem',
                  marginRight: '0.25rem',
                  ...(unassigned && !active ? { color: 'hsl(var(--pt-muted))' } : {}),
                }}
                title={unassigned ? 'Files without a customer phone' : fol.phone}
              >
                <Folder
                  size={16}
                  weight={active ? 'fill' : 'regular'}
                  style={{
                    color: unassigned
                      ? 'hsl(var(--pt-muted))'
                      : active
                        ? 'hsl(var(--marigold-deep))'
                        : undefined,
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{fol.name}</span>
                  {!unassigned && fol.name !== fol.phone && (
                    <span className="block truncate text-[10px]" style={{ color: 'hsl(var(--pt-muted))' }}>{fol.phone}</span>
                  )}
                </span>
                <span className="text-[10px]" style={{ color: 'hsl(var(--pt-muted))' }}>{fol.count}</span>
              </button>
            );
          })}
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
              className="shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition-colors"
              style={{
                borderColor: atRoot ? 'hsl(var(--marigold))' : 'hsl(var(--pt-border))',
                color: atRoot ? 'hsl(var(--marigold-deep))' : 'hsl(var(--ink-soft))',
                background: atRoot ? 'hsl(var(--marigold) / 0.12)' : 'hsl(var(--pt-card))',
              }}
              onClick={goRoot}
            >
              All
            </button>
            {filteredFolders.slice(0, 20).map((fol) => {
              const active = folderPhone === fol.phone;
              return (
                <button
                  key={fol.phone}
                  type="button"
                  className="shrink-0 text-[11px] px-2.5 py-1 rounded-full border max-w-[140px] truncate transition-colors"
                  style={{
                    borderColor: active ? 'hsl(var(--marigold))' : 'hsl(var(--pt-border))',
                    color: active ? 'hsl(var(--marigold-deep))' : 'hsl(var(--ink-soft))',
                    background: active ? 'hsl(var(--marigold) / 0.12)' : 'hsl(var(--pt-card))',
                  }}
                  onClick={() => openFolder(fol.phone)}
                >
                  {fol.name}
                </button>
              );
            })}
          </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-20 text-sm" style={{ color: 'hsl(var(--pt-muted))' }}>
              <SpinnerGap size={18} className="animate-spin" /> Loading files…
            </div>
          )}

          {/* ROOT: customer folders (capped — search for the rest) */}
          {!loading && atRoot && (
            <>
              {totalFolders > FOLDER_CAP && !search.trim() && (
                <p className="text-[11px] mb-2 px-1" style={{ color: 'hsl(var(--pt-muted))' }}>
                  Showing {FOLDER_CAP} of {totalFolders} customers — type a name or phone to find others.
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                {filteredFolders.map((fol) => {
                  const unassigned = fol.phone === '__unassigned__';
                  return (
                    <button
                      key={fol.phone}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openFolder(fol.phone); setSearch(''); }}
                      className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl text-center transition-all min-h-[132px]"
                      style={{
                        background: 'hsl(var(--pt-card))',
                        border: '1px solid hsl(var(--pt-border))',
                        boxShadow: 'var(--shadow-paper)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'hsl(var(--marigold) / 0.1)';
                        e.currentTarget.style.borderColor = 'hsl(var(--marigold) / 0.45)';
                        e.currentTarget.style.boxShadow = '0 0 0 1px hsl(var(--marigold) / 0.2), var(--shadow-paper)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'hsl(var(--pt-card))';
                        e.currentTarget.style.borderColor = 'hsl(var(--pt-border))';
                        e.currentTarget.style.boxShadow = 'var(--shadow-paper)';
                      }}
                    >
                      <Folder
                        size={56}
                        weight="fill"
                        style={{
                          color: unassigned ? 'hsl(var(--pt-muted))' : 'hsl(var(--marigold))',
                          filter: unassigned ? undefined : 'drop-shadow(0 3px 6px hsl(var(--marigold) / 0.28))',
                        }}
                      />
                      <span className="text-xs sm:text-[13px] font-semibold truncate w-full leading-tight" style={{ color: 'hsl(var(--ink))' }}>{fol.name}</span>
                      <span className="text-[10px] tabular-nums" style={{ color: 'hsl(var(--pt-muted))' }}>
                        {fol.count} item{fol.count === 1 ? '' : 's'}
                      </span>
                    </button>
                  );
                })}
                {filteredFolders.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center text-center py-16 px-4">
                    <FolderOpen size={40} className="mb-3" style={{ color: 'hsl(var(--pt-muted))', opacity: 0.45 }} />
                    <p className="text-sm max-w-sm" style={{ color: 'hsl(var(--pt-muted))' }}>
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
                    className="relative flex flex-col items-stretch rounded-xl p-2 text-left transition-all select-none"
                    style={{
                      background: isSel || openingId === f.id
                        ? 'hsl(var(--marigold) / 0.14)'
                        : 'hsl(var(--pt-card))',
                      border: isSel || openingId === f.id
                        ? '1px solid hsl(var(--marigold) / 0.55)'
                        : '1px solid hsl(var(--pt-border))',
                      boxShadow: isSel
                        ? '0 0 0 1px hsl(var(--marigold) / 0.22), var(--shadow-paper)'
                        : 'var(--shadow-paper)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSel && openingId !== f.id) {
                        e.currentTarget.style.background = 'hsl(var(--marigold) / 0.08)';
                        e.currentTarget.style.borderColor = 'hsl(var(--marigold) / 0.35)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSel && openingId !== f.id) {
                        e.currentTarget.style.background = 'hsl(var(--pt-card))';
                        e.currentTarget.style.borderColor = 'hsl(var(--pt-border))';
                      }
                    }}
                    title={isNarrow ? 'Tap to open · Long-press to select' : 'Click open · Ctrl+click select'}
                  >
                    {isSel && (
                      <span
                        className="absolute top-2 left-2 z-10 w-5 h-5 rounded flex items-center justify-center text-white shadow"
                        style={{ background: 'hsl(var(--marigold))' }}
                      >
                        <CheckSquare size={12} weight="bold" />
                      </span>
                    )}
                    <div
                      className="aspect-square rounded-lg flex items-center justify-center overflow-hidden mb-2 relative"
                      style={{ background: 'hsl(var(--pt-secondary))', border: '1px solid hsl(var(--pt-border))' }}
                    >
                      <Thumb f={f} />
                      {openingId === f.id && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'hsl(var(--ink) / 0.35)' }}>
                          <SpinnerGap size={22} className="animate-spin text-white" />
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-medium truncate" style={{ color: 'hsl(var(--ink))' }}>{displayName(f.fileName)}</span>
                    <span className="text-[10px] truncate" style={{ color: 'hsl(var(--pt-muted))' }}>
                      {(f.source || 'whatsapp').replace('-', ' ')}
                      {f.timestamp ? ` · ${new Date(f.timestamp).toLocaleDateString()}` : ''}
                    </span>
                  </button>
                );
              })}
              {visibleFiles.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center text-center py-16 px-4">
                  <Folder size={40} className="mb-3" style={{ color: 'hsl(var(--pt-muted))', opacity: 0.45 }} />
                  <p className="text-sm mb-3 max-w-sm" style={{ color: 'hsl(var(--pt-muted))' }}>
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
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid hsl(var(--pt-border))', background: 'hsl(var(--pt-card))', boxShadow: 'var(--shadow-paper)' }}
            >
              <div
                className="grid grid-cols-[1fr_100px_110px_70px] gap-2 px-3 py-2 pt-label text-[10px] border-b"
                style={{ borderColor: 'hsl(var(--pt-border))', color: 'hsl(var(--pt-muted))', background: 'hsl(var(--pt-secondary) / 0.45)' }}
              >
                <span>Name</span><span>Source</span><span>Date</span><span>Type</span>
              </div>
              {visibleFiles.map((f) => {
                const isSel = selectedIds.has(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={(e) => onFileActivate(e, f)}
                    onContextMenu={(e) => onContextMenu(e, f)}
                    className="w-full grid grid-cols-[1fr_100px_110px_70px] gap-2 px-3 py-2.5 text-left text-xs items-center border-b last:border-0 transition-colors"
                    style={{
                      borderColor: 'hsl(var(--pt-border))',
                      background: isSel ? 'hsl(var(--marigold) / 0.12)' : 'transparent',
                      color: 'hsl(var(--ink))',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSel) e.currentTarget.style.background = 'hsl(var(--pt-secondary))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isSel ? 'hsl(var(--marigold) / 0.12)' : 'transparent';
                    }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {openingId === f.id ? <SpinnerGap size={16} className="animate-spin shrink-0" style={{ color: 'hsl(var(--marigold-deep))' }} /> : (
                        <span
                          className="w-7 h-7 rounded overflow-hidden shrink-0 flex items-center justify-center"
                          style={{ background: 'hsl(var(--pt-secondary))' }}
                        >
                          <Thumb f={f} />
                        </span>
                      )}
                      <span className="truncate font-medium">{displayName(f.fileName)}</span>
                    </span>
                    <span className="truncate" style={{ color: 'hsl(var(--pt-muted))' }}>{(f.source || 'whatsapp').replace('-', ' ')}</span>
                    <span style={{ color: 'hsl(var(--pt-muted))' }}>{f.timestamp ? new Date(f.timestamp).toLocaleDateString() : '—'}</span>
                    <span style={{ color: 'hsl(var(--pt-muted))' }}>{isPdf(f) ? 'PDF' : isImage(f) ? 'Image' : 'File'}</span>
                  </button>
                );
              })}
              {visibleFiles.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                  <Folder size={36} className="mb-2" style={{ color: 'hsl(var(--pt-muted))', opacity: 0.45 }} />
                  <p className="text-sm mb-3" style={{ color: 'hsl(var(--pt-muted))' }}>No files in this folder.</p>
                  <button type="button" className="btn-secondary text-xs" onClick={goRoot}>
                    ← Back to all customers
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Explorer status bar */}
      {!preview && (
        <div
          className="shrink-0 border-t px-3 py-1.5 flex items-center justify-between gap-3 text-[11px]"
          style={{
            borderColor: 'hsl(var(--pt-border))',
            background: 'hsl(var(--pt-card))',
            color: 'hsl(var(--pt-muted))',
          }}
        >
          <span className="truncate">
            {atRoot
              ? `${filteredFolders.length} folder${filteredFolders.length === 1 ? '' : 's'}${totalFolders > FOLDER_CAP ? ` (of ${totalFolders})` : ''}`
              : `${visibleFiles.length} item${visibleFiles.length === 1 ? '' : 's'}${selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}`}
          </span>
          <span className="shrink-0 tabular-nums hidden sm:inline">
            {atRoot ? 'Large icons' : view === 'grid' ? 'Large icons' : 'Details'}
          </span>
        </div>
      )}

      {/* Multi-select action bar */}
      {!preview && selectedIds.size > 0 && (
        <div
          className="shrink-0 border-t px-3 py-2 flex flex-wrap items-center gap-2"
          style={{
            borderColor: 'hsl(var(--pt-border))',
            background: 'hsl(var(--marigold) / 0.12)',
            color: 'hsl(var(--ink))',
          }}
        >
          <CheckSquare size={16} weight="fill" style={{ color: 'hsl(var(--marigold-deep))' }} />
          <span className="text-xs font-medium" style={{ color: 'hsl(var(--ink))' }}>{selectedIds.size} selected</span>
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
          <button
            type="button"
            className="text-xs py-1.5 px-2.5 rounded-lg flex items-center gap-1 font-medium transition-colors"
            style={{ background: 'hsl(0 70% 45% / 0.15)', color: 'hsl(0 65% 38%)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(0 70% 45% / 0.22)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'hsl(0 70% 45% / 0.15)'; }}
            onClick={() => void deleteSelected()}
          >
            <Trash size={13} /> Delete
          </button>
          <button
            type="button"
            className="text-xs ml-auto px-2"
            style={{ color: 'hsl(var(--pt-muted))' }}
            onClick={clearSelection}
          >
            Clear
          </button>
        </div>
      )}

      <div
        className="shrink-0 border-t px-3 py-1.5 text-[10px] sm:text-[11px] flex flex-wrap justify-between gap-2"
        style={{ borderColor: 'hsl(var(--pt-border))', color: 'hsl(var(--pt-muted))', background: 'hsl(var(--pt-card) / 0.5)' }}
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
          className="fixed z-[80] min-w-[170px] rounded-xl py-1 text-xs"
          style={{
            left: ctx.x,
            top: ctx.y,
            background: 'hsl(var(--pt-card))',
            border: '1px solid hsl(var(--pt-border))',
            boxShadow: 'var(--shadow-paper)',
            color: 'hsl(var(--ink))',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full px-3 py-2 text-left transition-colors"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--pt-secondary))'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onClick={() => openFile(ctx.file)}
          >
            Open
          </button>
          <button
            type="button"
            className="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--pt-secondary))'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onClick={() => downloadFile(ctx.file)}
          >
            <DownloadSimple size={13} /> Download
          </button>
          {isImage(ctx.file) && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--pt-secondary))'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => {
                setCtx(null);
                const q = new URLSearchParams();
                q.set('fileId', driveIdOf(ctx.file));
                if (ctx.file.customerId) q.set('phone', ctx.file.customerId);
                if (ctx.file.customerName) q.set('name', ctx.file.customerName);
                q.set('from', '/app/files');
                navigate(`/app/photos/portal?${q}`);
              }}
            >
              <Camera size={13} /> Open in Photo Editor
            </button>
          )}
          {(isImage(ctx.file) || isPdf(ctx.file)) && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--pt-secondary))'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => {
                setCtx(null);
                const q = new URLSearchParams();
                q.set('fileId', driveIdOf(ctx.file));
                if (ctx.file.fileName) q.set('fileName', ctx.file.fileName);
                if (ctx.file.customerId) q.set('phone', ctx.file.customerId);
                if (ctx.file.customerName) q.set('name', ctx.file.customerName);
                q.set('from', '/app/files');
                navigate(`/app/photos/scan?${q}`);
              }}
            >
              <FilePdf size={13} /> Open in PDF Tool
            </button>
          )}
          <div className="my-1" style={{ borderTop: '1px solid hsl(var(--pt-border))' }} />
          <button
            type="button"
            className="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors"
            style={{ color: 'hsl(0 65% 38%)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(0 70% 45% / 0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onClick={() => deleteFile(ctx.file)}
          >
            <Trash size={13} /> Delete
          </button>
        </div>
      )}

      <MediaViewer
        file={
          preview
            ? {
                id: preview.file.id,
                fileName: preview.file.fileName,
                url: preview.url,
                kind: preview.kind,
              }
            : null
        }
        items={stripItems}
        index={previewIndex}
        opening={!!openingId && !!preview && openingId !== preview.file.id}
        onClose={closePreview}
        onPrev={() => void goPreviewDelta(-1)}
        onNext={() => void goPreviewDelta(1)}
        onSelectItem={(id) => {
          const f = visibleFiles.find((x) => x.id === id);
          if (f) void openFile(f);
        }}
        onDelete={preview ? () => void deleteFile(preview.file) : undefined}
        onDownload={preview ? () => void downloadFile(preview.file) : undefined}
        onOpenInPhotoEditor={preview ? () => openInPhotoEditor(preview.file) : undefined}
        showDelete
        showPhotoEditor
        renderStripThumb={(item) => {
          const f = visibleFiles.find((x) => x.id === item.id);
          return f ? <Thumb f={f} /> : null;
        }}
      />
    </div>
  );
}
