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
    <div className="min-h-screen pt-paper flex items-center justify-center">
      <Spinner size={24} className="animate-spin" style={{ color: 'hsl(var(--pt-marigold))' }} />
    </div>
  );

  if (error) return (
    <div className="min-h-screen pt-paper flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-sm" style={{ color: '#e53e3e' }}>{error}</p>
        <p className="text-xs mt-2" style={{ color: 'hsl(var(--pt-muted))' }}>This link may be expired or invalid.</p>
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
    <div className="min-h-screen pt-paper p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Branding */}
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'hsl(var(--pt-marigold) / 0.12)' }}>
            <span className="text-xs font-bold" style={{ color: 'hsl(var(--pt-marigold-deep))' }}>CC</span>
          </div>
          <span className="text-sm font-medium" style={{ color: 'hsl(var(--pt-ink))' }}>CyberControl</span>
          <span className="text-xs" style={{ color: 'hsl(var(--pt-muted))' }}>· Shared Profile</span>
        </div>

        {/* Header card */}
        <div className="paper-card rounded-2xl p-5 mb-4" style={{ background: 'hsl(var(--pt-card))' }}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-semibold" style={{ background: 'hsl(var(--pt-marigold) / 0.12)', color: 'hsl(var(--pt-marigold-deep))' }}>
              {(profile.name || '?')[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight truncate" style={{ color: 'hsl(var(--pt-ink))' }}>{profile.name}</h1>
              <p className="text-sm" style={{ color: 'hsl(var(--pt-muted))' }}>{profile.phone} · {profile.relationship}</p>
            </div>
          </div>

          {/* Save button */}
          <div className="mt-4">
            {imported ? (
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'hsl(158 60% 36% / 0.08)', border: '1px solid hsl(158 60% 36% / 0.2)' }}>
                <Check size={16} weight="bold" style={{ color: 'hsl(158 60% 36%)' }} />
                <span className="text-sm font-medium" style={{ color: 'hsl(158 60% 36%)' }}>Saved to your customers!</span>
                <button onClick={() => navigate('/app/customers')} className="text-xs ml-auto hover:underline" style={{ color: 'hsl(var(--pt-marigold-deep))' }}>View →</button>
              </div>
            ) : isLoggedIn ? (
              <button onClick={handleImport} disabled={importing}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50 hover:opacity-90"
                style={{ background: 'hsl(var(--pt-marigold))' }}>
                <DownloadSimple size={16} weight="bold" />
                {importing ? 'Saving...' : 'Save to My Customers'}
              </button>
            ) : (
              <a href="/app" className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-white text-sm font-medium no-underline"
                style={{ background: 'hsl(var(--pt-marigold))' }}>
                <SignIn size={16} weight="bold" /> Login to Save This Profile
              </a>
            )}
            {importError && <p className="text-xs mt-2 text-center" style={{ color: '#e53e3e' }}>{importError}</p>}
          </div>
        </div>

        {/* Profile data section header */}
        <h2 className="text-xs uppercase tracking-[0.15em] mb-3 px-1" style={{ color: 'hsl(var(--pt-muted))' }}>Profile Data</h2>

        {/* Fields in section cards */}
        <div className="space-y-3">
          {Object.entries(sections).map(([section, entries]) => (
            <div key={section} className="rounded-2xl p-5" style={{ background: 'hsl(var(--pt-card))', border: '1px solid hsl(var(--pt-border))' }}>
              <p className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--pt-muted))' }}>{section}</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {entries.map(([k, val]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: 'hsl(var(--pt-muted))' }}>{k.replace(/_/g, ' ')}</span>
                    <span className="text-sm" style={{ color: 'hsl(var(--pt-ink))' }}>{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {Object.keys(fields).length === 0 && (
          <div className="rounded-2xl p-8 text-center" style={{ background: 'hsl(var(--pt-card))', border: '1px solid hsl(var(--pt-border))' }}>
            <p className="text-sm" style={{ color: 'hsl(var(--pt-muted))' }}>No profile data available.</p>
          </div>
        )}

        <p className="text-[10px] mt-6 text-center" style={{ color: 'hsl(var(--pt-muted))' }}>
          Expires {new Date(profile.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
}
