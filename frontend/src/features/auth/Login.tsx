import { useState, useEffect, useRef } from 'react';
import { Lightning, Eye, EyeSlash } from '@phosphor-icons/react';
import { useAuthStore } from '../auth/store';
import { extensionBridge } from '../../shared/extensionBridge';
import axios from 'axios';
import { API_URL } from '../../shared/api';

const GOOGLE_CLIENT_ID = '62092486976-jhsn62q3ufj4dvr42c1hpubnujasaqok.apps.googleusercontent.com';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register' | 'verify'>('login');
  const [identity, setIdentity] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [requiresInvite, setRequiresInvite] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // verify step
  const [pendingId, setPendingId] = useState('');
  const [needsEmail, setNeedsEmail] = useState(false);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [notice, setNotice] = useState('');
  const { setTokens, setUser } = useAuthStore();
  const googleBtnRef = useRef<HTMLDivElement>(null);

  function switchMode(m: 'login' | 'register') { setMode(m); setError(''); setPassword(''); setConfirm(''); }

  function onLoginSuccess(data: any) {
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    extensionBridge.connect({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user, backendUrl: API_URL }).catch(() => {});
  }

  // Does self-serve signup require an invite code? (open by default)
  useEffect(() => {
    axios.get(`${API_URL}/auth/signup-config`)
      .then(r => setRequiresInvite(!!r.data?.requiresInvite))
      .catch(() => setRequiresInvite(false));
  }, []);

  useEffect(() => {
    const scriptId = 'google-gsi';
    if (document.getElementById(scriptId)) { initGoogle(); return; }
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = initGoogle;
    document.head.appendChild(script);

    function initGoogle() {
      const w = window as any;
      if (!w.google?.accounts?.id) return;
      w.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response: any) => {
          setLoading(true); setError('');
          try {
            const res = await axios.post(`${API_URL}/auth/google`, { credential: response.credential }, { withCredentials: true });
            onLoginSuccess(res.data);
          } catch (e: any) { setError(e.response?.data?.error || 'Google login failed'); }
          finally { setLoading(false); }
        },
      });
      if (googleBtnRef.current) {
        // Clamp to the container so the button never overflows a narrow phone (GSI allows 200–400).
        const btnW = Math.min(Math.max(Math.floor(googleBtnRef.current.clientWidth) || 320, 200), 400);
        w.google.accounts.id.renderButton(googleBtnRef.current, { theme: 'outline', size: 'large', width: btnW, text: 'signin_with' });
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'register') {
      if (!email && !phone) { setError('Enter an email or phone'); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
      if (password !== confirm) { setError('Passwords do not match'); return; }
      if (requiresInvite && !inviteCode.trim()) { setError('An invite code is required to sign up'); return; }
      setLoading(true);
      try {
        const res = await axios.post(`${API_URL}/auth/register`, {
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          password,
          inviteCode: inviteCode.trim() || undefined,
        }, { withCredentials: true });
        if (res.data?.pending) {
          setPendingId(res.data.pendingId);
          setNeedsEmail(!!res.data.needsEmail);
          setNeedsPhone(!!res.data.needsPhone);
          setEmailCode(''); setPhoneCode(''); setNotice('');
          setMode('verify');
        } else {
          onLoginSuccess(res.data);
        }
      } catch (err: any) { setError(err.response?.data?.error || 'Registration failed'); }
      finally { setLoading(false); }
      return;
    }
    setLoading(true);
    try {
      const isEmail = identity.includes('@');
      const res = await axios.post(`${API_URL}/auth/login`, { email: isEmail ? identity : undefined, phone: isEmail ? undefined : identity, password }, { withCredentials: true });
      onLoginSuccess(res.data);
    } catch (err: any) { setError(err.response?.data?.error || 'Login failed'); }
    finally { setLoading(false); }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setNotice(''); setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/verify-signup`, {
        pendingId,
        emailCode: emailCode.trim() || undefined,
        phoneCode: phoneCode.trim() || undefined,
      }, { withCredentials: true });
      onLoginSuccess(res.data);
    } catch (err: any) { setError(err.response?.data?.error || 'Verification failed'); }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    setError(''); setNotice('');
    try {
      await axios.post(`${API_URL}/auth/resend-otp`, { pendingId });
      setNotice('A new code has been sent.');
    } catch (err: any) { setError(err.response?.data?.error || 'Could not resend code'); }
  };

  return (
    <div className="pt-paper min-h-[100dvh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm p-8 card">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: 'hsl(var(--pt-marigold) / 0.15)' }}>
            <Lightning size={20} weight="fill" style={{ color: 'hsl(var(--pt-marigold-deep))' }} />
          </div>
          <div>
            <h1 className="pt-display text-lg font-bold tracking-tight" style={{ color: 'hsl(var(--pt-ink))' }}>CyberControl</h1>
            <p className="text-xs pt-muted">Operator Platform</p>
          </div>
        </div>

        {mode === 'verify' ? (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <h2 className="pt-display text-base font-bold" style={{ color: 'hsl(var(--pt-ink))' }}>Verify your contact</h2>
              <p className="text-xs pt-muted mt-1">
                Enter the code we sent to {[needsEmail && email, needsPhone && `WhatsApp ${phone}`].filter(Boolean).join(' and ')}.
              </p>
            </div>
            {needsEmail && (
              <div>
                <label htmlFor="v-email" className="text-xs pt-muted mb-1 block">Email code</label>
                <input id="v-email" inputMode="numeric" autoComplete="one-time-code" autoFocus value={emailCode} onChange={e => setEmailCode(e.target.value)} className="input-field tracking-widest" placeholder="6-digit code" />
              </div>
            )}
            {needsPhone && (
              <div>
                <label htmlFor="v-phone" className="text-xs pt-muted mb-1 block">WhatsApp code</label>
                <input id="v-phone" inputMode="numeric" autoComplete="one-time-code" value={phoneCode} onChange={e => setPhoneCode(e.target.value)} className="input-field tracking-widest" placeholder="6-digit code" />
              </div>
            )}
            {notice && <p className="text-xs" style={{ color: 'hsl(142 64% 34%)' }}>{notice}</p>}
            {error && <p className="text-xs" style={{ color: 'hsl(0 65% 48%)' }}>{error}</p>}
            <button type="submit" disabled={loading} className="w-full btn-primary py-2.5">{loading ? 'Verifying…' : 'Verify & create account'}</button>
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={handleResend} className="font-semibold" style={{ color: 'hsl(var(--pt-marigold-deep))' }}>Resend code</button>
              <button type="button" onClick={() => switchMode('register')} className="pt-muted hover:text-ink">Back</button>
            </div>
          </form>
        ) : (
        <>
        <div ref={googleBtnRef} className="mb-4 flex justify-center" />

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <span className="text-xs pt-muted">or</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label htmlFor="reg-name" className="text-xs pt-muted mb-1 block">Name</label>
              <input id="reg-name" type="text" autoComplete="name" autoFocus value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Your name" />
            </div>
          )}

          {mode === 'login' ? (
            <div>
              <label htmlFor="login-identity" className="text-xs pt-muted mb-1 block">Email or Phone</label>
              <input id="login-identity" type="text" autoComplete="username" autoFocus value={identity} onChange={e => setIdentity(e.target.value)} className="input-field" placeholder="you@example.com" />
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="reg-email" className="text-xs pt-muted mb-1 block">Email</label>
                <input id="reg-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="you@example.com" />
              </div>
              <div>
                <label htmlFor="reg-phone" className="text-xs pt-muted mb-1 block">Phone</label>
                <input id="reg-phone" type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} className="input-field" placeholder="9876543210" />
              </div>
            </>
          )}

          <div>
            <label htmlFor="login-password" className="text-xs pt-muted mb-1 block">Password</label>
            <div className="relative">
              <input id="login-password" type={showPw ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} className="input-field pr-10" placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter password'} />
              <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 pt-muted transition-colors hover:text-ink">
                {showPw ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label htmlFor="reg-confirm" className="text-xs pt-muted mb-1 block">Confirm password</label>
              <input id="reg-confirm" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className="input-field" placeholder="Re-enter password" />
            </div>
          )}

          {mode === 'register' && requiresInvite && (
            <div>
              <label htmlFor="reg-invite" className="text-xs pt-muted mb-1 block">Invite code</label>
              <input id="reg-invite" type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value)} className="input-field" placeholder="Enter your invite code" />
            </div>
          )}

          {error && <p className="text-xs" style={{ color: 'hsl(0 65% 48%)' }}>{error}</p>}
          <button type="submit" disabled={loading} className="w-full btn-primary py-2.5">
            {loading ? (mode === 'register' ? 'Creating account…' : 'Logging in…') : (mode === 'register' ? 'Create account' : 'Login')}
          </button>
        </form>

        <p className="text-xs pt-muted text-center mt-5">
          {mode === 'login' ? (
            <>New to CyberControl?{' '}
              <button type="button" onClick={() => switchMode('register')} className="font-semibold" style={{ color: 'hsl(var(--pt-marigold-deep))' }}>Create an account</button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button type="button" onClick={() => switchMode('login')} className="font-semibold" style={{ color: 'hsl(var(--pt-marigold-deep))' }}>Sign in</button>
            </>
          )}
        </p>
        </>
        )}
      </div>
    </div>
  );
}

