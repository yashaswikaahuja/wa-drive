import { useEffect, useState, useRef, memo, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import api, { API_URL } from '../../lib/api';

interface Message {
  id: string; phone: string; name: string; fileName?: string; text?: string;
  fileUrl?: string; timestamp: string; type?: string;
}
interface Chat { phone: string; name: string; lastTime: string; messages: Message[]; newCount: number; }

function docTitle(fileName: string): { title: string; badge: string; icon: string } {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) return { title: 'Photo', badge: 'IMG', icon: '🖼️' };
  if (['mp4','3gp','mov','avi','webm'].includes(ext)) return { title: 'Video', badge: 'VID', icon: '🎬' };
  if (ext === 'pdf') return { title: 'PDF Document', badge: 'PDF', icon: '📕' };
  if (['mp3','ogg','wav','aac','opus'].includes(ext)) return { title: 'Audio', badge: 'AUD', icon: '🎵' };
  return { title: 'Document', badge: ext.toUpperCase() || 'FILE', icon: '📄' };
}

function timeAgo(ts: string): string {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return new Date(ts).toLocaleDateString();
}

// Lazy thumbnail with intersection observer — only loads when visible
const LazyThumbnail = memo(({ src, ext, alt }: { src?: string; ext: string; alt?: string }) => {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || visible) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { rootMargin: '100px' });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible]);

  const isImg = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
  const isVideo = ['mp4','3gp','mov','avi','webm'].includes(ext);

  return (
    <div ref={ref} className="w-[72px] h-[72px] rounded-xl bg-white/5 relative overflow-hidden">
      {visible && src && (
        <>
          <img src={src} className="w-full h-full object-cover" loading="lazy" alt={alt} />
          {ext === 'pdf' && <span className="absolute bottom-1 right-1 text-[8px] px-1 py-0.5 rounded bg-red-600/80 text-white font-bold">PDF</span>}
          {isVideo && <span className="absolute inset-0 flex items-center justify-center"><span className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white text-[10px]">▶</span></span>}
        </>
      )}
    </div>
  );
});

// Memoized message card — only re-renders if msg changes
const MessageCard = memo(({ msg, onClick }: { msg: Message; onClick: (m: Message) => void }) => {
  const ext = msg.fileName?.split('.').pop()?.toLowerCase() || '';
  const thumbUrl = msg.fileUrl?.replace('sz=w200','sz=w400') || msg.fileUrl;
  const { title, badge } = docTitle(msg.fileName || '');

  if (msg.text && !msg.fileName) return (
    <div className="bg-[#1a2236] rounded-lg px-3 py-2 max-w-[80%]">
      <p className="text-sm text-gray-300">{msg.text}</p>
      <p className="text-[10px] text-gray-600 mt-1">{timeAgo(msg.timestamp)}</p>
    </div>
  );

  return (
    <div className="bg-[#1a2236] border border-white/5 rounded-xl p-3 flex gap-3 max-w-[480px] hover:border-blue-500/20 transition group">
      <div onClick={() => onClick(msg)} className="shrink-0 cursor-pointer">
        <LazyThumbnail src={thumbUrl} ext={ext} alt={title} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{badge} · {timeAgo(msg.timestamp)}</p>
        </div>
        <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition">
          <button onClick={() => onClick(msg)} className="text-[10px] px-2 py-0.5 rounded-md bg-blue-600/20 text-blue-400 hover:bg-blue-600/30">Open</button>
        </div>
      </div>
      <div className="shrink-0">
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">NEW</span>
      </div>
    </div>
  );
});

// Memoized chat list item
const ChatItem = memo(({ chat, selected, onClick }: { chat: Chat; selected: boolean; onClick: (phone: string) => void }) => (
  <div onClick={() => onClick(chat.phone)}
    className={`px-3 py-3 border-b border-white/5 cursor-pointer hover:bg-white/5 ${selected ? 'bg-blue-600/10' : ''}`}>
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-full bg-green-600/20 flex items-center justify-center text-green-400 text-xs font-bold shrink-0">
        {chat.name[0]?.toUpperCase() || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium truncate">{chat.name}</p>
        <p className="text-[11px] text-gray-500">{chat.newCount} document{chat.newCount !== 1 ? 's' : ''}</p>
      </div>
      <span className="text-[10px] text-gray-600 shrink-0">{timeAgo(chat.lastTime)}</span>
    </div>
  </div>
));

export default function WhatsApp() {
  const [connected, setConnected] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [chats, setChats] = useState<Map<string, Chat>>(new Map());
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [viewerFile, setViewerFile] = useState<Message | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    api.get('/whatsapp/status').then(r => setConnected(r.data.connected)).catch(() => {});
    api.get('/drive/files').then(r => {
      const msgs: Message[] = r.data.map((f: any) => ({
        id: f.id, phone: f.customerId || 'unknown', name: f.customerName || f.customerId || 'Unknown',
        fileName: f.fileName, fileUrl: f.fileUrl, timestamp: f.timestamp
      }));
      groupMessages(msgs);
    }).catch(() => {});
    const baseUrl = API_URL.replace('/api', '');
    const socket = io(baseUrl, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connection:status', (data: any) => { setConnected(data.connected); if (data.connected) setQrCode(null); });
    socket.on('qr', (data: any) => setQrCode(data.qr || data));
    socket.on('new_whatsapp_file', (file: any) => {
      addMessage({ id: file.id || Date.now().toString(), phone: file.phoneNumber || file.customerId || 'unknown',
        name: file.customerName || file.phoneNumber || 'Unknown', fileName: file.fileName,
        fileUrl: file.fileUrl, timestamp: file.timestamp || new Date().toISOString() });
    });
    return () => { socket.disconnect(); };
  }, []);

  const groupMessages = useCallback((msgs: Message[]) => {
    const map = new Map<string, Chat>();
    msgs.forEach(m => {
      const key = m.phone;
      if (!map.has(key)) map.set(key, { phone: key, name: m.name, lastTime: m.timestamp, messages: [], newCount: 0 });
      const chat = map.get(key)!;
      chat.messages.push(m);
      if (m.timestamp > chat.lastTime) chat.lastTime = m.timestamp;
      chat.newCount = chat.messages.length;
    });
    setChats(map);
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setChats(prev => {
      const map = new Map(prev);
      const key = msg.phone;
      if (!map.has(key)) map.set(key, { phone: key, name: msg.name, lastTime: msg.timestamp, messages: [], newCount: 0 });
      const chat = map.get(key)!;
      chat.messages.unshift(msg);
      chat.lastTime = msg.timestamp;
      chat.newCount++;
      return map;
    });
  }, []);

  const handleShowQR = useCallback(async () => { const r = await api.get('/whatsapp/qr'); if (r.data.qrCode) setQrCode(r.data.qrCode); }, []);
  const handleSelectChat = useCallback((phone: string) => setSelectedChat(phone), []);
  const handleOpenFile = useCallback((msg: Message) => setViewerFile(msg), []);
  const handleCloseViewer = useCallback(() => setViewerFile(null), []);

  const sortedChats = useMemo(() => Array.from(chats.values()).sort((a, b) => b.lastTime.localeCompare(a.lastTime)), [chats]);
  const activeChat = selectedChat ? chats.get(selectedChat) : null;
  const reversedMessages = useMemo(() => activeChat ? [...activeChat.messages].reverse() : [], [activeChat]);

  if (!connected) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <h2 className="text-lg font-bold text-white mb-4">Connect WhatsApp</h2>
        {qrCode ? (
          <div className="bg-white p-4 rounded-lg mb-4">
            <img src={qrCode.startsWith('data:') ? qrCode : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`} alt="QR" className="w-48 h-48" />
          </div>
        ) : (
          <button onClick={handleShowQR} className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700">Show QR Code</button>
        )}
        <p className="text-xs text-gray-500 mt-2">Scan with WhatsApp to connect</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-48px)] flex">
      <div className="w-72 border-r border-white/5 flex flex-col">
        <div className="p-3 border-b border-white/5 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-sm text-white font-medium">Inbox</span>
          <span className="text-[10px] text-gray-500 ml-auto">{sortedChats.length} customers</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sortedChats.length === 0 ? (
            <p className="text-center text-gray-600 text-xs py-8">No documents received</p>
          ) : sortedChats.map(chat => (
            <ChatItem key={chat.phone} chat={chat} selected={selectedChat === chat.phone} onClick={handleSelectChat} />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {!activeChat ? (
          <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">Select a customer to view documents</div>
        ) : (
          <>
            <div className="h-14 px-4 flex items-center gap-3 border-b border-white/5 shrink-0">
              <div className="w-9 h-9 rounded-full bg-green-600/20 flex items-center justify-center text-green-400 font-bold text-sm">
                {activeChat.name[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{activeChat.name}</p>
                <p className="text-[10px] text-gray-500">{activeChat.phone} · {activeChat.messages.length} documents</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {reversedMessages.map(msg => (
                <MessageCard key={msg.id} msg={msg} onClick={handleOpenFile} />
              ))}
            </div>
          </>
        )}
      </div>

      {viewerFile && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={handleCloseViewer}>
          <div className="absolute top-4 right-4 flex gap-3 z-10">
            <button onClick={handleCloseViewer} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20">✕ Close</button>
          </div>
          <div className="absolute top-4 left-4 z-10">
            <p className="text-white text-sm font-medium">{docTitle(viewerFile.fileName || '').title}</p>
            <p className="text-gray-400 text-xs">{timeAgo(viewerFile.timestamp)} · {viewerFile.name}</p>
          </div>
          <div onClick={e => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh]">
            {(() => {
              const ext = viewerFile.fileName?.split('.').pop()?.toLowerCase() || '';
              const driveId = viewerFile.fileUrl?.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || '';
              const imgUrl = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200` : viewerFile.fileUrl || '';
              const previewUrl = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : '';
              if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) return <img src={imgUrl} className="max-w-full max-h-[85vh] object-contain rounded-lg" />;
              if (['mp4','3gp','mov','avi','webm'].includes(ext)) return previewUrl ? <iframe src={previewUrl} className="w-[80vw] h-[75vh] rounded-lg border-0" allow="autoplay; fullscreen" allowFullScreen /> : <video src={imgUrl} controls className="max-w-full max-h-[85vh] rounded-lg" />;
              if (ext === 'pdf') return previewUrl ? <iframe src={previewUrl} className="w-[80vw] h-[75vh] rounded-lg border-0" title="PDF" /> : <div className="bg-[#1a2236] rounded-xl p-8 text-center"><p className="text-white">PDF preview unavailable</p></div>;
              return <div className="bg-[#1a2236] rounded-xl p-8 text-center"><span className="text-4xl block mb-3">{docTitle(viewerFile.fileName || '').icon}</span><p className="text-white">{viewerFile.fileName}</p></div>;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
