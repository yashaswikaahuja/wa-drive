import { Download, Printer, Trash2, MoreVertical, Image, Video, Music, FileText, File, Play } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import type { WhatsAppFile } from '../../types/whatsapp';
import { getPreviewUrl } from '../../utils/helpers';

const EXT_TYPE = (name: string) => {
  const e = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg','jpeg','png','gif','webp','bmp','svg','heic','heif','tiff','tif'].includes(e)) return 'image';
  if (['mp4','3gp','mov','avi','mkv','webm','flv','wmv','m4v'].includes(e)) return 'video';
  if (['mp3','ogg','wav','aac','m4a','flac','opus','wma','amr'].includes(e)) return 'audio';
  if (e === 'pdf') return 'pdf';
  if (['doc','docx','xls','xlsx','ppt','pptx','txt','csv','rtf','odt','ods','odp'].includes(e)) return 'document';
  return 'document';
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  image: <Image className="w-6 h-6" />, video: <Video className="w-6 h-6" />,
  audio: <Music className="w-6 h-6" />, pdf: <FileText className="w-6 h-6" />, document: <File className="w-6 h-6" />,
};
const TYPE_COLOR: Record<string, string> = {
  image: 'from-blue-500/20 to-cyan-500/20 text-cyan-400',
  video: 'from-purple-500/20 to-pink-500/20 text-purple-400',
  audio: 'from-orange-500/20 to-amber-500/20 text-orange-400',
  pdf: 'from-red-500/20 to-rose-500/20 text-red-400',
  document: 'from-slate-500/20 to-gray-500/20 text-slate-400',
};

interface Props {
  file: WhatsAppFile;
  isNew?: boolean;
  onPreview: (f: WhatsAppFile) => void;
  onDownload: (f: WhatsAppFile) => void;
  onPrint: (f: WhatsAppFile) => void;
  onDelete: (f: WhatsAppFile) => void;
}

export function FileCard({ file, isNew, onPreview, onDownload, onPrint, onDelete }: Props) {
  const type = EXT_TYPE(file.fileName);
  const thumb = getPreviewUrl(file.fileUrl);

  return (
    <div
      onClick={() => onPreview(file)}
      className={`group relative bg-card border rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-accent/5
        ${isNew ? 'border-accent/60 animate-[slideDown_0.3s_ease-out]' : 'border-border hover:border-accent/50'}`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square bg-secondary/50 overflow-hidden">
        {type === 'image' ? (
          <>
            <img src={thumb} alt={file.fileName} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
          </>
        ) : type === 'video' ? (
          <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${TYPE_COLOR[type]}`}>
            <div className="w-14 h-14 rounded-full bg-black/40 flex items-center justify-center border border-white/20">
              <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
            </div>
          </div>
        ) : (
          <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${TYPE_COLOR[type]}`}>
            <div className="w-14 h-14 rounded-xl bg-secondary/80 flex items-center justify-center">
              {TYPE_ICON[type]}
            </div>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
          <Button variant="secondary" size="sm" className="h-8 w-8 p-0 bg-white/10 hover:bg-white/20 border-white/20 backdrop-blur-sm"
            onClick={e => { e.stopPropagation(); onDownload(file); }}>
            <Download className="w-4 h-4 text-white" />
          </Button>
          <Button variant="secondary" size="sm" className="h-8 w-8 p-0 bg-white/10 hover:bg-white/20 border-white/20 backdrop-blur-sm"
            onClick={e => { e.stopPropagation(); onPrint(file); }}>
            <Printer className="w-4 h-4 text-white" />
          </Button>
        </div>

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-black/60 backdrop-blur-sm rounded text-white/90 border border-white/10">
            {type}
          </span>
        </div>

        {/* More menu */}
        <div className="absolute top-2 right-2" onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 bg-black/40 hover:bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="w-4 h-4 text-white" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onPreview(file)}><Image className="w-4 h-4 mr-2" />Preview</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDownload(file)}><Download className="w-4 h-4 mr-2" />Download</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPrint(file)}><Printer className="w-4 h-4 mr-2" />Print</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(file)} className="text-destructive focus:text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-foreground truncate mb-1">{file.fileName}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate max-w-[70%]">{file.customerName}</span>
          <span className="shrink-0 text-muted-foreground/60">{file.customerId?.slice(-6)}</span>
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          {formatDistanceToNow(new Date(file.timestamp), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
