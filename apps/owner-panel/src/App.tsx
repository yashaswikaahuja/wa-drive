import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchMetrics, fetchFunnel, fetchTrends, fetchWorkspaces, loadConfig, saveConfig } from './api';
import type { Config, Metrics, Funnel, Trends, Workspace } from './api';
import { MetricsGrid, MetricsSkeleton } from './components/StatCards';
import { FunnelWidget } from './components/Funnel';
import { TrendsPanel } from './components/Trends';
import { WorkspacesTable, TableSkeleton } from './components/WorkspacesTable';
import { WorkspaceDrawer } from './components/WorkspaceDrawer';
import { Setup } from './components/Setup';
import { AiSettingsPanel } from './components/AiSettings';
import { exportWorkspacesCsv } from './lib/csv';

type Sort = 'last_active' | 'created' | 'files' | 'health';

export function App() {
  const [cfg, setCfg] = useState<Config>(loadConfig);
  const [needsSetup, setNeedsSetup] = useState(!cfg.key);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [rows, setRows] = useState<Workspace[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [setupError, setSetupError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('last_active');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Full refresh: metrics + workspaces together (used on connect + manual refresh).
  const refreshAll = useCallback(async (c: Config, query: string, s: Sort) => {
    setLoading(true); setError('');
    try {
      const [m, fn, tr, w] = await Promise.all([fetchMetrics(c), fetchFunnel(c), fetchTrends(c), fetchWorkspaces(c, query, s)]);
      setMetrics(m); setFunnel(fn); setTrends(tr); setRows(w); setUpdatedAt(new Date()); setNeedsSetup(false);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) { setNeedsSetup(true); setSetupError(err.message); }
      else setError(err.message);
    } finally { setLoading(false); }
  }, []);

  // Initial load if we already have a key.
  useEffect(() => {
    if (cfg.key) void refreshAll(cfg, '', 'last_active');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced refetch of the list when search/sort change (metrics unaffected).
  const first = useRef(true);
  useEffect(() => {
    if (needsSetup || !cfg.key) return;
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      fetchWorkspaces(cfg, q, sort).then(setRows).catch((e: ApiError) => setError(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [q, sort, cfg, needsSetup]);

  const onConnect = (c: Config) => {
    setCfg(c); saveConfig(c); setSetupError(''); setQ(''); setSort('last_active');
    first.current = true;
    void refreshAll(c, '', 'last_active');
  };

  if (needsSetup) {
    return <Setup initial={cfg} error={setupError} onConnect={onConnect}
      onCancel={metrics ? () => setNeedsSetup(false) : undefined} />;
  }

  return (
    <div className="wrap">
      <header className="row between" style={{ marginBottom: 4 }}>
        <div className="row" style={{ gap: 12 }}>
          <span className="brand-badge" aria-hidden>⚡</span>
          <div>
            <h1 className="display" style={{ fontSize: 20, fontWeight: 700 }}>Owner Control</h1>
            <div className="label">CyberControl · tailnet</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {updatedAt && <span className="muted" style={{ fontSize: 12 }}>
            updated {updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>}
          <button className="btn" onClick={() => refreshAll(cfg, q, sort)} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn" onClick={() => setNeedsSetup(true)} aria-label="Settings">⚙</button>
        </div>
      </header>

      {error && <p className="banner" role="alert" style={{ margin: '16px 0' }}>{error}</p>}

      {metrics ? <MetricsGrid m={metrics} /> : <MetricsSkeleton />}
      {funnel && <FunnelWidget f={funnel} />}
      {trends && <TrendsPanel t={trends} />}
      <AiSettingsPanel cfg={cfg} />
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
  );
}
