/**
 * Drive picker — operator picks an existing customer file from Drive
 * without re-uploading. Pulls workspace-scoped files via the hub.
 *
 * SERVER NEVER SEES PIXELS — see /ARCHITECTURE.md §3.1.
 * The bytes flow Drive → hub (streaming proxy) → browser. No transformation.
 */

import { useEffect, useState } from 'react';
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
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'image/jpeg' });
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
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-lg shadow-2xl border border-gray-800 w-full max-w-3xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
          <span className="text-lg">📁</span>
          <h2 className="text-sm font-semibold text-gray-200">Drive Files</h2>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by customer or file name…"
            className="flex-1 px-3 py-1.5 bg-gray-800 text-gray-200 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3">
          {loading && <div className="text-center text-gray-500 py-12 text-sm">Loading…</div>}
          {error && <div className="text-center text-red-400 py-4 text-sm">{error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center text-gray-500 py-12 text-sm">
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
                  className={`bg-gray-800 hover:bg-gray-700 rounded overflow-hidden border border-gray-700 hover:border-blue-500 transition-colors text-left disabled:opacity-50 ${
                    pickingId === f.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                >
                  <div className="aspect-square bg-gray-950 flex items-center justify-center overflow-hidden">
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
                    <div className="text-xs text-gray-200 truncate font-medium">
                      {f.customerName || 'Unknown'}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate mt-0.5">
                      {pickingId === f.id ? 'Loading…' : (f.tag || f.fileName)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {filtered.length > 60 && (
          <footer className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-500">
            Showing 60 of {filtered.length} files. Refine search to find more.
          </footer>
        )}
      </div>
    </div>
  );
}
