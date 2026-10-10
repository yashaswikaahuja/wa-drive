import { CaretLeft, CaretRight, Camera, FileImage, FilePdf, Printer, Trash, X } from '@phosphor-icons/react';

export type MediaViewerItem = {
  id?: string;
  fileName?: string;
  fileUrl?: string;
};

type MediaViewerProps = {
  item: MediaViewerItem | null;
  onClose: () => void;
  onPrint?: () => void;
  onOpenInPhotoTool?: () => void;
  onDelete?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  showDelete?: boolean;
  showNavigator?: boolean;
};

function isImageName(fileName?: string) {
  const ext = fileName?.split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
}

function isVideoName(fileName?: string) {
  const ext = fileName?.split('.').pop()?.toLowerCase() || '';
  return ['mp4', '3gp', 'mov', 'avi', 'webm'].includes(ext);
}

function isPdfName(fileName?: string) {
  return (fileName || '').toLowerCase().endsWith('.pdf');
}

export default function MediaViewer({
  item,
  onClose,
  onPrint,
  onOpenInPhotoTool,
  onDelete,
  onPrev,
  onNext,
  showDelete = false,
  showNavigator = false,
}: MediaViewerProps) {
  if (!item) return null;

  const ext = item.fileName?.split('.').pop()?.toLowerCase() || '';
  const driveId = item.fileUrl?.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || '';
  const thumbUrl = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200` : item.fileUrl || '';
  const previewUrl = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : item.fileUrl || '';
  const isImage = isImageName(item.fileName);
  const isVideo = isVideoName(item.fileName);
  const isPdf = isPdfName(item.fileName);

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col" onClick={onClose} role="dialog" aria-modal="true">
      <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 bg-black/30 backdrop-blur-sm">
        <span className="text-white/90 text-sm font-medium truncate flex-1 min-w-0">{item.fileName || 'Document'}</span>
        {onPrint && (
          <button
            type="button"
            onClick={onPrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white shrink-0"
            style={{ background: 'linear-gradient(180deg, hsl(27 95% 58%), hsl(22 92% 50%))' }}
            title="Print"
          >
            <Printer size={15} weight="bold" />
            <span className="hidden sm:inline">Print</span>
          </button>
        )}
        {onOpenInPhotoTool && (
          <button
            type="button"
            onClick={onOpenInPhotoTool}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white shrink-0"
            style={{ background: 'linear-gradient(180deg, hsl(210 90% 56%), hsl(220 85% 48%))' }}
            title="Open in Photo Tool"
          >
            <Camera size={15} weight="bold" />
            <span className="hidden sm:inline">Photo Tool</span>
          </button>
        )}
        {showDelete && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white shrink-0 bg-red-500/80 hover:bg-red-500"
            title="Delete"
          >
            <Trash size={15} weight="bold" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-white/10 hover:bg-white/20 shrink-0"
          title="Close"
        >
          <X size={15} weight="bold" />
          <span className="hidden sm:inline">Close</span>
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {showNavigator && onPrev && (
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 text-black flex items-center justify-center shadow-lg"
            aria-label="Previous media"
          >
            <CaretLeft size={22} weight="bold" />
          </button>
        )}
        {showNavigator && onNext && (
          <button
            type="button"
            onClick={onNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 text-black flex items-center justify-center shadow-lg"
            aria-label="Next media"
          >
            <CaretRight size={22} weight="bold" />
          </button>
        )}

        <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
          <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center w-full h-full">
            {isImage ? (
              <img src={thumbUrl} alt={item.fileName} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
            ) : isVideo ? (
              previewUrl ? (
                <iframe src={previewUrl} className="w-[92vw] max-w-3xl h-[72vh] rounded-lg border-0 bg-black" title={item.fileName} />
              ) : null
            ) : isPdf ? (
              previewUrl ? (
                <iframe src={previewUrl} className="w-[92vw] max-w-4xl h-[82vh] rounded-lg border-0 bg-white" title={item.fileName} />
              ) : null
            ) : (
              <div className="bg-white/10 rounded-xl p-8 text-center max-w-md">
                <div className="flex justify-center mb-3 text-4xl text-white/80">
                  {isPdf ? <FilePdf size={48} weight="fill" /> : isImage ? <FileImage size={48} weight="fill" /> : <FileImage size={48} weight="fill" />}
                </div>
                <p className="text-white text-sm font-medium break-all">{item.fileName || 'Unsupported file'}</p>
                <p className="text-gray-400 text-xs mt-2">{ext ? ext.toUpperCase() : 'FILE'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
