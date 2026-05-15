import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../auth/store';
import { extensionBridge } from '../../shared/extensionBridge';
import axios from 'axios';
import { API_URL } from '../../shared/api';

const GOOGLE_CLIENT_ID = '62092486976-jhsn62q3ufj4dvr42c1hpubnujasaqok.apps.googleusercontent.com';

export default function Login() {
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setTokens, setUser } = useAuthStore();
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // After successful login, connect extension
  function onLoginSuccess(data: any) {
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    extensionBridge.connect({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      backendUrl: API_URL,
    }).catch(() => {});
  }

  // Load Google Identity Services script and render button
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
          } catch (e: any) {
            setError(e.response?.data?.error || 'Google login failed');
          } finally { setLoading(false); }
        },
      });
      if (googleBtnRef.current) {
        w.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'filled_black', size: 'large', width: 320, text: 'signin_with',
        });
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const isEmail = identity.includes('@');
      const res = await axios.post(`${API_URL}/auth/login`, {
        email: isEmail ? identity : undefined,
        phone: isEmail ? undefined : identity,
        password,
      });
      onLoginSuccess(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080d19]">
      <div className="w-full max-w-sm p-8 bg-[#0d1220] rounded-xl border border-white/10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 text-xl">⚡</div>
          <div>
            <h1 className="text-lg font-bold text-white">CyberControl</h1>
            <p className="text-xs text-gray-500">Operator Platform</p>
          </div>
        </div>

        {/* Google Sign-In */}
        <div ref={googleBtnRef} className="mb-4 flex justify-center" />

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-gray-600">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Email/password form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wider">Email or Phone</label>
            <input type="text" value={identity} onChange={e => setIdentity(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 bg-[#1a2236] border border-white/10 rounded-lg text-sm text-white outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wider">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 bg-[#1a2236] border border-white/10 rounded-lg text-sm text-white outline-none focus:border-blue-500" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
