import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import api, { API_URL } from '../../lib/api';

interface ReceivedFile {
  id: string; fileName: string; from: string; timestamp: string; fileUrl?: string;
}

export default function WhatsApp() {
  const [connected, setConnected] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [files, setFiles] = useState<ReceivedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Check status + load existing files
    api.get('/whatsapp/status').then(r => { setConnected(r.data.connected); setLoading(false); }).catch(() => setLoading(false));
    api.get('/inbox/list').then(r => {
      const inbox = r.data.filter((m: any) => m.filePath);
      setFiles(inbox.map((m: any) => ({ id: m.id, fileName: m.file || m.filePath, from: m.from || '', timestamp: m.time || '' })));
    }).catch(() => {});

    // Connect socket
    const baseUrl = API_URL.replace('/api', '');
    const socket = io(baseUrl, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connection:status', (data: any) => {
      setConnected(data.connected);
      if (data.connected) setQrCode(null);
    });
    socket.on('qr', (data: any) => { setQrCode(data.qr || data); });
    socket.on('new_whatsapp_file', (file: any) => {
      setFiles(prev => [{ id: file.id || Date.now().toString(), fileName: file.fileName, from: file.from || file.sender || '', timestamp: file.timestamp || new Date().toISOString(), fileUrl: file.fileUrl }, ...prev]);
    });

    return () => { socket.disconnect(); };
  }, []);

  const handleGetQR = async () => {
    try {
      const r = await api.get('/whatsapp/qr');
      if (r.data.qrCode) setQrCode(r.data.qrCode);
    } catch {}
  };

  const handleReconnect = async () => { await api.post('/whatsapp/reinit', {}); };
  const handleLogout = async () => { await api.post('/whatsapp/logout', {}); setConnected(false); };

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-6">WhatsApp</h1>

      {/* Connection Status */}
      <div className="bg-[#0d1220] border border-white/5 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-white font-medium">{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div className="flex gap-2">
            {!connected && <button onClick={handleGetQR} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Show QR</button>}
            {!connected && <button onClick={handleReconnect} className="px-3 py-1.5 bg-white/5 text-gray-400 text-xs rounded-lg hover:text-white">Reconnect</button>}
            {connected && <button onClick={handleLogout} className="px-3 py-1.5 bg-red-600/20 text-red-400 text-xs rounded-lg hover:bg-red-600/30">Disconnect</button>}
          </div>
        </div>

        {/* QR Code */}
        {qrCode && !connected && (
          <div className="mt-4 flex flex-col items-center">
            <p className="text-xs text-gray-500 mb-3">Scan with WhatsApp to connect</p>
            <div className="bg-white p-4 rounded-lg">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`} alt="QR" className="w-48 h-48" />
            </div>
          </div>
        )}
      </div>

      {/* Received Files */}
      <h2 className="text-sm font-medium text-gray-400 mb-3">Received Files</h2>
      {files.length === 0 ? (
        <p className="text-gray-600 text-sm text-center py-8">No files received yet. Documents sent via WhatsApp will appear here.</p>
      ) : (
        <div className="space-y-2">
          {files.map(f => (
            <div key={f.id} className="bg-[#0d1220] border border-white/5 rounded-xl p-4 flex items-center gap-3">
              <span className="text-lg">📄</span>
              <div className="flex-1">
                <p className="text-sm text-white">{f.fileName}</p>
                <p className="text-xs text-gray-500">From: {f.from}</p>
              </div>
              <p className="text-[10px] text-gray-600">{new Date(f.timestamp).toLocaleTimeString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
