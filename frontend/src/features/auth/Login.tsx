import { useState } from 'react';
import { useAuthStore } from '../auth/store';
import axios from 'axios';
import { API_URL } from '../../shared/api';

export default function Login() {
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setTokens, setUser } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const isEmail = identity.includes('@');
      const res = await axios.post(`${API_URL}/auth/login`, {
        email: isEmail ? identity : undefined,
        phone: isEmail ? undefined : identity,
        password,
      });
      setTokens(res.data.accessToken, res.data.refreshToken);
      setUser(res.data.user);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080d19]">
      <form onSubmit={handleSubmit} className="w-full max-w-sm p-8 bg-[#0d1220] rounded-xl border border-white/10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 text-xl">⚡</div>
          <div>
            <h1 className="text-lg font-bold text-white">CyberControl</h1>
            <p className="text-xs text-gray-500">Operator Platform</p>
          </div>
        </div>
        <div className="space-y-4">
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
        </div>
      </form>
    </div>
  );
}
