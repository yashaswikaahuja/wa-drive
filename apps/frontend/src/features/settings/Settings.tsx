import { useState, useEffect, useCallback } from 'react';
import { User, GoogleDriveLogo, SignOut, CloudCheck, CloudSlash, Spinner, SealCheck, WarningCircle, EnvelopeSimple, Phone, PencilSimple, Key } from '@phosphor-icons/react';
import api, { API_URL, SOCKET_URL } from '../../shared/api';
import { useAuthStore } from '../../features/auth/store';
import PageHeader from '../../shared/PageHeader';
import { VerifyModal, type VerifyStatus, type Channel } from '../../shared/VerifyBanner';
import { toast } from '../../shared/toast';

export default function Settings() {
  const { user, logout, setUser } = useAuthStore();
  const [driveStatus, setDriveStatus] = useState<'disconnected' | 'connected' | 'loading'>('loading');
  const [vstatus, setVstatus] = useState<VerifyStatus | null>(null);
  const [verifyChannel, setVerifyChannel] = useState<Channel | null>(null);

  const loadVerify = useCallback(() => {
    api.get('/auth/verify-status', { skipErrorToast: true } as any).then(r => setVstatus(r.data)).catch(() => setVstatus(null));
  }, []);
  useEffect(() => { loadVerify(); }, [loadVerify]);

  // Refresh hasPassword from /auth/me (Google login responses omit it).
  useEffect(() => {
    api.get('/auth/me', { skipErrorToast: true } as any).then((r) => {
      const u = r.data;
      const cur = useAuthStore.getState().user;
      if (!cur || !u) return;
      setUser({
        ...cur,
        id: u.id || cur.id,
        workspaceId: u.workspace_id || cur.workspaceId,
        name: u.name ?? cur.name,
        email: u.email ?? cur.email,
        role: u.role ?? cur.role,
        hasPassword: !!u.has_password,
      });
    }).catch(() => {});
  }, [setUser]);

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
    window.open(SOCKET_URL + '/api/drive/auth?workspace=' + wsId, 'drive-auth', 'width=500,height=600,left=200,top=100');
    // Never read popup.closed — COOP against Google's OAuth origin logs a console error
    // even inside try/catch. Completion is via postMessage (DRIVE_CONNECTED) and status polls.
    const finish = () => {
      api.get('/drive/status')
        .then(r => setDriveStatus(r.data.connected ? 'connected' : 'disconnected'))
        .catch(() => setDriveStatus('disconnected'));
    };
    const timer = setInterval(finish, 2000);
    setTimeout(() => clearInterval(timer), 120_000);
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

        <PasswordPanel
          hasPassword={!!user?.hasPassword}
          verifyStatus={vstatus}
          onChanged={() => {
            const u = useAuthStore.getState().user;
            if (u) setUser({ ...u, hasPassword: true });
          }}
        />

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
            statusKnown={vstatus !== null}
            canVerify={!!(vstatus?.canVerifyEmail && vstatus?.email && !vstatus?.emailVerified)}
            onVerify={() => setVerifyChannel('email')} onSaved={onContactSaved} />
          <ContactRow channel="phone" Icon={Phone} label="Phone"
            value={vstatus?.phone ?? null} verified={!!vstatus?.phoneVerified}
            statusKnown={vstatus !== null}
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

function PasswordPanel({
  hasPassword,
  verifyStatus,
  onChanged,
}: {
  hasPassword: boolean;
  verifyStatus: VerifyStatus | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-5 pt-4 border-t border-[hsl(var(--pt-border-soft))]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-start gap-2">
          <Key size={14} className="text-gray-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-gray-200">Password</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {hasPassword
                ? 'Set — used for email sign-in and CLI'
                : 'Not set — create one to sign in with email or CLI'}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="btn-primary text-xs shrink-0">
          {hasPassword ? 'Update' : 'Create'}
        </button>
      </div>
      {open && (
        <PasswordModal
          hasPassword={hasPassword}
          verifyStatus={verifyStatus}
          onClose={() => setOpen(false)}
          onChanged={() => { onChanged(); setOpen(false); }}
        />
      )}
    </div>
  );
}

function PasswordModal({
  hasPassword,
  verifyStatus,
  onClose,
  onChanged,
}: {
  hasPassword: boolean;
  verifyStatus: VerifyStatus | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const email = verifyStatus?.email || useAuthStore.getState().user?.email || '';
  const phone = verifyStatus?.phone || '';
  const [channel, setChannel] = useState<'email' | 'phone'>(email ? 'email' : 'phone');
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [masked, setMasked] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function sendOtp() {
    setErr('');
    setBusy(true);
    try {
      const r = await api.post('/auth/password/request-otp', { channel }, { skipErrorToast: true } as any);
      setOtpSent(true);
      setMasked(r.data?.masked || '');
      toast.success(channel === 'email' ? 'Code sent to your email' : 'Code sent to your WhatsApp');
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Could not send code');
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (next.length < 8) { setErr('Password must be at least 8 characters'); return; }
    if (next !== confirm) { setErr('Passwords do not match'); return; }
    if (hasPassword && !code.trim()) { setErr('Enter the verification code'); return; }
    setBusy(true);
    try {
      await api.patch('/auth/password', {
        password: next,
        ...(hasPassword ? { channel, code: code.trim() } : {}),
      }, { skipErrorToast: true } as any);
      toast.success(hasPassword ? 'Password updated' : 'Password created — you can sign in with email now');
      onChanged();
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Could not save password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border shadow-2xl p-6"
        style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))' }}
      >
        <h2 className="pt-display text-lg font-bold" style={{ color: 'hsl(var(--pt-ink))' }}>
          {hasPassword ? 'Update password' : 'Create password'}
        </h2>
        <p className="text-xs pt-muted mt-1 mb-4">
          {hasPassword
            ? 'We’ll send a one-time code to your email or WhatsApp to confirm it’s you.'
            : 'Create a password so you can also sign in with email and use the CLI.'}
        </p>

        <form onSubmit={submit} className="space-y-3">
          {hasPassword && (
            <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'hsl(var(--pt-border))' }}>
              <p className="text-xs font-medium" style={{ color: 'hsl(var(--pt-ink))' }}>Verify with</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!email}
                  onClick={() => { setChannel('email'); setOtpSent(false); setCode(''); }}
                  className={`flex-1 text-xs rounded-lg px-2 py-2 border ${channel === 'email' ? 'btn-primary border-transparent' : 'pt-chip'}`}
                  title={email || 'No email on account'}
                >
                  Email{email ? '' : ' (missing)'}
                </button>
                <button
                  type="button"
                  disabled={!phone}
                  onClick={() => { setChannel('phone'); setOtpSent(false); setCode(''); }}
                  className={`flex-1 text-xs rounded-lg px-2 py-2 border ${channel === 'phone' ? 'btn-primary border-transparent' : 'pt-chip'}`}
                  title={phone || 'No WhatsApp number on account'}
                >
                  WhatsApp{phone ? '' : ' (missing)'}
                </button>
              </div>
              {!email && !phone && (
                <p className="text-[11px]" style={{ color: 'hsl(0 65% 48%)' }}>
                  Add an email or WhatsApp number under Contact verification first.
                </p>
              )}
              {!otpSent ? (
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={busy || (!email && !phone) || (channel === 'email' ? !email : !phone)}
                  className="btn-primary text-xs w-full"
                >
                  {busy ? 'Sending…' : 'Send code'}
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] pt-muted">Code sent{masked ? ` to ${masked}` : ''}</p>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="input-field text-sm"
                    placeholder="6-digit code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                  <button type="button" onClick={sendOtp} disabled={busy} className="pt-chip text-xs w-full">
                    Resend code
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs pt-muted mb-1 block" htmlFor="pw-new">
              {hasPassword ? 'New password' : 'Password'}
            </label>
            <input
              id="pw-new"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="input-field text-sm"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label className="text-xs pt-muted mb-1 block" htmlFor="pw-confirm">Confirm password</label>
            <input
              id="pw-confirm"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="input-field text-sm"
              placeholder="Re-enter password"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Show passwords
          </label>

          {err && <p className="text-[11px]" style={{ color: 'hsl(0 65% 48%)' }}>{err}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="pt-chip flex-1">Cancel</button>
            <button
              type="submit"
              disabled={busy || (hasPassword && !otpSent)}
              className="btn-primary text-xs flex-1"
            >
              {busy ? 'Saving…' : (hasPassword ? 'Update password' : 'Create password')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContactRow({ channel, Icon, label, value, verified, statusKnown, canVerify, onVerify, onSaved }: {
  channel: Channel;
  Icon: React.ComponentType<any>;
  label: string;
  value: string | null;
  verified: boolean;
  /** False while /auth/verify-status is still loading — avoid "Not verified" flash (#307). */
  statusKnown: boolean;
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
          {value && statusKnown && (verified ? (
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
