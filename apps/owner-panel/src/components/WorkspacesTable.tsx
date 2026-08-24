import { useMemo, useState } from 'react';
import {
  MagnifyingGlass, Buildings, Phone, Envelope, MapPin, WhatsappLogo,
  FileText, Export, Heartbeat, Clock, Users
} from '@phosphor-icons/react';
import type { Workspace } from '../api';
import { relativeTime, isDormant, fmt } from '../lib/format';

type Sort = 'last_active' | 'created' | 'files' | 'health';
type BandFilter = 'all' | 'healthy' | 'watch' | 'at-risk' | 'onboarding';

const BAND_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  healthy: { bg: 'hsl(145 60% 40% / 0.1)', color: 'hsl(145 60% 35%)', label: 'Healthy' },
  watch: { bg: 'hsl(35 90% 50% / 0.1)', color: 'hsl(35 80% 40%)', label: 'Watch' },
  'at-risk': { bg: 'hsl(0 70% 50% / 0.08)', color: 'hsl(0 65% 45%)', label: 'At Risk' },
  onboarding: { bg: 'hsl(210 20% 50% / 0.08)', color: 'hsl(210 15% 50%)', label: 'Onboarding' },
};

function HealthBadge({ score, band }: { score: number; band: string }) {
  const s = BAND_STYLE[band] || BAND_STYLE.onboarding;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}
      title={`Health ${score}/100`}>
      <Heartbeat size={12} weight="bold" />
      {band === 'onboarding' ? 'New' : `${score}`}
    </span>
  );
}

function StatusDot({ connected }: { connected: boolean }) {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? 'hsl(145 60% 40%)' : 'hsl(0 0% 75%)', flexShrink: 0 }} />;
}

interface Props {
  rows: Workspace[];
  q: string;
  onQ: (v: string) => void;
  sort: Sort;
  onSort: (s: Sort) => void;
  onSelect: (id: string) => void;
  onExport: () => void;
}

export function WorkspacesTable({ rows, q, onQ, sort, onSort, onSelect, onExport }: Props) {
  const [band, setBand] = useState<BandFilter>('all');
  const view = useMemo(() => {
    let v = band === 'all' ? rows : rows.filter(r => r.healthBand === band);
    if (sort === 'health') v = [...v].sort((a, b) => a.health - b.health);
    return v;
  }, [rows, band, sort]);

  return (
    <section aria-label="Cybercafes">
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
          <Buildings size={20} weight="duotone" style={{ color: 'hsl(var(--marigold-deep))' }} />
          <h2 className="display" style={{ fontSize: 17, fontWeight: 700 }}>Cybercafes</h2>
          <span className="muted num" style={{ fontSize: 12 }}>{fmt(view.length)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <MagnifyingGlass size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted))' }} />
            <input className="input" type="search" value={q} onChange={e => onQ(e.target.value)}
              placeholder="Search…" aria-label="Search" style={{ paddingLeft: 30, width: 160, fontSize: 13 }} />
          </div>
          <select className="input" value={band} onChange={e => setBand(e.target.value as BandFilter)} style={{ width: 'auto', fontSize: 12 }} aria-label="Filter by health">
            <option value="all">All health</option>
            <option value="at-risk">At risk</option>
            <option value="watch">Watch</option>
            <option value="healthy">Healthy</option>
            <option value="onboarding">Onboarding</option>
          </select>
          <select className="input" value={sort} onChange={e => onSort(e.target.value as Sort)} style={{ width: 'auto', fontSize: 12 }} aria-label="Sort">
            <option value="last_active">Last active</option>
            <option value="created">Newest</option>
            <option value="files">Most files</option>
            <option value="health">Worst health</option>
          </select>
          <button className="btn" onClick={onExport} disabled={rows.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <Export size={14} /> CSV
          </button>
        </div>
      </div>

      {/* Empty state */}
      {view.length === 0 ? (
        <div className="card" style={{ padding: '48px 20px', textAlign: 'center' }}>
          <Buildings size={32} weight="duotone" style={{ color: 'hsl(var(--muted))', margin: '0 auto 8px' }} />
          <h3 style={{ fontSize: 14 }}>No cybercafes{q || band !== 'all' ? ' match' : ' yet'}</h3>
          <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>{q || band !== 'all' ? 'Try a different search or filter.' : 'Signups will appear here.'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {view.map(w => (
            <div key={w.id} className="card" onClick={() => onSelect(w.id)}
              style={{ padding: '14px 18px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 14, transition: 'box-shadow 150ms, border-color 150ms' }}>
              {/* Left: identity + meta */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{w.name || 'Untitled'}</span>
                  <HealthBadge score={w.health} band={w.healthBand} />
                  {w.status === 'suspended' && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'hsl(0 70% 50% / 0.08)', color: 'hsl(0 65% 45%)' }}>Blocked</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'hsl(var(--ink-soft))' }}>
                  {w.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Envelope size={12} style={{ color: 'hsl(var(--muted))' }} />{w.email}</span>}
                  {w.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={12} style={{ color: 'hsl(var(--muted))' }} />{w.phone}</span>}
                  {w.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={12} style={{ color: 'hsl(var(--muted))' }} />{w.location.length > 30 ? w.location.slice(0, 30) + '…' : w.location}</span>}
                </div>
              </div>
              {/* Right: stats */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'hsl(var(--ink-soft))', flexShrink: 0 }}>
                <Stat icon={WhatsappLogo} value={w.whatsappConnected ? 'On' : 'Off'} connected={w.whatsappConnected} />
                <Stat icon={FileText} value={`${fmt(w.files)}`} sub={w.filesLast7 > 0 ? `${w.filesLast7}/wk` : undefined} />
                <Stat icon={Users} value={`${w.operators}`} />
                <Stat icon={Clock} value={relativeTime(w.lastActiveAt)} dimmed={isDormant(w.lastActiveAt)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ icon: Icon, value, sub, connected, dimmed }: {
  icon: typeof FileText; value: string; sub?: string; connected?: boolean; dimmed?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: dimmed ? 0.5 : 1 }}>
      {connected !== undefined ? <StatusDot connected={connected} /> : <Icon size={14} style={{ color: 'hsl(var(--muted))' }} />}
      <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{value}</span>
      {sub && <span className="muted" style={{ fontSize: 10 }}>{sub}</span>}
    </div>
  );
}

export function TableSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading cybercafes">
      <div style={{ display: 'grid', gap: 8 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12 }} />
        ))}
      </div>
    </section>
  );
}
