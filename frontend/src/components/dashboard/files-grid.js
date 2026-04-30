import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { FileX2 } from 'lucide-react';
import { FileCard } from './file-card';
export function FilesGrid({ files, newIds, viewMode, onPreview, onDownload, onPrint, onDelete }) {
    if (files.length === 0) {
        return (_jsxs("div", { className: "flex flex-col items-center justify-center min-h-[400px] gap-4 text-center", children: [_jsx("div", { className: "w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center", children: _jsx(FileX2, { className: "w-8 h-8 text-muted-foreground/40" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-foreground font-medium", children: "No files found" }), _jsx("p", { className: "text-muted-foreground text-sm mt-1", children: "Files received from WhatsApp will appear here" })] })] }));
    }
    if (viewMode === 'list') {
        return (_jsx("div", { className: "flex flex-col gap-2", children: files.map(f => (_jsxs("div", { onClick: () => onPreview(f), className: "flex items-center gap-4 p-3 bg-card border border-border rounded-lg hover:border-accent/50 cursor-pointer transition-colors", children: [_jsx("div", { className: "w-10 h-10 rounded bg-secondary/50 shrink-0 overflow-hidden", children: _jsx("img", { src: f.fileUrl, alt: f.fileName, className: "w-full h-full object-cover", onError: e => { e.target.style.display = 'none'; } }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-medium text-foreground truncate", children: f.fileName }), _jsxs("p", { className: "text-xs text-muted-foreground", children: [f.customerName, " \u00B7 ", f.customerId] })] }), _jsx("p", { className: "text-xs text-muted-foreground/60 shrink-0", children: new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })] }, f.id))) }));
    }
    return (_jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4", children: files.map(f => (_jsx(FileCard, { file: f, isNew: newIds.has(f.id), onPreview: onPreview, onDownload: onDownload, onPrint: onPrint, onDelete: onDelete }, f.id))) }));
}
