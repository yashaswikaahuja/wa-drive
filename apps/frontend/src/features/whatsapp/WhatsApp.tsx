import { useEffect, useState, useRef, memo, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client'; // v2
import api, { API_URL, SOCKET_URL } from '../../shared/api';
import { DocTypePickerModal } from '../../shared/DocTypePicker';
import { ExtractProfileTarget, type ExtractSaveTarget } from '../../shared/ExtractProfileTarget';
import { toast } from '../../shared/toast';
import { getCachedBlob, printBlob } from '../../shared/fileCache';
import { formatPhoneDisplay, phonesMatch } from '../../shared/phone';
import { useReveal } from '../../shared/useReveal';
import {
  MediaViewer,
  displayName,
  driveIdFromUrl,
  mediaKindOf,
  type MediaViewerFile,
  type MediaViewerStripItem,
} from '@cybercontrol/media-viewer';
import { useAuthStore } from '../auth/store';
import {
  Printer, Camera, WhatsappLogo, Eye, Tag, DownloadSimple, Trash, UserCircle,
  PaperPlaneTilt, AddressBook, CheckSquare, ArrowClockwise, FilePdf, Image as ImageIcon,
  FileVideo, FileAudio, File as FileIcon, Play, DotsThree, Check, CaretLeft,
} from '@phosphor-icons/react';

const DOCS_RETURN = '/app/whatsapp';

function photoEditorPath(driveId: string, msg?: { phone?: string; name?: string }) {
  const q = new URLSearchParams();
  q.set('fileId', driveId);
  if (msg?.phone) q.set('phone', msg.phone);
  if (msg?.name) q.set('name', msg.name);
  q.set('from', DOCS_RETURN);
  return `/app/photos/portal?${q}`;
}

interface Message {
  id: string; phone: string; name: string; fileName?: string; text?: string;
  fileUrl?: string; timestamp: string; type?: string; dpUrl?: string; tag?: string;
  needsType?: boolean;
}

/** True when the operator has set a real document type (not a filename guess). */
function hasStoredDocType(msg: Message): boolean {
  return !!msg.tag && msg.tag !== 'Needs type' && !msg.needsType;
}

/**
 * Build Profile requires an explicit Tag.
 * Filename heuristics (`docCategory`) stay visual hints only — they must not unlock extract
 * (backend can still return needsType mid-run when the guess was wrong).
 */
function docNeedsTypeTag(msg: Message): boolean {
  return !hasStoredDocType(msg);
}
interface Chat { phone: string; name: string; lastTime: string; messages: Message[]; newCount: number; dpUrl?: string; }

interface Person { id: string; name: string; displayLabel: string; relationship: string; }
interface Household { phone: string; persons: Person[]; person_count: string; }

function docCategory(fileName: string): { category: string; color: string } | null {
  const name = fileName.toLowerCase();
  // Paper-theme chips (readable on cream cards)
  if (/aadh|aadhaar|adhar|uid/i.test(name)) return { category: 'Aadhaar', color: 'bg-[hsl(28_95%_55%/0.14)] text-[hsl(18_90%_40%)]' };
  if (/pan[\s_-]?card|pan[\s_.]|pancard/i.test(name)) return { category: 'PAN', color: 'bg-[hsl(215_70%_42%/0.12)] text-[hsl(215_70%_34%)]' };
  if (/passport|pport/i.test(name)) return { category: 'Passport', color: 'bg-[hsl(280_45%_42%/0.12)] text-[hsl(280_45%_36%)]' };
  if (/mark\s?sheet|result|10th|12th|matric|inter|hsc|ssc/i.test(name)) return { category: 'Marksheet', color: 'bg-[hsl(158_55%_36%/0.12)] text-[hsl(158_55%_28%)]' };
  if (/degree|graduat|diploma|certif/i.test(name)) return { category: 'Certificate', color: 'bg-[hsl(215_70%_42%/0.12)] text-[hsl(215_70%_34%)]' };
  if (/photo|passport.?size|selfie|dp|pic/i.test(name)) return { category: 'Photo', color: 'bg-[hsl(330_55%_45%/0.12)] text-[hsl(330_55%_38%)]' };
  if (/voter|epic|election/i.test(name)) return { category: 'Voter ID', color: 'bg-[hsl(40_90%_42%/0.14)] text-[hsl(35_90%_34%)]' };
  if (/driv.*lic|dl[\s_.-]/i.test(name)) return { category: 'Driving License', color: 'bg-[hsl(0_65%_48%/0.12)] text-[hsl(0_65%_42%)]' };
  if (/ration|bpl|apl/i.test(name)) return { category: 'Ration Card', color: 'bg-[hsl(28_80%_45%/0.14)] text-[hsl(22_80%_38%)]' };
  if (/caste|obc|sc[\s_]|st[\s_]|category/i.test(name)) return { category: 'Caste Cert', color: 'bg-[hsl(250_40%_45%/0.12)] text-[hsl(250_40%_38%)]' };
  if (/income|salary|itr/i.test(name)) return { category: 'Income', color: 'bg-[hsl(158_55%_36%/0.12)] text-[hsl(158_55%_28%)]' };
  if (/domicile|residen/i.test(name)) return { category: 'Domicile', color: 'bg-[hsl(190_60%_35%/0.12)] text-[hsl(190_60%_30%)]' };
  if (/bank|passbook|cheque|ifsc/i.test(name)) return { category: 'Bank', color: 'bg-[hsl(200_65%_40%/0.12)] text-[hsl(200_65%_34%)]' };
  if (/sign|signature/i.test(name)) return { category: 'Signature', color: 'bg-[hsl(270_40%_45%/0.12)] text-[hsl(270_40%_38%)]' };
  return null;
}

function docTitle(fileName: string): { title: string; badge: string; kind: 'image' | 'video' | 'pdf' | 'audio' | 'file' } {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) return { title: 'Photo', badge: 'IMG', kind: 'image' };
  if (['mp4','3gp','mov','avi','webm'].includes(ext)) return { title: 'Video', badge: 'VID', kind: 'video' };
  if (ext === 'pdf') return { title: 'PDF', badge: 'PDF', kind: 'pdf' };
  if (['mp3','ogg','wav','aac','opus'].includes(ext)) return { title: 'Audio', badge: 'AUD', kind: 'audio' };
  return { title: 'Document', badge: ext.toUpperCase() || 'FILE', kind: 'file' };
}

function timeAgo(ts: string): string {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return new Date(ts).toLocaleDateString();
}

function authThumbUrl(fileUrl?: string, fileId?: string) {
  const driveId = driveIdFromUrl(fileUrl) || fileId || '';
  if (!driveId) return undefined;
  const token = useAuthStore.getState().accessToken || '';
  return `${API_URL}/drive/download/${driveId}?token=${encodeURIComponent(token)}`;
}

const KindGlyph = ({ kind, size = 28 }: { kind: string; size?: number }) => {
  if (kind === 'pdf') return <FilePdf size={size} weight="fill" style={{ color: 'hsl(0 65% 48%)' }} />;
  if (kind === 'image') return <ImageIcon size={size} weight="fill" style={{ color: 'hsl(200 65% 40%)' }} />;
  if (kind === 'video') return <FileVideo size={size} weight="fill" style={{ color: 'hsl(280 45% 42%)' }} />;
  if (kind === 'audio') return <FileAudio size={size} weight="fill" style={{ color: 'hsl(158 55% 36%)' }} />;
  return <FileIcon size={size} weight="fill" style={{ color: 'hsl(var(--pt-muted))' }} />;
};

const LazyThumbnail = memo(({ src, ext, kind, label }: { src?: string; ext: string; kind: string; label?: string }) => {
  const [visible, setVisible] = useState(false);
  const [imgError, setImgError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || visible) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { rootMargin: '100px' });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible]);
  const isImage = kind === 'image';
  const isVideo = kind === 'video';
  const showImg = visible && src && (isImage || isVideo) && !imgError;
  return (
    <div
      ref={ref}
      className="w-[96px] h-[96px] sm:w-[108px] sm:h-[108px] rounded-xl relative overflow-hidden flex items-center justify-center shrink-0"
      style={{
        background: 'hsl(var(--pt-secondary))',
        border: '1px solid hsl(var(--pt-border))',
        boxShadow: 'inset 0 1px 0 hsl(var(--ink) / 0.03)',
      }}
    >
      {showImg ? (
        <img src={src} className="w-full h-full object-cover" loading="lazy" alt={label || ''} onError={() => setImgError(true)} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-1.5 px-2">
          <KindGlyph kind={kind} size={30} />
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-md font-bold tracking-wide uppercase"
            style={{ background: 'hsl(var(--ink) / 0.07)', color: 'hsl(var(--ink-soft))' }}
          >
            {ext || kind}
          </span>
        </div>
      )}
      {isVideo && showImg && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-8 h-8 rounded-full bg-black/55 flex items-center justify-center text-white shadow-md">
            <Play size={14} weight="fill" />
          </span>
        </span>
      )}
      <span
        className="absolute bottom-1.5 left-1.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
        style={{ background: 'hsl(var(--ink) / 0.72)', color: 'white' }}
      >
        {kind === 'image' ? 'IMG' : kind === 'pdf' ? 'PDF' : kind === 'video' ? 'VID' : ext || 'FILE'}
      </span>
    </div>
  );
});

const ActionBtn = ({ title, onClick, danger, accent, children }: any) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className="inline-flex items-center justify-center h-8 min-w-[2rem] px-2 rounded-lg text-[11px] font-medium gap-1 transition-colors"
    style={{
      border: '1px solid hsl(var(--pt-border))',
      background: danger ? 'hsl(0 70% 50% / 0.08)' : accent ? 'hsl(var(--marigold) / 0.12)' : 'hsl(var(--paper))',
      color: danger ? 'hsl(0 65% 42%)' : accent ? 'hsl(var(--marigold-deep))' : 'hsl(var(--ink-soft))',
    }}
  >
    {children}
  </button>
);

const MessageCard = memo(({ msg, onClick, selected, selectUiActive, onToggleSelect, onDelete, onSetType }: any) => {
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const openClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ext = msg.fileName?.split('.').pop()?.toLowerCase() || '';
  const { title, kind } = docTitle(msg.fileName || '');
  const cleanName = displayName(msg.fileName || '');
  const driveId = driveIdFromUrl(msg.fileUrl) || msg.id;
  const thumbUrl = kind === 'image' || kind === 'video'
    ? (authThumbUrl(msg.fileUrl, msg.id) || msg.fileUrl)
    : undefined;
  const showCheck = selectUiActive || selected;
  const ID_TAGS = ['Aadhaar','PAN','Passport','Voter ID','Driving License','Ration Card','Ayushman','10th Marksheet','12th Marksheet','Graduation','Post-Grad','Admit Card','Certificate','Bank'];
  const needsType = !hasStoredDocType(msg);
  const isJunkTag = !!msg.tag && !ID_TAGS.includes(msg.tag) && msg.tag !== 'Needs type';
  const guessed = !msg.tag || msg.tag === 'Needs type' || msg.needsType
    ? docCategory(msg.fileName || '')
    : null;
  const category = hasStoredDocType(msg)
    ? { category: msg.tag!, color: isJunkTag ? 'bg-[hsl(var(--pt-secondary))] text-[hsl(var(--pt-muted))]' : 'bg-[hsl(158_55%_36%/0.12)] text-[hsl(158_55%_28%)]' }
    : { category: 'Needs type', color: 'bg-[hsl(35_92%_48%/0.16)] text-[hsl(28_90%_38%)]' };
  // Confirmed tag wins the title; filename guess is a soft subtitle only.
  const primaryTitle = hasStoredDocType(msg) ? msg.tag! : (guessed?.category || title);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreOpen]);

  if (msg.text && !msg.fileName) return (
    <div
      className="rounded-2xl rounded-tl-md px-3.5 py-2.5 max-w-[85%] sm:max-w-[70%]"
      style={{
        background: 'hsl(142 45% 92%)',
        border: '1px solid hsl(142 35% 82%)',
        boxShadow: 'var(--shadow-paper)',
      }}
    >
      <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--ink))' }}>{msg.text}</p>
      <p className="text-[10px] mt-1.5 text-right" style={{ color: 'hsl(var(--pt-muted))' }}>{timeAgo(msg.timestamp)}</p>
    </div>
  );

  const doPrint = () => {
    if (!driveId) return;
    getCachedBlob(driveId, async () => {
      const res = await api.get(`/drive/download/${driveId}`, { responseType: 'blob' });
      return new Blob([res.data], { type: String(res.headers['content-type'] ?? 'application/pdf') });
    }).then((blob) => { printBlob(blob); }).catch((err) => {
      toast.error('Failed to load file: ' + (err.message || 'unknown'));
    });
  };

  const doPhotoEditor = () => {
    if (!driveId) return;
    navigate(photoEditorPath(driveId, msg));
  };

  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const onThumbOpen = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    // Delay single-click open so double-click can steal it for select (desktop).
    if (openClickTimer.current) clearTimeout(openClickTimer.current);
    openClickTimer.current = setTimeout(() => {
      openClickTimer.current = null;
      onClick(msg);
    }, 260);
  };

  const onThumbDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (openClickTimer.current) {
      clearTimeout(openClickTimer.current);
      openClickTimer.current = null;
    }
    onToggleSelect(msg);
  };

  const onThumbTouchStart = () => {
    longPressFired.current = false;
    clearLongPress();
    longPressRef.current = setTimeout(() => {
      longPressFired.current = true;
      onToggleSelect(msg);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { (navigator as any).vibrate?.(12); } catch { /* ignore */ }
      }
    }, 450);
  };

  const onThumbTouchEnd = () => {
    clearLongPress();
  };

  const doDownload = () => {
    if (!driveId) return;
    getCachedBlob(driveId, async () => {
      const res = await api.get(`/drive/download/${driveId}`, { responseType: 'blob' });
      return new Blob([res.data], { type: String(res.headers['content-type'] ?? 'application/octet-stream') });
    }).then((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = msg.fileName || 'file';
      a.click();
    });
  };

  const doDelete = () => {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    api.delete('/drive/files/' + msg.id).then(() => {
      onDelete(msg.id);
      toast.success('Document deleted');
    }).catch(() => toast.error('Failed to delete'));
  };

  return (
    <div
      className="rounded-2xl max-w-[min(100%,540px)] overflow-hidden transition group"
      style={{
        background: selected ? 'hsl(var(--marigold) / 0.08)' : 'hsl(var(--pt-card))',
        border: selected
          ? '1px solid hsl(var(--marigold) / 0.5)'
          : '1px solid hsl(var(--pt-border))',
        boxShadow: selected
          ? '0 0 0 1px hsl(var(--marigold) / 0.18), var(--shadow-paper)'
          : 'var(--shadow-paper)',
      }}
    >
      <div className="flex gap-3 p-3">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={onThumbOpen}
            onDoubleClick={onThumbDoubleClick}
            onTouchStart={onThumbTouchStart}
            onTouchEnd={onThumbTouchEnd}
            onTouchCancel={onThumbTouchEnd}
            onContextMenu={(e) => e.preventDefault()}
            className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--marigold))] select-none"
            title="Open · double-click or long-press to select"
          >
            <LazyThumbnail src={thumbUrl} ext={ext} kind={kind} label={primaryTitle} />
          </button>
          {showCheck && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSelect(msg); }}
              className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-md"
              style={{
                background: selected ? 'hsl(var(--marigold))' : 'hsl(var(--pt-card) / 0.92)',
                border: selected ? '1.5px solid hsl(var(--marigold-deep))' : '1.5px solid hsl(var(--ink) / 0.35)',
                color: selected ? 'white' : 'transparent',
              }}
              title={selected ? 'Deselect' : 'Select'}
              aria-label={selected ? 'Deselect document' : 'Select document'}
              aria-pressed={selected}
            >
              {selected ? <Check size={14} weight="bold" /> : null}
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug truncate" style={{ color: 'hsl(var(--ink))' }}>
                {primaryTitle}
              </p>
              <p className="text-[12px] mt-0.5 truncate" style={{ color: 'hsl(var(--ink-soft))' }} title={msg.fileName}>
                {cleanName}
              </p>
            </div>
            <span className="text-[10px] font-medium shrink-0 pt-0.5" style={{ color: 'hsl(var(--pt-muted))' }}>
              {timeAgo(msg.timestamp)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md"
              style={{ background: 'hsl(var(--pt-secondary))', color: 'hsl(var(--ink-soft))' }}
            >
              <KindGlyph kind={kind} size={12} />
              {title}
            </span>
            {category && category.category !== primaryTitle && (
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${category.color}`}>
                {category.category}
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-1.5 px-3 py-2"
        style={{
          borderTop: '1px solid hsl(var(--pt-border))',
          background: 'hsl(var(--pt-secondary) / 0.45)',
        }}
      >
        <ActionBtn title="Open" onClick={() => onClick(msg)}>
          <Eye size={14} /> <span>Open</span>
        </ActionBtn>
        <ActionBtn
          title={needsType ? 'Set document type' : 'Tag / set type'}
          accent={needsType}
          onClick={(e: any) => { e.stopPropagation(); onSetType?.(msg); }}
        >
          <Tag size={14} /> <span>Tag</span>
        </ActionBtn>
        <div className="flex-1 min-w-[0.5rem]" />
        <div className="relative" ref={moreRef}>
          <ActionBtn
            title="More actions"
            onClick={(e: any) => { e.stopPropagation(); setMoreOpen((v: boolean) => !v); }}
          >
            <DotsThree size={16} weight="bold" />
          </ActionBtn>
          {moreOpen && (
            <div
              className="absolute right-0 bottom-full mb-1 z-30 min-w-[160px] rounded-xl py-1 overflow-hidden"
              style={{
                background: 'hsl(var(--pt-card))',
                border: '1px solid hsl(var(--pt-border))',
                boxShadow: 'var(--shadow-lift)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-[hsl(var(--pt-secondary))]"
                style={{ color: 'hsl(var(--ink))' }}
                onClick={() => { setMoreOpen(false); doPrint(); }}
              >
                <Printer size={14} /> Print
              </button>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-[hsl(var(--pt-secondary))]"
                style={{ color: 'hsl(var(--ink))' }}
                onClick={() => { setMoreOpen(false); doPhotoEditor(); }}
              >
                <Camera size={14} /> Photo Editor
              </button>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-[hsl(var(--pt-secondary))]"
                style={{ color: 'hsl(var(--ink))' }}
                onClick={() => { setMoreOpen(false); doDownload(); }}
              >
                <DownloadSimple size={14} /> Download
              </button>
              <div style={{ borderTop: '1px solid hsl(var(--pt-border))', margin: '0.25rem 0' }} />
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-[hsl(0_70%_50%/0.08)]"
                style={{ color: 'hsl(0 65% 42%)' }}
                onClick={() => { setMoreOpen(false); doDelete(); }}
              >
                <Trash size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const ChatItem = memo(({ chat, selected, onClick, unreadCount, pinned, onPin }: any) => (
  <div
    onClick={() => onClick(chat.phone)}
    className="group px-3 py-2.5 cursor-pointer transition-colors"
    style={{
      background: selected ? 'hsl(var(--whatsapp) / 0.1)' : 'transparent',
      boxShadow: selected ? 'inset 3px 0 0 hsl(var(--whatsapp))' : undefined,
      borderBottom: '1px solid hsl(var(--pt-border-soft))',
    }}
    onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'hsl(var(--pt-secondary) / 0.7)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = selected ? 'hsl(var(--whatsapp) / 0.1)' : 'transparent'; }}
  >
    <div className="flex items-center gap-3">
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden"
        style={{ background: 'hsl(var(--whatsapp) / 0.14)', color: 'hsl(142 64% 28%)' }}
      >
        {chat.dpUrl ? <img src={chat.dpUrl} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display='none')} alt="" /> : null}
        {!chat.dpUrl && (chat.name[0]?.toUpperCase() || '?')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--ink))' }}>{chat.name}</p>
          {pinned && <span className="text-[10px]" title="Pinned">📌</span>}
        </div>
        <p className="text-[11px] truncate mt-0.5" style={{ color: 'hsl(var(--pt-muted))' }}>
          {formatPhoneDisplay(chat.phone)}
          {' · '}{chat.newCount} doc{chat.newCount !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className="text-[10px] font-medium" style={{ color: unreadCount > 0 ? 'hsl(var(--whatsapp))' : 'hsl(var(--pt-muted))' }}>
          {timeAgo(chat.lastTime)}
        </span>
        {unreadCount > 0 && (
          <span
            className="min-w-[1.25rem] h-5 px-1.5 rounded-full text-white text-[10px] flex items-center justify-center font-bold"
            style={{ background: 'hsl(var(--whatsapp))' }}
          >
            {unreadCount}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onPin(chat.phone); }}
        className={`text-xs p-1.5 rounded-lg transition-opacity ${pinned ? 'opacity-100' : 'opacity-70 md:opacity-0 md:group-hover:opacity-100'}`}
        style={{ color: pinned ? 'hsl(var(--marigold-deep))' : 'hsl(var(--pt-muted))' }}
        title={pinned ? 'Unpin' : 'Pin'}
        aria-label={pinned ? 'Unpin chat' : 'Pin chat'}
      >
        📌
      </button>
    </div>
  </div>
));

export default function WhatsApp() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { reveal, trigger } = useReveal({ auto: false });
  // true = show inbox immediately when last session was linked; null = spinner until
  // /whatsapp/status returns. Never start as false (that caused a 2s Connect flash).
  const [connected, setConnected] = useState<boolean | null>(() => {
    return localStorage.getItem('cc-wa-connected') === 'true' ? true : null;
  });
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [qrExpired, setQrExpired] = useState(false);
  const qrStartRef = useRef<number | null>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deepPhoneAppliedRef = useRef<string | null>(null);
  const QR_TIMEOUT_MS = 120_000; // 2 minutes
  const [chats, setChats] = useState<Map<string, Chat>>(new Map());
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [viewerFile, setViewerFile] = useState<Message | null>(null);
  const [viewerResolved, setViewerResolved] = useState<MediaViewerFile | null>(null);
  const [viewerOpening, setViewerOpening] = useState(false);
  const viewerBlobUrlRef = useRef<string | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Map<string, Message>>(new Map());
  const [showPicker, setShowPicker] = useState(false);
  const [unread, setUnread] = useState<Map<string, number>>(new Map());
  const [chatSearch, setChatSearch] = useState('');
  const [pinnedChats, setPinnedChats] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cc-pinned-chats') || '[]')); } catch { return new Set(); }
  });
  const [msgSearch, setMsgSearch] = useState('');
  const [dpPreview, setDpPreview] = useState<string | null>(null);
  const [typePickerFile, setTypePickerFile] = useState<Message | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractedSuggestions, setExtractedSuggestions] = useState<any | null>(null);
  const [targetPersonId, setTargetPersonId] = useState<string | null>(null);
  const targetPersonIdRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const msgContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  // Require consecutive misses before flipping linked→Connect UI (avoids 2s flash on open).
  const statusMissesRef = useRef(0);

  useEffect(() => {
    api.get('/whatsapp/status').then(r => {
      if (r.data.connected) {
        statusMissesRef.current = 0;
        setConnected(true);
        setReconnecting(false);
        localStorage.setItem('cc-wa-connected', 'true');
      } else if (localStorage.getItem('cc-wa-connected') === 'true') {
        // Already linked — keep inbox up while the socket finishes resuming.
        setReconnecting(true);
      } else {
        setConnected(false);
        localStorage.setItem('cc-wa-connected', 'false');
        localStorage.removeItem('cc-drive-files');
      }
      // Auto-start only when there is no session yet (not on every brief disconnect).
      if (r.data.status === 'none') {
        api.post('/whatsapp/connect').catch(() => {});
      }
      if (r.data.qr) setQrCode(r.data.qr);
    }).catch(() => {});
    // Load cached data instantly, then refresh from server
    const cacheKey = `cc-drive-files:${useAuthStore.getState().user?.workspaceId || ''}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { const msgs = JSON.parse(cached); groupMessages(msgs); } catch {}
    }
    api.get('/drive/files/ws', { params: { source: 'whatsapp' } }).then(r => {
      const msgs: Message[] = r.data.map((f: any) => ({
        id: f.id, phone: f.customerId || 'unknown', name: f.customerName || f.customerId || 'Unknown',
        fileName: f.fileName, fileUrl: f.fileUrl, timestamp: f.timestamp, dpUrl: f.dpUrl, tag: f.tag
      }));
      localStorage.setItem(`cc-drive-files:${useAuthStore.getState().user?.workspaceId || ''}`, JSON.stringify(msgs));
      groupMessages(msgs);
    }).catch(() => {});
    const baseUrl = SOCKET_URL;
    const token = useAuthStore.getState().accessToken || '';
    const socket = io(baseUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      auth: { token },
      query: { token },
    });
    socketRef.current = socket;
    // ── QR delivery via HTTP polling (no Socket.IO) ──
    // Polls /whatsapp/status every 3s. Stops when connected. Resumes if disconnected.
    // #306: never restart polling after unmount (mounted flag).
    let mounted = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const stopPolling = () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    };
    const pollStatus = async () => {
      if (!mounted) return;
      try {
        const r = await api.get('/whatsapp/status');
        if (!mounted) return;
        if (r.data.connected) {
          statusMissesRef.current = 0;
          setConnected(true); setQrCode(null); setReconnecting(false); setQrExpired(false);
          qrStartRef.current = null;
          localStorage.setItem('cc-wa-connected', 'true');
          // Keep polling so soft disconnects still hit the hysteresis path below.
        } else {
          if (r.data.qr) {
            // Track when QR first appeared; expire after 2 min
            if (!qrStartRef.current) qrStartRef.current = Date.now();
            if (Date.now() - qrStartRef.current > QR_TIMEOUT_MS) {
              setQrExpired(true);
            } else {
              setQrCode(r.data.qr);
            }
          }
          statusMissesRef.current += 1;
          const wasLinked = localStorage.getItem('cc-wa-connected') === 'true';
          // One miss is normal while Baileys resumes — do not flash Connect WhatsApp.
          if (!wasLinked || statusMissesRef.current >= 2) {
            setConnected(false);
            setReconnecting(false);
            if (wasLinked && statusMissesRef.current >= 2) {
              localStorage.setItem('cc-wa-connected', 'false');
            }
          } else {
            setReconnecting(true);
          }
        }
      } catch (e) {
        console.warn('[WhatsApp] status poll failed:', (e as any)?.message);
      }
    };
    const startPolling = () => {
      if (!mounted || pollTimer) return;
      pollStatus();
      pollTimer = setInterval(pollStatus, 3000);
    };
    // Kick off polling immediately — single status loop (no second interval).
    startPolling();
    // Connection events still come via socket (single emit, low cost)
    socket.on('connection:status', (data: any) => {
      if (!mounted) return;
      if (data.connected) {
        statusMissesRef.current = 0;
        setConnected(true); setQrCode(null); setReconnecting(false);
        localStorage.setItem('cc-wa-connected', 'true');
      } else {
        // Soft disconnect / resume — keep inbox if previously linked; poll confirms.
        if (localStorage.getItem('cc-wa-connected') === 'true') {
          setReconnecting(true);
        }
        startPolling();
      }
    });
    socket.on('new_whatsapp_file', (file: any) => {
      if (!mounted) return;
      const phone = file.phoneNumber || file.customerId || 'unknown';
      const name = file.customerName || file.phoneNumber || 'Unknown';
      addMessage({ id: file.id || Date.now().toString(), phone, name, fileName: file.fileName,
        fileUrl: file.fileUrl, timestamp: file.timestamp || new Date().toISOString(), dpUrl: file.dpUrl || file.profilePicUrl });
      // Browser notification
      if (Notification.permission === 'granted') {
        new Notification(`📄 ${name}`, { body: file.fileName || 'New document received', icon: '/favicon.ico' });
        new Audio('/notify.mp3').play().catch(() => {});
      }
      // Track unread
      setUnread(prev => { const m = new Map(prev); m.set(phone, (m.get(phone) || 0) + 1); const total = Array.from(m.values()).reduce((a,b)=>a+b,0); localStorage.setItem('cc-wa-unread', String(total)); return m; });
    });
    // Request notification permission
    if (Notification.permission === 'default') Notification.requestPermission();
    return () => {
      mounted = false;
      stopPolling();
      if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const groupMessages = useCallback((msgs: Message[]) => {
    const map = new Map<string, Chat>();
    msgs.forEach(m => {
      const key = m.phone;
      if (!map.has(key)) map.set(key, { phone: key, name: m.name, lastTime: m.timestamp, messages: [], newCount: 0, dpUrl: m.dpUrl });
      const chat = map.get(key)!;
      chat.messages.push(m);
      if (m.timestamp > chat.lastTime) chat.lastTime = m.timestamp;
      if (m.dpUrl) chat.dpUrl = m.dpUrl;
      chat.newCount = chat.messages.length;
    });
    setChats(map);
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setChats(prev => {
      const map = new Map(prev);
      const key = msg.phone;
      if (!map.has(key)) map.set(key, { phone: key, name: msg.name, lastTime: msg.timestamp, messages: [], newCount: 0, dpUrl: msg.dpUrl });
      const chat = map.get(key)!;
      if (chat.messages.some(m => m.id === msg.id)) return prev; // dedupe
      chat.messages.unshift(msg);
      chat.lastTime = msg.timestamp;
      chat.newCount++;
      if (msg.dpUrl) chat.dpUrl = msg.dpUrl;
      return map;
    });
  }, []);

  const handleShowQR = useCallback(async () => {
    setReconnecting(true);
    setQrExpired(false);
    qrStartRef.current = null;
    if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
    // Force start a new session — this generates a fresh QR
    await api.post('/whatsapp/connect').catch(() => {});
    // Poll for QR (takes 3-10s for Baileys to generate). Cleared on unmount (#306).
    let attempts = 0;
    qrPollRef.current = setInterval(async () => {
      attempts++;
      try {
        const r = await api.get('/whatsapp/status');
        if (r.data.connected) {
          if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
          setConnected(true); setQrCode(null); setReconnecting(false); return;
        }
        if (r.data.qr) {
          if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
          setQrCode(r.data.qr); setReconnecting(false); qrStartRef.current = Date.now();
        }
      } catch {}
      if (attempts > 15) {
        if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
        setReconnecting(false);
      }
    }, 2000);
  }, []);

  // While linked, periodically refresh Drive-backed inbox (status lives in the socket poll above).
  useEffect(() => {
    if (connected !== true) return;
    let alive = true;
    const load = () => {
      api.get('/drive/files/ws', { params: { source: 'whatsapp' } }).then((fr) => {
        if (!alive) return;
        const msgs: Message[] = fr.data.map((f: any) => ({
          id: f.id, phone: f.customerId || 'unknown', name: f.customerName || f.customerId || 'Unknown',
          fileName: f.fileName, fileUrl: f.fileUrl, timestamp: f.timestamp, dpUrl: f.dpUrl, tag: f.tag,
        }));
        if (msgs.length > 0) {
          localStorage.setItem(`cc-drive-files:${useAuthStore.getState().user?.workspaceId || ''}`, JSON.stringify(msgs));
          groupMessages(msgs);
        }
      }).catch(() => {});
    };
    load();
    const poll = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(poll); };
  }, [connected, groupMessages]);

  const handleSelectChat = useCallback((phone: string) => {
    setSelectedChat(phone);
    setSelectedDocs(new Map());
    setUnread(prev => { const m = new Map(prev); m.delete(phone); const total = Array.from(m.values()).reduce((a,b)=>a+b,0); localStorage.setItem('cc-wa-unread', String(total)); return m; });
    userScrolledUpRef.current = false;
    setMsgSearch('');
    setTimeout(() => messagesEndRef.current?.scrollIntoView(), 100);
  }, []);

  // Today / Profile deep-link: /app/whatsapp?phone=… opens that customer's chat.
  useEffect(() => {
    const want = searchParams.get('phone');
    if (!want || chats.size === 0) return;
    if (deepPhoneAppliedRef.current === want) return;
    const match = [...chats.keys()].find((p) => phonesMatch(p, want));
    if (!match) return;
    deepPhoneAppliedRef.current = want;
    handleSelectChat(match);
  }, [searchParams, chats, handleSelectChat]);

  const togglePin = useCallback((phone: string) => {
    setPinnedChats(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone); else next.add(phone);
      localStorage.setItem('cc-pinned-chats', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const assignChat = useCallback(async (phone: string, name: string) => {
    const isLid = !/^[0-9]{10,13}$/.test(phone);
    const realPhone = isLid ? prompt(`Enter real phone for "${name}" (e.g. 919876543210):`) : phone;
    if (!realPhone) return;
    try {
      await api.post('/customers/persons', { phone: realPhone, name, displayLabel: name, relationship: 'self' });
      if (isLid) await api.post('/whatsapp/link-lid', { lid: phone, phone: realPhone }).catch(() => {});
      toast.success(`Assigned ${name} → ${realPhone}`);
    } catch (e: any) {
      if (e.response?.status === 409) toast.info('Already assigned');
      else toast.error(e.response?.data?.error || 'Failed to assign');
    }
  }, []);

  const requestDocs = useCallback(async (phone: string) => {
    try {
      await api.post('/whatsapp/send', { phone, message: 'नमस्ते! कृपया अपने डॉक्यूमेंट्स (आधार कार्ड, मार्कशीट, फोटो आदि) WhatsApp पर भेजें। / Hello! Please send your documents (Aadhaar, marksheets, photo etc.) on this WhatsApp.' });
      toast.success('Document request sent');
    } catch { toast.error('Failed to send request'); }
  }, []);

  const handleOpenFile = useCallback(async (msg: Message) => {
    const kind = mediaKindOf(msg.fileName);
    if (!kind) {
      const driveId = driveIdFromUrl(msg.fileUrl) || msg.id;
      try {
        const blob = await getCachedBlob(driveId, async () => {
          const res = await api.get(`/drive/download/${driveId}`, { responseType: 'blob' });
          return new Blob([res.data], { type: String(res.headers['content-type'] ?? 'application/octet-stream') });
        });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (err: any) {
        toast.error('Failed to open: ' + (err?.message || 'unknown'));
      }
      return;
    }
    setViewerFile(msg);
  }, []);
  const handleCloseViewer = useCallback(() => {
    setViewerFile(null);
    setViewerResolved(null);
    setViewerOpening(false);
    if (viewerBlobUrlRef.current) {
      URL.revokeObjectURL(viewerBlobUrlRef.current);
      viewerBlobUrlRef.current = null;
    }
  }, []);

  // Resolve authenticated blob URL for the Photos-style viewer
  useEffect(() => {
    if (!viewerFile) {
      setViewerResolved(null);
      setViewerOpening(false);
      return;
    }
    const kind = mediaKindOf(viewerFile.fileName);
    if (!kind) {
      setViewerFile(null);
      return;
    }
    let cancelled = false;
    const driveId = driveIdFromUrl(viewerFile.fileUrl) || viewerFile.id;
    setViewerOpening(true);
    getCachedBlob(driveId, async () => {
      const res = await api.get(`/drive/download/${driveId}`, { responseType: 'blob' });
      return new Blob([res.data], { type: String(res.headers['content-type'] ?? 'application/octet-stream') });
    })
      .then((blob) => {
        if (cancelled) return;
        if (viewerBlobUrlRef.current) URL.revokeObjectURL(viewerBlobUrlRef.current);
        const url = URL.createObjectURL(blob);
        viewerBlobUrlRef.current = url;
        setViewerResolved({
          id: viewerFile.id,
          fileName: viewerFile.fileName || 'file',
          url,
          kind,
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        toast.error('Failed to load: ' + (err?.message || 'unknown'));
        setViewerFile(null);
        setViewerResolved(null);
      })
      .finally(() => {
        if (!cancelled) setViewerOpening(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewerFile]);
  const handleDeleteDoc = useCallback((id: string) => {
    setChats(prev => {
      const map = new Map(prev);
      for (const [key, chat] of map) {
        const filtered = chat.messages.filter(m => m.id !== id);
        if (filtered.length !== chat.messages.length) map.set(key, { ...chat, messages: filtered, newCount: filtered.length });
      }
      return map;
    });
    try { const key = `cc-drive-files:${useAuthStore.getState().user?.workspaceId || ''}`; const cached = localStorage.getItem(key); if (cached) localStorage.setItem(key, JSON.stringify(JSON.parse(cached).filter((m: any) => m.id !== id))); } catch {}
  }, []);

  const toggleDocSelection = useCallback((msg: Message) => {
    setSelectedDocs(prev => {
      const next = new Map(prev);
      if (next.has(msg.id)) next.delete(msg.id);
      else next.set(msg.id, msg);
      return next;
    });
  }, []);

  const clearSelection = () => {
    setSelectedDocs(new Map());
  };

  const selectIdDocs = () => {
    const ID_TAGS = ['Aadhaar','PAN','Passport','Voter ID','Driving License','Ration Card','Ayushman','10th Marksheet','12th Marksheet','Graduation','Post-Grad','Admit Card','Certificate','Bank'];
    const msgs = (selectedChat ? chats.get(selectedChat)?.messages : null) || [];
    const next = new Map<string, Message>();
    let n = 0;
    for (const m of msgs) {
      if (!m.fileName) continue;
      const tag = m.tag || docCategory(m.fileName)?.category;
      if (tag && ID_TAGS.includes(tag)) { next.set(m.id, m); n++; }
    }
    setSelectedDocs(next);
    if (n === 0) toast.info('No ID documents detected yet — tick boxes manually');
    else toast.success(`Selected ${n} ID document${n === 1 ? '' : 's'}`);
  };

  const startBuildProfile = async () => {
    const blocked = Array.from(selectedDocs.values()).filter(docNeedsTypeTag);
    if (blocked.length > 0) {
      const names = blocked
        .slice(0, 3)
        .map((d) => displayName(d.fileName || 'file'))
        .join(', ');
      const more = blocked.length > 3 ? ` +${blocked.length - 3} more` : '';
      toast.error(
        blocked.length === 1
          ? `Tag “${names}” first, then Build Profile`
          : `Tag ${blocked.length} docs first (${names}${more})`,
      );
      const first = blocked[0];
      if (first) setTypePickerFile(first);
      return;
    }
    setShowPicker(true);
  };

  const onPickerConfirm = async (personId: string) => {
    setShowPicker(false);
    targetPersonIdRef.current = personId;
    setTargetPersonId(personId);
    setExtracting(true);
    setExtractError('');
    try {
      // Multi-document extraction — call extract per doc, merge results
      const docs = Array.from(selectedDocs.values()).filter(d => d.fileName && !['mp4','3gp','mov','avi','webm','mp3','ogg','wav'].includes(d.fileName.split('.').pop()?.toLowerCase() || ''));
      console.log('[Extract] selectedDocs size:', selectedDocs.size, 'filtered docs:', docs.length, docs.map(d => ({id:d.id, name:d.fileName})));
      if (docs.length === 0) { setExtractError('No images or PDFs in selection'); setExtracting(false); return; }
      // Run extractions in parallel for speed
      // Extract one-by-one (sequential) for accuracy — parallel calls hit Groq rate
      // limits and degrade quality. Most docs are already cached by auto-extract on
      // arrival, so this stays fast (cache hits return instantly).
      const results: any[] = [];
      for (const d of docs) {
        try {
          const r = await api.post('/process/extract', { fileId: d.id });
          results.push({ doc: d, result: r.data });
        } catch (e: any) {
          results.push({ doc: d, result: { error: e.message } });
        }
      }
      // Priority-based merge: each field has a "best source" priority by doc type.
      // Higher priority document types overwrite lower for the same field.
      const TYPE_PRIORITY: Record<string, number> = {
        aadhaar: 100, pan: 95, passport: 95, voter_id: 90, driving_license: 90,
        marksheet_postgrad: 85, marksheet_graduation: 85, marksheet_12th: 80, marksheet_10th: 75,
        admit_card: 70, certificate: 65, bank_passbook: 60, ration_card: 55,
        result: 50, form: 40, other: 20, photo: 10, signature: 10,
      };
      // Field-specific priority overrides (e.g., name from Aadhaar > name from admit card)
      const FIELD_PREFERRED_TYPE: Record<string, string[]> = {
        // Identity fields prefer Aadhaar/PAN/Passport
        name: ['aadhaar', 'pan', 'passport', 'voter_id', 'driving_license'],
        father_name: ['aadhaar', 'pan'],
        dob: ['aadhaar', 'passport', 'pan'],
        gender: ['aadhaar', 'passport'],
        address: ['aadhaar', 'voter_id', 'passport'],
        permanent_address: ['aadhaar', 'voter_id', 'passport'],
        // Marksheet fields prefer their specific marksheet type
        passing_year_10th: ['marksheet_10th'],
        marks_10th: ['marksheet_10th'],
        percentage_10th: ['marksheet_10th'],
        board_10th: ['marksheet_10th'],
        passing_year_12th: ['marksheet_12th'],
        marks_12th: ['marksheet_12th'],
        percentage_12th: ['marksheet_12th'],
        board_12th: ['marksheet_12th'],
        // Exam fields prefer admit card
        roll_number: ['admit_card', 'marksheet_10th', 'marksheet_12th', 'marksheet_graduation'],
        registration_number: ['admit_card'],
        exam_name: ['admit_card'],
        exam_date: ['admit_card'],
        exam_center: ['admit_card'],
        application_number: ['admit_card', 'form'],
      };

      const merged: Record<string, any> = {};
      const errors: string[] = [];

      for (const r of results) {
        if (!r) continue;
        if (r.result?.error) {
          errors.push(r.doc.fileName + ': ' + (r.result.message || r.result.error));
          continue;
        }
        if (!r.result?.suggested) continue;
        if (r.result.needsType || r.result.suggested.needs_type || r.result.suggested.document_type?.needsReview) {
          errors.push(r.doc.fileName + ': needs document type — use the Tag button to set it before Build Profile');
          continue;
        }
        const docType = r.result.suggested.document_type?.value || 'other';
        const docPriority = TYPE_PRIORITY[docType] || 30;

        for (const [k, v] of Object.entries(r.result.suggested)) {
          if (k === 'document_type') continue;  // skip the type marker itself
          const fieldInfo = v as any;
          if (!fieldInfo.value || !String(fieldInfo.value).trim()) continue;

          const existing = merged[k];

          // No existing value — accept it
          if (!existing) {
            merged[k] = { ...fieldInfo, documentId: r.doc.id, sourceDocType: docType, _priority: docPriority };
            continue;
          }

          // Field has preferred doc types — check those first
          const preferred = FIELD_PREFERRED_TYPE[k];
          if (preferred) {
            const existingPreferredIdx = preferred.indexOf(existing.sourceDocType);
            const newPreferredIdx = preferred.indexOf(docType);
            if (newPreferredIdx !== -1 && (existingPreferredIdx === -1 || newPreferredIdx < existingPreferredIdx)) {
              merged[k] = { ...fieldInfo, documentId: r.doc.id, sourceDocType: docType, _priority: docPriority };
              continue;
            }
            if (existingPreferredIdx !== -1 && newPreferredIdx === -1) continue;  // existing wins
          }

          // Fall back to general type priority
          if (docPriority > (existing._priority || 0)) {
            merged[k] = { ...fieldInfo, documentId: r.doc.id, sourceDocType: docType, _priority: docPriority };
          }
        }
      }
      // Strip internal merge metadata before showing to operator
      Object.values(merged).forEach((v: any) => { delete v._priority; delete v.sourceDocType; });
      // Debug log so operator can inspect in browser devtools (F12)
      console.log('[Build Profile] Per-document results:', results.map((r: any) => ({
        file: r?.doc?.fileName,
        type: r?.result?.suggested?.document_type?.value,
        fields: r?.result?.suggested ? Object.keys(r.result.suggested) : null,
        error: r?.result?.error || r?.result?.message,
      })));
      console.log('[Build Profile] Merged fields:', Object.keys(merged), merged);
      // Remove document_type from saved fields (it's just a classification, not profile data)
      delete merged.document_type;
      if (Object.keys(merged).length === 0) {
        const errMsg = errors.length > 0
          ? errors.join('\n')
          : 'No extractable data found in selected documents. Make sure you selected actual ID/document images, not photos or screenshots.';
        setExtractError(errMsg);
        return;
      }
      setExtractedSuggestions(merged);
    } catch (e: any) {
      setExtractError(e.message || 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const onConfirmExtraction = async (acceptedFields: Record<string, any>, target?: ExtractSaveTarget) => {
    const defaultPid = targetPersonIdRef.current || targetPersonId;
    if (target?.chooseProfile && !target.chosenPersonId) {
      setExtractError('Select a profile from the list, or uncheck “Choose which profile…”');
      return;
    }
    const pid = target?.chooseProfile ? target.chosenPersonId! : defaultPid;
    console.log('[Save] personId:', pid, 'fields:', Object.keys(acceptedFields).length, 'chooseProfile:', !!target?.chooseProfile);
    if (!pid) { setExtractError('No target person — pick a person first'); return; }
    try {
      const phoneFromDocs = Array.from(selectedDocs.values()).map((d) => d.phone).find(Boolean)
        || selectedChat
        || '';
      const nameFromFields = acceptedFields?.name?.value || acceptedFields?.name || '';
      const r = await api.patch(`/customers/persons/${pid}`, {
        fields: acceptedFields,
        phone: phoneFromDocs,
        name: nameFromFields,
        createIfMissing: !target?.chooseProfile,
      }, { skipErrorToast: true } as any);
      if (r.data?.id) {
        targetPersonIdRef.current = r.data.id;
        setTargetPersonId(r.data.id);
      }
      setExtractedSuggestions(null);
      setTargetPersonId(null);
      clearSelection();
      if (target?.chooseProfile) {
        toast.success(`✅ Saved to ${target.chosenLabel || 'selected profile'}`);
      } else if (r.data?.created || r.data?.redirected) {
        toast.success(
          `✅ Saved to ${r.data?.name || 'new profile'}${r.data?.created ? ' (created — name did not match selected person)' : ' (matched existing person)'}.`,
        );
      } else {
        toast.success('✅ Profile updated! Open a govt form and use the extension to fill.');
      }
    } catch (e: any) {
      setExtractError(e.response?.data?.error || e.message || 'Save failed');
    }
  };

  const sortedChats = useMemo(() => Array.from(chats.values()).sort((a, b) => b.lastTime.localeCompare(a.lastTime)), [chats]);
  const filteredChats = useMemo(() => {
    let list = sortedChats;
    if (chatSearch.trim()) {
      const q = chatSearch.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    // Pinned chats first
    return [...list].sort((a, b) => {
      const ap = pinnedChats.has(a.phone) ? 1 : 0;
      const bp = pinnedChats.has(b.phone) ? 1 : 0;
      return bp - ap;
    });
  }, [sortedChats, chatSearch, pinnedChats]);
  const activeChat = selectedChat ? chats.get(selectedChat) : null;
  const untaggedSelected = useMemo(
    () => Array.from(selectedDocs.values()).filter(docNeedsTypeTag),
    [selectedDocs],
  );
  const viewerMessages = useMemo(
    () => (activeChat ? activeChat.messages.filter((m) => !!m.fileName && mediaKindOf(m.fileName)) : []),
    [activeChat],
  );
  const viewerIndex = viewerFile ? viewerMessages.findIndex((m) => m.id === viewerFile.id) : -1;
  const viewerStripItems: MediaViewerStripItem[] = useMemo(() => {
    const token = useAuthStore.getState().accessToken || '';
    return viewerMessages.map((m) => {
      const kind = mediaKindOf(m.fileName) || 'other';
      const driveId = driveIdFromUrl(m.fileUrl) || m.id;
      return {
        id: m.id,
        fileName: m.fileName || 'file',
        kind,
        thumbUrl:
          kind === 'image'
            ? `${API_URL}/drive/download/${driveId}?token=${encodeURIComponent(token)}`
            : undefined,
      };
    });
  }, [viewerMessages]);
  const handlePrevViewer = useCallback(() => {
    if (!viewerFile || !viewerMessages.length) return;
    const idx = viewerMessages.findIndex((msg) => msg.id === viewerFile.id);
    if (idx <= 0) return;
    setViewerFile(viewerMessages[idx - 1]);
  }, [viewerFile, viewerMessages]);
  const handleNextViewer = useCallback(() => {
    if (!viewerFile || !viewerMessages.length) return;
    const idx = viewerMessages.findIndex((msg) => msg.id === viewerFile.id);
    if (idx < 0 || idx >= viewerMessages.length - 1) return;
    setViewerFile(viewerMessages[idx + 1]);
  }, [viewerFile, viewerMessages]);
  const reversedMessages = useMemo(() => {
    if (!activeChat) return [];
    let msgs = [...activeChat.messages].reverse();
    if (msgSearch.trim()) {
      const q = msgSearch.toLowerCase();
      msgs = msgs.filter(m => m.fileName?.toLowerCase().includes(q) || m.text?.toLowerCase().includes(q));
    }
    return msgs;
  }, [activeChat, msgSearch]);

  // Auto-scroll on new messages if user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [reversedMessages.length]);

  useEffect(() => {
    if (connected !== null) trigger();
  }, [connected, trigger]);

  if (connected === null) {
    return (
      <div className="h-full flex items-center justify-center">
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'hsl(var(--whatsapp) / 0.25)', borderTopColor: 'hsl(var(--whatsapp))' }}
        />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center px-6" style={reveal(0)}>
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'hsl(var(--whatsapp) / 0.12)', boxShadow: 'var(--shadow-paper)' }}
        >
          <WhatsappLogo size={32} weight="fill" style={{ color: 'hsl(var(--whatsapp))' }} />
        </div>
        <h2 className="pt-display text-xl font-bold mb-2" style={{ color: 'hsl(var(--ink))' }}>Connect WhatsApp</h2>
        {useAuthStore.getState().user?.role === 'admin' ? (
          <>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: 'hsl(var(--pt-muted))' }}>
              Link your café WhatsApp to receive customer documents. Files sent to this number appear here automatically.
            </p>
            {qrCode && !qrExpired ? (
              <div className="bg-white p-4 rounded-2xl mb-4" style={{ boxShadow: 'var(--shadow-lift)', border: '1px solid hsl(var(--pt-border))' }}>
                <img src={qrCode.startsWith('data:') ? qrCode : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`} alt="QR" className="w-48 h-48" />
              </div>
            ) : qrExpired ? (
              <div className="relative bg-white p-4 rounded-2xl mb-4" style={{ boxShadow: 'var(--shadow-lift)', border: '1px solid hsl(var(--pt-border))' }}>
                <img src={qrCode?.startsWith('data:') ? qrCode : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode || '')}`} alt="QR expired" className="w-48 h-48 blur-sm" />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-xs font-medium mb-2" style={{ color: 'hsl(var(--ink))' }}>QR code expired</p>
                  <button
                    onClick={handleShowQR}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-full"
                    style={{ background: 'hsl(var(--whatsapp))' }}
                  >
                    <ArrowClockwise size={16} weight="bold" /> Refresh
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 mb-4">
                {reconnecting && (
                  <div
                    className="w-8 h-8 rounded-full border-2 animate-spin"
                    style={{ borderColor: 'hsl(var(--whatsapp) / 0.25)', borderTopColor: 'hsl(var(--whatsapp))' }}
                  />
                )}
                <button
                  onClick={handleShowQR}
                  className="px-6 py-2.5 text-sm font-semibold text-white rounded-full"
                  style={{ background: 'hsl(var(--whatsapp))', boxShadow: '0 8px 20px -8px hsl(var(--whatsapp) / 0.55)' }}
                >
                  {reconnecting ? 'Connecting…' : 'Connect WhatsApp'}
                </button>
              </div>
            )}
            <div className="text-xs mt-4 space-y-1.5 text-left rounded-xl px-4 py-3" style={{ color: 'hsl(var(--pt-muted))', background: 'hsl(var(--pt-secondary) / 0.7)', border: '1px solid hsl(var(--pt-border))' }}>
              <p>1. Open WhatsApp on your phone</p>
              <p>2. Go to Settings → Linked Devices</p>
              <p>3. Scan the QR code above</p>
            </div>
          </>
        ) : (
          <p className="text-sm pt-muted mb-2 max-w-xs">WhatsApp isn't connected for this workspace yet. Ask an admin to link it — customer documents will appear here once it's connected.</p>
        )}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex w-full min-w-0 overflow-hidden relative" style={{ background: 'hsl(var(--paper))', ...reveal(0) }}>
      {/* Inbox — always flex-col; hide on phone when a chat is open */}
      <div
        className={`w-full md:w-80 border-r flex flex-col min-h-0 ${selectedChat ? 'hidden md:flex' : 'flex'}`}
        style={{ borderColor: 'hsl(var(--pt-border))', background: 'hsl(var(--pt-card))' }}
      >
        <div
          className="px-4 py-3 border-b flex items-center gap-2.5 shrink-0"
          style={{ borderColor: 'hsl(var(--pt-border))', background: 'linear-gradient(180deg, hsl(142 40% 22%) 0%, hsl(142 45% 16%) 100%)' }}
        >
          <WhatsappLogo size={18} weight="fill" className="text-white/90 shrink-0" />
          <span className="text-sm font-semibold text-white tracking-tight">Documents</span>
          {reconnecting && <span className="text-[10px] text-amber-200/90">Reconnecting…</span>}
          <span className="text-[11px] text-white/55 ml-auto tabular-nums">{sortedChats.length}</span>
        </div>
        <div className="px-3 py-2.5 border-b" style={{ borderColor: 'hsl(var(--pt-border))', background: 'hsl(var(--paper) / 0.65)' }}>
          <input
            value={chatSearch}
            onChange={e => setChatSearch(e.target.value)}
            placeholder="Search customers…"
            className="input-field text-xs"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredChats.length === 0 ? (
            <div className="text-center py-12 px-4">
              <WhatsappLogo size={28} className="mx-auto mb-2" style={{ color: 'hsl(var(--pt-muted))' }} />
              <p className="text-xs" style={{ color: 'hsl(var(--pt-muted))' }}>
                {chatSearch ? 'No match' : 'No documents received yet'}
              </p>
            </div>
          ) : filteredChats.map(chat => (
            <ChatItem key={chat.phone} chat={chat} selected={selectedChat === chat.phone} onClick={handleSelectChat} unreadCount={unread.get(chat.phone) || 0} pinned={pinnedChats.has(chat.phone)} onPin={togglePin} />
          ))}
        </div>
      </div>

      {/* Conversation — full width on phone when a chat is open */}
      <div className={`flex-1 min-w-0 min-h-0 flex-col relative ${selectedChat ? 'flex' : 'hidden md:flex'}`}>
        {!activeChat ? (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center"
            style={{
              backgroundImage: 'radial-gradient(hsl(142 30% 40% / 0.06) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'hsl(var(--whatsapp) / 0.12)' }}
            >
              <WhatsappLogo size={28} weight="fill" style={{ color: 'hsl(var(--whatsapp))' }} />
            </div>
            <p className="pt-display text-base font-semibold" style={{ color: 'hsl(var(--ink))' }}>Select a customer</p>
            <p className="text-sm max-w-xs" style={{ color: 'hsl(var(--pt-muted))' }}>
              Open a chat to review documents, tag IDs, and build profiles.
            </p>
          </div>
        ) : (
          <>
            <div
              className="min-h-[3.25rem] px-2 sm:px-4 py-2 flex items-center gap-2 border-b shrink-0"
              style={{ borderColor: 'hsl(var(--pt-border))', background: 'hsl(var(--pt-card))', boxShadow: '0 1px 0 hsl(var(--pt-border) / 0.8)' }}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedChat(null);
                  deepPhoneAppliedRef.current = null;
                  if (searchParams.get('phone')) {
                    const next = new URLSearchParams(searchParams);
                    next.delete('phone');
                    navigate({ pathname: '/app/whatsapp', search: next.toString() ? `?${next}` : '' }, { replace: true });
                  }
                }}
                className="md:hidden -ml-0.5 flex items-center justify-center w-9 h-9 rounded-full shrink-0"
                style={{ color: 'hsl(var(--ink))', background: 'hsl(var(--pt-secondary))' }}
                aria-label="Back to inbox"
              >
                <CaretLeft size={18} weight="bold" />
              </button>
              <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-semibold text-sm overflow-hidden cursor-pointer shrink-0"
                style={{ background: 'hsl(var(--whatsapp) / 0.14)', color: 'hsl(142 64% 28%)' }}
                onClick={() => activeChat.dpUrl && setDpPreview(activeChat.dpUrl)}
              >
                {activeChat.dpUrl ? <img src={activeChat.dpUrl} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none'; }} alt="" /> : null}
                {!activeChat.dpUrl && (activeChat.name[0]?.toUpperCase() || '?')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--ink))' }}>{activeChat.name}</p>
                <p className="text-[11px] truncate" style={{ color: 'hsl(var(--pt-muted))' }}>
                  {formatPhoneDisplay(activeChat.phone)} · {activeChat.messages.length} doc{activeChat.messages.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="hidden sm:block">
                <input
                  value={msgSearch}
                  onChange={e => setMsgSearch(e.target.value)}
                  placeholder="Search…"
                  className="input-field w-28 text-xs py-1.5"
                />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <ActionBtn title="Request documents" accent onClick={() => { if (activeChat) requestDocs(activeChat.phone); }}>
                  <PaperPlaneTilt size={15} />
                </ActionBtn>
                <ActionBtn title="Profile" onClick={() => navigate(`/app/customers/${encodeURIComponent(activeChat.phone)}`)}>
                  <UserCircle size={15} />
                </ActionBtn>
                <span className="hidden sm:contents">
                  <ActionBtn title="Assign" onClick={() => { if (activeChat) assignChat(activeChat.phone, activeChat.name); }}>
                    <AddressBook size={15} />
                  </ActionBtn>
                  <ActionBtn title="Select ID documents" onClick={selectIdDocs}>
                    <CheckSquare size={15} />
                  </ActionBtn>
                </span>
              </div>
            </div>
            <div
              ref={msgContainerRef}
              onScroll={() => { const el = msgContainerRef.current; if (el) userScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 100; }}
              className="flex-1 overflow-y-auto p-4 space-y-3 pb-24"
              style={{
                backgroundColor: 'hsl(38 28% 93%)',
                backgroundImage: 'radial-gradient(hsl(142 25% 35% / 0.07) 1px, transparent 1px)',
                backgroundSize: '16px 16px',
              }}
            >
              {reversedMessages.map((msg, i) => {
                const msgDate = new Date(msg.timestamp).toLocaleDateString();
                const prevDate = i > 0 ? new Date(reversedMessages[i-1].timestamp).toLocaleDateString() : null;
                const showDate = msgDate !== prevDate;
                const today = new Date().toLocaleDateString();
                const yesterday = new Date(Date.now()-86400000).toLocaleDateString();
                const label = msgDate === today ? 'Today' : msgDate === yesterday ? 'Yesterday' : msgDate;
                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="text-center py-2">
                        <span
                          className="text-[10px] font-semibold px-3 py-1 rounded-full"
                          style={{ background: 'hsl(var(--pt-card) / 0.92)', color: 'hsl(var(--pt-muted))', border: '1px solid hsl(var(--pt-border))', boxShadow: 'var(--shadow-paper)' }}
                        >
                          {label}
                        </span>
                      </div>
                    )}
                    <MessageCard
                      msg={msg} onClick={handleOpenFile}
                      selected={selectedDocs.has(msg.id)}
                      selectUiActive={selectedDocs.size > 0}
                      onToggleSelect={toggleDocSelection}
                      onDelete={handleDeleteDoc}
                      onSetType={(m: Message) => setTypePickerFile(m)}
                    />
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {selectedDocs.size > 0 && (
              <div
                className="absolute left-1/2 -translate-x-1/2 px-3 sm:px-4 py-2.5 rounded-full flex items-center gap-1.5 sm:gap-2 z-20 max-w-[calc(100%-1rem)] sm:max-w-[95%]"
                style={{
                  bottom: 'max(1rem, env(safe-area-inset-bottom))',
                  background: untaggedSelected.length > 0
                    ? 'linear-gradient(180deg, hsl(28 90% 42%) 0%, hsl(22 85% 34%) 100%)'
                    : 'var(--gradient-marigold)',
                  boxShadow: untaggedSelected.length > 0
                    ? '0 12px 32px -10px hsl(28 90% 40% / 0.55)'
                    : '0 12px 32px -10px hsl(var(--marigold) / 0.55)',
                }}
              >
                <span className="text-sm font-semibold text-white whitespace-nowrap">
                  {selectedDocs.size} selected
                  {untaggedSelected.length > 0 ? ` · ${untaggedSelected.length} need tag` : ''}
                </span>
                {untaggedSelected.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const first = untaggedSelected[0];
                      if (first) setTypePickerFile(first);
                      toast.info(
                        untaggedSelected.length === 1
                          ? 'Set the document type, then Build Profile'
                          : `Tag ${untaggedSelected.length} docs, then Build Profile`,
                      );
                    }}
                    className="px-3 py-1.5 bg-white rounded-full text-xs font-bold hover:bg-white/95 inline-flex items-center gap-1"
                    style={{ color: 'hsl(22 85% 32%)' }}
                  >
                    <Tag size={13} weight="bold" /> Tag first
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startBuildProfile}
                    className="px-3 py-1.5 bg-white rounded-full text-xs font-bold hover:bg-white/95"
                    style={{ color: 'hsl(var(--ink))' }}
                  >
                    Build Profile
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-2.5 py-1.5 text-white/90 rounded-full text-xs font-semibold hover:bg-white/15"
                  title="Clear selection"
                >
                  Clear
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Customer Picker Modal */}
      {showPicker && (
        <CustomerPicker
          onCancel={() => setShowPicker(false)}
          onConfirm={onPickerConfirm}
          docCount={selectedDocs.size}
        />
      )}

      {/* Extracting overlay */}
      {extracting && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center">
          <div className="rounded-2xl p-6 text-center" style={{ background: 'hsl(var(--pt-card))', border: '1px solid hsl(var(--pt-border))', boxShadow: 'var(--shadow-lift)' }}>
            <div
              className="w-8 h-8 rounded-full border-2 animate-spin mx-auto mb-3"
              style={{ borderColor: 'hsl(var(--marigold) / 0.25)', borderTopColor: 'hsl(var(--marigold))' }}
            />
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--ink))' }}>
              Extracting from {selectedDocs.size} document{selectedDocs.size !== 1 ? 's' : ''}…
            </p>
          </div>
        </div>
      )}

      {/* Extraction error */}
      {extractError && !extracting && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center" onClick={() => setExtractError('')}>
          <div className="rounded-2xl p-6 max-w-sm" style={{ background: 'hsl(var(--pt-card))', border: '1px solid hsl(0 70% 50% / 0.25)', boxShadow: 'var(--shadow-lift)' }}>
            <p className="text-sm font-semibold mb-2" style={{ color: 'hsl(0 65% 42%)' }}>Extraction failed</p>
            <p className="text-xs" style={{ color: 'hsl(var(--pt-muted))' }}>{extractError}</p>
          </div>
        </div>
      )}

      {/* Extraction confirm modal */}
      {extractedSuggestions && (
        <ExtractionConfirmModal
          suggestions={extractedSuggestions}
          phone={
            Array.from(selectedDocs.values()).map((d) => d.phone).find(Boolean)
            || selectedChat
            || undefined
          }
          onCancel={() => { setExtractedSuggestions(null); setTargetPersonId(null); }}
          onConfirm={onConfirmExtraction}
        />
      )}

      {/* DP preview */}
      {dpPreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setDpPreview(null)}>
          <img src={dpPreview} className="max-w-[80vw] max-h-[80vh] rounded-xl shadow-2xl object-contain" alt="Profile picture" />
        </div>
      )}

      <MediaViewer
        file={viewerResolved}
        items={viewerStripItems}
        index={viewerIndex}
        opening={!!viewerFile && (!viewerResolved || viewerOpening)}
        onClose={handleCloseViewer}
        onPrev={handlePrevViewer}
        onNext={handleNextViewer}
        onSelectItem={(id) => {
          const msg = viewerMessages.find((m) => m.id === id);
          if (msg) setViewerFile(msg);
        }}
        onPrint={() => {
          const driveId = driveIdFromUrl(viewerFile?.fileUrl) || viewerFile?.id;
          if (!driveId) return;
          void getCachedBlob(driveId, async () => {
            const res = await api.get(`/drive/download/${driveId}`, { responseType: 'blob' });
            return new Blob([res.data], { type: String(res.headers['content-type'] ?? 'application/pdf') });
          }).then((blob) => {
            printBlob(blob);
          }).catch((err) => {
            toast.error('Failed to load: ' + (err.message || 'unknown'));
          });
        }}
        onOpenInPhotoEditor={() => {
          const driveId = driveIdFromUrl(viewerFile?.fileUrl) || viewerFile?.id;
          if (!driveId || !viewerFile) return;
          navigate(photoEditorPath(driveId, viewerFile));
        }}
        onDownload={() => {
          const driveId = driveIdFromUrl(viewerFile?.fileUrl) || viewerFile?.id;
          if (!driveId || !viewerFile) return;
          void getCachedBlob(driveId, async () => {
            const res = await api.get(`/drive/download/${driveId}`, { responseType: 'blob' });
            return new Blob([res.data], { type: String(res.headers['content-type'] ?? 'application/octet-stream') });
          }).then((blob) => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = viewerFile.fileName || 'file';
            a.click();
          }).catch((err) => {
            toast.error('Download failed: ' + (err.message || 'unknown'));
          });
        }}
        onDelete={() => {
          if (!viewerFile) return;
          const id = viewerFile.id;
          api.delete('/drive/files/' + id).then(() => {
            handleDeleteDoc(id);
            handleCloseViewer();
          }).catch((err: any) => {
            toast.error(err?.response?.data?.error || err?.message || 'Delete failed');
          });
        }}
        showDelete={!!viewerFile}
        showPrint
        showPhotoEditor
      />
      {typePickerFile && (
        <DocTypePickerModal
          fileId={typePickerFile.id}
          onClose={() => setTypePickerFile(null)}
          onDone={(tag) => {
            const fileId = typePickerFile.id;
            const apply = (m: Message) =>
              m.id === fileId ? { ...m, tag, needsType: false } : m;
            setChats((prev) => {
              const next = new Map(prev);
              for (const [phone, chat] of next) {
                next.set(phone, { ...chat, messages: chat.messages.map(apply) });
              }
              return next;
            });
            // Keep selection in sync so Build Profile unlocks after Tag (was stuck on stale needsType).
            setSelectedDocs((prev) => {
              if (!prev.has(fileId)) return prev;
              const next = new Map(prev);
              const cur = next.get(fileId)!;
              next.set(fileId, { ...cur, tag, needsType: false });
              return next;
            });
            setTypePickerFile(null);
          }}
        />
      )}
    </div>
  );
}

function CustomerPicker({ onCancel, onConfirm, docCount }: { onCancel: () => void; onConfirm: (personId: string) => void; docCount: number }) {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ phone: '', name: '', relationship: 'self' });

  useEffect(() => { api.get('/customers/households').then(r => setHouseholds(r.data)); }, []);

  const handleCreatePerson = async (phone: string, name: string, relationship: string) => {
    const r = await api.post('/customers/persons', { phone, name, displayLabel: name, relationship });
    return r.data.id;
  };

  const handleQuickCreate = async () => {
    if (!form.phone || !form.name) return;
    const id = await handleCreatePerson(form.phone, form.name, form.relationship);
    onConfirm(id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={onCancel}>
      <div
        onClick={e => e.stopPropagation()}
        className="rounded-2xl p-5 max-w-md w-full max-h-[80vh] overflow-y-auto"
        style={{ background: 'hsl(var(--pt-card))', border: '1px solid hsl(var(--pt-border))', boxShadow: 'var(--shadow-lift)' }}
      >
        <h3 className="pt-display text-base font-bold mb-1" style={{ color: 'hsl(var(--ink))' }}>
          Build profile from {docCount} document{docCount !== 1 ? 's' : ''}
        </h3>
        <p className="text-xs mb-4" style={{ color: 'hsl(var(--pt-muted))' }}>Select an existing person, or create a new one</p>

        {!showCreate ? (
          <>
            <div className="space-y-3 mb-4">
              {households.map(h => (
                <div key={h.phone}>
                  <p className="pt-label text-[10px] mb-1.5 px-1" style={{ color: 'hsl(var(--pt-muted))' }}>{h.phone}</p>
                  <div className="space-y-1">
                    {h.persons.map(p => (
                      <button
                        key={p.id}
                        onClick={() => onConfirm(p.id)}
                        className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2.5 transition-colors"
                        style={{ background: 'hsl(var(--pt-secondary) / 0.65)', border: '1px solid hsl(var(--pt-border))' }}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: 'hsl(var(--marigold) / 0.16)', color: 'hsl(var(--marigold-deep))' }}
                        >
                          {p.name?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--ink))' }}>{p.displayLabel || p.name}</div>
                          <div className="text-[10px] capitalize" style={{ color: 'hsl(var(--pt-muted))' }}>{p.relationship}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setShowCreate(true)} className="w-full btn-primary text-sm">+ Create New Person</button>
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] uppercase tracking-wide" style={{ color: 'hsl(var(--pt-muted))' }}>Phone</label>
              <input
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="9823745234"
                className="input-field mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide" style={{ color: 'hsl(var(--pt-muted))' }}>Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field mt-1" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide" style={{ color: 'hsl(var(--pt-muted))' }}>Relationship</label>
              <select value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value })} className="input-field mt-1">
                <option value="self">Self</option>
                <option value="spouse">Spouse</option>
                <option value="parent">Parent</option>
                <option value="child">Child</option>
                <option value="sibling">Sibling</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleQuickCreate}
                disabled={!form.phone || !form.name}
                className="flex-1 btn-primary text-sm disabled:opacity-50"
              >
                Create & Use
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary text-sm">Back</button>
            </div>
          </div>
        )}

        <button onClick={onCancel} className="w-full mt-3 text-xs font-medium" style={{ color: 'hsl(var(--pt-muted))' }}>Cancel</button>
      </div>
    </div>
  );
}

function ExtractionConfirmModal({
  suggestions,
  phone,
  onCancel,
  onConfirm,
}: {
  suggestions: Record<string, any>;
  phone?: string;
  onCancel: () => void;
  onConfirm: (fields: Record<string, any>, target?: ExtractSaveTarget) => void;
}) {
  const [accepted, setAccepted] = useState<Record<string, any>>({ ...suggestions });
  const [target, setTarget] = useState<ExtractSaveTarget>({
    chooseProfile: false,
    chosenPersonId: null,
    chosenLabel: null,
  });

  const toggle = (key: string) => {
    setAccepted((prev: any) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = suggestions[key];
      return next;
    });
  };
  const updateValue = (key: string, value: string) => {
    setAccepted((prev: any) => ({ ...prev, [key]: { ...prev[key], value, source: 'document_corrected' } }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} className="bg-[var(--card)] border border-blue-500/30 rounded-xl p-5 max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <p className="text-sm font-medium text-blue-400 mb-3">Review extracted fields</p>
        <p className="text-xs text-gray-500 mb-3">Uncheck fields to skip. Edit values inline. Confirm to save with provenance.</p>
        <ExtractProfileTarget
          value={target}
          onChange={setTarget}
          phone={phone}
          hint="Only family members on this phone — pick who these details belong to (e.g. bank passbook with no name)."
        />
        <div className="space-y-2 mb-4">
          {Object.entries(suggestions).map(([k, v]: [string, any]) => (
            <div key={k} className="flex items-center gap-2">
              <input type="checkbox" checked={!!accepted[k]} onChange={() => toggle(k)} className="accent-blue-500" />
              <span className="text-xs text-gray-400 w-24 capitalize shrink-0">{k.replace(/_/g, ' ')}</span>
              <input
                value={accepted[k]?.value || v.value || ''}
                onChange={e => updateValue(k, e.target.value)}
                disabled={!accepted[k]}
                className="flex-1 px-2 py-1 bg-[var(--secondary)] border border-[var(--border)] rounded text-xs text-white outline-none disabled:opacity-50" />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onConfirm(accepted, target)}
            disabled={target.chooseProfile && !target.chosenPersonId}
            className="flex-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded disabled:opacity-50"
          >
            Confirm & Save
          </button>
          <button onClick={onCancel} className="px-3 py-1.5 bg-white/5 text-gray-400 text-sm rounded">Cancel</button>
        </div>
      </div>
    </div>
  );
}

