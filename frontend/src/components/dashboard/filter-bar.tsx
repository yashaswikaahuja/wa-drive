import { Button } from '../ui/button';
import { Image, Video, Music, FileText, Layers } from 'lucide-react';

export type FileFilter = 'all' | 'image' | 'video' | 'audio' | 'pdf' | 'document';

const filters: { type: FileFilter; label: string; icon: React.ReactNode }[] = [
  { type: 'all', label: 'All', icon: <Layers className="w-4 h-4" /> },
  { type: 'image', label: 'Images', icon: <Image className="w-4 h-4" /> },
  { type: 'video', label: 'Videos', icon: <Video className="w-4 h-4" /> },
  { type: 'audio', label: 'Audio', icon: <Music className="w-4 h-4" /> },
  { type: 'pdf', label: 'PDFs', icon: <FileText className="w-4 h-4" /> },
];

interface FilterBarProps {
  activeFilter: FileFilter;
  onFilterChange: (f: FileFilter) => void;
  counts: Record<FileFilter, number>;
}

export function FilterBar({ activeFilter, onFilterChange, counts }: FilterBarProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {filters.map(f => (
        <Button key={f.type} variant="ghost" size="sm" onClick={() => onFilterChange(f.type)}
          className={`h-8 gap-2 shrink-0 ${activeFilter === f.type ? 'bg-accent/20 text-accent hover:bg-accent/30 hover:text-accent' : 'text-muted-foreground hover:text-foreground'}`}>
          {f.icon}
          <span>{f.label}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-md ${activeFilter === f.type ? 'bg-accent/30 text-accent' : 'bg-secondary text-muted-foreground'}`}>
            {counts[f.type]}
          </span>
        </Button>
      ))}
    </div>
  );
}
