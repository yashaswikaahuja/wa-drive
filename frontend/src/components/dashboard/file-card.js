import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Download, Printer, Trash2, MoreVertical, Image, Video, Music, FileText, File, Play } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { getPreviewUrl } from '../../utils/helpers';
const EXT_TYPE = (name) => {
    const e = name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'tiff', 'tif'].includes(e))
        return 'image';
    if (['mp4', '3gp', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v'].includes(e))
        return 'video';
    if (['mp3', 'ogg', 'wav', 'aac', 'm4a', 'flac', 'opus', 'wma', 'amr'].includes(e))
        return 'audio';
    if (e === 'pdf')
        return 'pdf';
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'odt', 'ods', 'odp'].includes(e))
        return 'document';
    return 'document';
};
const TYPE_ICON = {
    image: _jsx(Image, { className: "w-6 h-6" }), video: _jsx(Video, { className: "w-6 h-6" }),
    audio: _jsx(Music, { className: "w-6 h-6" }), pdf: _jsx(FileText, { className: "w-6 h-6" }), document: _jsx(File, { className: "w-6 h-6" }),
};
const TYPE_COLOR = {
    image: 'from-blue-500/20 to-cyan-500/20 text-cyan-400',
    video: 'from-purple-500/20 to-pink-500/20 text-purple-400',
    audio: 'from-orange-500/20 to-amber-500/20 text-orange-400',
    pdf: 'from-red-500/20 to-rose-500/20 text-red-400',
    document: 'from-slate-500/20 to-gray-500/20 text-slate-400',
};
export function FileCard({ file, isNew, selected, onToggleSelect, onPreview, onDownload, onPrint, onDelete }) {
    const type = EXT_TYPE(file.fileName);
    const thumb = getPreviewUrl(file.fileUrl);
    return (_jsxs("div", { onClick: () => onPreview(file), className: `group relative bg-card border rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-accent/5
        ${isNew ? 'border-accent/60 animate-[slideDown_0.3s_ease-out]' : selected ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-accent/50'}`, children: [onToggleSelect && (_jsx("div", { className: "absolute top-2 left-2 z-10", onClick: e => { e.stopPropagation(); onToggleSelect(file.id); }, children: _jsx("input", { type: "checkbox", checked: selected ?? false, onChange: () => { }, className: "w-4 h-4 accent-accent cursor-pointer" }) })), _jsxs("div", { className: "relative aspect-square bg-secondary/50 overflow-hidden", children: [type === 'image' ? (_jsx(_Fragment, { children: _jsx("img", { src: thumb, alt: file.fileName, className: "w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" }) })) : type === 'video' ? (_jsx("div", { className: `w-full h-full flex items-center justify-center bg-gradient-to-br ${TYPE_COLOR[type]}`, children: _jsx("div", { className: "w-14 h-14 rounded-full bg-black/40 flex items-center justify-center border border-white/20", children: _jsx(Play, { className: "w-6 h-6 text-white ml-0.5", fill: "white" }) }) })) : (_jsx("div", { className: `w-full h-full flex items-center justify-center bg-gradient-to-br ${TYPE_COLOR[type]}`, children: _jsx("div", { className: "w-14 h-14 rounded-xl bg-secondary/80 flex items-center justify-center", children: TYPE_ICON[type] }) })), _jsxs("div", { className: "absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2", children: [_jsx(Button, { variant: "secondary", size: "sm", className: "h-8 w-8 p-0 bg-white/10 hover:bg-white/20 border-white/20 backdrop-blur-sm", onClick: e => { e.stopPropagation(); onDownload(file); }, children: _jsx(Download, { className: "w-4 h-4 text-white" }) }), _jsx(Button, { variant: "secondary", size: "sm", className: "h-8 w-8 p-0 bg-white/10 hover:bg-white/20 border-white/20 backdrop-blur-sm", onClick: e => { e.stopPropagation(); onPrint(file); }, children: _jsx(Printer, { className: "w-4 h-4 text-white" }) })] }), _jsx("div", { className: "absolute top-2 left-2", children: _jsx("span", { className: "px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-black/60 backdrop-blur-sm rounded text-white/90 border border-white/10", children: type }) }), _jsx("div", { className: "absolute top-2 right-2", onClick: e => e.stopPropagation(), children: _jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "sm", className: "h-7 w-7 p-0 bg-black/40 hover:bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity", children: _jsx(MoreVertical, { className: "w-4 h-4 text-white" }) }) }), _jsxs(DropdownMenuContent, { align: "end", children: [_jsxs(DropdownMenuItem, { onClick: () => onPreview(file), children: [_jsx(Image, { className: "w-4 h-4 mr-2" }), "Preview"] }), _jsxs(DropdownMenuItem, { onClick: () => onDownload(file), children: [_jsx(Download, { className: "w-4 h-4 mr-2" }), "Download"] }), _jsxs(DropdownMenuItem, { onClick: () => onPrint(file), children: [_jsx(Printer, { className: "w-4 h-4 mr-2" }), "Print"] }), _jsx(DropdownMenuSeparator, {}), _jsxs(DropdownMenuItem, { onClick: () => onDelete(file), className: "text-destructive focus:text-destructive", children: [_jsx(Trash2, { className: "w-4 h-4 mr-2" }), "Delete"] })] })] }) })] }), _jsxs("div", { className: "p-3", children: [_jsx("p", { className: "text-sm font-medium text-foreground truncate mb-1", children: file.fileName }), _jsxs("div", { className: "flex items-center justify-between text-xs text-muted-foreground", children: [_jsx("span", { className: "truncate max-w-[70%]", children: file.customerName }), _jsx("span", { className: "shrink-0 text-muted-foreground/60", children: file.customerId?.slice(-6) })] }), _jsx("p", { className: "text-[11px] text-muted-foreground/60 mt-1", children: formatDistanceToNow(new Date(file.timestamp), { addSuffix: true }) })] })] }));
}
