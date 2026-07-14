import { useEffect, useState, useRef, memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client'; // v2
import api, { SOCKET_URL } from '../../shared/api';
import { toast } from '../../shared/toast';
import { getCachedBlob, printBlob } from '../../shared/fileCache';
import { useAuthStore } from '../auth/store';
import { Printer, Camera, X, WhatsappLogo } from '@phosphor-icons/react';

interface Message {
  id: string; phone: string; name: string; fileName?: string; text?: string;
  fileUrl?: string; timestamp: string; type?: string; dpUrl?: string; tag?: string;
}
interface Chat { phone: string; name: string; lastTime: string; messages: Message[]; newCount: number; dpUrl?: string; }

interface Person { id: string; name: string; displayLabel: string; relationship: string; }
interface Household { phone: string; persons: Person[]; person_count: string; }

function docCategory(fileName: string): { category: string; color: string } | null {
  const name = fileName.toLowerCase();
  if (/aadh|aadhaar|adhar|uid/i.test(name)) return { category: 'Aadhaar', color: 'bg-orange-500/20 text-orange-400' };
  if (/pan[\s_-]?card|pan[\s_.]|pancard/i.test(name)) return { category: 'PAN', color: 'bg-blue-500/20 text-blue-400' };
  if (/passport|pport/i.test(name)) return { category: 'Passport', color: 'bg-purple-500/20 text-purple-400' };
  if (/mark\s?sheet|result|10th|12th|matric|inter|hsc|ssc/i.test(name)) return { category: 'Marksheet', color: 'bg-green-500/20 text-green-400' };
  if (/degree|graduat|diploma|certif/i.test(name)) return { category: 'Certificate', color: 'bg-blue-500/20 text-blue-400' };
  if (/photo|passport.?size|selfie|dp|pic/i.test(name)) return { category: 'Photo', color: 'bg-pink-500/20 text-pink-400' };
  if (/voter|epic|election/i.test(name)) return { category: 'Voter ID', color: 'bg-yellow-500/20 text-yellow-400' };
  if (/driv.*lic|dl[\s_.-]/i.test(name)) return { category: 'Driving License', color: 'bg-red-500/20 text-red-400' };
  if (/ration|bpl|apl/i.test(name)) return { category: 'Ration Card', color: 'bg-amber-500/20 text-amber-400' };
  if (/caste|obc|sc[\s_]|st[\s_]|category/i.test(name)) return { category: 'Caste Cert', color: 'bg-indigo-500/20 text-indigo-400' };
  if (/income|salary|itr/i.test(name)) return { category: 'Income', color: 'bg-emerald-500/20 text-green-400' };
  if (/domicile|residen/i.test(name)) return { category: 'Domicile', color: 'bg-cyan-500/20 text-cyan-400' };
  if (/bank|passbook|cheque|ifsc/i.test(name)) return { category: 'Bank', color: 'bg-sky-500/20 text-sky-400' };
  if (/sign|signature/i.test(name)) return { category: 'Signature', color: 'bg-violet-500/20 text-violet-400' };
  return null;
}

function docTitle(fileName: string): { title: string; badge: string; icon: string } {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) return { title: 'Photo', badge: 'IMG', icon: 'ðŸ–¼ï¸' };
  if (['mp4','3gp','mov','avi','webm'].includes(ext)) return { title: 'Video', badge: 'VID', icon: 'ðŸŽ¬' };
  if (ext === 'pdf') return { title: 'PDF Document', badge: 'PDF', icon: 'ðŸ“•' };
  if (['mp3','ogg','wav','aac','opus'].includes(ext)) return { title: 'Audio', badge: 'AUD', icon: 'ðŸŽµ' };
  return { title: 'Document', badge: ext.toUpperCase() || 'FILE', icon: 'ðŸ“„' };
}

function timeAgo(ts: string): string {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return new Date(ts).toLocaleDateString();
}

const LazyThumbnail = memo(({ src, ext, alt }: { src?: string; ext: string; alt?: string }) => {
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
  const isImage = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
  const isVideo = ['mp4','3gp','mov','avi','webm'].includes(ext);
  const isPdf = ext === 'pdf';
  const hasThumbnail = isImage || isVideo || isPdf;
  const { icon, badge } = docTitle(alt || ('file.' + ext));
  return (
    <div ref={ref} className="w-[120px] h-[120px] rounded-xl bg-white/5 relative overflow-hidden flex items-center justify-center">
      {visible && src && hasThumbnail && !imgError ? (
        <>
          <img src={src} className="w-full h-full object-cover" loading="lazy" alt={alt}
            onError={() => setImgError(true)} />
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-2xl">{isVideo ? 'ðŸŽ¬' : icon}</span>
          <span className="text-[8px] px-1 py-0.5 rounded bg-white/10 text-gray-400 font-bold">{badge}</span>
        </div>
      )}
      {isVideo && visible && src && !imgError && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white text-[10px]">â–¶</span>
        </span>
      )}
    </div>
  );
});

const MessageCard = memo(({ msg, onClick, selectionMode, selected, onToggleSelect, onDelete }: any) => {
  const ext = msg.fileName?.split('.').pop()?.toLowerCase() || '';
  const thumbUrl = msg.fileUrl?.includes('uc?export=view') ? msg.fileUrl.replace('uc?export=view&id=','thumbnail?id=')+'&sz=w600' : (msg.fileUrl?.replace('sz=w200','sz=w600') || msg.fileUrl);
  const { title, badge } = docTitle(msg.fileName || '');
  const ID_TAGS = ['Aadhaar','PAN','Passport','Voter ID','Driving License','Ration Card','10th Marksheet','12th Marksheet','Graduation','Post-Grad','Admit Card','Certificate','Bank'];
  const isJunkTag = msg.tag && !ID_TAGS.includes(msg.tag); // Photo / Other / Signature / Form
  const category = msg.tag
    ? { category: msg.tag, color: isJunkTag ? 'bg-white/10 text-gray-500' : 'bg-green-500/15 text-green-400' }
    : docCategory(msg.fileName || '');

  if (msg.text && !msg.fileName) return (
    <div className="bg-[var(--secondary)] rounded-lg px-3 py-2 max-w-[80%]">
      <p className="text-sm text-gray-300">{msg.text}</p>
      <p className="text-[10px] text-gray-600 mt-1">{timeAgo(msg.timestamp)}</p>
    </div>
  );

  return (
    <div className={`rounded-lg p-3 flex gap-3 max-w-[480px] transition group ${selected ? 'border border-blue-500/40 bg-blue-500/5' : 'border border-transparent hover:bg-white/[0.02]'}`} style={{ background: selected ? undefined : 'var(--card)' }}>
      {selectionMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(msg)}
          className="w-4 h-4 self-center accent-blue-500 cursor-pointer"
        />
      )}
      <div onClick={() => selectionMode ? onToggleSelect(msg) : onClick(msg)} className="shrink-0 cursor-pointer">
        <LazyThumbnail src={thumbUrl} ext={ext} alt={title} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{badge} Â· {timeAgo(msg.timestamp)}{category && <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-medium ${category.color}`}>{category.category}</span>}</p>
        </div>
        {!selectionMode && (
          <div className="flex flex-wrap gap-2 mt-2 opacity-0 group-hover:opacity-100 transition">
            <button onClick={() => onClick(msg)} className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-blue-400 hover:bg-white/[0.06]">Open</button>
            <button onClick={(e) => { e.stopPropagation(); const cats = ['Aadhaar','PAN','Passport','Marksheet','Photo','Voter ID','Driving License','Caste Cert','Income','Bank','Signature','Other']; const pick = prompt('Tag this document:\\n' + cats.map((c,i)=>(i+1)+'. '+c).join('\\n') + '\\n\\nEnter number:'); if(pick){const tag=cats[parseInt(pick)-1]; if(tag){ api.patch('/drive/files/'+msg.id+'/tag',{tag}).then(()=>{msg.tag=tag;toast.success(tag)}).catch(()=>toast.error('Failed'));}} }} className="text-[10px] px-2 py-0.5 rounded-md bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30">Tag</button>
            <button onClick={(e) => { e.stopPropagation(); const driveId = msg.fileUrl?.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1]; if (!driveId) return; getCachedBlob(driveId, async () => { const res = await api.get(`/drive/download/${driveId}`, {responseType:'blob'}); return new Blob([res.data], {type: String(res.headers['content-type'] ?? 'application/pdf')}); }).then(blob => { printBlob(blob); }).catch((err) => { toast.error('Failed to load file: ' + (err.message || 'unknown')); }); }} className="text-[10px] px-2 py-0.5 rounded-md bg-green-600/20 text-green-400 hover:bg-green-600/30">Print</button>
            <button onClick={(e) => { e.stopPropagation(); const driveId = msg.fileUrl?.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1]; if (!driveId) return; window.open('/app/photo?fileId=' + driveId, '_blank'); }} className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30">Photo Tool</button>
            <button onClick={(e) => { e.stopPropagation(); const driveId = msg.fileUrl?.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1]; if (!driveId) return; getCachedBlob(driveId, async () => { const res = await api.get(`/drive/download/${driveId}`, {responseType:'blob'}); return new Blob([res.data], {type: String(res.headers['content-type'] ?? 'application/octet-stream')}); }).then(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = msg.fileName || 'file'; a.click(); }); }} className="text-[10px] px-2 py-0.5 rounded-md bg-purple-600/20 text-purple-400 hover:bg-purple-600/30">Download</button>
            <button onClick={(e) => { e.stopPropagation(); if (!confirm('Delete this document? This cannot be undone.')) return; api.delete('/drive/files/' + msg.id).then(() => { onDelete(msg.id); toast.success('Document deleted'); }).catch(() => toast.error('Failed to delete')); }} className="text-[10px] px-2 py-0.5 rounded-md bg-red-600/20 text-red-400 hover:bg-red-600/30">Delete</button>
          </div>
        )}
      </div>
    </div>
  );
});

const ChatItem = memo(({ chat, selected, onClick, unreadCount, pinned, onPin }: any) => (
  <div onClick={() => onClick(chat.phone)}
    className={`px-3 py-3 border-b cursor-pointer transition-colors hover:bg-white/[0.03] ${selected ? 'bg-blue-500/5' : ''}`} style={{ borderColor: 'var(--border)' }}>
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-md bg-blue-500/10 flex items-center justify-center text-blue-400 text-xs font-semibold shrink-0 overflow-hidden">
        {chat.dpUrl ? <img src={chat.dpUrl} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display='none')} /> : null}
        {!chat.dpUrl && (chat.name[0]?.toUpperCase() || '?')}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium truncate">{chat.name} {pinned && <span className="text-[9px] text-gray-500">ðŸ“Œ</span>}</p>
        <p className="text-[11px] text-gray-500">{/^\d{10,13}$/.test(chat.phone) ? `+${chat.phone.slice(0,2)} ${chat.phone.slice(2,7)} ${chat.phone.slice(7)}` : ''} Â· {chat.newCount} doc{chat.newCount !== 1 ? 's' : ''}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] text-gray-600">{timeAgo(chat.lastTime)}</span>
        {unreadCount > 0 && <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold">{unreadCount}</span>}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onPin(chat.phone); }} className="text-gray-600 hover:text-white text-xs opacity-0 group-hover:opacity-100" title={pinned ? 'Unpin' : 'Pin'}>ðŸ“Œ</button>
    </div>
  </div>
));

export default function WhatsApp() {
  const navigate = useNavigate();
  const [connected, setConnected] = useState<boolean | null>(() => {
    const cached = localStorage.getItem('cc-wa-connected');
    return cached !== null ? cached === 'true' : null;
  });
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [chats, setChats] = useState<Map<string, Chat>>(new Map());
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [viewerFile, setViewerFile] = useState<Message | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<Map<string, Message>>(new Map());
  const [showPicker, setShowPicker] = useState(false);
  const [unread, setUnread] = useState<Map<string, number>>(new Map());
  const [chatSearch, setChatSearch] = useState('');
  const [pinnedChats, setPinnedChats] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cc-pinned-chats') || '[]')); } catch { return new Set(); }
  });
  const [msgSearch, setMsgSearch] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractedSuggestions, setExtractedSuggestions] = useState<any | null>(null);
  const [targetPersonId, setTargetPersonId] = useState<string | null>(null);
  const targetPersonIdRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const msgContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  useEffect(() => {
    api.get('/whatsapp/status').then(r => {
      if (r.data.connected) {
        setConnected(true);
        localStorage.setItem('cc-wa-connected', 'true');
      } else if (localStorage.getItem('cc-wa-connected') !== 'true') {
        setConnected(false);
        localStorage.setItem('cc-wa-connected', 'false');
        localStorage.removeItem('cc-drive-files');
      }
      // Auto-start session if none exists
      if (r.data.status === 'none' || (!r.data.connected && !r.data.qr)) {
        api.post('/whatsapp/connect').catch(() => {});
      }
      if (r.data.qr) setQrCode(r.data.qr);
    }).catch(() => {});
    // Load cached data instantly, then refresh from server
    const cached = localStorage.getIteóß4¶‰žËkºwµç@€€€€€ñ‘¥ØÉ•˜õíµÍ½¹Ñ…¥¹•ÉI•™ô½¹MÉ½±°õì ¤€ôøì½¹ÍÐ•°€ôµÍ½¹Ñ…¥¹•ÉI•˜¹ÕÉÉ•¹Ðì¥˜€¡•°¤ÕÍ•ÉMÉ½±±•‘UÁI•˜¹ÕÉÉ•¹Ð€ô•°¹ÍÉ½±±!•¥¡Ð€´•°¹ÍÉ½±±Q½À€´•°¹±¥•¹Ñ!•¥¡Ð€ø€ÄÀÀìõô±…ÍÍ9…µ”ô‰™±•à´Ä½Ù•É™±½Üµäµ…ÕÑ¼À´ÐÍÁ…”µä´ÈÁˆ´ÈÀˆø4(€€€€€€€€€€€€€íÉ•Ù•ÉÍ•‘5•ÍÍ…•Ì¹µ…À ¡µÍœ°¤¤€ôøì4(€€€€€€€€€€€€€€€½¹ÍÐµÍ…Ñ”€ô¹•Ü…Ñ”¡µÍœ¹Ñ¥µ•ÍÑ…µÀ¤¹Ñ½1½…±•…Ñ•MÑÉ¥¹œ ¤ì4(€€€€€€€€€€€€€€€½¹ÍÐÁÉ•Ù…Ñ”€ô¤€ø€À€ü¹•Ü…Ñ”¡É•Ù•ÉÍ•‘5•ÍÍ…•Ím¤´Åt¹Ñ¥µ•ÍÑ…µÀ¤¹Ñ½1½…±•…Ñ•MÑÉ¥¹œ ¤€è¹Õ±°ì4(€€€€€€€€€€€€€€€½¹ÍÐÍ¡½Ý…Ñ”€ôµÍ…Ñ”€„ôôÁÉ•Ù…Ñ”ì4(€€€€€€€€€€€€€€€½¹ÍÐÑ½‘…ä€ô¹•Ü…Ñ” ¤¹Ñ½1½…±•…Ñ•MÑÉ¥¹œ ¤ì4(€€€€€€€€€€€€€€€½¹ÍÐå•ÍÑ•É‘…ä€ô¹•Ü…Ñ”¡…Ñ”¹¹½Ü ¤´àØÐÀÀÀÀÀ¤¹Ñ½1½…±•…Ñ•MÑÉ¥¹œ ¤ì4(€€€€€€€€€€€€€€€½¹ÍÐ±…‰•°€ôµÍ…Ñ”€ôôôÑ½‘…ä€ü€Q½‘…äœ€èµÍ…Ñ”€ôôôå•ÍÑ•É‘…ä€ü€e•ÍÑ•É‘…äœ€èµÍ…Ñ”ì4(€€€€€€€€€€€€€€€É•ÑÕÉ¸€ ðø4(€€€€€€€€€€€€€€€€€íÍ¡½Ý…Ñ”€˜˜€ñ‘¥Ø­•äõì´œ­¥ô±…ÍÍ9…µ”ô‰Ñ•áÐµ•¹Ñ•ÈÁä´ÈˆøñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµlÄÁÁát‰œµÝ¡¥Ñ”½lÀ¸ÀÍtÑ•áÐµÉ…ä´ÔÀÀÁà´ÌÁä´ÄÉ½Õ¹‘•µ™Õ±°ˆùí±…‰•±ôð½ÍÁ…¸øð½‘¥Øùô4(€€€€€€€€€€€€€€€€€€ñ5•ÍÍ…•…É4(€€€€€€€€€€€€€€€€€€€­•äõíµÍœ¹¥‘ôµÍœõíµÍô½¹±¥¬õí¡…¹‘±•=Á•¹¥±•ô4(€€€€€€€€€€€€€€€€€€€Í•±•Ñ¥½¹5½‘”õíÍ•±•Ñ¥½¹5½‘•ô4(€€€€€€€€€€€€€€€€€€€Í•±•Ñ•õíÍ•±•Ñ•‘½Ì¹¡…Ì¡µÍœ¹¥¥ô4(€€€€€€€€€€€€€€€€€€€½¹Q½±•M•±•ÐõíÑ½±•½M•±•Ñ¥½¹ô4(€€€€€€€€€€€€€€€€€€€½¹•±•Ñ”õí¡…¹‘±••±•Ñ•½ô4(€€€€€€€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€€€€€ð¼ø¤ì4(€€€€€€€€€€€€€ô¥ô4(€€€€€€€€€€€€€€ñ‘¥ØÉ•˜õíµ•ÍÍ…•Í¹‘I•™ô€¼ø4(€€€€€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€€€€ì¼¨±½…Ñ¥¹œ…Ñ¥½¸‰…ÈÝ¡•¸¥Ñ•µÌÍ•±•Ñ•€¨½ô4(€€€€€€€€€€€íÍ•±•Ñ¥½¹5½‘”€˜˜Í•±•Ñ•‘½Ì¹Í¥é”€ø€À€˜˜€ 4(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”‰½ÑÑ½´´Ð±•™Ð´Ä¼È€µÑÉ…¹Í±…Ñ”µà´Ä¼ÈÁà´ÔÁä´ÌÉ½Õ¹‘•µ™Õ±°Í¡…‘½Üµá°™±•à¥Ñ•µÌµ•¹Ñ•È…À´Ìè´ÄÀˆÍÑå±”õíì‰…­É½Õ¹è€Ù…È ´µÁÉ¥µ…Éä¤œõôø4(€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµÍ´™½¹Ðµµ•‘¥Õ´Ñ•áÐµÝ¡¥Ñ”ˆùíÍ•±•Ñ•‘½Ì¹Í¥é•ôÍ•±•Ñ•ð½ÍÁ…¸ø4(€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õíÍÑ…ÉÑ	Õ¥±‘AÉ½™¥±•ô4(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Áà´ÌÁä´Ä‰œµÝ¡¥Ñ”Ñ•áÐµÉ…ä´äÀÀÉ½Õ¹‘•µ™Õ±°Ñ•áÐµáÌ™½¹Ðµ‰½±¡½Ù•Èé‰œµÉ…ä´ÄÀÀˆø4(€€€€€€€€€€€€€€€€€	Õ¥±AÉ½™¥±”4(€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøì½¹ÍÐ™¥±•Ì€ôÉÉ…ä¹™É½´¡Í•±•Ñ•‘½Ì¹Ù…±Õ•Ì ¤¤¹µ…À¡´€ôø€¡ì¥è´¹™¥±•UÉ°ü¹µ…Ñ  ½lü™u¥ô¡m„µéµhÀ´å|µt¬¤¼¤ü¹lÅtñð´¹¥°™¥±•9…µ”è´¹™¥±•9…µ”ñð€œœ°™¥±•UÉ°è´¹™¥±•UÉ°ñð€œœ°ÕÍÑ½µ•É9…µ”è´¹¹…µ”ô¤¤ìÝ¥¹‘½Ü¹±½…Ñ¥½¸¹¡É•˜€ô€œ½…ÁÀ½ÍÑ¥Ñ ý™¥±•Ìôœ€¬•¹½‘•UI%½µÁ½¹•¹Ð¡)M=8¹ÍÑÉ¥¹¥™ä¡™¥±•Ì¤¤ìõô4(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Áà´ÌÁä´Ä‰œµÝ¡¥Ñ”¼ÈÀÑ•áÐµÝ¡¥Ñ”É½Õ¹‘•µ™Õ±°Ñ•áÐµáÌ™½¹Ðµ‰½±¡½Ù•Èé‰œµÝ¡¥Ñ”¼ÌÀˆø4(€€€€€€€€€€€€€€€€€A¡½Ñ¼Q½½°4(€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€¥ô4(€€€€€€€€€€ð¼ø4(€€€€€€€€¥ô4(€€€€€€ð½‘¥Øø4(4(€€€€€ì¼¨ÕÍÑ½µ•ÈA¥­•È5½‘…°€¨½ô4(€€€€€íÍ¡½ÝA¥­•È€˜˜€ 4(€€€€€€€€ñÕÍÑ½µ•ÉA¥­•È4(€€€€€€€€€½¹…¹•°õì ¤€ôøÍ•ÑM¡½ÝA¥­•È¡™…±Í”¥ô4(€€€€€€€€€½¹½¹™¥É´õí½¹A¥­•É½¹™¥Éµô4(€€€€€€€€€‘½½Õ¹ÐõíÍ•±•Ñ•‘½Ì¹Í¥é•ô4(€€€€€€€€¼ø4(€€€€€€¥ô4(4(€€€€€ì¼¨áÑÉ…Ñ¥¹œ½Ù•É±…ä€¨½ô4(€€€€€í•áÑÉ…Ñ¥¹œ€˜˜€ 4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™¥á•¥¹Í•Ð´Àè´ÔÀ‰œµ‰±…¬¼àÀ™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•Èˆø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‰œµmÙ…È ´µ…É¥tÉ½Õ¹‘•µá°À´ØÑ•áÐµ•¹Ñ•Èˆø4(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Ü´à ´à‰½É‘•È´È‰½É‘•Èµ‰±Õ”´ÔÀÀ‰½É‘•ÈµÐµÑÉ…¹ÍÁ…É•¹ÐÉ½Õ¹‘•µ™Õ±°…¹¥µ…Ñ”µÍÁ¥¸µàµ…ÕÑ¼µˆ´Ìˆ€¼ø4(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áÐµÝ¡¥Ñ”Ñ•áÐµÍ´ˆùáÑÉ…Ñ¥¹œ™É½´íÍ•±•Ñ•‘½Ì¹Í¥é•ô‘½Õµ•¹ÑíÍ•±•Ñ•‘½Ì¹Í¥é”€„ôô€Ä€ü€Ìœ€è€œô¸¸¸ð½Àø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€ð½‘¥Øø4(€€€€€€¥ô4(4(€€€€€ì¼¨áÑÉ…Ñ¥½¸•ÉÉ½È€¨½ô4(€€€€€í•áÑÉ…ÑÉÉ½È€˜˜€…•áÑÉ…Ñ¥¹œ€˜˜€ 4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™¥á•¥¹Í•Ð´Àè´ÔÀ‰œµ‰±…¬¼àÀ™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•Èˆ½¹±¥¬õì ¤€ôøÍ•ÑáÑÉ…ÑÉÉ½È œœ¥ôø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‰œµmÙ…È ´µ…É¥t‰½É‘•È‰½É‘•ÈµÉ•´ÔÀÀ¼ÌÀÉ½Õ¹‘•µá°À´Øµ…àµÜµÍ´ˆø4(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áÐµÉ•´ÐÀÀÑ•áÐµÍ´µˆ´ÌˆùáÑÉ…Ñ¥½¸™…¥±•ð½Àø4(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áÐµÉ…ä´ÐÀÀÑ•áÐµáÌˆùí•áÑÉ…ÑÉÉ½Éôð½Àø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€ð½‘¥Øø4(€€€€€€¥ô4(4(€€€€€ì¼¨áÑÉ…Ñ¥½¸½¹™¥É´µ½‘…°€¨½ô4(€€€€€í•áÑÉ…Ñ•‘MÕ•ÍÑ¥½¹Ì€˜˜€ 4(€€€€€€€€ñáÑÉ…Ñ¥½¹½¹™¥Éµ5½‘…°4(€€€€€€€€€ÍÕ•ÍÑ¥½¹Ìõí•áÑÉ…Ñ•‘MÕ•ÍÑ¥½¹Íô4(€€€€€€€€€½¹…¹•°õì ¤€ôøìÍ•ÑáÑÉ…Ñ•‘MÕ•ÍÑ¥½¹Ì¡¹Õ±°¤ìÍ•ÑQ…É•ÑA•ÉÍ½¹%¡¹Õ±°¤ìõô4(€€€€€€€€€½¹½¹™¥É´õí½¹½¹™¥ÉµáÑÉ…Ñ¥½¹ô4(€€€€€€€€¼ø4(€€€€€€¥ô4(4(€€€€€ì¼¨½Õµ•¹ÐÙ¥•Ý•È€¨½ô4(€€€€€íÙ¥•Ý•É¥±”€˜˜€ 4(€€€€€€€€ñ‘¥ØÉ•˜õíÙ¥•Ý•ÉI•™ô±…ÍÍ9…µ”ô‰™¥á•¥¹Í•Ð´Àè´ÔÀ‰œµ‰±…¬¼äÀ™±•à™±•àµ½°ˆ½¹±¥¬õí¡…¹‘±•±½Í•Y¥•Ý•ÉôÉ½±”ô‰‘¥…±½œˆ…É¥„µµ½‘…°ô‰ÑÉÕ”ˆø4(€€€€€€€€€€ñ‘¥Ø½¹±¥¬õí”€ôø”¹ÍÑ½ÁAÉ½Á……Ñ¥½¸ ¥ô±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´ÈÁà´ÌÁä´È¸Ô‰½É‘•Èµˆ‰½É‘•ÈµÝ¡¥Ñ”¼ÄÀˆø4(€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµÝ¡¥Ñ”¼äÀÑ•áÐµÍ´™½¹Ðµµ•‘¥Õ´ÑÉÕ¹…Ñ”™±•à´Äµ¥¸µÜ´ÀˆùíÙ¥•Ý•É¥±”¹™¥±•9…µ•ôð½ÍÁ…¸ø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸4(€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøì½¹ÍÐ‘É¥Ù•%€ôÙ¥•Ý•É¥±”¹™¥±•UÉ°ü¹µ…Ñ  ½lü™u¥ô¡m„µéµhÀ´å|µt¬¤¼¤ü¹lÅtì¥˜€ …‘É¥Ù•%¤É•ÑÕÉ¸ì•Ñ…¡•‘	±½ˆ¡‘É¥Ù•%°…Íå¹Œ€ ¤€ôøì½¹ÍÐÉ•Ì€ô…Ý…¥Ð…Á¤¹•Ð¡€½‘É¥Ù”½‘½Ý¹±½…¼‘í‘É¥Ù•%‘õ€°íÉ•ÍÁ½¹Í•QåÁ”è‰±½ˆô¤ìÉ•ÑÕÉ¸¹•Ü	±½ˆ¡mÉ•Ì¹‘…Ñ…t°íÑåÁ”èMÑÉ¥¹œ¡É•Ì¹¡•…‘•ÉÍl½¹Ñ•¹ÐµÑåÁ”t€üü€…ÁÁ±¥…Ñ¥½¸½Á‘˜œ¥ô¤ìô¤¹Ñ¡•¸¡‰±½ˆ€ôøìÁÉ¥¹Ñ	±½ˆ¡‰±½ˆ¤ìô¤¹…Ñ  ¡•ÉÈ¤€ôøìÑ½…ÍÐ¹•ÉÉ½È …¥±•Ñ¼±½…è€œ€¬€¡•ÉÈ¹µ•ÍÍ…”ñð€Õ¹­¹½Ý¸œ¤¤ìô¤ìõô(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Ä¸ÔÁà´ÌÁä´Ä¸ÔÉ½Õ¹‘•µ™Õ±°Ñ•áÐµáÌ™½¹ÐµÍ•µ¥‰½±Ñ•áÐµÝ¡¥Ñ”Í¡É¥¹¬´Àˆ4(€€€€€€€€€€€€€ÍÑå±”õíì‰…­É½Õ¹è€±¥¹•…ÈµÉ…‘¥•¹Ð ÄàÁ‘•œ°¡Í° ÈÜ€äÔ”€Ôà”¤°¡Í° ÈÈ€äÈ”€ÔÀ”¤¤œõô4(€€€€€€€€€€€€€Ñ¥Ñ±”ô‰AÉ¥¹Ðˆ4(€€€€€€€€€€€€ø4(€€€€€€€€€€€€€€ñAÉ¥¹Ñ•ÈÍ¥é”õìÄÕôÝ•¥¡Ðô‰‰½±ˆ€¼øñÍÁ…¸±…ÍÍ9…µ”ô‰¡¥‘‘•¸Í´é¥¹±¥¹”ˆùAÉ¥¹Ðð½ÍÁ…¸ø4(€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸4(€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøì½¹ÍÐ‘É¥Ù•%€ôÙ¥•Ý•É¥±”¹™¥±•UÉ°ü¹µ…Ñ  ½lü™u¥ô¡m„µéµhÀ´å|µt¬¤¼¤ü¹lÅtì¥˜€ …‘É¥Ù•%¤É•ÑÕÉ¸ìÝ¥¹‘½Ü¹½Á•¸ œ½…ÁÀ½Á¡½Ñ¼ý™¥±•%ôœ€¬‘É¥Ù•%°€}‰±…¹¬œ¤ìõô4(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Ä¸ÔÁà´ÌÁä´Ä¸ÔÉ½Õ¹‘•µ™Õ±°Ñ•áÐµáÌ™½¹Ðµµ•‘¥Õ´Ñ•áÐµÝ¡¥Ñ”‰œµÝ¡¥Ñ”¼ÄÀ¡½Ù•Èé‰œµÝ¡¥Ñ”¼ÈÀÍ¡É¥¹¬´Àˆ4(€€€€€€€€€€€€€Ñ¥Ñ±”ô‰=Á•¸¥¸A¡½Ñ¼Q½½°ˆ4(€€€€€€€€€€€€ø4(€€€€€€€€€€€€€€ñ…µ•É„Í¥é”õìÄÕô€¼øñÍÁ…¸±…ÍÍ9…µ”ô‰¡¥‘‘•¸Í´é¥¹±¥¹”ˆùA¡½Ñ¼Q½½°ð½ÍÁ…¸ø4(€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õí¡…¹‘±•±½Í•Y¥•Ý•Éô±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Ä¸ÔÁà´ÌÁä´Ä¸ÔÉ½Õ¹‘•µ™Õ±°Ñ•áÐµáÌ™½¹Ðµµ•‘¥Õ´Ñ•áÐµÝ¡¥Ñ”‰œµÝ¡¥Ñ”¼ÄÀ¡½Ù•Èé‰œµÝ¡¥Ñ”¼ÈÀÍ¡É¥¹¬´ÀˆÑ¥Ñ±”ô‰±½Í”ˆø4(€€€€€€€€€€€€€€ñ`Í¥é”õìÄÕô€¼øñÍÁ…¸±…ÍÍ9…µ”ô‰¡¥‘‘•¸Í´é¥¹±¥¹”ˆù±½Í”ð½ÍÁ…¸ø4(€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à´Ä™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÀ´Ì½Ù•É™±½Üµ…ÕÑ¼ˆ½¹±¥¬õí¡…¹‘±•±½Í•Y¥•Ý•Éôø4(€€€€€€€€€€€€ñ‘¥Ø½¹±¥¬õí”€ôø”¹ÍÑ½ÁAÉ½Á……Ñ¥½¸ ¥ô±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•Èµ…àµÜµ™Õ±°µ…àµ µ™Õ±°ˆø4(€€€€€€€€€€€€€ì  ¤€ôøì4(€€€€€€€€€€€€€€€½¹ÍÐ•áÐ€ôÙ¥•Ý•É¥±”¹™¥±•9…µ”ü¹ÍÁ±¥Ð œ¸œ¤¹Á½À ¤ü¹Ñ½1½Ý•É…Í” ¤ñð€œœì4(€€€€€€€€€€€€€€€½¹ÍÐ‘É¥Ù•%€ôÙ¥•Ý•É¥±”¹™¥±•UÉ°ü¹µ…Ñ  ½lü™u¥ô¡m„µéµhÀ´å|µt¬¤¼¤ü¹lÅtñð€œœì4(€€€€€€€€€€€€€€€½¹ÍÐ¥µUÉ°€ô‘É¥Ù•%€ü¡ÑÑÁÌè¼½‘É¥Ù”¹½½±”¹½´½Ñ¡Õµ‰¹…¥°ý¥ô‘í‘É¥Ù•%‘ô™ÍèõÜÄÈÀÁ€€èÙ¥•Ý•É¥±”¹™¥±•UÉ°ñð€œœì4(€€€€€€€€€€€€€€€½¹ÍÐÁÉ•Ù¥•ÝUÉ°€ô‘É¥Ù•%€ü¡ÑÑÁÌè¼½‘É¥Ù”¹½½±”¹½´½™¥±”½¼‘í‘É¥Ù•%‘ô½ÁÉ•Ù¥•Ý€€è€œœì4(€€€€€€€€€€€€€€€¥˜€¡l©Áœœ°©Á•œœ°Á¹œœ°¥˜œ°Ý•‰Àœ°‰µÀt¹¥¹±Õ‘•Ì¡•áÐ¤¤É•ÑÕÉ¸€ñ¥µœÍÉŒõí¥µUÉ±ô±…ÍÍ9…µ”ô‰µ…àµÜµ™Õ±°µ…àµ µlàÁÙ¡t½‰©•Ðµ½¹Ñ…¥¸É½Õ¹‘•µ±œˆ€¼øì4(€€€€€€€€€€€€€€€¥˜€¡lµÀÐœ°œÍÀœ°µ½Øœ°…Ù¤œ°Ý•‰´t¹¥¹±Õ‘•Ì¡•áÐ¤¤É•ÑÕÉ¸ÁÉ•Ù¥•ÝUÉ°€ü€ñ¥™É…µ”ÍÉŒõíÁÉ•Ù¥•ÝUÉ±ô±…ÍÍ9…µ”ô‰ÜµläÉÙÝtµ…àµÜ´Íá° µlÜÉÙ¡tÉ½Õ¹‘•µ±œ‰½É‘•È´Àˆ€¼ø€è¹Õ±°ì4(€€€€€€€€€€€€€€€¥˜€¡•áÐ€ôôô€Á‘˜œ¤É•ÑÕÉ¸ÁÉ•Ù¥•ÝUÉ°€ü€ñ¥™É…µ”ÍÉŒõíÁÉ•Ù¥•ÝUÉ±ô±…ÍÍ9…µ”ô‰ÜµläÉÙÝtµ…àµÜ´Íá° µlàÁÙ¡tÉ½Õ¹‘•µ±œ‰½É‘•È´ÀˆÑ¥Ñ±”ô‰Aˆ€¼ø€è¹Õ±°ì4(€€€€€€€€€€€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÍ9…µ”ô‰‰œµÝ¡¥Ñ”¼ÄÀÉ½Õ¹‘•µá°À´àÑ•áÐµ•¹Ñ•ÈˆøñÀ±…ÍÍ9…µ”ô‰Ñ•áÐµÝ¡¥Ñ”ˆùíÙ¥•Ý•É¥±”¹™¥±•9…µ•ôð½Àøð½‘¥Øøì4(€€€€€€€€€€€€€ô¤ ¥ô4(€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€ð½‘¥Øø4(€€€€€€¥ô4(€€€€ð½‘¥Øø4(€€¤ì4)ô4(4)™Õ¹Ñ¥½¸ÕÍÑ½µ•ÉA¥­•È¡ì½¹…¹•°°½¹½¹™¥É´°‘½½Õ¹Ðôèì½¹…¹•°è€ ¤€ôøÙ½¥ì½¹½¹™¥É´è€¡Á•ÉÍ½¹%èÍÑÉ¥¹œ¤€ôøÙ½¥ì‘½½Õ¹Ðè¹Õµ‰•Èô¤ì4(€½¹ÍÐm¡½ÕÍ•¡½±‘Ì°Í•Ñ!½ÕÍ•¡½±‘Ít€ôÕÍ•MÑ…Ñ”ñ!½ÕÍ•¡½±‘mtø¡mt¤ì4(€½¹ÍÐmÍ¡½ÝÉ•…Ñ”°Í•ÑM¡½ÝÉ•…Ñ•t€ôÕÍ•MÑ…Ñ”¡™…±Í”¤ì4(€½¹ÍÐm™½É´°Í•Ñ½Éµt€ôÕÍ•MÑ…Ñ”¡ìÁ¡½¹”è€œœ°¹…µ”è€œœ°É•±…Ñ¥½¹Í¡¥Àè€Í•±˜œô¤ì4(4(€ÕÍ•™™•Ð  ¤€ôøì…Á¤¹•Ð œ½ÕÍÑ½µ•ÉÌ½¡½ÕÍ•¡½±‘Ìœ¤¹Ñ¡•¸¡È€ôøÍ•Ñ!½ÕÍ•¡½±‘Ì¡È¹‘…Ñ„¤¤ìô°mt¤ì4(4(€½¹ÍÐ¡…¹‘±•É•…Ñ•A•ÉÍ½¸€ô…Íå¹Œ€¡Á¡½¹”èÍÑÉ¥¹œ°¹…µ”èÍÑÉ¥¹œ°É•±…Ñ¥½¹Í¡¥ÀèÍÑÉ¥¹œ¤€ôøì4(€€€½¹ÍÐÈ€ô…Ý…¥Ð…Á¤¹Á½ÍÐ œ½ÕÍÑ½µ•ÉÌ½Á•ÉÍ½¹Ìœ°ìÁ¡½¹”°¹…µ”°‘¥ÍÁ±…å1…‰•°è¹…µ”°É•±…Ñ¥½¹Í¡¥Àô¤ì4(€€€É•ÑÕÉ¸È¹‘…Ñ„¹¥ì4(€ôì4(4(€½¹ÍÐ¡…¹‘±•EÕ¥­É•…Ñ”€ô…Íå¹Œ€ ¤€ôøì4(€€€¥˜€ …™½É´¹Á¡½¹”ñð€…™½É´¹¹…µ”¤É•ÑÕÉ¸ì4(€€€½¹ÍÐ¥€ô…Ý…¥Ð¡…¹‘±•É•…Ñ•A•ÉÍ½¸¡™½É´¹Á¡½¹”°™½É´¹¹…µ”°™½É´¹É•±…Ñ¥½¹Í¡¥À¤ì4(€€€½¹½¹™¥É´¡¥¤ì4(€ôì4(4(€É•ÑÕÉ¸€ 4(€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™¥á•¥¹Í•Ð´Àè´ÔÀ‰œµ‰±…¬¼àÀ™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÀ´Ðˆ½¹±¥¬õí½¹…¹•±ôø4(€€€€€€ñ‘¥Ø½¹±¥¬õí”€ôø”¹ÍÑ½ÁAÉ½Á……Ñ¥½¸ ¥ô±…ÍÍ9…µ”ô‰‰œµmÙ…È ´µ…É¥t‰½É‘•È‰½É‘•ÈµmÙ…È ´µ‰½É‘•È¥tÉ½Õ¹‘•µá°À´Ôµ…àµÜµµÜµ™Õ±°µ…àµ µlàÁÙ¡t½Ù•É™±½Üµäµ…ÕÑ¼ˆø4(€€€€€€€€ñ Ì±…ÍÍ9…µ”ô‰Ñ•áÐµ‰…Í”™½¹Ðµ‰½±Ñ•áÐµÝ¡¥Ñ”µˆ´Äˆù	Õ¥±ÁÉ½™¥±”™É½´í‘½½Õ¹Ñô‘½Õµ•¹Ñí‘½½Õ¹Ð€„ôô€Ä€ü€Ìœ€è€œôð½ Ìø4(€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áÐµáÌÑ•áÐµÉ…ä´ÔÀÀµˆ´ÐˆùM•±•Ð…¸•á¥ÍÑ¥¹œÁ•ÉÍ½¸°½ÈÉ•…Ñ”„¹•Ü½¹”ð½Àø4(4(€€€€€€€ì…Í¡½ÝÉ•…Ñ”€ü€ 4(€€€€€€€€€€ðø4(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Ìµˆ´Ðˆø4(€€€€€€€€€€€€€í¡½ÕÍ•¡½±‘Ì¹µ…À¡ €ôø€ 4(€€€€€€€€€€€€€€€€ñ‘¥Ø­•äõí ¹Á¡½¹•ôø4(€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áÐµlÄÁÁátÑ•áÐµÉ…ä´ÔÀÀÕÁÁ•É…Í”µˆ´ÄÁà´Äˆùí ¹Á¡½¹•ôð½Àø4(€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Äˆø4(€€€€€€€€€€€€€€€€€€€í ¹Á•ÉÍ½¹Ì¹µ…À¡À€ôø€ 4(€€€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸­•äõíÀ¹¥‘ô½¹±¥¬õì ¤€ôø½¹½¹™¥É´¡À¹¥¥ô4(€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Üµ™Õ±°Ñ•áÐµ±•™ÐÁà´ÌÁä´ÈÉ½Õ¹‘•µ±œ‰œµÝ¡¥Ñ”¼Ô¡½Ù•Èé‰œµÝ¡¥Ñ”½lÀ¸ÀÑtÑ•áÐµÍ´Ñ•áÐµÝ¡¥Ñ”™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èˆø4(€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Ü´Ü ´ÜÉ½Õ¹‘•µ™Õ±°‰œµ‰±Õ”´ØÀÀ¼ÌÀ™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÑ•áÐµáÌ™½¹Ðµ‰½±ˆùíÀ¹¹…µ”ü¹lÁuôð½‘¥Øø4(€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à´Äˆø4(€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Ñ•áÐµÍ´ˆùíÀ¹‘¥ÍÁ±…å1…‰•°ñðÀ¹¹…µ•ôð½‘¥Øø4(€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Ñ•áÐµlÄÁÁátÑ•áÐµÉ…ä´ÔÀÀ…Á¥Ñ…±¥é”ˆùíÀ¹É•±…Ñ¥½¹Í¡¥Áôð½‘¥Øø4(€€€€€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€€€€€€€¤¥ô4(€€€€€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€€€¤¥ô4(€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•ÑM¡½ÝÉ•…Ñ”¡ÑÉÕ”¥ô±…ÍÍ9…µ”ô‰Üµ™Õ±°Áà´ÌÁä´È‰œµ‰±Õ”´ØÀÀÑ•áÐµÝ¡¥Ñ”É½Õ¹‘•µ±œÑ•áÐµÍ´¡½Ù•Èé‰œµ‰±Õ”´ÜÀÀˆø¬É•…Ñ”9•ÜA•ÉÍ½¸ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€ð¼ø4(€€€€€€€€¤€è€ 4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Ìˆø4(€€€€€€€€€€€€ñ‘¥Øø4(€€€€€€€€€€€€€€ñ±…‰•°±…ÍÍ9…µ”ô‰Ñ•áÐµlÄÅÁátÑ•áÐµÉ…ä´ÔÀÀÕÁÁ•É…Í”ˆùA¡½¹”ð½±…‰•°ø4(€€€€€€€€€€€€€€ñ¥¹ÁÕÐÙ…±Õ”õí™½É´¹Á¡½¹•ô½¹¡…¹”õí”€ôøÍ•Ñ½É´¡ì€¸¸¹™½É´°Á¡½¹”è”¹Ñ…É•Ð¹Ù…±Õ”ô¥ô4(€€€€€€€€€€€€€€€Á±…•¡½±‘•ÈôˆäàÈÌÜÐÔÈÌÐˆ4(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Üµ™Õ±°µÐ´ÄÁà´ÌÁä´È‰œµmÙ…È ´µÍ•½¹‘…Éä¥t‰½É‘•È‰½É‘•ÈµmÙ…È ´µ‰½É‘•È¥tÉ½Õ¹‘•µ±œÑ•áÐµÍ´Ñ•áÐµÝ¡¥Ñ”½ÕÑ±¥¹”µ¹½¹”ˆ€¼ø4(€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€ñ‘¥Øø4(€€€€€€€€€€€€€€ñ±…‰•°±…ÍÍ9…µ”ô‰Ñ•áÐµlÄÅÁátÑ•áÐµÉ…ä´ÔÀÀÕÁÁ•É…Í”ˆù9…µ”ð½±…‰•°ø4(€€€€€€€€€€€€€€ñ¥¹ÁÕÐÙ…±Õ”õí™½É´¹¹…µ•ô½¹¡…¹”õí”€ôøÍ•Ñ½É´¡ì€¸¸¹™½É´°¹…µ”è”¹Ñ…É•Ð¹Ù…±Õ”ô¥ô4(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Üµ™Õ±°µÐ´ÄÁà´ÌÁä´È‰œµmÙ…È ´µÍ•½¹‘…Éä¥t‰½É‘•È‰½É‘•ÈµmÙ…È ´µ‰½É‘•È¥tÉ½Õ¹‘•µ±œÑ•áÐµÍ´Ñ•áÐµÝ¡¥Ñ”½ÕÑ±¥¹”µ¹½¹”ˆ€¼ø4(€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€ñ‘¥Øø4(€€€€€€€€€€€€€€ñ±…‰•°±…ÍÍ9…µ”ô‰Ñ•áÐµlÄÅÁátÑ•áÐµÉ…ä´ÔÀÀÕÁÁ•É…Í”ˆùI•±…Ñ¥½¹Í¡¥Àð½±…‰•°ø4(€€€€€€€€€€€€€€ñÍ•±•ÐÙ…±Õ”õí™½É´¹É•±…Ñ¥½¹Í¡¥Áô½¹¡…¹”õí”€ôøÍ•Ñ½É´¡ì€¸¸¹™½É´°É•±…Ñ¥½¹Í¡¥Àè”¹Ñ…É•Ð¹Ù…±Õ”ô¥ô4(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Üµ™Õ±°µÐ´ÄÁà´ÌÁä´È‰œµmÙ…È ´µÍ•½¹‘…Éä¥t‰½É‘•È‰½É‘•ÈµmÙ…È ´µ‰½É‘•È¥tÉ½Õ¹‘•µ±œÑ•áÐµÍ´Ñ•áÐµÝ¡¥Ñ”½ÕÑ±¥¹”µ¹½¹”ˆø4(€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ô‰Í•±˜ˆùM•±˜ð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ô‰ÍÁ½ÕÍ”ˆùMÁ½ÕÍ”ð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ô‰Á…É•¹ÐˆùA…É•¹Ðð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ô‰¡¥±ˆù¡¥±ð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ô‰Í¥‰±¥¹œˆùM¥‰±¥¹œð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ô‰½Ñ¡•Èˆù=Ñ¡•Èð½½ÁÑ¥½¸ø4(€€€€€€€€€€€€€€ð½Í•±•Ðø4(€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à…À´ÈÁÐ´Èˆø4(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õí¡…¹‘±•EÕ¥­É•…Ñ•ô‘¥Í…‰±•õì…™½É´¹Á¡½¹”ñð€…™½É´¹¹…µ•ô4(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•à´ÄÁà´ÌÁä´È‰œµÉ••¸´ØÀÀÑ•áÐµÝ¡¥Ñ”É½Õ¹‘•µ±œÑ•áÐµÍ´‘¥Í…‰±•é½Á…¥Ñä´ÔÀˆùÉ•…Ñ”€˜UÍ”ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•ÑM¡½ÝÉ•…Ñ”¡™…±Í”¥ô±…ÍÍ9…µ”ô‰Áà´ÌÁä´È‰œµÝ¡¥Ñ”¼ÔÑ•áÐµÉ…ä´ÐÀÀÉ½Õ¹‘•µ±œÑ•áÐµÍ´ˆù	…¬ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€¥ô4(4(€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õí½¹…¹•±ô±…ÍÍ9…µ”ô‰Üµ™Õ±°µÐ´ÌÑ•áÐµáÌÑ•áÐµÉ…ä´ÔÀÀ¡½Ù•ÈéÑ•áÐµÝ¡¥Ñ”ˆù…¹•°ð½‰ÕÑÑ½¸ø4(€€€€€€ð½‘¥Øø4(€€€€ð½‘¥Øø4(€€¤ì4)ô4(4)™Õ¹Ñ¥½¸áÑÉ…Ñ¥½¹½¹™¥Éµ5½‘…°¡ìÍÕ•ÍÑ¥½¹Ì°½¹…¹•°°½¹½¹™¥É´ôè…¹ä¤ì4(€½¹ÍÐm…•ÁÑ•°Í•Ñ•ÁÑ•‘t€ôÕÍ•MÑ…Ñ”ñI•½ÉñÍÑÉ¥¹œ°…¹äøø¡ì€¸¸¹ÍÕ•ÍÑ¥½¹Ìô¤ì4(4(€½¹ÍÐÑ½±”€ô€¡­•äèÍÑÉ¥¹œ¤€ôøì4(€€€Í•Ñ•ÁÑ• ¡ÁÉ•Øè…¹ä¤€ôøì4(€€€€€½¹ÍÐ¹•áÐ€ôì€¸¸¹ÁÉ•Øôì4(€€€€€¥˜€¡¹•áÑm­•åt¤‘•±•Ñ”¹•áÑm­•åtì4(€€€€€•±Í”¹•áÑm­•åt€ôÍÕ•ÍÑ¥½¹Ím­•åtì4(€€€€€É•ÑÕÉ¸¹•áÐì4(€€€ô¤ì4(€ôì4(€½¹ÍÐÕÁ‘…Ñ•Y…±Õ”€ô€¡­•äèÍÑÉ¥¹œ°Ù…±Õ”èÍÑÉ¥¹œ¤€ôøì4(€€€Í•Ñ•ÁÑ• ¡ÁÉ•Øè…¹ä¤€ôø€¡ì€¸¸¹ÁÉ•Ø°m­•åtèì€¸¸¹ÁÉ•Ùm­•åt°Ù…±Õ”°Í½ÕÉ”è€‘½Õµ•¹Ñ}½ÉÉ•Ñ•œôô¤¤ì4(€ôì4(4(€É•ÑÕÉ¸€ 4(€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™¥á•¥¹Í•Ð´Àè´ÔÀ‰œµ‰±…¬¼àÀ™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÀ´Ðˆ½¹±¥¬õí½¹…¹•±ôø4(€€€€€€ñ‘¥Ø½¹±¥¬õí”€ôø”¹ÍÑ½ÁAÉ½Á……Ñ¥½¸ ¥ô±…ÍÍ9…µ”ô‰‰œµmÙ…È ´µ…É¥t‰½É‘•È‰½É‘•Èµ‰±Õ”´ÔÀÀ¼ÌÀÉ½Õ¹‘•µá°À´Ôµ…àµÜµ±œÜµ™Õ±°µ…àµ µlàÕÙ¡t½Ù•É™±½Üµäµ…ÕÑ¼ˆø4(€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áÐµÍ´™½¹Ðµµ•‘¥Õ´Ñ•áÐµ‰±Õ”´ÐÀÀµˆ´ÌˆùI•Ù¥•Ü•áÑÉ…Ñ•™¥•±‘Ìð½Àø4(€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áÐµáÌÑ•áÐµÉ…ä´ÔÀÀµˆ´ÐˆùU¹¡•¬™¥•±‘ÌÑ¼Í­¥À¸‘¥ÐÙ…±Õ•Ì¥¹±¥¹”¸½¹™¥É´Ñ¼Í…Ù”Ý¥Ñ ÁÉ½Ù•¹…¹”¸ð½Àø4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Èµˆ´Ðˆø4(€€€€€€€€€í=‰©•Ð¹•¹ÑÉ¥•Ì¡ÍÕ•ÍÑ¥½¹Ì¤¹µ…À ¡m¬°ÙtèmÍÑÉ¥¹œ°…¹åt¤€ôø€ 4(€€€€€€€€€€€€ñ‘¥Ø­•äõí­ô±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èˆø4(€€€€€€€€€€€€€€ñ¥¹ÁÕÐÑåÁ”ô‰¡•­‰½àˆ¡•­•õì„……•ÁÑ•‘m­uô½¹¡…¹”õì ¤€ôøÑ½±”¡¬¥ô±…ÍÍ9…µ”ô‰…•¹Ðµ‰±Õ”´ÔÀÀˆ€¼ø4(€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµáÌÑ•áÐµÉ…ä´ÐÀÀÜ´ÈÐ…Á¥Ñ…±¥é”Í¡É¥¹¬´Àˆùí¬¹É•Á±…” ½|½œ°€œ€œ¥ôð½ÍÁ…¸ø4(€€€€€€€€€€€€€€ñ¥¹ÁÕÐ4(€€€€€€€€€€€€€€€Ù…±Õ”õí…•ÁÑ•‘m­tü¹Ù…±Õ”ñðØ¹Ù…±Õ”ñð€œô4(€€€€€€€€€€€€€€€½¹¡…¹”õí”€ôøÕÁ‘…Ñ•Y…±Õ”¡¬°”¹Ñ…É•Ð¹Ù…±Õ”¥ô4(€€€€€€€€€€€€€€€‘¥Í…‰±•õì……•ÁÑ•‘m­uô4(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•à´ÄÁà´ÈÁä´Ä‰œµmÙ…È ´µÍ•½¹‘…Éä¥t‰½É‘•È‰½É‘•ÈµmÙ…È ´µ‰½É‘•È¥tÉ½Õ¹‘•Ñ•áÐµáÌÑ•áÐµÝ¡¥Ñ”½ÕÑ±¥¹”µ¹½¹”‘¥Í…‰±•é½Á…¥Ñä´ÔÀˆ€¼ø4(€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€¤¥ô4(€€€€€€€€ð½‘¥Øø4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à…À´Èˆø4(€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôø½¹½¹™¥É´¡…•ÁÑ•¥ô±…ÍÍ9…µ”ô‰™±•à´ÄÁà´ÌÁä´Ä¸Ô‰œµÉ••¸´ØÀÀÑ•áÐµÝ¡¥Ñ”Ñ•áÐµÍ´É½Õ¹‘•ˆù½¹™¥É´€˜M…Ù”ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õí½¹…¹•±ô±…ÍÍ9…µ”ô‰Áà´ÌÁä´Ä¸Ô‰œµÝ¡¥Ñ”¼ÔÑ•áÐµÉ…ä´ÐÀÀÑ•áÐµÍ´É½Õ¹‘•ˆù…¹•°ð½‰ÕÑÑ½¸ø4(€€€€€€€€ð½‘¥Øø4(€€€€€€ð½‘¥Øø4(€€€€ð½‘¥Øø4(€€¤ì4)ô4(4(