import { useState, useEffect } from 'react';
import { User, GoogleDriveLogo, SignOut, CloudCheck, CloudSlash, Spinner } from '@phosphor-icons/react';
import api, { API_URL, SOCKET_URL } from '../../shared/api';
import { useAuthStore } from '../../features/auth/store';
import PageHeader from '../../shared/PageHeader';

export default function Settings() {
  const { user, logout } = useAuthStore();
  const [driveStatus, setDriveStatus] = useState<'disconnected' | 'connected' | 'loading'>('loading');

  useEffect(() => {
    api.get('/drive/status')
      .then(r => setDriveStatus(r.data.connected ? 'connected' : 'disconnected'))
      .catch(() => setDriveStatus('disconnected'));
  }, []);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'DRIVE_CONNECTED') setDriveStatus('connected');
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function connectDrive() {
    setDriveStatus('loading');
    const token = useAuthStore.getState().accessToken || '';
    const payload = token.split('.')[1];
    const wsId = payload ? JSON.parse(atob(payload)).workspaceId || '' : '';
    const popup = window.open(SOCKET_URL + '/api/drive/auth?workspace=' + wsId, 'drive-auth', 'width=500,height=600,left=200,top=100');
    const timer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(timer);
        api.get('/drive/status').then(r => setDriveStatus(r.data.connected ? 'connected' : 'disconnected')).catch(() => setDriveStatus('disconnected'));
      }
    }, 500);
  }

  return (
    <div className="max-w-lg">
      <PageHeader title="Settings" />

      <section className="card mb-4">
        <div className="flex items-center gap-2 mb-4">
          <User size={16} className="text-gray-400" />
          <h3 className="text-sm font-medium text-gray-300">Account</h3>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="text-gray-200">{user?.name}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-gray-200">{user?.email}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Role</span><span className="badge badge-info">{user?.role}</span></div>
        </div>
        <button onClick={logout} className="mt-4 btn-ghost text-red-400 hover:text-red-300 flex items-center gap-2 px-0">
          <SignOut size={14} /> Sign out
        </button>
      </section>

      <section className="card mb-4">
        <div className="flex items-center gap-2 mb-4">
          <GoogleDriveLogo size={16} className="text-gray-400" />
          <h3 className="text-sm font-medium text-gray-300">Google Drive</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">Connect Google Drive to receive WhatsApp files</p>
        <div className="flex items-center gap-3">
          {driveStatus === 'connected' ? <CloudCheck size={20} className="text-emerald-400" /> : driveStatus === 'loading' ? <Spinner size={20} className="text-amber-400 animate-spin" /> : <CloudSlash size={20} className="text-red-400" />}
          <span className="text-sm text-gray-200">{driveStatus === 'connected' ? 'Connected' : driveStatus === 'loading' ? 'Checking...' : 'Disconnected'}</span>
          <button onClick={connectDrive} disabled={driveStatus === 'loading'} className="ml-auto btn-primary text-xs">
            {driveStatus === 'connected' ? 'Reconnect' : 'Connect Drive'}
          </button>
        </div>
      </section>

      <section className="card">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Platform</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-gray-500">Backend</span><span className="text-gray-400 font-mono truncate ml-4">{API_URL}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Workspace</span><span className="text-gray-400 font-mono">{user?.workspaceId?.slice(0, 8)}</span></div>
        </div>
      </section>
    </div>
  );
}
