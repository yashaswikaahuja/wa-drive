import { useState, useEffect, useRef } from 'react';
import { Lightning, Eye, EyeSlash } from '@phosphor-icons/react';
import { useAuthStore } from '../auth/store';
import { extensionBridge } from '../../shared/extensionBridge';
import axios from 'axios';
import { API_URL } from '../../shared/api';

const GOOGLE_CLIENT_ID = '62092486976-jhsn62q3ufj4dvr42c1hpubnujasaqok.apps.googleusercontent.com';

export default function Login() {
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setTokens, setUser } = useAuthStore();
  const googleBtnRef = useRef<HTMLDivElement>(null);

  function onLoginSuccess(data: any) {
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    extensionBridge.connect({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user, backendUrl: API_URL }).catch(() => {});
  }

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
            const res = await axios.post(`${API_URL}/auth/google`, { credential: response.credential });
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
    setError(''); setLoading(true);
    try {
      const isEmail = identity.includes('@');
      const res = await axios.post(`${API_URL}/auth/login`, { email: isEmail ? identity : undefined, phone: isEmail ? undefined : identity, password });
      onLoginSuccess(res.data);
    } catch (err: any) { setError(err.response?.data?.error || 'Login failed'); }
    finally { setLoading(false); }
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

        <div ref={googleBtnRef} className="mb-4 flex justify-center" />

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <span className="text-xs pt-muted">or</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-identity" className="text-xs pt-muted mb-1 block">Email or Phone</label>
            <input id="login-identity" type="text" autoComplete="username" autoFocus value={identity} onChange={e => setIdentity(e.target.value)} className="input-field" placeholder="you@example.com" />
          </div>
          <div>
            <label htmlFor="login-password" className="text-xs pt-muted mb-1 block">Password</label>
            <div className="relative">
              <input id="login-password" type={showPw ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="input-field pr-10" placeholder="Enter password" />
              <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 pt-muted transition-colors hover:text-ink">
                {showPw ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {error && <p className="text-xs" style={{ color: 'hsl(0 65% 48%)' }}>{error}</p>}
          <button type="submit" disabled={loading} className="w-full btn-primary py-2.5">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

