import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchMetrics, fetchWorkspaces, loadConfig, saveConfig } from './api';
import type { Config, Metrics, Workspace } from './api';
import { MetricsGrid, MetricsSkeleton } from './components/StatCards';
import { WorkspacesTable, TableSkeleton } from './components/WorkspacesTable';
import { Setup } from './components/Setup';

type Sort = 'last_active' | 'created' | 'files';

export function App() {
  const [cfg, setCfg] = useState<Config>(loadConfig);
  const [needsSetup, setNeedsSetup] = useState(!cfg.key);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [rows, setRows] = useState<Workspace[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [setupError, setSetupError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('last_active');

  // Full refresh: metrics + workspaces together (used on connect + manual refresh).
  const refreshAll = useCallback(async (c: Config, query: string, s: Sort) => {
    setLoading(true); setError('');
    try {
      const [m, w] = await Promise.all([fetchMetrics(c), fetchWorkspaces(c, query, s)]);
      setMetrics(m); setRows(w); setUpdatedAt(new Date()); setNeedsSetup(false);
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
      {rows ? (
        <WorkspacesTable rows={rows} q={q} onQ={setQ} sort={sort} onSort={setSort} />
      ) : <TableSkeleton />}
    </div>
  );
}
