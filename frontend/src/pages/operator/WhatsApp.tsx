import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import api, { API_URL } from '../../lib/api';

interface Message {
  id: string; phone: string; name: string; fileName?: string; text?: string;
  fileUrl?: string; isImage?: boolean; timestamp: string; type?: string;
}

interface Chat {
  phone: string; name: string; lastMessage: string; lastTime: string; messages: Message[];
}

export default function WhatsApp() {
  const [connected, setConnected] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [chats, setChats] = useState<Map<string, Chat>>(new Map());
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    api.get('/whatsapp/status').then(r => setConnected(r.data.connected)).catch(() => {});

    // Load existing files from persistent store
    api.get('/drive/files').then(r => {
      const msgs: Message[] = r.data.map((f: any) => ({
        id: f.id, phone: f.customerId || 'unknown', name: f.customerName || f.customerId || 'Unknown',
        fileName: f.fileName, fileUrl: f.fileUrl, isImage: f.type === 'whatsapp_image',
        timestamp: f.timestamp
      }));
      groupMessages(msgs);
    }).catch(() => {});

    // Socket for real-time
    const baseUrl = API_URL.replace('/api', '');
    const socket = io(baseUrl, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connection:status', (data: any) => { setConnected(data.connected); if (data.connected) setQrCode(null); });
    socket.on('qr', (data: any) => setQrCode(data.qr || data));
    socket.on('new_whatsapp_file', (file: any) => {
      const msg: Message = {
        id: file.id || Date.now().toString(), phone: file.phoneNumber || file.customerId || 'unknown',
        name: file.customerName || file.phoneNumber || 'Unknown', fileName: file.fileName,
        fileUrl: file.fileUrl, isImage: file.type === 'image', timestamp: file.timestamp || new Date().toISOString()
      };
      addMessage(msg);
    });

    return () => { socket.disconnect(); };
  }, []);

  const groupMessages = (msgs: Message[]) => {
    const map = new Map<string, Chat>();
    msgs.forEach(m => {
      const key = m.phone;
      if (!map.has(key)) map.set(key, { phone: key, name: m.name, lastMessage: '', lastTime: m.timestamp, messages: [] });
      const chat = map.get(key)!;
      chat.messages.push(m);
      if (m.timestamp > chat.lastTime) { chat.lastTime = m.timestamp; chat.lastMessage = m.fileName || m.text || ''; }
    });
    setChats(map);
  };

  const addMessage = (msg: Message) => {
    setChats(prev => {
      const map = new Map(prev);
      const key = msg.phone;
      if (!map.has(key)) map.set(key, { phone: key, name: msg.name, lastMessage: '', lastTime: msg.timestamp, messages: [] });
      const chat = map.get(key)!;
      chat.messages.unshift(msg);
      chat.lastMessage = msg.fileName || msg.text || '';
      chat.lastTime = msg.timestamp;
      return map;
    });
  };

  const handleShowQR = async () => { const r = await api.get('/whatsapp/qr'); if (r.data.qrCode) setQrCode(r.data.qrCode); };

  const sortedChats = Array.from(chats.values()).sort((a, b) => b.lastTime.localeCompare(a.lastTime));
  const activeChat = selectedChat ? chats.get(selectedChat) : null;

  // Not connected - show QR
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
      {/* Chat List (left) */}
      <div className="w-72 border-r border-white/5 flex flex-col">
        <div className="p-3 border-b border-white/5 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-sm text-white font-medium">WhatsApp</span>
          <span className="text-[10px] text-gray-500 ml-auto">{sortedChats.length} chats</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sortedChats.length === 0 ? (
            <p className="text-center text-gray-600 text-xs py-8">No messages yet</p>
          ) : sortedChats.map(chat => (
            <div key={chat.phone} onClick={() => setSelectedChat(chat.phone)}
              className={`px-3 py-3 border-b border-white/5 cursor-pointer hover:bg-white/5 ${selectedChat === chat.phone ? 'bg-blue-600/10' : ''}`}>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-green-600/20 flex items-center justify-center text-green-400 text-xs font-bold shrink-0">
                  {chat.name[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{chat.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">{chat.lastMessage || 'No messages'}</p>
                </div>
                <span className="text-[10px] text-gray-600 shrink-0">{new Date(chat.lastTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat View (right) */}
      <div className="flex-1 flex flex-col">
        {!activeChat ? (
          <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">Select a chat</div>
        ) : (
          <>
            <div className="h-14 px-4 flex items-center gap-3 border-b border-white/5 shrink-0">
              <div className="w-9 h-9 rounded-full bg-green-600/20 flex items-center justify-center text-green-400 font-bold text-sm">
                {activeChat.name[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{activeChat.name}</p>
                <p className="text-[10px] text-gray-500">{activeChat.phone}</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {[...activeChat.messages].reverse().map(msg => {
                const ext = msg.fileName?.split('.').pop()?.toLowerCase() || '';
                const isImg = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
                const isVideo = ['mp4','3gp','mov','avi','mkv','webm'].includes(ext);
                const isPdf = ext === 'pdf';
                const isAudio = ['mp3','ogg','wav','aac','m4a','opus'].includes(ext);
                const thumbUrl = msg.fileUrl?.replace('sz=w200','sz=w400') || msg.fileUrl;
                const typeLabel = isImg ? 'Photo' : isVideo ? 'Video' : isPdf ? 'PDF Document' : isAudio ? 'Audio' : ext ? ext.toUpperCase()+' File' : 'Message';
                const typeIcon = isImg ? '🖼️' : isVideo ? '🎬' : isPdf ? '📕' : isAudio ? '🎵' : '📄';
                const timeAgo = (() => { const d=Date.now()-new Date(msg.timestamp).getTime(); return d<60000?'just now':d<3600000?Math.floor(d/60000)+'m ago':d<86400000?Math.floor(d/3600000)+'h ago':new Date(msg.timestamp).toLocaleDateString(); })();
                if (msg.text && !msg.fileName) return (
                  <div key={msg.id} className="bg-[#1a2236] rounded-lg px-3 py-2 max-w-[80%]">
                    <p className="text-sm text-gray-300">{msg.text}</p>
                    <p className="text-[10px] text-gray-600 mt-1">{timeAgo}</p>
                  </div>
                );
                return (
                <div key={msg.id} className="bg-[#1a2236] border border-white/5 rounded-lg p-2.5 flex gap-3 max-w-[420px] hover:border-blue-500/20 transition group">
                  {/* Thumbnail */}
                  <a href={thumbUrl} target="_blank" rel="noreferrer" className="shrink-0">
                    {isImg ? (
                      <img src={thumbUrl} className="w-16 h-16 object-cover rounded-md" />
                    ) : (
                      <div className="w-16 h-16 rounded-md bg-white/5 flex items-center justify-center text-2xl">{typeIcon}</div>
                    )}
                  </a>
                  {/* Metadata */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{msg.fileName || 'Unknown'}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{typeLabel} · {timeAgo}</p>
                    {/* Actions */}
                    <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition">
                      <a href={thumbUrl} target="_blank" rel="noreferrer" className="text-[10px] px-2 py-0.5 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30">Open</a>
                      <a href={thumbUrl} download className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400 hover:text-white">Download</a>
                    </div>
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
