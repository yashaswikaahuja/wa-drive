import { useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import api, { API_URL } from '../../shared/api';
import { useAuthStore } from '../../features/auth/store';

export default function Settings() {
  const { user, logout } = useAuthStore();
  const [driveStatus, setDriveStatus] = useState<'disconnected' | 'connected' | 'loading'>('disconnected');

  // Check Drive connection on mount
  useEffect(() => {
    fetch(API_URL + '/drive/files').then(r => r.json()).then(d => {
      if (Array.isArray(d) && d.length > 0) setDriveStatus('connected');
    }).catch(() => {});
  }, []);

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.file',
    onSuccess: (res) => {
      setDriveStatus('loading');
      fetch(API_URL + '/drive/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: res.access_token })
      }).then(() => setDriveStatus('connected')).catch(() => setDriveStatus('disconnected'));
    },
    onError: () => setDriveStatus('disconnected'),
  });

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
          <button onClick={() => login()} disabled={driveStatus === 'loading'}
            className="ml-auto px-4 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {driveStatus === 'loading' ? 'Connecting...' : driveStatus === 'connected' ? 'Reconnect' : 'Connect Drive'}
          </button>
        </div>
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
