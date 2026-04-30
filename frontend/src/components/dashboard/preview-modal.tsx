import { useEffect, useCallback } from 'react';
import { Download, Printer, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { WhatsAppFile } from '../../types/whatsapp';
import { getPreviewUrl } from '../../utils/helpers';

const EXT_TYPE = (name: string) => {
  const e = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg','jpeg','png','gif','webp','bmp'].includes(e)) return 'image';
  if (['mp4','3gp','mov','avi'].includes(e)) return 'video';
  if (['mp3','ogg','wav','aac'].includes(e)) return 'audio';
  if (e === 'pdf') return 'pdf';
  return 'other';
};

function getDriveId(url: string) {
  const m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m?.[1] ?? null;
}

interface Props {
  file: WhatsAppFile | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (f: WhatsAppFile) => void;
  onPrint: (f: WhatsAppFile) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

export function PreviewModal({ file, isOpen, onClose, onDownload, onPrint, onPrevious, onNext, hasPrevious, hasNext }: Props) {
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowLeft' && hasPrevious) onPrevious?.();
    if (e.key === 'ArrowRight' && hasNext) onNext?.();
    if (e.key === 'Escape') onClose();
  }, [isOpen, hasPrevious, hasNext, onPrevious, onNext, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (!file) return null;

  const type = EXT_TYPE(file.fileName);
  const previewUrl = getPreviewUrl(file.fileUrl);
  const driveId = getDriveId(file.fileUrl);

  const renderContent = () => {
    if (type === 'image') return (
      <div className="flex items-center justify-center bg-black/20 rounded-lg overflow-hidden min-h-[300px]">
        <img src={previewUrl} alt={file.fileName} className="max-w-full max-h-[60vh] object-contain rounded" />
      </div>
    );

    if (type === 'video') {
      const src = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : previewUrl;
      return driveId ? (
        <iframe src={src} className="w-full aspect-video rounded-lg border-0" 
          allow="autoplay; fullscreen" allowFullScreen 
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms" />
      ) : (
        <video src={src} controls autoPlay className="w-full aspect-video rounded-lg bg-black" />
      );
    }

    if (type === 'audio') {
      const src = driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : previewUrl;
      return (
        <div className="w-full p-8 bg-secondary/50 rounded-lg flex flex-col items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500/30 to-amber-500/30 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-orange-500/50 animate-pulse" />
          </div>
          <audio src={src} controls className="w-full max-w-md" />
        </div>
      );
    }

    if (type === 'pdf') {
      const src = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : previewUrl;
      return (
        <iframe src={src} className="w-full h-[60vh] rounded-lg border border-border"
          title={file.fileName} onError={() => {}} />
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 bg-secondary/50 rounded-lg p-8">
        <p className="text-muted-foreground text-sm">Preview not available</p>
        <Button variant="outline" onClick={() => onDownload(file)} className="gap-2">
          <Download className="w-4 h-4" />Download to view
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent showCloseButton={false} className="max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden rounded-xl p-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium text-foreground truncate">{file.fileName}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{file.customerName}</span>
              <span>·</span>
              <span>{file.customerId}</span>
              <span>·</span>
              <span>{formatDistanceToNow(new Date(file.timestamp), { addSuffix: true })}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-secondary/50 border-border">{type}</Badge>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="relative p-4">
          {renderContent()}
          {hasPrevious && (
            <Button variant="ghost" size="icon" onClick={onPrevious}
              className="absolute left-6 top-1/2 -translate-y-1/2 h-10 w-10 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full">
              <ChevronLeft className="w-5 h-5 text-white" />
            </Button>
          )}
          {hasNext && (
            <Button variant="ghost" size="icon" onClick={onNext}
              className="absolute right-6 top-1/2 -translate-y-1/2 h-10 w-10 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full">
              <ChevronRight className="w-5 h-5 text-white" />
            </Button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-secondary/30">
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-2 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />Close
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onPrint(file)} className="gap-2 bg-secondary/50 border-border">
              <Printer className="w-4 h-4" />Print
            </Button>
            <Button size="sm" onClick={() => onDownload(file)} className="gap-2 bg-accent hover:bg-accent/90 text-accent-foreground">
              <Download className="w-4 h-4" />Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
