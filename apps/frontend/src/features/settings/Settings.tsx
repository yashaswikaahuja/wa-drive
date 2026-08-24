import { useState, useEffect, useCallback } from 'react';
import { User, GoogleDriveLogo, SignOut, CloudCheck, CloudSlash, Spinner, SealCheck, WarningCircle, EnvelopeSimple, Phone, PencilSimple } from '@phosphor-icons/react';
import api, { API_URL, SOCKET_URL } from '../../shared/api';
import { useAuthStore } from '../../features/auth/store';
import PageHeader from '../../shared/PageHeader';
import { VerifyModal, type VerifyStatus, type Channel } from '../../shared/VerifyBanner';

export default function Settings() {
  const { user, logout } = useAuthStore();
  const [driveStatus, setDriveStatus] = useState<'disconnected' | 'connected' | 'loading'>('loading');
  const [vstatus, setVstatus] = useState<VerifyStatus | null>(null);
  const [verifyChannel, setVerifyChannel] = useState<Channel | null>(null);

  const loadVerify = useCallback(() => {
    api.get('/auth/verify-status', { skipErrorToast: true } as any).then(r => setVstatus(r.data)).catch(() => setVstatus(null));
  }, []);
  useEffect(() => { loadVerify(); }, [loadVerify]);

  const onContactSaved = useCallback((channel: Channel, value: string) => {
    loadVerify();
    if (channel === 'email') {
      const u = useAuthStore.getState().user;
      if (u) useAuthStore.getState().setUser({ ...u, email: value });
    }
  }, [loadVerify]);

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
          <SealCheck size={16} className="text-gray-400" />
          <h3 className="text-sm font-medium text-gray-300">Contact verification</h3>
        </div>
        <div className="space-y-4">
          <ContactRow channel="email" Icon={EnvelopeSimple} label="Email"
            value={vstatus?.email ?? user?.email ?? null} verified={!!vstatus?.emailVerified}
            canVerify={!!(vstatus?.canVerifyEmail && vstatus?.email && !vstatus?.emailVerified)}
            onVerify={() => setVerifyChannel('email')} onSaved={onContactSaved} />
          <ContactRow channel="phone" Icon={Phone} label="Phone"
            value={vstatus?.phone ?? null} verified={!!vstatus?.phoneVerified}
            canVerify={!!(vstatus?.canVerifyPhone && vstatus?.phone && !vstatus?.phoneVerified)}
            onVerify={() => setVerifyChannel('phone')} onSaved={onContactSaved} />
        </div>
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
          {useAuthStore.getState().user?.role === 'admin' ? (
            <button onClick={connectDrive} disabled={driveStatus === 'loading'} className="ml-auto btn-primary text-xs">
              {driveStatus === 'connected' ? 'Reconnect' : 'Connect Drive'}
            </button>
          ) : (
            <span className="ml-auto text-xs pt-muted">Managed by an admin</span>
          )}
        </div>
      </section>


      <section className="card">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Platform</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-gray-500">Backend</span><span className="text-gray-400 font-mono truncate ml-4">{API_URL}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Workspace</span><span className="text-gray-400 font-mono">{user?.workspaceId?.slice(0, 8)}</span></div>
        </div>
      </section>

      {verifyChannel && vstatus && (
        <VerifyModal pending={[verifyChannel]} status={vstatus} onClose={() => setVerifyChannel(null)} onChanged={loadVerify} />
      )}
    </div>
  );
}

function ContactRow({ channel, Icon, label, value, verified, canVerify, onVerify, onSaved }: {
  channel: Channel;
  Icon: React.ComponentType<any>;
  label: string;
  value: string | null;
  verified: boolean;
  canVerify: boolean;
  onVerify: () => void;
  onSaved: (channel: Channel, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(value || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setInput(value || ''); }, [value]);

  async function save() {
    const v = input.trim();
    if (!v) { setErr('Enter a value'); return; }
    setErr(''); setBusy(true);
    try {
      const r = await api.patch('/auth/contact', { [channel]: v }, { skipErrorToast: true } as any);
      setEditing(false);
      onSaved(channel, r.data?.[channel] ?? v);
    } catch (e: any) { setErr(e.response?.data?.error || 'Could not save'); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex items-start gap-3">
      <Icon size={16} className="text-gray-400 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        {editing ? (
          <div className="mt-1 flex flex-wrap gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} type={channel === 'email' ? 'email' : 'tel'}
              className="input-field text-sm flex-1 min-w-0" placeholder={channel === 'email' ? 'you@example.com' : '9876543210'} autoFocus />
            <button onClick={save} disabled={busy} className="btn-primary text-xs shrink-0">{busy ? '…' : 'Save'}</button>
            <button onClick={() => { setEditing(false); setErr(''); setInput(value || ''); }} className="pt-chip text-xs shrink-0">Cancel</button>
          </div>
        ) : (
          <p className="text-sm text-gray-200 truncate">{value || <span className="text-gray-500">Not added</span>}</p>
        )}
        {err && <p className="text-[11px] mt-1" style={{ color: 'hsl(0 65% 48%)' }}>{err}</p>}
      </div>
      {!editing && (
        <div className="flex items-center gap-2 shrink-0">
          {value && (verified ? (
            <span className="badge badge-success flex items-center gap-1"><SealCheck size={12} weight="fill" /> Verified</span>
          ) : canVerify ? (
            <button onClick={onVerify} className="btn-primary text-xs">Verify</button>
          ) : (
            <span className="badge flex items-center gap-1"><WarningCircle size={12} /> Not verified</span>
          ))}
          <button onClick={() => setEditing(true)} className="pt-muted hover:text-ink transition-colors" title={value ? `Change ${label}` : `Add ${label}`} aria-label={value ? `Change ${label}` : `Add ${label}`}>
            <PencilSimple size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
