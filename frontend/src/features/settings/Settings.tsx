import { useState, useEffect } from 'react';
import api, { API_URL, SOCKET_URL } from '../../shared/api';
import { useAuthStore } from '../../features/auth/store';

export default function Settings() {
  const { user, logout } = useAuthStore();
  const [driveStatus, setDriveStatus] = useState<'disconnected' | 'connected' | 'loading'>('disconnected');

  // Check Drive connection on mount
  useEffect(() => {
    api.get('/drive/status')
      .then(r => setDriveStatus(r.data.connected ? 'connected' : 'disconnected'))
      .catch(() => setDriveStatus('disconnected'));
  }, []);

  // Listen for DRIVE_CONNECTED message from the OAuth popup
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'DRIVE_CONNECTED') setDriveStatus('connected');
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function connectDrive() {
    setDriveStatus('loading');
    // Open backend OAuth redirect in a popup — backend handles code exchange and token storage
    const token = useAuthStore.getState().accessToken || '';
    const payload = token.split('.')[1];
    const wsId = payload ? JSON.parse(atob(payload)).workspaceId || '' : '';
    const popup = window.open(
      SOCKET_URL + '/api/drive/auth?workspace=' + wsId,
      'drive-auth',
      'width=500,height=600,left=200,top=100'
    );
    // Fallback: if popup closed without message, re-check status
    const timer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(timer);
        api.get('/drive/status')
          .then(r => setDriveStatus(r.data.connected ? 'connected' : 'disconnected'))
          .catch(() => setDriveStatus('disconnected'));
      }
    }, 500);
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold text-white mb-6">Settings</h1>

      {/* Account */}
      <div className="bg-[#0d1220] border border-white/5 rounded-xl p-5 mb-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Account</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="text-white">{user?.name}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-white">{user?.email}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Role</span><span className="text-white">{user?.role}</span></div>
        </div>
        <button onClick={logout} className="mt-4 px-4 py-2 bg-red-600/20 text-red-400 text-xs rounded-lg hover:bg-red-600/30">Logout</button>
      </div>

      {/* Google Drive */}
      <div className="bg-[#0d1220] border border-white/5 rounded-xl p-5 mb-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Google Drive</h3>
        <p className="text-xs text-gray-500 mb-3">Connect Google Drive to receive WhatsApp files</p>
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${driveStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-white">{driveStatus === 'connected' ? 'Connected' : 'Disconnected'}</span>
          <button onClick={connectDrive} disabled={driveStatus === 'loading'}
            className="ml-auto px-4 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {driveStatus === 'loading' ? 'Connecting...' : driveStatus === 'connected' ? 'Reconnect' : 'Connect Drive'}
          </button>
        </div>
        {driveStatus === 'connected' && (
          <p className="text-xs text-green-400/70 mt-2">✓ Auto-refresh active — stays connected permanently</p>
        )}
      </div>

      {/* Backend Info */}
      <div className="bg-[#0d1220] border border-white/5 rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Platform</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-gray-500">Backend</span><span className="text-gray-400 truncate ml-4">{API_URL}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Workspace</span><span className="text-gray-400">{user?.workspaceId?.slice(0, 8)}</span></div>
        </div>
      </div>
    </div>
  );
}
