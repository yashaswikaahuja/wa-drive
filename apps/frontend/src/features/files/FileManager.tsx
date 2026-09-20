/**
 * File Manager — Explorer-style: folders (customers) → icon grid → click/double-click to open.
 * No per-row Download/Delete buttons; actions via open preview + right-click menu.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen, Folder, MagnifyingGlass, UploadSimple, ArrowsClockwise,
  File as FileIcon, Image as ImageIcon, FilePdf, CaretRight, X,
  SquaresFour, ListBullets, DownloadSimple, Trash, Camera,
} from '@phosphor-icons/react';
import api from '../../shared/api';
import { toast } from '../../shared/toast';
import { getCachedBlob } from '../../shared/fileCache';

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
function FileGlyph({ f, size = 36 }: { f: DriveFile; size?: number }) {
  if (isPdf(f)) return <FilePdf size={size} className="text-red-400" weight="fill" />;
  if (isImage(f)) return <ImageIcon size={size} className="text-sky-400" weight="fill" />;
  return <FileIcon size={size} className="text-gray-400" weight="fill" />;
}

export default function FileManager() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [folderPhone, setFolderPhone] = useState<string | null>(null); // null = root (all customers)
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: DriveFile; url: string; kind: 'image' | 'pdf' | 'other' } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; file: DriveFile } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/drive/files/ws'); // all sources — File Manager
      setFiles(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || 'Failed to load files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Close context menu on outside click / Escape
  useEffect(() => {
    const close = () => setCtx(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setCtx(null); setPreview((p) => { if (p) URL.revokeObjectURL(p.url); return null; }); }
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey); };
  }, []);

  const folders: FolderRow[] = useMemo(() => {
    const map = new Map<string, FolderRow>();
    for (const f of files) {
      const phone = f.customerId || 'unknown';
      const cur = map.get(phone);
      if (cur) cur.count += 1;
      else map.set(phone, { phone, name: f.customerName || phone, count: 1 });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [files]);

  const visibleFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((f) => {
      if (folderPhone && (f.customerId || 'unknown') !== folderPhone) return false;
      if (!q) return true;
      return (
        (f.fileName || '').toLowerCase().includes(q)
        || (f.customerName || '').toLowerCase().includes(q)
        || (f.customerId || '').toLowerCase().includes(q)
        || (f.tag || '').toLowerCase().includes(q)
      );
    }).sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  }, [files, folderPhone, search]);

  const activeFolder = folderPhone ? folders.find((f) => f.phone === folderPhone) : null;

  const fetchBlob = async (f: DriveFile) => {
    return getCachedBlob(f.id, async () => {
      const res = await api.get(`/drive/download/${f.id}`, { responseType: 'blob' });
      return new Blob([res.data], { type: String(res.headers['content-type'] ?? 'application/octet-stream') });
    });
  };

  const openFile = async (f: DriveFile) => {
    setCtx(null);
    setSelectedId(f.id);
    try {
      const blob = await fetchBlob(f);
      const url = URL.createObjectURL(blob);
      if (preview) URL.revokeObjectURL(preview.url);
      if (isImage(f)) setPreview({ file: f, url, kind: 'image' });
      else if (isPdf(f)) setPreview({ file: f, url, kind: 'pdf' });
      else {
        // Other types: open in new tab
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e: any) {
      toast.error(e.message || 'Could not open file');
    }
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
    if (!confirm(`Move "${f.fileName}" to trash?`)) return;
    try {
      await api.delete(`/drive/files/${f.id}`);
      setFiles((prev) => prev.filter((x) => x.id !== f.id));
      if (selectedId === f.id) setSelectedId(null);
      if (preview?.file.id === f.id) {
        URL.revokeObjectURL(preview.url);
        setPreview(null);
      }
      toast.success('Deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  const uploadLocal = async (list: FileList | null) => {
    if (!list?.length) return;
    const phone = folderPhone;
    if (!phone || phone === 'unknown') {
      toast.error('Open a customer folder first, then upload');
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('phone', phone);
        fd.append('source', 'manual-upload');
        await api.post('/customers/upload', fd);
      }
      toast.success(`Uploaded ${list.length} file(s)`);
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
    setCtx({ x: e.clientX, y: e.clientY, file: f });
  };

  return (
    <div ref={rootRef} className="h-full md:h-[calc(100vh-4rem)] flex flex-col min-h-0" style={{ background: 'hsl(var(--pt-bg, var(--background)))' }}>
      {/* Toolbar */}
      <div className="shrink-0 border-b px-3 py-2 flex flex-wrap items-center gap-2" style={{ borderColor: 'var(--border)', background: 'hsl(var(--pt-card, var(--card)))' }}>
        <FolderOpen size={18} weight="fill" className="text-[hsl(27_95%_55%)]" />
        <span className="text-sm font-semibold mr-2">File Manager</span>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] min-w-0 flex-1">
          <button type="button" className="hover:text-[hsl(27_95%_55%)] truncate" onClick={() => { setFolderPhone(null); setSelectedId(null); }}>
            Customers
          </button>
          {activeFolder && (
            <>
              <CaretRight size={12} />
              <span className="text-[var(--foreground)] truncate font-medium">{activeFolder.name}</span>
            </>
          )}
        </nav>

        <div className="relative w-44 sm:w-56">
          <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input-field text-xs w-full pl-7 py-1.5"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <button type="button" className={`p-1.5 ${view === 'grid' ? 'bg-[hsl(27_95%_55%/0.2)]' : ''}`} title="Grid" onClick={() => setView('grid')}>
            <SquaresFour size={15} />
          </button>
          <button type="button" className={`p-1.5 ${view === 'list' ? 'bg-[hsl(27_95%_55%/0.2)]' : ''}`} title="List" onClick={() => setView('list')}>
            <ListBullets size={15} />
          </button>
        </div>
        <button type="button" className="btn-secondary text-xs py-1.5 px-2" onClick={load} disabled={loading}>
          <ArrowsClockwise size={13} className={`inline ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          className="btn-primary text-xs py-1.5 px-2.5 flex items-center gap-1"
          disabled={uploading || !folderPhone}
          title={!folderPhone ? 'Open a customer folder to upload' : 'Upload from this PC'}
          onClick={() => fileRef.current?.click()}
        >
          <UploadSimple size={13} /> Upload
        </button>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => uploadLocal(e.target.files)} />
      </div>

      {/* Body: sidebar + content */}
      <div className="flex-1 min-h-0 flex">
        {/* Folder tree */}
        <aside className="w-52 shrink-0 border-r overflow-y-auto hidden sm:block" style={{ borderColor: 'var(--border)', background: 'hsl(var(--pt-card, var(--card)) / 0.5)' }}>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 px-3 pt-3 pb-1">Folders</p>
          <button
            type="button"
            onClick={() => { setFolderPhone(null); setSelectedId(null); }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs ${!folderPhone ? 'bg-[hsl(27_95%_55%/0.15)] text-[hsl(27_95%_55%)]' : 'hover:bg-white/5'}`}
          >
            <FolderOpen size={16} weight={!folderPhone ? 'fill' : 'regular'} />
            <span className="truncate flex-1">All customers</span>
            <span className="text-[10px] opacity-60">{files.length}</span>
          </button>
          {folders.map((fol) => (
            <button
              key={fol.phone}
              type="button"
              onClick={() => { setFolderPhone(fol.phone); setSelectedId(null); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs ${folderPhone === fol.phone ? 'bg-[hsl(27_95%_55%/0.15)] text-[hsl(27_95%_55%)]' : 'hover:bg-white/5'}`}
            >
              <Folder size={16} weight={folderPhone === fol.phone ? 'fill' : 'regular'} />
              <span className="truncate flex-1">{fol.name}</span>
              <span className="text-[10px] opacity-60">{fol.count}</span>
            </button>
          ))}
        </aside>

        {/* Files pane */}
        <main className="flex-1 min-w-0 overflow-y-auto p-3" onClick={() => setSelectedId(null)}>
          {/* Mobile folder chips */}
          <div className="flex gap-1.5 overflow-x-auto mb-3 sm:hidden">
            <button type="button" className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${!folderPhone ? 'border-[hsl(27_95%_55%)]' : ''}`} style={{ borderColor: 'var(--border)' }} onClick={() => setFolderPhone(null)}>All</button>
            {folders.slice(0, 20).map((fol) => (
              <button key={fol.phone} type="button" className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border max-w-[140px] truncate ${folderPhone === fol.phone ? 'border-[hsl(27_95%_55%)]' : ''}`} style={{ borderColor: 'var(--border)' }} onClick={() => setFolderPhone(fol.phone)}>{fol.name}</button>
            ))}
          </div>

          {loading && <p className="text-sm text-[var(--muted-foreground)] animate-pulse p-6">Loading…</p>}

          {!loading && !folderPhone && !search && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {folders.map((fol) => (
                <button
                  key={fol.phone}
                  type="button"
                  onDoubleClick={() => setFolderPhone(fol.phone)}
                  onClick={(e) => { e.stopPropagation(); setFolderPhone(fol.phone); }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-[var(--border)] text-center"
                >
                  <Folder size={48} weight="fill" className="text-amber-400/90" />
                  <span className="text-xs font-medium truncate w-full">{fol.name}</span>
                  <span className="text-[10px] text-[var(--muted-foreground)]">{fol.count} items · {fol.phone}</span>
                </button>
              ))}
              {folders.length === 0 && (
                <p className="col-span-full text-sm text-[var(--muted-foreground)] text-center py-16">
                  No customer folders yet. Files from WhatsApp will appear here.
                </p>
              )}
            </div>
          )}

          {!loading && (folderPhone || search) && view === 'grid' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {visibleFiles.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedId(f.id); openFile(f); }}
                  onContextMenu={(e) => onContextMenu(e, f)}
                  className={`flex flex-col items-stretch rounded-xl border p-2 text-left transition ${selectedId === f.id ? 'border-[hsl(27_95%_55%)] bg-[hsl(27_95%_55%/0.12)]' : 'border-transparent hover:bg-white/5 hover:border-[var(--border)]'}`}
                  title="Click to open · Right-click for more"
                >
                  <div className="aspect-square rounded-lg bg-black/25 flex items-center justify-center overflow-hidden mb-2">
                    {isImage(f) && f.fileUrl ? (
                      <img src={f.fileUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <FileGlyph f={f} size={40} />
                    )}
                  </div>
                  <span className="text-[11px] font-medium truncate">{f.fileName}</span>
                  <span className="text-[10px] text-[var(--muted-foreground)] truncate">
                    {f.source || 'whatsapp'}{f.timestamp ? ` · ${new Date(f.timestamp).toLocaleDateString()}` : ''}
                  </span>
                </button>
              ))}
              {visibleFiles.length === 0 && (
                <p className="col-span-full text-sm text-[var(--muted-foreground)] text-center py-16">This folder is empty.</p>
              )}
            </div>
          )}

          {!loading && (folderPhone || search) && view === 'list' && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="grid grid-cols-[1fr_100px_110px_90px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 border-b" style={{ borderColor: 'var(--border)' }}>
                <span>Name</span><span>Source</span><span>Date</span><span>Type</span>
              </div>
              {visibleFiles.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedId(f.id); openFile(f); }}
                  onContextMenu={(e) => onContextMenu(e, f)}
                  className={`w-full grid grid-cols-[1fr_100px_110px_90px] gap-2 px-3 py-2 text-left text-xs items-center border-b last:border-0 ${selectedId === f.id ? 'bg-[hsl(27_95%_55%/0.12)]' : 'hover:bg-white/5'}`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {isImage(f) && f.fileUrl ? (
                      <img src={f.fileUrl} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                    ) : (
                      <FileGlyph f={f} size={20} />
                    )}
                    <span className="truncate">{f.fileName}</span>
                  </span>
                  <span className="truncate text-[var(--muted-foreground)]">{f.source || 'whatsapp'}</span>
                  <span className="text-[var(--muted-foreground)]">{f.timestamp ? new Date(f.timestamp).toLocaleDateString() : '—'}</span>
                  <span className="text-[var(--muted-foreground)]">{isPdf(f) ? 'PDF' : isImage(f) ? 'Image' : 'File'}</span>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Status bar */}
      <div className="shrink-0 border-t px-3 py-1 text-[10px] text-[var(--muted-foreground)] flex justify-between" style={{ borderColor: 'var(--border)' }}>
        <span>
          {folderPhone
            ? `${visibleFiles.length} item(s)`
            : `${folders.length} folder(s) · ${files.length} file(s)`}
          {selectedId ? ' · 1 selected' : ''}
        </span>
        <span>Click a file to open · Right-click for Download / Delete</span>
      </div>

      {/* Context menu */}
      {ctx && (
        <div
          className="fixed z-[80] min-w-[160px] rounded-lg border shadow-xl py-1 text-xs"
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
                window.location.href = `/app/photos/portal?fileId=${encodeURIComponent(ctx.file.id)}&phone=${encodeURIComponent(ctx.file.customerId || '')}&name=${encodeURIComponent(ctx.file.customerName || '')}`;
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

      {/* Preview / open pane */}
      {preview && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex flex-col" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}>
          <div className="flex items-center gap-2 px-4 py-2 bg-black/50 text-white shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="text-sm font-medium truncate flex-1">{preview.file.fileName}</span>
            <button type="button" className="text-xs px-2 py-1 rounded hover:bg-white/10" onClick={() => downloadFile(preview.file)}>Download</button>
            <button type="button" className="p-1.5 rounded hover:bg-white/10" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}>
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            {preview.kind === 'image' && (
              <img src={preview.url} alt={preview.file.fileName} className="max-w-full max-h-full object-contain rounded shadow-2xl" />
            )}
            {preview.kind === 'pdf' && (
              <iframe title={preview.file.fileName} src={preview.url} className="w-full h-full max-w-5xl rounded bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
