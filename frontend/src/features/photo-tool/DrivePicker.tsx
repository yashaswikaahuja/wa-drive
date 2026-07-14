/**
 * Drive picker — operator picks an existing customer file from Drive
 * without re-uploading. Pulls workspace-scoped files via the hub.
 *
 * SERVER NEVER SEES PIXELS — see /ARCHITECTURE.md §3.1.
 * The bytes flow Drive → hub (streaming proxy) → browser. No transformation.
 */

import { useEffect, useState } from 'react';
import { FolderOpen, MagnifyingGlass, ArrowsClockwise } from '@phosphor-icons/react';
import api from '../../shared/api';

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
}

// Session cache so reopening the picker is instant (the /drive/files/ws call
// hits Google Drive and is slow). Stale-while-revalidate: show cached results
// immediately, refresh in the background when older than the TTL.
let _driveCache: { data: DriveFile[]; at: number } | null = null;
const DRIVE_CACHE_TTL = 120_000;

export default function DrivePicker({ open, onClose, onPick }: Props) {
  const [files, setFiles] = useState<DriveFile[]>(() => _driveCache?.data ?? []);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [pickingId, setPickingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const hasCache = !!_driveCache;
    const fresh = _driveCache && Date.now() - _driveCache.at < DRIVE_CACHE_TTL;
    if (hasCache) { setFiles(_driveCache!.data); setLoading(false); }
    else { setLoading(true); }
    if (fresh) return;            // cache still fresh — no network needed
    setError('');
    api.get('/drive/files/ws')
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : [];
        _driveCache = { data, at: Date.now() };
        if (alive) setFiles(data);
      })
      .catch(e => { if (alive && !hasCache) setError(e.response?.data?.error || e.message || 'Failed to load files'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  const reload = () => {
    _driveCache = null;
    setLoading(true);
    setError('');
    api.get('/drive/files/ws')
      .then(res => { const data = Array.isArray(res.data) ? res.data : []; _driveCache = { data, at: Date.now() }; setFiles(data); })
      .catch(e => setError(e.response?.data?.error || e.message || 'Failed to load files'))
      .finally(() => setLoading(false));
  };

  const filtered = search.trim()
    ? files.filter(f =>
        (f.customerName || '').toLowerCase().includes(search.toLowerCase()) ||
        (f.fileName || '').toLowerCase().includes(search.toLowerCase()))
    : files;

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

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="rounded-2xl shadow-2xl border w-full max-w-3xl max-h-[80vh] flex flex-col"
        style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))' }}
        onClick={e => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b flex items-center gap-2 sm:gap-3" style={{ borderColor: 'hsl(var(--pt-border))' }}>
          <FolderOpen size={18} weight="fill" style={{ color: 'hsl(var(--pt-marigold-deep))' }} className="shrink-0" />
          <h2 className="pt-display text-sm font-semibold shrink-0 hidden sm:block" style={{ color: 'hsl(var(--pt-ink))' }}>Drive Files</h2>
          <div className="relative flex-1 min-w-0">
            <MagnifyingGlass size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 pt-muted pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by customer or file name…"
              className="w-full pl-8 pr-3 py-1.5 rounded-full text-xs outline-none border"
              style={{ background: 'hsl(var(--pt-secondary) / 0.6)', borderColor: 'hsl(var(--pt-border))', color: 'hsl(var(--pt-ink))' }}
              autoFocus
            />
          </div>
          <button onClick={reload} disabled={loading} className="pt-toolbtn shrink-0 disabled:opacity-50" title="Refresh files" aria-label="Refresh files">
            <ArrowsClockwise size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} className="pt-chip shrink-0">Close</button>
        </header>

        <div className="flex-1 overflow-y-auto p-3">
          {loading && <div className="text-center pt-muted py-12 text-sm">Loading…</div>}
          {error && <div className="text-center py-4 text-sm" style={{ color: 'hsl(0 65% 48%)' }}>{error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center pt-muted py-12 text-sm">
              {search ? 'No files match your search' : 'No Drive files yet — files received via WhatsApp appear here'}
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.slice(0, 60).map(f => (
                <button
                  key={f.id}
                  onClick={() => handlePick(f)}
                  disabled={pickingId !== null}
                  className="rounded-xl overflow-hidden border text-left transition-colors disabled:opacity-50 border-[hsl(var(--pt-border))] hover:border-[hsl(var(--pt-marigold-deep))]"
                  style={{ background: 'hsl(var(--pt-secondary) / 0.5)', ...(pickingId === f.id ? { borderColor: 'hsl(var(--pt-marigold))', boxShadow: '0 0 0 2px hsl(var(--pt-marigold) / 0.4)' } : {}) }}
                >
                  <div className="aspect-square flex items-center justify-center overflow-hidden" style={{ background: 'hsl(var(--pt-paper-deep))' }}>
                    <img
                      src={f.fileUrl}
                      alt={f.fileName}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  <div className="p-2">
                    <div className="text-xs truncate font-medium" style={{ color: 'hsl(var(--pt-ink))' }}>
                      {f.customerName || 'Unknown'}
                    </div>
                    <div className="text-[10px] pt-muted truncate mt-0.5">
                      {pickingId === f.id ? 'Loading…' : (f.tag || f.fileName)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {filtered.length > 60 && (
          <footer className="px-4 py-2 border-t text-[10px] pt-muted" style={{ borderColor: 'hsl(var(--pt-border))' }}>
            Showing 60 of {filtered.length} files. Refine search to find more.
          </footer>
        )}
      </div>
    </div>
  );
}
