import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../services/api.service';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setTokens, setUser } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const isEmail = email.includes('@');
      const res = await authApi.login(isEmail ? email : null, isEmail ? null : email, password);
      setTokens(res.data.accessToken, res.data.refreshToken);
      setUser(res.data.user);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080d19]">
      <div className="w-full max-w-sm p-8 bg-[#0d1220] rounded-xl border border-border">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[22px]" style={{fontVariationSettings:"'FILL' 1"}}>bolt</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">CyberControl</h1>
            <p className="text-xs text-muted-foreground">Operator Hub</p>
          </div>
        </div>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide">Email or Phone</label>
            <input type="text" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-[#1a2236] border border-border rounded-lg text-sm text-white outline-none focus:border-primary"
              placeholder="email@example.com" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-[#1a2236] border border-border rounded-lg text-sm text-white outline-none focus:border-primary"
              placeholder="••••••••" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary/90 disabled:opacity-50">
            {loading ? 'Logging in...' : '🔐 Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
