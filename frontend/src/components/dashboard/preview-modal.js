import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useCallback } from 'react';
import { Download, Printer, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { getPreviewUrl } from '../../utils/helpers';
const EXT_TYPE = (name) => {
    const e = name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(e))
        return 'image';
    if (['mp4', '3gp', 'mov', 'avi'].includes(e))
        return 'video';
    if (['mp3', 'ogg', 'wav', 'aac'].includes(e))
        return 'audio';
    if (e === 'pdf')
        return 'pdf';
    return 'other';
};
function getDriveId(url) {
    const m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return m?.[1] ?? null;
}
export function PreviewModal({ file, isOpen, onClose, onDownload, onPrint, onPrevious, onNext, hasPrevious, hasNext }) {
    const handleKey = useCallback((e) => {
        if (!isOpen)
            return;
        if (e.key === 'ArrowLeft' && hasPrevious)
            onPrevious?.();
        if (e.key === 'ArrowRight' && hasNext)
            onNext?.();
        if (e.key === 'Escape')
            onClose();
    }, [isOpen, hasPrevious, hasNext, onPrevious, onNext, onClose]);
    useEffect(() => {
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [handleKey]);
    if (!file)
        return null;
    const type = EXT_TYPE(file.fileName);
    const previewUrl = getPreviewUrl(file.fileUrl);
    const driveId = getDriveId(file.fileUrl);
    const renderContent = () => {
        if (type === 'image')
            return (_jsx("div", { className: "flex items-center justify-center bg-black/20 rounded-lg overflow-hidden min-h-[300px]", children: _jsx("img", { src: previewUrl, alt: file.fileName, className: "max-w-full max-h-[60vh] object-contain rounded" }) }));
        if (type === 'video') {
            const src = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : previewUrl;
            return driveId ? (_jsx("iframe", { src: src, className: "w-full aspect-video rounded-lg border-0", allow: "autoplay" })) : (_jsx("video", { src: src, controls: true, autoPlay: true, className: "w-full aspect-video rounded-lg bg-black" }));
        }
        if (type === 'audio') {
            const src = driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : previewUrl;
            return (_jsxs("div", { className: "w-full p-8 bg-secondary/50 rounded-lg flex flex-col items-center gap-6", children: [_jsx("div", { className: "w-20 h-20 rounded-full bg-gradient-to-br from-orange-500/30 to-amber-500/30 flex items-center justify-center", children: _jsx("div", { className: "w-12 h-12 rounded-full bg-orange-500/50 animate-pulse" }) }), _jsx("audio", { src: src, controls: true, className: "w-full max-w-md" })] }));
        }
        if (type === 'pdf') {
            const src = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : previewUrl;
            return (_jsx("iframe", { src: src, className: "w-full h-[60vh] rounded-lg border border-border", title: file.fileName, onError: () => { } }));
        }
        return (_jsxs("div", { className: "flex flex-col items-center justify-center min-h-[200px] gap-4 bg-secondary/50 rounded-lg p-8", children: [_jsx("p", { className: "text-muted-foreground text-sm", children: "Preview not available" }), _jsxs(Button, { variant: "outline", onClick: () => onDownload(file), className: "gap-2", children: [_jsx(Download, { className: "w-4 h-4" }), "Download to view"] })] }));
    };
    return (_jsx(Dialog, { open: isOpen, onOpenChange: onClose, children: _jsxs(DialogContent, { showCloseButton: false, className: "max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden rounded-xl p-0", children: [_jsxs("div", { className: "flex items-center justify-between gap-4 p-4 border-b border-border", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-base font-medium text-foreground truncate", children: file.fileName }), _jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground mt-0.5", children: [_jsx("span", { children: file.customerName }), _jsx("span", { children: "\u00B7" }), _jsx("span", { children: file.customerId }), _jsx("span", { children: "\u00B7" }), _jsx("span", { children: formatDistanceToNow(new Date(file.timestamp), { addSuffix: true }) })] })] }), _jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [_jsx(Badge, { variant: "outline", className: "text-[10px] uppercase tracking-wider bg-secondary/50 border-border", children: type }), _jsx(Button, { variant: "ghost", size: "sm", onClick: onClose, className: "h-8 w-8 p-0 text-muted-foreground hover:text-foreground", children: _jsx(X, { className: "w-4 h-4" }) })] })] }), _jsxs("div", { className: "relative p-4", children: [renderContent(), hasPrevious && (_jsx(Button, { variant: "ghost", size: "icon", onClick: onPrevious, className: "absolute left-6 top-1/2 -translate-y-1/2 h-10 w-10 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full", children: _jsx(ChevronLeft, { className: "w-5 h-5 text-white" }) })), hasNext && (_jsx(Button, { variant: "ghost", size: "icon", onClick: onNext, className: "absolute right-6 top-1/2 -translate-y-1/2 h-10 w-10 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full", children: _jsx(ChevronRight, { className: "w-5 h-5 text-white" }) }))] }), _jsxs("div", { className: "flex items-center justify-between p-4 border-t border-border bg-secondary/30", children: [_jsxs(Button, { variant: "ghost", size: "sm", onClick: onClose, className: "gap-2 text-muted-foreground hover:text-foreground", children: [_jsx(X, { className: "w-4 h-4" }), "Close"] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs(Button, { variant: "outline", size: "sm", onClick: () => onPrint(file), className: "gap-2 bg-secondary/50 border-border", children: [_jsx(Printer, { className: "w-4 h-4" }), "Print"] }), _jsxs(Button, { size: "sm", onClick: () => onDownload(file), className: "gap-2 bg-accent hover:bg-accent/90 text-accent-foreground", children: [_jsx(Download, { className: "w-4 h-4" }), "Download"] })] })] })] }) }));
}
