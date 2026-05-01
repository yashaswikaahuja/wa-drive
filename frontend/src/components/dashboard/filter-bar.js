import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '../ui/button';
import { Image, Video, Music, FileText, Layers, File } from 'lucide-react';
const filters = [
    { type: 'all', label: 'All', icon: _jsx(Layers, { className: "w-4 h-4" }) },
    { type: 'image', label: 'Images', icon: _jsx(Image, { className: "w-4 h-4" }) },
    { type: 'video', label: 'Videos', icon: _jsx(Video, { className: "w-4 h-4" }) },
    { type: 'audio', label: 'Audio', icon: _jsx(Music, { className: "w-4 h-4" }) },
    { type: 'pdf', label: 'PDFs', icon: _jsx(FileText, { className: "w-4 h-4" }) },
    { type: 'document', label: 'Documents', icon: _jsx(File, { className: "w-4 h-4" }) },
];
export function FilterBar({ activeFilter, onFilterChange, counts }) {
    return (_jsx("div", { className: "flex items-center gap-2 overflow-x-auto pb-1", children: filters.map(f => (_jsxs(Button, { variant: "ghost", size: "sm", onClick: () => onFilterChange(f.type), className: `h-8 gap-2 shrink-0 ${activeFilter === f.type ? 'bg-accent/20 text-accent hover:bg-accent/30 hover:text-accent' : 'text-muted-foreground hover:text-foreground'}`, children: [f.icon, _jsx("span", { children: f.label }), _jsx("span", { className: `text-xs px-1.5 py-0.5 rounded-md ${activeFilter === f.type ? 'bg-accent/30 text-accent' : 'bg-secondary text-muted-foreground'}`, children: counts[f.type] })] }, f.type))) }));
}
