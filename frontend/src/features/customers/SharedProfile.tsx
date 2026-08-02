import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, DownloadSimple, Check, SignIn } from '@phosphor-icons/react';
import { SOCKET_URL } from '../../shared/api';
import api from '../../shared/api';
import { useAuthStore } from '../auth/store';

export default function SharedProfile() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { accessToken } = useAuthStore();
  const isLoggedIn = !!accessToken;
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [importError, setImportError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${SOCKET_URL}/api/customers/shared/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error); }))
      .then(d => setProfile(d))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleImport = async () => {
    setImporting(true); setImportError('');
    try {
      await api.post('/customers/import-shared', { token });
      setImported(true);
    } catch (e: any) { setImportError(e.response?.data?.error || 'Import failed'); }
    finally { setImporting(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <Spinner size={24} className="text-[#0a84ff] animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-red-400 text-sm">{error}</p>
        <p className="text-gray-600 text-xs mt-2">This link may be expired or invalid.</p>
      </div>
    </div>
  );

  if (!profile) return null;

  const fields = profile.fields || {};
  const sections: Record<string, [string, any][]> = {};
  for (const [k, v] of Object.entries(fields)) {
    const val = typeof v === 'object' && v !== null ? (v as any).value : v;
    if (!val) continue;
    const section = k.includes('10th') ? '10th Marksheet' : k.includes('12th') ? '12th Marksheet' : k.includes('graduation') ? 'Graduation' : 'Identity';
    if (!sections[section]) sections[section] = [];
    sections[section].push([k, val]);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 sm:p-8">
      <div className="max-w-lg mx-auto">
        <div className="rounded-2xl bg-[#1c1c1e] border border-white/10 p-6">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#0a84ff]/10 flex items-center justify-center text-[#0a84ff] text-lg font-semibold">
              {(profile.name || '?')[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-white">{profile.name}</h1>
              <p className="text-xs text-gray-500">{profile.phone} · {profile.relationship}</p>
            </div>
          </div>

          {/* Save / Import button */}
          <div className="mb-6">
            {imported ? (
              <div className="flex items-center gap-2 justify-center p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <Check size={16} weight="bold" className="text-emerald-400" />
                <span className="text-sm text-emerald-400 font-medium">Saved to your customers!</span>
                <button onClick={() => navigate('/app/customers')} className="text-xs text-[#0a84ff] ml-2 hover:underline">View →</button>
              </div>
            ) : isLoggedIn ? (
              <button onClick={handleImport} disabled={importing}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-[#0a84ff] hover:bg-[#0a84ff]/90 text-white text-sm font-medium transition-colors disabled:opacity-50">
                <DownloadSimple size={16} weight="bold" />
                {importing ? 'Saving...' : 'Save to My Customers'}
              </button>
            ) : (
              <a href="/app" className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-[#0a84ff] hover:bg-[#0a84ff]/90 text-white text-sm font-medium transition-colors">
                <SignIn size={16} weight="bold" /> Login to Save This Profile
              </a>
            )}
            {importError && <p className="text-xs text-red-400 mt-2 text-center">{importError}</p>}
          </div>

          {/* Fields */}
          {Object.entries(sections).map(([section, entries]) => (
            <div key={section} className="mb-4">
              <h3 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">{section}</h3>
              <div className="space-y-1.5">
                {entries.map(([k, val]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-gray-400 capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="text-gray-200 text-right max-w-[60%] truncate">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {Object.keys(fields).length === 0 && (
            <p className="text-xs text-gray-600 text-center">No profile data available.</p>
          )}

          <p className="text-[10px] text-gray-600 mt-6 text-center">
            Shared via CyberControl · Expires {new Date(profile.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>
    </div>
  );
}
