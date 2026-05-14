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

    // Load existing inbox messages
    api.get('/inbox/list').then(r => {
      const msgs: Message[] = r.data.map((m: any) => ({
        id: m.id, phone: m.phone || 'unknown', name: m.senderName || m.phone || 'Unknown',
        fileName: m.file || undefined, text: m.text || undefined,
        isImage: m.isImage, timestamp: m.time, fileUrl: m.filePath ? API_URL.replace('/api','') + '/inbox/file/' + m.id : undefined
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
              {[...activeChat.messages].reverse().map(msg => (
                <div key={msg.id} className="max-w-[70%]">
                  <div className="bg-[#1a2236] rounded-lg p-3">
                    {msg.isImage && msg.fileUrl && <img src={msg.fileUrl} className="rounded max-w-full max-h-48 mb-2" />}
                    {msg.fileName && !msg.isImage && (
                      <div className="flex items-center gap-2 text-sm text-blue-400">📄 {msg.fileName}</div>
                    )}
                    {msg.text && <p className="text-sm text-gray-300">{msg.text}</p>}
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
