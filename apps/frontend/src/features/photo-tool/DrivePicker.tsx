/**
 * Drive picker — open a customer folder and pick a file, like a Windows folder window.
 * Every file in the open folder is listed. Nothing is cut off at 60.
 *
 * SERVER NEVER SEES PIXELS — see /ARCHITECTURE.md §3.1.
 * The bytes flow Drive → hub (streaming proxy) → browser. No transformation.
 */

import { useEffect, useMemo, useState } from 'react';
import { CaretLeft, Folder, FolderOpen, MagnifyingGlass, ArrowsClockwise, File as FileIcon } from '@phosphor-icons/react';
import { displayName } from '@cybercontrol/media-viewer';
import api from '../../shared/api';
import { useAuthStore } from '../auth/store';

type DriveFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  customerName?: string;
  customerId?: string;
  timestamp?: string;
  tag?: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (file: File) => void;
  /** Hide PDFs and office files. Photos with no extension still show. */
  imagesOnly?: boolean;
}

type FolderRow = { key: string; name: string; count: number };

// Session cache so reopening the picker is instant (the /drive/files/ws call
// hits Google Drive and is slow). Stale-while-revalidate: show cached results
// immediately, refresh in the background when older than the TTL.
let _driveCache: { ws: string; data: DriveFile[]; at: number } | null = null;
const DRIVE_CACHE_TTL = 120_000;

function isOfficeOrPdf(name: string) {
  return /\.(pdf|docx?|xlsx?|pptx?|zip|txt|csv)$/i.test(name);
}

function folderKeyOf(f: DriveFile) {
  const id = (f.customerId || '').trim();
  if (id) return id;
  const name = (f.customerName || '').trim();
  if (name) return `name:${name}`;
  return '__unassigned__';
}

function folderNameOf(f: DriveFile, key: string) {
  if (key === '__unassigned__') return 'Unassigned';
  const name = (f.customerName || '').trim();
  if (name && !/^\d{10,15}$/.test(name)) return name;
  if (key.startsWith('name:')) return key.slice(5);
  return key;
}

export default function DrivePicker({ open, onClose, onPick, imagesOnly = false }: Props) {
  const [files, setFiles] = useState<DriveFile[]>(() => {
    const ws = useAuthStore.getState().user?.workspaceId || '';
    return _driveCache?.ws === ws ? _driveCache.data : [];
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [folderKey, setFolderKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const ws = useAuthStore.getState().user?.workspaceId || '';
    const hasCache = !!_driveCache && _driveCache.ws === ws;
    const fresh = hasCache && Date.now() - _driveCache!.at < DRIVE_CACHE_TTL;
    if (hasCache) { setFiles(_driveCache!.data); setLoading(false); }
    else { setFiles([]); setLoading(true); }
    if (fresh) return;
    setError('');
    api.get('/drive/files/ws')
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : [];
        _driveCache = { ws, data, at: Date.now() };
        if (alive) setFiles(data);
      })
      .catch(e => { if (alive && !hasCache) setError(e.response?.data?.error || e.message || 'Failed to load files'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open]);

  const reload = () => {
    _driveCache = null;
    setLoading(true);
    setError('');
    const ws = useAuthStore.getState().user?.workspaceId || '';
    api.get('/drive/files/ws')
      .then(res => { const data = Array.isArray(res.data) ? res.data : []; _driveCache = { ws, data, at: Date.now() }; setFiles(data); })
      .catch(e => setError(e.response?.data?.error || e.message || 'Failed to load files'))
      .finally(() => setLoading(false));
  };

  const pool = imagesOnly ? files.filter((f) => !isOfficeOrPdf(f.fileName || '')) : files;

  const folders = useMemo(() => {
    const map = new Map<string, FolderRow>();
    for (const f of pool) {
      const key = folderKeyOf(f);
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { key, name: folderNameOf(f, key), count: 1 });
    }
    return [...map.values()].sort((a, b) => {
      if (a.key === '__unassigned__') return 1;
      if (b.key === '__unassigned__') return -1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [pool]);

  const openFolder = folders.find((f) => f.key === folderKey) || null;
  const q = search.trim().toLowerCase();

  const folderFiles = useMemo(() => {
    if (!folderKey) return [];
    const inFolder = pool.filter((f) => folderKeyOf(f) === folderKey);
    const matched = q
      ? inFolder.filter((f) => displayName(f.fileName).toLowerCase().includes(q) || (f.fileName || '').toLowerCase().includes(q))
      : inFolder;
    return matched.sort((a, b) =>
      displayName(a.fileName).localeCompare(displayName(b.fileName), undefined, { sensitivity: 'base', numeric: true }),
    );
  }, [pool, folderKey, q]);

  const shownFolders = q
    ? folders.filter((f) => f.name.toLowerCase().includes(q))
    : folders;

  const goFolders = () => {
    setFolderKey(null);
    setSearch('');
  };

  const handlePick = async (df: DriveFile) => {
    setPickingId(df.id);
    setError('');
    try {
      const res = await api.get(`/drive/download/${df.id}`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: String(res.headers['content-type'] ?? 'image/jpeg') });
      const file = new File([blob], df.fileName || 'image.jpg', { type: blob.type });
      onPick(file);
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Could not load file');
    } finally {
      setPickingId(null);
    }
  };

  if (!open) return null;

  const itemCount = openFolder ? folderFiles.length : shownFolders.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label="Choose a file">
      <div
        className="rounded-xl shadow-2xl border w-full max-w-3xl h-[min(86vh,720px)] flex flex-col"
        style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))' }}
        onClick={e => e.stopPropagation()}
        data-drive-picker="1"
      >
        <header className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: 'hsl(var(--pt-border))' }}>
          <button
            type="button"
            onClick={goFolders}
            disabled={!openFolder}
            className="pt-toolbtn shrink-0 disabled:opacity-30"
            title="Back to folders"
            aria-label="Back to folders"
          >
            <CaretLeft size={16} />
          </button>
          <div className="flex items-center gap-1 min-w-0 text-sm shrink">
            <button type="button" className="truncate font-medium hover:underline" style={{ color: 'hsl(var(--pt-ink))' }} onClick={goFolders}>
              File Manager
            </button>
            {openFolder && (
              <span className="flex items-center gap-1 min-w-0 font-semibold" style={{ color: 'hsl(var(--pt-ink))' }}>
                <span className="pt-muted">/</span>
                <FolderOpen size={15} weight="fill" style={{ color: 'hsl(var(--pt-marigold-deep))' }} className="shrink-0" />
                <span className="truncate">{openFolder.name}</span>
              </span>
            )}
          </div>
          <div className="relative flex-1 min-w-[8rem]">
            <MagnifyingGlass size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 pt-muted pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={openFolder ? 'Search this folder…' : 'Search folders…'}
              className="w-full pl-8 pr-3 py-1.5 rounded-md text-xs outline-none border"
              style={{ background: 'hsl(var(--pt-secondary) / 0.6)', borderColor: 'hsl(var(--pt-border))', color: 'hsl(var(--pt-ink))' }}
            />
          </div>
          <button type="button" onClick={reload} disabled={loading} className="pt-toolbtn shrink-0 disabled:opacity-50" title="Refresh" aria-label="Refresh files">
            <ArrowsClockwise size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={onClose} className="pt-chip shrink-0">Close</button>
        </header>

        <div className="px-3 py-1 text-[11px] border-b flex gap-8 pt-muted" style={{ borderColor: 'hsl(var(--pt-border))' }}>
          <span className="flex-1">Name</span>
          {!openFolder && <span className="w-16 text-right">Items</span>}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0" data-drive-picker-list="1">
          {loading && files.length === 0 && <div className="text-center pt-muted py-12 text-sm">Loading…</div>}
          {error && <div className="text-center py-4 text-sm" style={{ color: 'hsl(0 65% 48%)' }}>{error}</div>}
          {!loading && !error && itemCount === 0 && (
            <div className="text-center pt-muted py-12 text-sm px-6">
              {q
                ? 'Nothing matches'
                : openFolder
                  ? 'This folder is empty'
                  : 'No folders yet — files received via WhatsApp appear here'}
            </div>
          )}
          {!openFolder && shownFolders.map((fol) => (
            <button
              key={fol.key}
              type="button"
              onClick={() => { setFolderKey(fol.key); setSearch(''); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-left border-b hover:bg-[hsl(var(--pt-marigold)/0.12)]"
              style={{ borderColor: 'hsl(var(--pt-border) / 0.6)', color: 'hsl(var(--pt-ink))' }}
            >
              <Folder size={22} weight="fill" style={{ color: 'hsl(var(--pt-marigold-deep))' }} className="shrink-0" />
              <span className="flex-1 truncate text-sm">{fol.name}</span>
              <span className="w-16 text-right text-xs pt-muted tabular-nums">{fol.count}</span>
            </button>
          ))}
          {openFolder && folderFiles.map((f) => {
            const name = displayName(f.fileName);
            const photo = !isOfficeOrPdf(f.fileName || '');
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => handlePick(f)}
                disabled={pickingId !== null}
                className="w-full flex items-center gap-3 px-3 py-1.5 text-left border-b hover:bg-[hsl(var(--pt-marigold)/0.12)] disabled:opacity-50"
                style={{ borderColor: 'hsl(var(--pt-border) / 0.45)', color: 'hsl(var(--pt-ink))', ...(pickingId === f.id ? { background: 'hsl(var(--pt-marigold) / 0.16)' } : {}) }}
              >
                <span className="w-8 h-8 shrink-0 rounded-sm overflow-hidden flex items-center justify-center" style={{ background: 'hsl(var(--pt-paper-deep))' }}>
                  {photo ? (
                    <img
                      src={f.fileUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <FileIcon size={18} style={{ color: 'hsl(var(--pt-muted))' }} />
                  )}
                </span>
                <span className="flex-1 truncate text-sm">{pickingId === f.id ? 'Loading…' : name}</span>
              </button>
            );
          })}
        </div>

        <footer className="px-3 py-1.5 border-t text-[11px] pt-muted" style={{ borderColor: 'hsl(var(--pt-border))' }}>
          {itemCount} {openFolder ? (itemCount === 1 ? 'item' : 'items') : (itemCount === 1 ? 'folder' : 'folders')}
        </footer>
      </div>
    </div>
  );
}
