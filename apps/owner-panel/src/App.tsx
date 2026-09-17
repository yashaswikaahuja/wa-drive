import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChartLine, Buildings, FileText, Brain, Gear, ArrowClockwise,
  Broadcast, PencilSimple, Stack,
} from '@phosphor-icons/react';
import {
  ApiError, fetchMetrics, fetchFunnel, fetchTrends, fetchWorkspaces,
  fetchLearningStats, loadConfig, saveConfig,
} from './api';
import type { Config, Metrics, Funnel, Trends, Workspace, LearningStats } from './api';
import { MetricsGrid, MetricsSkeleton } from './components/StatCards';
import { FunnelWidget } from './components/Funnel';
import { TrendsPanel } from './components/Trends';
import { WorkspacesTable, TableSkeleton } from './components/WorkspacesTable';
import { WorkspaceDrawer } from './components/WorkspaceDrawer';
import { Setup } from './components/Setup';
import { AiSettingsPanel } from './components/AiSettings';
import { DocumentExtractMapsPanel } from './components/DocumentExtractMaps';
import { FormsPanel } from './components/FormsPanel';
import { MappingsPanel } from './components/MappingsPanel';
import { SessionsPanel } from './components/SessionsPanel';
import { CorrectionsPanel } from './components/CorrectionsPanel';
import { exportWorkspacesCsv } from './lib/csv';

type Section = 'overview' | 'workspaces' | 'forms' | 'mappings' | 'sessions' | 'corrections' | 'ai' | 'settings';
type Sort = 'last_active' | 'created' | 'files' | 'health';

const NAV_ITEMS: { key: Section; label: string; icon: typeof ChartLine }[] = [
  { key: 'overview', label: 'Overview', icon: ChartLine },
  { key: 'workspaces', label: 'Workspaces', icon: Buildings },
  { key: 'forms', label: 'Forms', icon: FileText },
  { key: 'mappings', label: 'Mappings', icon: Stack },
  { key: 'sessions', label: 'Sessions', icon: Broadcast },
  { key: 'corrections', label: 'Corrections', icon: PencilSimple },
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
  const [learning, setLearning] = useState<LearningStats | null>(null);

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
      const [m, fn, tr, learn] = await Promise.all([
        fetchMetrics(c), fetchFunnel(c), fetchTrends(c),
        fetchLearningStats(c).catch(() => null),
      ]);
      setMetrics(m); setFunnel(fn); setTrends(tr); setLearning(learn);
      setUpdatedAt(new Date()); setNeedsSetup(false);
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
    // Forms / mappings / sessions / corrections / AI load their own data on mount
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
            {learning && (
              <div className="card" style={{ padding: 16, marginTop: 14 }}>
                <div className="row between" style={{ marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                  <div className="label">Learning (fills across cafés)</div>
                  <span className="muted" style={{ fontSize: 11 }}>Click a card to open that section</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                  {([
                    { label: 'Sessions', value: learning.sessions, section: 'sessions' as Section },
                    { label: 'Filled', value: learning.filled, section: 'sessions' as Section },
                    { label: 'Failed', value: learning.failed, section: 'sessions' as Section },
                    { label: 'Corrections', value: learning.corrections, section: 'corrections' as Section },
                    { label: 'Forms mapped', value: learning.forms, section: 'mappings' as Section },
                    { label: 'Unmapped', value: learning.unmapped, section: 'mappings' as Section },
                  ]).map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      className="card"
                      onClick={() => navigate(c.section)}
                      style={{
                        padding: 12,
                        textAlign: 'left',
                        cursor: 'pointer',
                        border: '1px solid hsl(var(--border-soft))',
                        background: 'hsl(var(--bg))',
                      }}
                    >
                      <div className="muted" style={{ fontSize: 11 }}>{c.label}</div>
                      <div className="num display" style={{ fontSize: 20, fontWeight: 700 }}>{c.value}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
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

        {section === 'mappings' && (
          <div className="section-body">
            <MappingsPanel cfg={cfg} />
          </div>
        )}

        {section === 'sessions' && (
          <div className="section-body">
            <SessionsPanel cfg={cfg} />
          </div>
        )}

        {section === 'corrections' && (
          <div className="section-body">
            <CorrectionsPanel cfg={cfg} />
          </div>
        )}

        {section === 'ai' && (
          <div className="section-body">
            <AiSettingsPanel cfg={cfg} />
            <DocumentExtractMapsPanel cfg={cfg} />
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
