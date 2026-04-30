import { FileX2 } from 'lucide-react';
import { FileCard } from './file-card';
import type { WhatsAppFile } from '../../types/whatsapp';

interface Props {
  files: WhatsAppFile[];
  newIds: Set<string>;
  viewMode: 'grid' | 'list';
  onPreview: (f: WhatsAppFile) => void;
  onDownload: (f: WhatsAppFile) => void;
  onPrint: (f: WhatsAppFile) => void;
  onDelete: (f: WhatsAppFile) => void;
}

export function FilesGrid({ files, newIds, viewMode, onPreview, onDownload, onPrint, onDelete }: Props) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center">
          <FileX2 className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <div>
          <p className="text-foreground font-medium">No files found</p>
          <p className="text-muted-foreground text-sm mt-1">Files received from WhatsApp will appear here</p>
        </div>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="flex flex-col gap-2">
        {files.map(f => (
          <div key={f.id} onClick={() => onPreview(f)}
            className="flex items-center gap-4 p-3 bg-card border border-border rounded-lg hover:border-accent/50 cursor-pointer transition-colors">
            <div className="w-10 h-10 rounded bg-secondary/50 shrink-0 overflow-hidden">
              <img src={f.fileUrl} alt={f.fileName} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{f.fileName}</p>
              <p className="text-xs text-muted-foreground">{f.customerName} · {f.customerId}</p>
            </div>
            <p className="text-xs text-muted-foreground/60 shrink-0">
              {new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {files.map(f => (
        <FileCard key={f.id} file={f} isNew={newIds.has(f.id)}
          onPreview={onPreview} onDownload={onDownload} onPrint={onPrint} onDelete={onDelete} />
      ))}
    </div>
  );
}
