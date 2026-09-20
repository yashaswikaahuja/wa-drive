/**
 * File Manager — Drive-style browser for all customer files (#317 / operator request).
 * Shows every provenance; filter by source / customer. Upload local → Save as manual-upload.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen, MagnifyingGlass, UploadSimple, ArrowsClockwise,
  DownloadSimple, Trash, File as FileIcon, Image as ImageIcon, FilePdf,
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

const SOURCE_FILTERS = [
  { id: 'all', label: 'All files' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'photo-editor', label: 'Photo Editor' },
  { id: 'pdf-editor', label: 'PDF Tool' },
  { id: 'manual-upload', label: 'Manual upload' },
  { id: 'generated', label: 'Generated' },
] as const;

function iconFor(f: DriveFile) {
  const n = (f.fileName || '').toLowerCase();
  const m = (f.mimeType || '').toLowerCase();
  if (m.includes('pdf') || n.endsWith('.pdf')) return FilePdf;
  if (m.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(n)) return ImageIcon;
  return FileIcon;
}

function sourceBadge(source?: string) {
  const s = source || 'whatsapp';
  const colors: Record<string, string> = {
    whatsapp: 'bg-emerald-500/15 text-emerald-300',
    'photo-editor': 'bg-orange-500/15 text-orange-300',
    'pdf-editor': 'bg-sky-500/15 text-sky-300',
    'manual-upload': 'bg-violet-500/15 text-violet-300',
    generated: 'bg-gray-500/20 text-gray-300',
  };
  return colors[s] || colors.generated;
}

export default function FileManager() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<string>('all');
  const [phone, setPhone] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (source !== 'all') params.source = source;
      const r = await api.get('/drive/files/ws', { params });
      setFiles(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || 'Failed to load files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((f) => {
      if (phone.trim() && !(f.customerId || '').includes(phone.trim())) return false;
      if (!q) return true;
      return (
        (f.fileName || '').toLowerCase().includes(q)
        || (f.customerName || '').toLowerCase().includes(q)
        || (f.customerId || '').toLowerCase().includes(q)
        || (f.tag || '').toLowerCase().includes(q)
      );
    });
  }, [files, search, phone]);

  const byCustomer = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; items: DriveFile[] }>();
    for (const f of filtered) {
      const key = f.customerId || 'unknown';
      if (!map.has(key)) map.set(key, { name: f.customerName || key, phone: key, items: [] });
      map.get(key)!.items.push(f);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const download = async (f: DriveFile) => {
    try {
      const blob = await getCachedBlob(f.id, async () => {
        const res = await api.get(`/drive/download/${f.id}`, { responseType: 'blob' });
        return new Blob([res.data], { type: String(res.headers['content-type'] ?? 'application/octet-stream') });
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = f.fileName || 'file';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e: any) {
      toast.error(e.message || 'Download failed');
    }
  };

  const remove = async (f: DriveFile) => {
    if (!confirm(`Delete ${f.fileName}?`)) return;
    try {
      await api.delete(`/drive/files/${f.id}`);
      setFiles((prev) => prev.filter((x) => x.id !== f.id));
      toast.success('Deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  const uploadLocal = async (list: FileList | null) => {
    if (!list?.length) return;
    if (!phone.trim()) {
      toast.error('Enter customer phone before uploading');
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('phone', phone.trim());
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

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FolderOpen size={22} weight="fill" className="text-[hsl(27_95%_55%)]" />
            File Manager
          </h1>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            All customer files on Drive — WhatsApp, Photo Editor, PDF Tool, and manual uploads.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-xs flex items-center gap-1.5" onClick={load} disabled={loading}>
            <ArrowsClockwise size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            className="btn-primary text-xs flex items-center gap-1.5"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <UploadSimple size={14} /> Upload local
          </button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => uploadLocal(e.target.files)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {SOURCE_FILTERS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSource(s.id)}
            className="rounded-full px-3 py-1.5 text-xs border"
            style={{
              borderColor: source === s.id ? 'hsl(27 95% 55%)' : 'var(--border)',
              background: source === s.id ? 'hsl(27 95% 55% / 0.15)' : 'transparent',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input-field text-sm w-full pl-8"
            placeholder="Search name, file, tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <input
          className="input-field text-sm w-44"
          placeholder="Customer phone (for upload)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
        {loading && <p className="text-sm text-[var(--muted-foreground)] animate-pulse">Loading files…</p>}
        {!loading && byCustomer.length === 0 && (
          <div className="card p-8 text-center text-sm text-[var(--muted-foreground)]">
            No files yet. Upload from local or receive via WhatsApp.
          </div>
        )}
        {byCustomer.map((group) => (
          <section key={group.phone} className="card overflow-hidden">
            <header className="px-3 py-2 border-b flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{group.name}</p>
                <p className="text-[11px] text-[var(--muted-foreground)]">{group.phone}</p>
              </div>
              <span className="text-[11px] text-[var(--muted-foreground)]">{group.items.length} file(s)</span>
            </header>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {group.items.map((f) => {
                const Icon = iconFor(f);
                return (
                  <li key={f.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--card-hover)]">
                    {f.fileUrl && /\.(jpe?g|png|webp|gif)$/i.test(f.fileName || '') ? (
                      <img src={f.fileUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0 bg-black/20" />
                    ) : (
                      <span className="w-10 h-10 rounded grid place-items-center bg-black/20 shrink-0">
                        <Icon size={18} />
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{f.fileName}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${sourceBadge(f.source)}`}>
                          {f.source || 'whatsapp'}
                        </span>
                        {f.tag && <span className="text-[10px] text-[var(--muted-foreground)]">{f.tag}</span>}
                        {f.timestamp && (
                          <span className="text-[10px] text-[var(--muted-foreground)]">
                            {new Date(f.timestamp).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <button type="button" className="p-1.5 rounded hover:bg-white/5" title="Download" onClick={() => download(f)}>
                      <DownloadSimple size={16} />
                    </button>
                    <button type="button" className="p-1.5 rounded hover:bg-red-500/10 text-red-400" title="Delete" onClick={() => remove(f)}>
                      <Trash size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
