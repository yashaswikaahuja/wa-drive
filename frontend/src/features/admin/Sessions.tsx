import { useEffect, useState } from 'react';
import { ArrowLeft, Broadcast } from '@phosphor-icons/react';
import api from '../../shared/api';
import PageHeader from '../../shared/PageHeader';

interface SessionRecord {
  stepId?: string;
  contextId?: string;
  nodeId?: string;
  label?: string;
  type?: string;
  source?: string;
  semanticKey?: string;
  profileKey?: string;
  knowledgeRecordId?: string;
  mappingSource?: string;
  mappingStatus?: string;
  mappingConfidence?: number | null;
  mappingDisposition?: string;
  mappingMatchedPattern?: string;
  transformation?: string;
  result?: string;
  failReason?: string | null;
  postconditionMet?: boolean | null;
  durationMs?: number | null;
}

interface Session {
  id: string;
  hostname: string;
  semanticFormKey: string;
  runtimeVersion: string;
  totalFilled: number;
  totalFailed: number;
  records?: SessionRecord[];
  receivedAt: string;
}

const sourceColor = (source: string) => {
  if (source === 'mapping') return 'badge badge-info';
  if (source === 'ai-resolve') return 'bg-purple-500/15 text-purple-700';
  if (source === 'reviewed') return 'bg-cyan-500/15 text-cyan-700';
  if (source === 'fuzzy') return 'bg-purple-500/15 text-purple-700';
  return 'bg-gray-500/10 text-gray-500';
};

const resultDot = (result?: string) => {
  if (result === 'filled') return 'text-green-600';
  if (result === 'skipped') return 'text-amber-600';
  if (result === 'unmapped') return 'text-gray-400';
  return 'text-red-500';
};

const sourceLabel = (record: SessionRecord) => {
  if (record.mappingDisposition) return 'ai-resolve';
  if (['manual', 'confirmed', 'correction'].includes(record.mappingSource || '')) return 'reviewed';
  if (record.knowledgeRecordId || record.mappingSource || record.semanticKey || record.profileKey) return 'mapping';
  return record.source || 'unlinked';
};

const actionLabel = (type?: string) => {
  const labels: Record<string, string> = {
    type_text: 'text',
    select_one: 'dropdown',
    select_many: 'multi-select',
    toggle: 'checkbox',
    upload: 'file',
  };
  return labels[type || ''] || type || 'unknown';
};

function MappingSummary({ record }: { record: SessionRecord }) {
  const semanticKey = record.semanticKey || null;
  const profileKey = record.profileKey || null;
  const details = [
    record.mappingMatchedPattern ? `matched “${record.mappingMatchedPattern}”` : null,
    record.transformation && record.transformation !== 'direct' ? record.transformation : null,
    typeof record.mappingConfidence === 'number' ? `${Math.round(record.mappingConfidence * 100)}% confidence` : null,
  ].filter(Boolean);

  if (!semanticKey && !profileKey) {
    return <span className="text-gray-500">No semantic mapping</span>;
  }

  return (
    <div className="min-w-0">
      <div className="truncate font-mono text-[12px] text-gray-200" title={[semanticKey, profileKey].filter(Boolean).join(' → ')}>
        <span>{semanticKey || '—'}</span>
        {profileKey && profileKey !== semanticKey && <span className="text-gray-500"> → {profileKey}</span>}
      </div>
      {details.length > 0 && (
        <div className="mt-0.5 truncate text-[10px] text-gray-500" title={details.join(' · ')}>
          {details.join(' · ')}
        </div>
      )}
    </div>
  );
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/sessions').then(response => setSessions(response.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function openSession(session: Session) {
    setSelected(session);
    setLoadingDetail(true);
    try {
      const response = await api.get(`/sessions/${session.id}`);
      setSelected(response.data);
    } catch {
      // Preserve the summary card if detail retrieval fails.
    } finally {
      setLoadingDetail(false);
    }
  }

  if (selected) {
    const records = selected.records || [];
    const filledCount = records.filter(record => record.result === 'filled').length;
    const skippedCount = records.filter(record => record.result === 'skipped').length;
    const unmappedCount = records.filter(record => record.result === 'unmapped').length;
    const failedCount = records.filter(record => record.result && !['filled', 'skipped', 'unmapped'].includes(record.result)).length;
    const bySource: Record<string, number> = {};
    records.forEach(record => {
      const source = sourceLabel(record);
      bySource[source] = (bySource[source] || 0) + 1;
    });

    return (
      <div>
        <button type="button" onClick={() => setSelected(null)} className="btn-ghost mb-4 flex items-center gap-1 text-xs">
          <ArrowLeft size={14} /> Back to sessions
        </button>
        <h1 className="mb-1 text-lg font-semibold tracking-tight text-white">{selected.hostname}</h1>
        <p className="mb-3 text-xs text-gray-500">
          rv: {selected.runtimeVersion} · {new Date(selected.receivedAt).toLocaleString()}
        </p>

        <div className="mb-4 flex flex-wrap gap-2" aria-label="Session outcome summary">
          <span className="badge badge-info">Total: <b className="ml-0.5 text-white">{records.length}</b></span>
          <span className="badge badge-success">Filled: <b className="ml-0.5">{filledCount}</b></span>
          {skippedCount > 0 && <span className="badge badge-warning">Skipped: <b className="ml-0.5">{skippedCount}</b></span>}
          {unmappedCount > 0 && <span className="badge">Unmapped: <b className="ml-0.5">{unmappedCount}</b></span>}
          {failedCount > 0 && <span className="badge badge-danger">Failed: <b className="ml-0.5">{failedCount}</b></span>}
          {Object.entries(bySource).map(([source, count]) => (
            <span key={source} className={`inline-flex items-center rounded px-2 py-1 text-[11px] ${sourceColor(source)}`}>
              {source}: <b className="ml-1">{count}</b>
            </span>
          ))}
        </div>

        {loadingDetail && records.length === 0 && <div className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />}
        {records.length > 0 && (
          <div className="card overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[16px_minmax(220px,1.35fr)_100px_minmax(210px,1fr)_110px_56px] items-center gap-3 border-b border-white/[0.06] px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                <span aria-hidden="true" />
                <span>Observed field / public target</span>
                <span>Action</span>
                <span>Semantic mapping</span>
                <span>Source</span>
                <span className="text-right">Time</span>
              </div>
              <div className="divide-y divide-white/[0.05]">
                {records.map((record, index) => {
                  const target = [record.contextId, record.nodeId].filter(Boolean).join(' / ');
                  const source = sourceLabel(record);
                  const sourceTitle = [
                    record.mappingSource ? `origin: ${record.mappingSource}` : null,
                    record.mappingStatus ? `status: ${record.mappingStatus}` : null,
                    record.knowledgeRecordId ? `record: ${record.knowledgeRecordId}` : null,
                  ].filter(Boolean).join(' · ');
                  return (
                    <div key={`${record.stepId || 'record'}-${index}`} className="grid grid-cols-[16px_minmax(220px,1.35fr)_100px_minmax(210px,1fr)_110px_56px] items-center gap-3 px-4 py-2.5 text-xs">
                      <span className={`${resultDot(record.result)} text-[10px]`} title={record.result || 'unknown'} aria-label={record.result || 'unknown'}>●</span>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-200" title={record.label || 'Unlabelled field'}>
                          {record.label || 'Unlabelled field'}
                        </div>
                        {target && <div className="mt-0.5 truncate font-mono text-[10px] text-gray-500" title={target}>{target}</div>}
                      </div>
                      <span className="truncate text-gray-400" title={record.type}>{actionLabel(record.type)}</span>
                      <MappingSummary record={record} />
                      <div className="min-w-0">
                        <span className={`inline-flex max-w-full truncate rounded px-1.5 py-0.5 text-[10px] ${sourceColor(source)}`} title={sourceTitle || source}>
                          {source}
                        </span>
                        {record.failReason && <div className="mt-1 truncate text-[10px] text-red-500" title={record.failReason}>{record.failReason}</div>}
                      </div>
                      <span className="text-right font-mono tabular-nums text-gray-500">{record.durationMs ?? 0}ms</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {!loadingDetail && records.length === 0 && <p className="py-4 text-sm text-gray-500">No records</p>}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Sessions" subtitle="Autofill runs from the operator extension" />
      {loading ? (
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[68px] rounded-2xl" style={{ background: 'hsl(var(--pt-secondary) / 0.6)' }} />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
          <Broadcast size={34} className="pt-muted mb-3" />
          <p className="text-sm font-medium" style={{ color: 'hsl(var(--pt-ink))' }}>No sessions yet</p>
          <p className="pt-muted mt-1 max-w-xs text-xs">Autofill runs from the extension will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => (
            <button key={session.id} type="button" onClick={() => openSession(session)}
              className="card w-full cursor-pointer p-4 text-left transition hover:border-[#0a84ff]/30"
              aria-label={`Open ${session.hostname || 'unknown host'} session from ${new Date(session.receivedAt).toLocaleString()}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight text-white">{session.hostname || '(no hostname)'}</p>
                  <p className="truncate text-xs text-gray-500">rv {session.runtimeVersion} · {session.semanticFormKey || ''}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm font-medium tabular-nums text-green-600">{session.totalFilled} filled</p>
                  {session.totalFailed > 0 && <p className="font-mono text-xs tabular-nums text-red-500">{session.totalFailed} failed</p>}
                </div>
              </div>
              <p className="mt-2 text-[10px] text-gray-500">{new Date(session.receivedAt).toLocaleString()}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
