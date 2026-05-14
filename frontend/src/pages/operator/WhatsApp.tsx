import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import api, { API_URL } from '../../lib/api';

interface Message {
  id: string; phone: string; name: string; fileName?: string; text?: string;
  fileUrl?: string; timestamp: string; type?: string;
}
interface Chat { phone: string; name: string; lastTime: string; messages: Message[]; newCount: number; }

// Infer semantic document title from filename
function docTitle(fileName: string): { title: string; badge: string; icon: string } {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) return { title: 'Photo', badge: 'IMG', icon: '🖼️' };
  if (['mp4','3gp','mov','avi','webm'].includes(ext)) return { title: 'Video', badge: 'VID', icon: '🎬' };
  if (ext === 'pdf') return { title: 'PDF Document', badge: 'PDF', icon: '📕' };
  if (['mp3','ogg','wav','aac','opus'].includes(ext)) return { title: 'Audio', badge: 'AUD', icon: '🎵' };
  return { title: 'Document', badge: ext.toUpperCase() or 'FILE', icon: '📄' };
}

function timeAgo(ts: string): string {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  const date = new Date(ts);
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  return date.toLocaleDateString();
}

export default function WhatsApp() {
  const [connected, setConnected] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [chats, setChats] = useState<Map<string, Chat>>(new Map());
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
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

  const groupMessages = (msgs: Message[]) => {
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
  };

  const addMessage = (msg: Message) => {
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
  };

  const handleShowQR = async () => { const r = await api.get('/whatsapp/qr'); if (r.data.qrCode) setQrCode(r.data.qrCode); };

  const sortedChats = Array.from(chats.values()).sort((a, b) => b.lastTime.localeCompare(a.lastTime));
  const activeChat = selectedChat ? chats.get(selectedChat) : null;

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
      {/* Chat List */}
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
            <div key={chat.phone} onClick={() => setSelectedChat(chat.phone)}
              className={`px-3 py-3 border-b border-white/5 cursor-pointer hover:bg-white/5 ${selectedChat === chat.phone ? 'bg-blue-600/10' : ''}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-green-600/20 flex items-center justify-center text-green-400 text-xs font-bold shrink-0">
                  {chat.name[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{chat.name}</p>
                  <p className="text-[11px] text-gray-500">{chat.newCount} document{chat.newCount !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] text-gray-600">{timeAgo(chat.lastTime)}</span>
                  {chat.newCount > 0 && <div className="w-4 h-4 rounded-full bg-blue-500 text-[9px] text-white flex items-center justify-center mt-1 ml-auto">{chat.newCount}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Document Panel */}
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
              {[...activeChat.messages].reverse().map(msg => {
                if (msg.text && !msg.fileName) return (
                  <div key={msg.id} className="bg-[#1a2236] rounded-lg px-3 py-2 max-w-[80%]">
                    <p className="text-sm text-gray-300">{msg.text}</p>
                    <p className="text-[10px] text-gray-600 mt-1">{timeAgo(msg.timestamp)}</p>
                  </div>
                );
                const { title, badge, icon } = docTitle(msg.fileName || '');
                const ext = msg.fileName?.split('.').pop()?.toLowerCase() || '';
                const isImg = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
                const thumbUrl = msg.fileUrl?.replace('sz=w200','sz=w400') || msg.fileUrl;
                return (
                  <div key={msg.id} className="bg-[#1a2236] border border-white/5 rounded-xl p-3 flex gap-3 max-w-[480px] hover:border-blue-500/20 transition group">
                    {/* Thumbnail */}
                    <a href={thumbUrl} target="_blank" rel="noreferrer" className="shrink-0">
                      {thumbUrl ? (
                        <div className="relative">
                          <img src={thumbUrl} className="w-[72px] h-[72px] object-cover rounded-xl bg-white/5" loading="lazy" />
                          {ext === 'pdf' && <span className="absolute bottom-1 right-1 text-[8px] px-1 py-0.5 rounded bg-red-600/80 text-white font-bold">PDF</span>}
                          {['mp4','3gp','mov','avi','webm'].includes(ext) && <span className="absolute inset-0 flex items-center justify-center"><span className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white text-[10px]">▶</span></span>}
                        </div>
                      ) : (
                        <div className="w-[72px] h-[72px] rounded-xl bg-white/5 flex flex-col items-center justify-center">
                          <span className="text-2xl">{icon}</span>
                          <span className="text-[9px] text-gray-500 mt-1">{badge}</span>
                        </div>
                      )}
                    </a>
                    {/* Content */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">{title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{badge} · {timeAgo(msg.timestamp)}</p>
                      </div>
                      {/* Actions */}
                      <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition">
                        <a href={thumbUrl} target="_blank" rel="noreferrer" className="text-[10px] px-2 py-0.5 rounded-md bg-blue-600/20 text-blue-400 hover:bg-blue-600/30">Open</a>
                        <a href={thumbUrl} download className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-gray-400 hover:text-white">Download</a>
                        <button className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-gray-400 hover:text-white">Link</button>
                      </div>
                    </div>
                    {/* Status badge */}
                    <div className="shrink-0">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">NEW</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
