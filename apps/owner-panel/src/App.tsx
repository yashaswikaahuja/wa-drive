import { useCallback, useEffect, useRef, useState } from 'react';
import { ChartLine, Buildings, FileText, Brain, Gear, ArrowClockwise } from '@phosphor-icons/react';
import { ApiError, fetchMetrics, fetchFunnel, fetchTrends, fetchWorkspaces, loadConfig, saveConfig } from './api';
import type { Config, Metrics, Funnel, Trends, Workspace } from './api';
import { MetricsGrid, MetricsSkeleton } from './components/StatCards';
import { FunnelWidget } from './components/Funnel';
import { TrendsPanel } from './components/Trends';
import { WorkspacesTable, TableSkeleton } from './components/WorkspacesTable';
import { WorkspaceDrawer } from './components/WorkspaceDrawer';
import { Setup } from './components/Setup';
import { AiSettingsPanel } from './components/AiSettings';
import { FormsPanel } from './components/FormsPanel';
import { exportWorkspacesCsv } from './lib/csv';

type Section = 'overview' | 'workspaces' | 'forms' | 'ai' | 'settings';
type Sort = 'last_active' | 'created' | 'files' | 'health';

const NAV_ITEMS: { key: Section; label: string; icon: typeof ChartLine }[] = [
  { key: 'overview', label: 'Overview', icon: ChartLine },
  { key: 'workspaces', label: 'Workspaces', icon: Buildings },
  { key: 'forms', label: 'Forms', icon: FileText },
  { key: 'ai', label: 'AI', icon: Brain },
  { key: 'settings', label: 'Settings', icon: Gear },
];

function getInitialSection(): Section {
  const hash = window.location.hash.replace('#', '') as Section;
  if (NAV_ITEMS.some(n => n.key === hash)) return hash;
  const stored = sessionStorage.getItem('owner-section') as Section | null;
  if (stored && NAV_ITEMS.some(n => n.key === stored)) return stored;
  return 'overview';
}

export function App() {
  const [cfg, setCfg] = useState<Config>(loadConfig);
  const [needsSetup, setNeedsSetup] = useState(!cfg.key);
  const [section, setSection] = useState<Section>(getInitialSection);

  // Overview data
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);

  // Workspaces data
  const [rows, setRows] = useState<Workspace[] | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('last_active');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [setupError, setSetupError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Navigate to section
  const navigate = (s: Section) => {
    setSection(s);
    window.location.hash = s;
    sessionStorage.setItem('owner-section', s);
  };

  // Listen for hash changes (back/forward)
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace('#', '') as Section;
      if (NAV_ITEMS.some(n => n.key === h)) setSection(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Fetch overview data
  const loadOverview = useCallback(async (c: Config) => {
    setLoading(true); setError('');
    try {
      const [m, fn, tr] = await Promise.all([fetchMetrics(c), fetchFunnel(c), fetchTrends(c)]);
      setMetrics(m); setFunnel(fn); setTrends(tr); setUpdatedAt(new Date()); setNeedsSetup(false);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) { setNeedsSetup(true); setSetupError(err.message); }
      else setError(err.message);
    } finally { setLoading(false); }
  }, []);

  // Fetch workspaces
  const loadWorkspaces = useCallback(async (c: Config, query: string, s: Sort) => {
    setLoading(true); setError('');
    try {
      const w = await fetchWorkspaces(c, query, s);
      setRows(w); setNeedsSetup(false);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) { setNeedsSetup(true); setSetupError(err.message); }
      else setError(err.message);
    } finally { setLoading(false); }
  }, []);

  // Initial load on connect
  useEffect(() => {
    if (!cfg.key) return;
    if (section === 'overview') void loadOverview(cfg);
    else if (section === 'workspaces') void loadWorkspaces(cfg, '', 'last_active');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load section data when switching
  useEffect(() => {
    if (!cfg.key || needsSetup) return;
    if (section === 'overview' && !metrics) void loadOverview(cfg);
    if (section === 'workspaces' && !rows) void loadWorkspaces(cfg, '', 'last_active');
    // Forms/AI load their own data internally on mount
  }, [section, cfg, needsSetup, metrics, rows, loadOverview, loadWorkspaces]);

  // Debounced workspaces refetch on search/sort
  const first = useRef(true);
  useEffect(() => {
    if (needsSetup || !cfg.key || section !== 'workspaces') return;
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      fetchWorkspaces(cfg, q, sort).then(setRows).catch((e: ApiError) => setError(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [q, sort, cfg, needsSetup, section]);

  const onConnect = (c: Config) => {
    setCfg(c); saveConfig(c); setSetupError(''); setQ(''); setSort('last_active');
    first.current = true;
    navigate('overview');
    void loadOverview(c);
  };

  if (needsSetup) {
    return <Setup initial={cfg} error={setupError} onConnect={onConnect}
      onCancel={metrics ? () => setNeedsSetup(false) : undefined} />;
  }

  return (
    <div className="shell">
      {/* Navigation */}
      <nav className="shell-nav">
        <div className="nav-brand">
          <span className="brand-badge" aria-hidden>⚡</span>
          <div>
            <div className="display" style={{ fontSize: 14, fontWeight: 700 }}>Owner Control</div>
            <div className="label" style={{ fontSize: 10 }}>CyberControl</div>
          </div>
        </div>
        <div className="nav-items">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={`nav-item ${section === item.key ? 'nav-item-active' : ''}`}
                onClick={() => navigate(item.key)}
              >
                <Icon size={16} weight={section === item.key ? 'fill' : 'regular'} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <main className="shell-main">
        <header className="section-header">
          <h1 className="display" style={{ fontSize: 18, fontWeight: 700 }}>
            {NAV_ITEMS.find(n => n.key === section)?.label}
          </h1>
          <div className="row" style={{ gap: 8 }}>
            {updatedAt && <span className="muted" style={{ fontSize: 11 }}>
              {updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>}
            {section === 'overview' && (
              <button className="btn" onClick={() => loadOverview(cfg)} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <ArrowClockwise size={14} weight="bold" />
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
            {section === 'workspaces' && (
              <button className="btn" onClick={() => loadWorkspaces(cfg, q, sort)} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <ArrowClockwise size={14} weight="bold" />
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
          </div>
        </header>

        {error && <p className="banner" role="alert" style={{ margin: '12px 0' }}>{error}</p>}

        {/* Section bodies */}
        {section === 'overview' && (
          <div className="section-body">
            {metrics ? <MetricsGrid m={metrics} /> : <MetricsSkeleton />}
            {funnel && <FunnelWidget f={funnel} />}
            {trends && <TrendsPanel t={trends} />}
          </div>
        )}

        {section === 'workspaces' && (
          <div className="section-body">
            {rows ? (
              <WorkspacesTable rows={rows} q={q} onQ={setQ} sort={sort} onSort={setSort}
                onSelect={setSelectedId} onExport={() => exportWorkspacesCsv(rows)} />
            ) : <TableSkeleton />}
            {selectedId && <WorkspaceDrawer cfg={cfg} id={selectedId} onClose={() => setSelectedId(null)}
              hint={(() => { const s = rows?.find(r => r.id === selectedId); return s ? { health: s.health, healthBand: s.healthBand, healthFlags: s.healthFlags } : null; })()}
              onStatusChanged={(wid, status) => setRows(rs => rs ? rs.map(r => r.id === wid ? { ...r, status } : r) : rs)}
              onDeleted={(wid) => { setRows(rs => rs ? rs.filter(r => r.id !== wid) : rs); setSelectedId(null); }}
              onLocationSaved={(wid, location) => setRows(rs => rs ? rs.map(r => r.id === wid ? { ...r, location, locationSource: location ? 'manual' : null } : r) : rs)} />}
          </div>
        )}

        {section === 'forms' && (
          <div className="section-body">
            <FormsPanel cfg={cfg} />
          </div>
        )}

        {section === 'ai' && (
          <div className="section-body">
            <AiSettingsPanel cfg={cfg} />
          </div>
        )}

        {section === 'settings' && (
          <div className="section-body">
            <Setup initial={cfg} error="" onConnect={onConnect} onCancel={() => navigate('overview')} />
          </div>
        )}
      </main>
    </div>
  );
}
