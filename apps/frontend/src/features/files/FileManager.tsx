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
  House, List, X, Clock,
} from '@phosphor-icons/react';
import {
  MediaViewer,
  displayName as mediaDisplayName,
  type MediaViewerStripItem,
} from '@cybercontrol/media-viewer';
import api, { API_URL } from '../../shared/api';
import { toast } from '../../shared/toast';
import { getCachedBlob, printBlob } from '../../shared/fileCache';
import { isCardType as isCardTag } from '@cybercontrol/media-tools';
import { formatPhoneDisplay, phonesMatch } from '../../shared/phone';
import { useReveal } from '../../shared/useReveal';
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
type TypeFilter = 'all' | 'photos' | 'pdfs';
type SortMode = 'newest' | 'name';

/** Cap visible folders so 500–600 customers stay usable; search finds the rest. */
const FOLDER_CAP = 50;
/** Cap Recent list (opened + newest received). */
const RECENT_CAP = 50;

const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'photos', label: 'Photos' },
  { id: 'pdfs', label: 'PDFs' },
];

const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'name', label: 'Name' },
];

function openedStorageKey(workspaceId: string | undefined | null) {
  return workspaceId ? `cc-fm-recent-opened:${workspaceId}` : null;
}

function readOpenedIds(workspaceId: string | undefined | null): string[] {
  const key = openedStorageKey(workspaceId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeOpenedIds(workspaceId: string | undefined | null, ids: string[]) {
  const key = openedStorageKey(workspaceId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(ids.slice(0, 40)));
  } catch { /* private mode */ }
}

function customerLabelOf(f: DriveFile) {
  const phone = (f.customerId || '').trim();
  if (!phone) return 'Unassigned';
  return folderLabel(phone, f.customerName || '');
}

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
  const workspaceId = useAuthStore((s) => s.user?.workspaceId);
  const { reveal, trigger } = useReveal({ auto: false });
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [folderPhone, setFolderPhone] = useState<string | null>(null);
  /** Virtual “Recent” view (not a customer folder). */
  const [recentMode, setRecentMode] = useState(false);
  const [openedIds, setOpenedIds] = useState<string[]>(() => readOpenedIds(useAuthStore.getState().user?.workspaceId));
  const deepPhoneAppliedRef = useRef<string | null>(null);
  const deepRecentAppliedRef = useRef(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  /** Type filter for folder / Recent file lists. */
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  /** Sort for folder / Recent: Newest = date desc; Name = A–Z. */
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: DriveFile; url: string; kind: 'image' | 'pdf' } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; file: DriveFile } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false); // phone / small tablet portrait
  const [foldersOpen, setFoldersOpen] = useState(false); // phone folders drawer
  const [folderNavSearch, setFolderNavSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const blobUrlCache = useRef<Map<string, string>>(new Map());
  const mainRef = useRef<HTMLElement>(null);
  const folderDrawerSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOpenedIds(readOpenedIds(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsNarrow(mq.matches);
    apply();
    // Older WebViews used addListener; phone Chrome supports addEventListener.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
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
      trigger();
    }
  }, [trigger]);

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
    setRecentMode(false);
    setFolderPhone(match.phone);
  }, [searchParams, folders]);

  // /app/files?view=recent
  useEffect(() => {
    if (searchParams.get('view') !== 'recent') return;
    if (deepRecentAppliedRef.current) return;
    deepRecentAppliedRef.current = true;
    setFolderPhone(null);
    setRecentMode(true);
  }, [searchParams]);

  const matchesFileSearch = useCallback((f: DriveFile, q: string) => {
    if (!q) return true;
    return (
      (f.fileName || '').toLowerCase().includes(q)
      || displayName(f.fileName || '').toLowerCase().includes(q)
      || (f.customerName || '').toLowerCase().includes(q)
      || (f.customerId || '').toLowerCase().includes(q)
      || (f.tag || '').toLowerCase().includes(q)
      || customerLabelOf(f).toLowerCase().includes(q)
    );
  }, []);

  const matchesTypeFilter = useCallback((f: DriveFile, filter: TypeFilter) => {
    if (filter === 'all') return true;
    if (filter === 'photos') return isImage(f);
    if (filter === 'pdfs') return isPdf(f);
    return true;
  }, []);

  const visibleFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byTs = (a: DriveFile, b: DriveFile) =>
      String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
    const byName = (a: DriveFile, b: DriveFile) =>
      displayName(a.fileName || '').localeCompare(displayName(b.fileName || ''), undefined, { sensitivity: 'base' });
    const sortFiles = (list: DriveFile[]) =>
      [...list].sort(sortMode === 'name' ? byName : byTs);

    const applyFilters = (list: DriveFile[]) =>
      list.filter((f) => matchesFileSearch(f, q) && matchesTypeFilter(f, typeFilter));

    if (recentMode && !folderPhone) {
      // Name: plain A–Z. Newest: files you opened first, then newest received.
      if (sortMode === 'name') {
        return sortFiles(applyFilters(files)).slice(0, RECENT_CAP);
      }
      const byId = new Map(files.map((f) => [f.id, f]));
      const remembered: DriveFile[] = [];
      const seen = new Set<string>();
      for (const id of openedIds) {
        const hit = byId.get(id);
        if (hit && !seen.has(hit.id)) {
          remembered.push(hit);
          seen.add(hit.id);
        }
      }
      const rest = files.filter((f) => !seen.has(f.id)).sort(byTs);
      return applyFilters([...remembered, ...rest]).slice(0, RECENT_CAP);
    }

    return sortFiles(
      applyFilters(
        files.filter((f) => {
          const phone = (f.customerId || '').trim() || '__unassigned__';
          if (folderPhone && phone !== folderPhone) return false;
          return true;
        }),
      ),
    );
  }, [files, folderPhone, search, recentMode, openedIds, typeFilter, sortMode, matchesFileSearch, matchesTypeFilter]);

  /** Counts for type chips (same scope as current view, before type filter). */
  const typeFilterCounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    let pool: DriveFile[];
    if (recentMode && !folderPhone) {
      pool = files;
    } else if (folderPhone) {
      pool = files.filter((f) => ((f.customerId || '').trim() || '__unassigned__') === folderPhone);
    } else {
      pool = [];
    }
    const matched = pool.filter((f) => matchesFileSearch(f, q));
    return {
      all: recentMode && !folderPhone ? Math.min(matched.length, RECENT_CAP) : matched.length,
      photos: matched.filter(isImage).length,
      pdfs: matched.filter(isPdf).length,
    };
  }, [files, folderPhone, recentMode, search, matchesFileSearch]);

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
  const atRecent = recentMode && !folderPhone;
  const atRoot = !folderPhone && !recentMode;
  const showingFiles = !atRoot; // folder or Recent
  const canUpload = !!folderPhone && folderPhone !== '__unassigned__';
  const totalFolders = folders.length;

  const autocompleteFolders = useMemo(() => {
    if (folderPhone || recentMode || search.trim().length < 1) return [];
    return folderMatches.slice(0, FOLDER_CAP);
  }, [folderPhone, recentMode, search, folderMatches]);

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

  const rememberOpened = (id: string) => {
    setOpenedIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)];
      writeOpenedIds(workspaceId, next);
      return next;
    });
  };

  const openFile = async (f: DriveFile) => {
    setCtx(null);
    setSelectedId(f.id);
    setOpeningId(f.id);
    try {
      if (!isImage(f) && !isPdf(f)) {
        const url = await ensureBlobUrl(f);
        rememberOpened(f.id);
        window.open(url, '_blank', 'noopener');
        return;
      }
      const url = await ensureBlobUrl(f);
      rememberOpened(f.id);
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

  /** Photos → paper editor to fix them first; PDFs and anything else print directly. */
  const openDocumentPrint = (f: DriveFile) => {
    if (isImage(f)) {
      void (async () => {
        const q = new URLSearchParams();
        q.set('fileId', driveIdOf(f));
        if (f.customerId) q.set('phone', f.customerId);
        if (f.customerName) q.set('name', f.customerName);
        q.set('from', '/app/files');
        q.set('paper', 'a4');
        if (f.tag) q.set('docType', f.tag);
        // Card IDs: auto-pull the other side of the same physical card (same id-number).
        if (f.tag && f.customerId && isCardTag(f.tag)) {
          try {
            const r = await api.get(
              `/customers/card-siblings/${encodeURIComponent(f.customerId)}/${encodeURIComponent(driveIdOf(f))}`,
              { skipErrorToast: true } as any,
            );
            const ids: string[] = Array.isArray(r.data?.orderedFileIds) ? r.data.orderedFileIds : [];
            const rest = ids.filter((id) => id && id !== driveIdOf(f));
            if (rest.length) q.set('fileIds', rest.join(','));
          } catch { /* fall back to the single card */ }
        }
        closePreview();
        navigate(`/app/photos/printdoc?${q}`);
      })();
      return;
    }
    void (async () => {
      try {
        const id = driveIdOf(f);
        const blob = await getCachedBlob(id, async () => {
          const res = await api.get(`/drive/download/${id}`, { responseType: 'blob' });
          return new Blob([res.data], {
            type: String(res.headers['content-type'] ?? 'application/pdf'),
          });
        });
        printBlob(blob);
      } catch (e: any) {
        toast.error(e?.message || 'Print failed');
      }
    })();
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
    setRecentMode(false);
    clearSelection();
    setSearch('');
    setFoldersOpen(false);
  };

  const openRecent = () => {
    setFolderPhone(null);
    setRecentMode(true);
    clearSelection();
    setSearch('');
    setFoldersOpen(false);
  };

  const openFolder = (phone: string) => {
    setFolderPhone(phone);
    setRecentMode(false);
    clearSelection();
    setSearch('');
    setFoldersOpen(false);
  };

  // Phone folders drawer: Esc closes; focus search when opened.
  useEffect(() => {
    if (!foldersOpen) return;
    const t = window.setTimeout(() => folderDrawerSearchRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFoldersOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [foldersOpen]);

  const navFolders = useMemo(() => {
    const q = folderNavSearch.trim().toLowerCase();
    const base = filteredFolders;
    if (!q) return base;
    return base.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.phone.toLowerCase().includes(q) ||
        formatPhoneDisplay(f.phone).toLowerCase().includes(q),
    );
  }, [filteredFolders, folderNavSearch]);

  /** Desktop Navigation pane — Hub sidebar-item chrome. */
  const renderDesktopFolderNav = () => (
    <>
      <button
        type="button"
        onClick={goRoot}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs rounded-[10px] transition-all ${
          atRoot ? 'sidebar-item active' : 'sidebar-item'
        }`}
        style={{ width: 'calc(100% - 0.5rem)', marginLeft: '0.25rem', marginRight: '0.25rem' }}
      >
        <FolderOpen size={16} weight={atRoot ? 'fill' : 'regular'} style={atRoot ? { color: 'hsl(var(--marigold-deep))' } : undefined} />
        <span className="truncate flex-1 font-medium">All customers</span>
        <span className="text-[10px] tabular-nums" style={{ color: 'hsl(var(--pt-muted))' }}>{totalFolders}</span>
      </button>
      <button
        type="button"
        onClick={openRecent}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs rounded-[10px] transition-all ${
          atRecent ? 'sidebar-item active' : 'sidebar-item'
        }`}
        style={{ width: 'calc(100% - 0.5rem)', marginLeft: '0.25rem', marginRight: '0.25rem' }}
      >
        <Clock size={16} weight={atRecent ? 'fill' : 'regular'} style={atRecent ? { color: 'hsl(var(--marigold-deep))' } : undefined} />
        <span className="truncate flex-1 font-medium">Recent</span>
        <span className="text-[10px] tabular-nums" style={{ color: 'hsl(var(--pt-muted))' }}>
          {Math.min(files.length, RECENT_CAP)}
        </span>
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
                    : 'hsl(var(--marigold))',
              }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{fol.name}</span>
              {!unassigned && fol.name !== fol.phone && (
                <span className="block truncate text-[10px]" style={{ color: 'hsl(var(--pt-muted))' }}>
                  {formatPhoneDisplay(fol.phone)}
                </span>
              )}
            </span>
            <span className="text-[10px]" style={{ color: 'hsl(var(--pt-muted))' }}>{fol.count}</span>
          </button>
        );
      })}
    </>
  );

  /** Phone drawer — clean file-manager rows (not Hub sidebar-item). */
  const renderPhoneFolderDrawer = () => (
    <>
      {/* Search + close — no Folders banner; more list height */}
      <div
        className="sticky top-0 z-10 flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3"
        style={{ background: 'hsl(var(--pt-card))', borderBottom: '1px solid hsl(var(--pt-border-soft))' }}
      >
        <div className="relative flex-1 min-w-0">
          <MagnifyingGlass size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--pt-muted))' }} />
          <input
            ref={folderDrawerSearchRef}
            className="input-field text-[15px] w-full pl-10 pr-3 py-3 rounded-2xl"
            placeholder="Search customers…"
            value={folderNavSearch}
            onChange={(e) => setFolderNavSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'hsl(var(--pt-secondary))', color: 'hsl(var(--ink-soft))' }}
          onClick={() => setFoldersOpen(false)}
          aria-label="Close folders"
        >
          <X size={18} weight="bold" />
        </button>
      </div>

      <button
        type="button"
        onClick={goRoot}
        className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:opacity-80"
        style={{
          background: atRoot ? 'hsl(var(--marigold) / 0.12)' : 'transparent',
          borderBottom: '1px solid hsl(var(--pt-border-soft))',
        }}
      >
        <span
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: atRoot ? 'hsl(var(--marigold) / 0.22)' : 'hsl(var(--pt-secondary))' }}
        >
          <FolderOpen size={22} weight="fill" style={{ color: 'hsl(var(--marigold-deep))' }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold truncate" style={{ color: 'hsl(var(--ink))' }}>All customers</span>
          <span className="block text-[13px] truncate mt-0.5" style={{ color: 'hsl(var(--pt-muted))' }}>
            {totalFolders} folder{totalFolders === 1 ? '' : 's'}
          </span>
        </span>
        {atRoot && (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'hsl(var(--marigold) / 0.2)', color: 'hsl(var(--marigold-deep))' }}>
            Open
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={openRecent}
        className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:opacity-80"
        style={{
          background: atRecent ? 'hsl(var(--marigold) / 0.12)' : 'transparent',
          borderBottom: '1px solid hsl(var(--pt-border-soft))',
        }}
      >
        <span
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: atRecent ? 'hsl(var(--marigold) / 0.22)' : 'hsl(var(--pt-secondary))' }}
        >
          <Clock size={22} weight="fill" style={{ color: 'hsl(var(--marigold-deep))' }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold truncate" style={{ color: 'hsl(var(--ink))' }}>Recent</span>
          <span className="block text-[13px] truncate mt-0.5" style={{ color: 'hsl(var(--pt-muted))' }}>
            Opened + newest files
          </span>
        </span>
        {atRecent && (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'hsl(var(--marigold) / 0.2)', color: 'hsl(var(--marigold-deep))' }}>
            Open
          </span>
        )}
      </button>

      <ul className="pb-8">
        {navFolders.map((fol) => {
          const active = folderPhone === fol.phone;
          const unassigned = fol.phone === '__unassigned__';
          return (
            <li key={fol.phone}>
              <button
                type="button"
                onClick={() => openFolder(fol.phone)}
                className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:opacity-80"
                style={{
                  background: active ? 'hsl(var(--marigold) / 0.12)' : 'transparent',
                  borderBottom: '1px solid hsl(var(--pt-border-soft))',
                }}
                title={unassigned ? 'Files without a customer phone' : fol.phone}
              >
                <span
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                  style={{
                    background: unassigned
                      ? 'hsl(var(--pt-secondary))'
                      : active
                        ? 'hsl(var(--marigold) / 0.22)'
                        : 'hsl(var(--marigold) / 0.12)',
                  }}
                >
                  <Folder
                    size={22}
                    weight="fill"
                    style={{ color: unassigned ? 'hsl(var(--pt-muted))' : 'hsl(var(--marigold-deep))' }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold truncate" style={{ color: 'hsl(var(--ink))' }}>
                    {fol.name}
                  </span>
                  {!unassigned && (
                    <span className="block text-[13px] truncate tabular-nums mt-0.5" style={{ color: 'hsl(var(--pt-muted))' }}>
                      {formatPhoneDisplay(fol.phone)}
                    </span>
                  )}
                  {unassigned && (
                    <span className="block text-[13px] truncate mt-0.5" style={{ color: 'hsl(var(--pt-muted))' }}>
                      No customer phone
                    </span>
                  )}
                </span>
                <span
                  className="min-w-[1.75rem] h-7 px-2 rounded-full text-xs font-semibold tabular-nums flex items-center justify-center shrink-0"
                  style={{
                    background: active ? 'hsl(var(--marigold) / 0.22)' : 'hsl(var(--pt-secondary))',
                    color: active ? 'hsl(var(--marigold-deep))' : 'hsl(var(--pt-muted))',
                  }}
                >
                  {fol.count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {navFolders.length === 0 && (
        <p className="px-6 py-14 text-[15px] text-center" style={{ color: 'hsl(var(--pt-muted))' }}>
          No customers match “{folderNavSearch.trim()}”.
        </p>
      )}
    </>
  );

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
    /* Fill Layout full-bleed main (same as Documents). Do not pin top-12 —
       that left a blank strip when the Hub CyberControl bar was scrolled/hidden. */
    <div
      className="flex flex-col flex-1 h-full min-h-0 overflow-hidden"
      style={{ background: 'hsl(var(--paper))' }}
    >
      {/* Toolbar — phone: airy title bar; desktop: Explorer chrome */}
      <div
        className={`shrink-0 border-b flex flex-col ${isNarrow ? 'px-3 py-3 gap-3' : 'px-2 sm:px-3 py-2 gap-2'}`}
        style={{
          borderColor: 'hsl(var(--pt-border))',
          background: 'linear-gradient(180deg, hsl(var(--pt-card)) 0%, hsl(var(--paper)) 100%)',
          ...reveal(0),
        }}
      >
        {isNarrow ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              className="pt-toolbtn w-11 h-11 !p-0 shrink-0"
              onClick={() => {
                setFolderNavSearch('');
                setFoldersOpen(true);
              }}
              title="Folders"
              aria-label="Open folders"
              aria-expanded={foldersOpen}
            >
              <List size={20} weight="bold" />
            </button>
            {!atRoot && (
              <button
                type="button"
                className="pt-toolbtn w-11 h-11 !p-0 shrink-0"
                onClick={goRoot}
                title="Back to customers"
                aria-label="Back"
              >
                <CaretLeft size={18} weight="bold" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold truncate leading-tight" style={{ color: 'hsl(var(--ink))' }}>
                {activeFolder ? activeFolder.name : atRecent ? 'Recent' : 'Customers'}
              </p>
              <p className="text-[12px] truncate mt-0.5" style={{ color: 'hsl(var(--pt-muted))' }}>
                {showingFiles
                  ? `${visibleFiles.length} item${visibleFiles.length === 1 ? '' : 's'}`
                  : `${totalFolders} folder${totalFolders === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              type="button"
              className="pt-toolbtn w-11 h-11 !p-0 shrink-0"
              onClick={load}
              disabled={loading}
              title="Refresh"
              aria-label="Refresh"
            >
              <ArrowsClockwise size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="pt-toolbtn w-11 h-11 !p-0 shrink-0"
              disabled={uploading || !canUpload}
              title={canUpload ? 'Upload' : 'Open a customer folder to upload into it'}
              aria-label="Upload"
              onClick={() => fileRef.current?.click()}
            >
              <UploadSimple size={18} />
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => uploadLocal(e.target.files)} />
          </div>
        ) : (
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
                {atRecent && (
                  <>
                    <CaretRight size={11} className="shrink-0 opacity-60" />
                    <span className="truncate font-semibold" style={{ color: 'hsl(var(--ink))' }}>Recent</span>
                  </>
                )}
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
              className="pt-toolbtn w-9 h-9 !p-0 shrink-0"
              onClick={load}
              disabled={loading}
              title="Refresh"
              aria-label="Refresh"
            >
              <ArrowsClockwise size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="pt-toolbtn w-9 h-9 !p-0 shrink-0"
              disabled={uploading || !canUpload}
              title={canUpload ? 'Upload' : 'Open a customer folder to upload into it'}
              aria-label="Upload"
              onClick={() => fileRef.current?.click()}
            >
              <UploadSimple size={18} />
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => uploadLocal(e.target.files)} />
          </div>
        )}

        <div className="flex items-center gap-2 relative">
          <div className="relative flex-1 min-w-0">
            <MagnifyingGlass
              size={isNarrow ? 16 : 14}
              className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${isNarrow ? 'left-3.5' : 'left-2.5'}`}
              style={{ color: 'hsl(var(--pt-muted))' }}
            />
            <input
              className={`input-field w-full ${isNarrow ? 'text-[15px] pl-10 py-3 rounded-2xl' : 'text-sm sm:text-xs pl-8 py-2 sm:py-1.5'}`}
              placeholder={atRoot ? 'Search name or phone…' : atRecent ? 'Search recent files…' : 'Search files…'}
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
          {showingFiles && (
            <div className="flex rounded-xl overflow-hidden shrink-0" style={{ border: '1px solid hsl(var(--pt-border))' }}>
              <button
                type="button"
                className={`pt-toolbtn !rounded-none ${isNarrow ? '!h-11 !px-3' : '!h-8 !px-2'}`}
                data-active={view === 'grid' ? 'true' : undefined}
                title="Large icons"
                onClick={() => setView('grid')}
              >
                <SquaresFour size={isNarrow ? 17 : 15} />
              </button>
              <button
                type="button"
                className={`pt-toolbtn !rounded-none ${isNarrow ? '!h-11 !px-3' : '!h-8 !px-2'}`}
                data-active={view === 'list' ? 'true' : undefined}
                title="Details"
                onClick={() => setView('list')}
              >
                <ListBullets size={isNarrow ? 17 : 15} />
              </button>
            </div>
          )}
        </div>

        {showingFiles && (
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="flex items-center gap-2 overflow-x-auto min-w-0 flex-1"
              style={{ WebkitOverflowScrolling: 'touch' } as any}
              role="tablist"
              aria-label="File type filter"
            >
              {TYPE_FILTERS.map((chip) => {
                const active = typeFilter === chip.id;
                const count =
                  chip.id === 'all'
                    ? typeFilterCounts.all
                    : chip.id === 'photos'
                      ? typeFilterCounts.photos
                      : typeFilterCounts.pdfs;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setTypeFilter(chip.id);
                      clearSelection();
                    }}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors ${
                      isNarrow ? 'text-[13px] px-3.5 py-2' : 'text-xs px-3 py-1.5'
                    }`}
                    style={{
                      background: active ? 'hsl(var(--marigold) / 0.2)' : 'hsl(var(--pt-secondary))',
                      color: active ? 'hsl(var(--marigold-deep))' : 'hsl(var(--ink-soft))',
                      border: active ? '1px solid hsl(var(--marigold) / 0.45)' : '1px solid transparent',
                    }}
                  >
                    {chip.label}
                    <span
                      className="tabular-nums rounded-full min-w-[1.25rem] px-1 text-center"
                      style={{
                        fontSize: isNarrow ? 11 : 10,
                        background: active ? 'hsl(var(--marigold) / 0.22)' : 'hsl(var(--pt-card))',
                        color: active ? 'hsl(var(--marigold-deep))' : 'hsl(var(--pt-muted))',
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              className="flex rounded-full overflow-hidden shrink-0"
              style={{ border: '1px solid hsl(var(--pt-border))', background: 'hsl(var(--pt-secondary))' }}
              role="group"
              aria-label="Sort files"
            >
              {SORT_MODES.map((mode) => {
                const active = sortMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSortMode(mode.id);
                      clearSelection();
                    }}
                    className={`font-semibold transition-colors ${
                      isNarrow ? 'text-[12px] px-3 py-2' : 'text-[11px] px-2.5 py-1.5'
                    }`}
                    style={{
                      background: active ? 'hsl(var(--marigold) / 0.22)' : 'transparent',
                      color: active ? 'hsl(var(--marigold-deep))' : 'hsl(var(--pt-muted))',
                    }}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex relative" style={reveal(1)}>
        {/* Navigation pane — Explorer-style (desktop) */}
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
          {renderDesktopFolderNav()}
        </aside>

        {/* Phone folders drawer — clean file-manager list (not Hub sidebar chrome) */}
        {isNarrow && foldersOpen && (
          <>
            <button
              type="button"
              className="absolute inset-0 z-40 border-0 p-0 cursor-default"
              style={{ background: 'hsl(220 30% 8% / 0.4)' }}
              aria-label="Close folders"
              onClick={() => setFoldersOpen(false)}
            />
            <aside
              className="absolute inset-y-0 left-0 z-50 w-[min(22rem,92vw)] flex flex-col overflow-hidden"
              style={{
                background: 'hsl(var(--pt-card))',
                boxShadow: '12px 0 40px -16px hsl(220 30% 8% / 0.45)',
                borderRight: '1px solid hsl(var(--pt-border))',
              }}
              role="dialog"
              aria-modal="true"
              aria-label="Folders"
            >
              <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' } as any}>
                {renderPhoneFolderDrawer()}
              </div>
            </aside>
          </>
        )}

        <main
          ref={mainRef as any}
          className={`flex-1 min-w-0 overflow-y-auto ${isNarrow ? 'p-4' : 'p-3 sm:p-4'}`}
          onClick={() => clearSelection()}
        >
          {loading && (
            <div className="flex items-center justify-center gap-2 py-20 text-sm" style={{ color: 'hsl(var(--pt-muted))' }}>
              <SpinnerGap size={18} className="animate-spin" /> Loading files…
            </div>
          )}

          {/* ROOT: customer folders (capped — search for the rest) */}
          {!loading && atRoot && (
            <>
              {totalFolders > FOLDER_CAP && !search.trim() && (
                <p className={`mb-3 px-1 ${isNarrow ? 'text-[13px]' : 'text-[11px]'}`} style={{ color: 'hsl(var(--pt-muted))' }}>
                  Showing {FOLDER_CAP} of {totalFolders} customers — type a name or phone to find others.
                </p>
              )}
              <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 ${isNarrow ? 'gap-3' : 'gap-2 sm:gap-3'}`}>
                {filteredFolders.map((fol) => {
                  const unassigned = fol.phone === '__unassigned__';
                  return (
                    <button
                      key={fol.phone}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openFolder(fol.phone); setSearch(''); }}
                      className={`flex flex-col items-center text-center transition-all ${
                        isNarrow
                          ? 'gap-2.5 p-4 rounded-2xl min-h-[156px]'
                          : 'gap-2 p-3 sm:p-4 rounded-xl min-h-[132px]'
                      }`}
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
                        size={isNarrow ? 64 : 56}
                        weight="fill"
                        style={{
                          color: unassigned ? 'hsl(var(--pt-muted))' : 'hsl(var(--marigold))',
                          filter: unassigned ? undefined : 'drop-shadow(0 3px 6px hsl(var(--marigold) / 0.28))',
                        }}
                      />
                      <span
                        className={`font-semibold truncate w-full leading-snug ${isNarrow ? 'text-[14px]' : 'text-xs sm:text-[13px]'}`}
                        style={{ color: 'hsl(var(--ink))' }}
                      >
                        {fol.name}
                      </span>
                      <span className={`tabular-nums ${isNarrow ? 'text-[12px]' : 'text-[10px]'}`} style={{ color: 'hsl(var(--pt-muted))' }}>
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

          {/* Folder or Recent: files */}
          {!loading && showingFiles && view === 'grid' && (
            <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 ${isNarrow ? 'gap-3' : 'gap-1.5 sm:gap-2'}`}>
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
                    className={`relative flex flex-col items-stretch text-left transition-all select-none ${
                      isNarrow ? 'rounded-2xl p-2.5' : 'rounded-xl p-2'
                    }`}
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
                      className={`aspect-square flex items-center justify-center overflow-hidden relative ${
                        isNarrow ? 'rounded-xl mb-2.5' : 'rounded-lg mb-2'
                      }`}
                      style={{ background: 'hsl(var(--pt-secondary))', border: '1px solid hsl(var(--pt-border))' }}
                    >
                      <Thumb f={f} />
                      {openingId === f.id && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'hsl(var(--ink) / 0.35)' }}>
                          <SpinnerGap size={22} className="animate-spin text-white" />
                        </div>
                      )}
                    </div>
                    <span className={`font-medium truncate ${isNarrow ? 'text-[13px]' : 'text-[11px]'}`} style={{ color: 'hsl(var(--ink))' }}>
                      {displayName(f.fileName)}
                    </span>
                    <span className={`truncate ${isNarrow ? 'text-[11px] mt-0.5' : 'text-[10px]'}`} style={{ color: 'hsl(var(--pt-muted))' }}>
                      {atRecent
                        ? `${customerLabelOf(f)}${f.timestamp ? ` · ${new Date(f.timestamp).toLocaleDateString()}` : ''}`
                        : `${(f.source || 'whatsapp').replace('-', ' ')}${f.timestamp ? ` · ${new Date(f.timestamp).toLocaleDateString()}` : ''}`}
                    </span>
                  </button>
                );
              })}
              {visibleFiles.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center text-center py-16 px-4">
                  {atRecent
                    ? <Clock size={40} className="mb-3" style={{ color: 'hsl(var(--pt-muted))', opacity: 0.45 }} />
                    : <Folder size={40} className="mb-3" style={{ color: 'hsl(var(--pt-muted))', opacity: 0.45 }} />}
                  <p className="text-sm mb-3 max-w-sm" style={{ color: 'hsl(var(--pt-muted))' }}>
                    {search || typeFilter !== 'all'
                      ? (typeFilter === 'photos'
                        ? 'No photos match.'
                        : typeFilter === 'pdfs'
                          ? 'No PDFs match.'
                          : (atRecent ? 'No recent files match your search.' : 'No files match your search in this folder.'))
                      : (atRecent ? 'No files yet. Receive documents on WhatsApp or open a customer folder.' : 'This folder is empty.')}
                  </p>
                  {typeFilter !== 'all' && !search && (
                    <button type="button" className="btn-secondary text-xs mb-2" onClick={() => setTypeFilter('all')}>
                      Show all types
                    </button>
                  )}
                  <button type="button" className="btn-secondary text-xs" onClick={goRoot}>
                    ← Back to all customers
                  </button>
                </div>
              )}
            </div>
          )}

          {!loading && showingFiles && view === 'list' && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid hsl(var(--pt-border))', background: 'hsl(var(--pt-card))', boxShadow: 'var(--shadow-paper)' }}
            >
              <div
                className="grid grid-cols-[1fr_120px_100px_70px] gap-2 px-3 py-2 pt-label text-[10px] border-b"
                style={{ borderColor: 'hsl(var(--pt-border))', color: 'hsl(var(--pt-muted))', background: 'hsl(var(--pt-secondary) / 0.45)' }}
              >
                <span>Name</span>
                <span>{atRecent ? 'Customer' : 'Source'}</span>
                <span>Date</span>
                <span>Type</span>
              </div>
              {visibleFiles.map((f) => {
                const isSel = selectedIds.has(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={(e) => onFileActivate(e, f)}
                    onContextMenu={(e) => onContextMenu(e, f)}
                    className="w-full grid grid-cols-[1fr_120px_100px_70px] gap-2 px-3 py-2.5 text-left text-xs items-center border-b last:border-0 transition-colors"
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
                    <span className="truncate" style={{ color: 'hsl(var(--pt-muted))' }}>
                      {atRecent ? customerLabelOf(f) : (f.source || 'whatsapp').replace('-', ' ')}
                    </span>
                    <span style={{ color: 'hsl(var(--pt-muted))' }}>{f.timestamp ? new Date(f.timestamp).toLocaleDateString() : '—'}</span>
                    <span style={{ color: 'hsl(var(--pt-muted))' }}>{isPdf(f) ? 'PDF' : isImage(f) ? 'Image' : 'File'}</span>
                  </button>
                );
              })}
              {visibleFiles.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                  {atRecent
                    ? <Clock size={36} className="mb-2" style={{ color: 'hsl(var(--pt-muted))', opacity: 0.45 }} />
                    : <Folder size={36} className="mb-2" style={{ color: 'hsl(var(--pt-muted))', opacity: 0.45 }} />}
                  <p className="text-sm mb-3" style={{ color: 'hsl(var(--pt-muted))' }}>
                    {atRecent ? 'No recent files yet.' : 'No files in this folder.'}
                  </p>
                  <button type="button" className="btn-secondary text-xs" onClick={goRoot}>
                    ← Back to all customers
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Multi-select action bar */}
      {!preview && selectedIds.size > 0 && (
        <div
          className="shrink-0 border-t px-3 py-2 flex flex-wrap items-center gap-2"
          style={{
            borderColor: 'hsl(var(--pt-border))',
            background: 'hsl(var(--marigold) / 0.12)',
            color: 'hsl(var(--ink))',
            paddingBottom: isNarrow ? 'max(0.5rem, env(safe-area-inset-bottom))' : undefined,
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

      {/* Desktop status bar only — phone title already shows counts */}
      {!preview && selectedIds.size === 0 && !isNarrow && (
        <div
          className="shrink-0 border-t px-3 py-1.5 text-[10px] sm:text-[11px] flex flex-wrap items-center justify-between gap-2"
          style={{
            borderColor: 'hsl(var(--pt-border))',
            color: 'hsl(var(--pt-muted))',
            background: 'hsl(var(--pt-card))',
          }}
        >
          <span className="truncate">
            {atRoot
              ? `${filteredFolders.length} folder${filteredFolders.length === 1 ? '' : 's'}${totalFolders > FOLDER_CAP ? ` of ${totalFolders}` : ''} · ${files.length} files`
              : atRecent
                ? `${visibleFiles.length} recent file${visibleFiles.length === 1 ? '' : 's'}`
                : `${visibleFiles.length} item${visibleFiles.length === 1 ? '' : 's'} in ${activeFolder?.name || 'folder'}`}
          </span>
          <span className="shrink-0">
            {atRoot
              ? 'Large icons · Search finds any customer'
              : atRecent
                ? (sortMode === 'name' ? 'Recent · A–Z' : 'Recent · opened first, then newest')
                : view === 'grid'
                  ? (sortMode === 'name' ? 'Large icons · A–Z' : 'Large icons · newest first')
                  : (sortMode === 'name' ? 'Details · A–Z' : 'Details · newest first')}
          </span>
        </div>
      )}

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
          {atRecent && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--pt-secondary))'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => {
                const phone = (ctx.file.customerId || '').trim() || '__unassigned__';
                setCtx(null);
                openFolder(phone);
              }}
            >
              <Folder size={13} /> Show in folder
            </button>
          )}
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
                q.set('paper', 'a4');
                navigate(`/app/photos/printdoc?${q}`);
              }}
            >
              <FilePdf size={13} /> Open in Print Doc
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
        onPrint={preview ? () => openDocumentPrint(preview.file) : undefined}
        showDelete
        showPhotoEditor
        showPrint={!!preview && (isImage(preview.file) || isPdf(preview.file))}
        renderStripThumb={(item) => {
          const f = visibleFiles.find((x) => x.id === item.id);
          return f ? <Thumb f={f} /> : null;
        }}
      />
    </div>
  );
}
