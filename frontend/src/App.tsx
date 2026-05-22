import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';

interface FileItem {
  id: string; file_name: string; sender_name: string; sender_phone: string;
  thumbnail_url: string; mime_type: string; created_at: string;
}

export default function App() {
  const [waStatus, setWaStatus] = useState<any>(null);
  const [driveConnected, setDriveConnected] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);

  const pollStatus = async () => {
    const res = await fetch(`/api/whatsapp/status/${WORKSPACE_ID}`);
    const data = await res.json();
    setWaStatus(data);
  };

  const loadFiles = async () => {
    const res = await fetch(`/api/files/${WORKSPACE_ID}`);
    setFiles(await res.json());
  };

  const checkDrive = async () => {
    const res = await fetch(`/api/drive/status/${WORKSPACE_ID}`);
    const data = await res.json();
    setDriveConnected(data.connected);
  };

  useEffect(() => { pollStatus(); checkDrive(); loadFiles(); }, []);
  useEffect(() => {
    if (waStatus?.status === 'qr_pending' || waStatus?.status === 'connecting') {
      const t = setInterval(pollStatus, 3000);
      return () => clearInterval(t);
    }
  }, [waStatus?.status]);

  const connectWhatsApp = async () => {
    setLoading(true);
    await fetch('/api/whatsapp/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: WORKSPACE_ID }) });
    setTimeout(pollStatus, 2000);
    setLoading(false);
  };

  const disconnectWhatsApp = async () => {
    await fetch('/api/whatsapp/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: WORKSPACE_ID }) });
    pollStatus();
  };

  const connectDrive = async () => {
    const res = await fetch(`/api/drive/auth-url/${WORKSPACE_ID}`);
    const { url } = await res.json();
    window.open(url, '_blank', 'width=500,height=600');
    window.addEventListener('message', (e) => { if (e.data?.type === 'DRIVE_CONNECTED') { setDriveConnected(true); } }, { once: true });
  };

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <h1 style={{ fontSize: 24 }}>⚡ CyberControl</h1>

      {/* WhatsApp Section */}
      <section style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>💬 WhatsApp</h2>
        {waStatus?.connected ? (
          <div>
            <p style={{ color: '#16a34a' }}>✅ Connected as {waStatus.phone}</p>
            <button onClick={disconnectWhatsApp} style={btnStyle('#ef4444')}>Disconnect</button>
          </div>
        ) : waStatus?.qr ? (
          <div style={{ textAlign: 'center' }}>
            <p>Scan this QR with WhatsApp:</p>
            <QRCodeSVG value={waStatus.qr} size={256} />
            <p style={{ color: '#6b7280', fontSize: 12 }}>Waiting for scan...</p>
          </div>
        ) : (
          <button onClick={connectWhatsApp} disabled={loading} style={btnStyle('#22c55e')}>
            {loading ? 'Connecting...' : 'Connect WhatsApp'}
          </button>
        )}
      </section>

      {/* Drive Section */}
      <section style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>📁 Google Drive</h2>
        {driveConnected ? (
          <p style={{ color: '#2563eb' }}>✅ Drive connected</p>
        ) : (
          <button onClick={connectDrive} style={btnStyle('#3b82f6')}>Connect Google Drive</button>
        )}
      </section>

      {/* File Inbox */}
      <section style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>📥 Inbox</h2>
          <button onClick={loadFiles} style={btnStyle('#6b7280')}>Refresh</button>
        </div>
        {files.length === 0 ? (
          <p style={{ color: '#9ca3af' }}>No files yet. Connect WhatsApp and send a document!</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {files.map(f => (
              <div key={f.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <img src={f.thumbnail_url} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{f.file_name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>From: {f.sender_name} • {new Date(f.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const btnStyle = (bg: string): React.CSSProperties => ({
  background: bg, color: '#fff', border: 'none', padding: '10px 20px',
  borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
});
