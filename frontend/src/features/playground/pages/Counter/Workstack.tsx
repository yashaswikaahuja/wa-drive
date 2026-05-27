import { Pin, Activity, Clock } from 'lucide-react';
import { workstack, type WorkRow } from './data';

const toneClass: Record<string, string> = {
  success: 'text-cc-success',
  danger: 'text-cc-danger',
  warning: 'text-cc-warning',
  info: 'text-cc-info',
  neutral: 'text-cc-text-secondary',
};

export default function Workstack({ selectedId }: { selectedId: string }) {
  return (
    <aside
      className="w-[360px] shrink-0 flex flex-col overflow-hidden bg-cc-bg border-r border-cc-border"
      aria-label="Workstack"
    >
      <header className="px-4 py-3 shrink-0 flex items-center justify-between border-b border-cc-border">
        <h2 className="text-sm font-semibold text-cc-text">Workstack</h2>
        <span className="text-[11px] text-cc-text-secondary tabular-nums">
          {workstack.pinned.length + workstack.active.length + workstack.waiting.length} items
        </span>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
        <Bucket title="Pinned" icon={Pin} count={workstack.pinned.length} items={workstack.pinned} selectedId={selectedId} />
        <Bucket title="Active" icon={Activity} count={workstack.active.length} items={workstack.active} selectedId={selectedId} />
        <Bucket title="Waiting" icon={Clock} count={workstack.waiting.length} items={workstack.waiting} selectedId={selectedId} muted />
      </div>
    </aside>
  );
}

function Bucket({
  title,
  icon: Icon,
  count,
  items,
  selectedId,
  muted,
}: {
  title: string;
  icon: any;
  count: number;
  items: WorkRow[];
  selectedId: string;
  muted?: boolean;
}) {
  return (
    <section aria-label={title}>
      <div className="flex items-center gap-1.5 px-1 mb-1.5">
        <Icon size={12} className="text-cc-text-tertiary" aria-hidden="true" />
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-cc-text-tertiary">{title}</h3>
        <span className="text-[10px] tabular-nums px-1.5 rounded bg-cc-surface text-cc-text-secondary border border-cc-border">{count}</span>
      </div>
      <ul role="list" className="space-y-1.5">
        {items.map(it => (
          <li key={it.id}>
            <Row item={it} selected={it.id === selectedId} muted={muted} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ item, selected, muted }: { item: WorkRow; selected: boolean; muted?: boolean }) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      className={[
        'w-full text-left px-3 py-2 rounded-lg transition-colors',
        selected ? 'bg-cc-surface ring-1 ring-cc-primary' : 'bg-cc-surface border border-cc-border hover:border-cc-border-strong',
        muted ? 'opacity-75' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={['text-sm truncate', muted ? 'text-cc-text-secondary' : 'text-cc-text font-medium'].join(' ')}>{item.name}</span>
        <span className="text-[10px] tabular-nums shrink-0 text-cc-text-tertiary">{item.when}</span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="text-xs truncate text-cc-text-secondary">{item.service}</span>
        <span className={['text-[10px] font-medium shrink-0', item.tone ? toneClass[item.tone] : 'text-cc-text-tertiary'].join(' ')}>
          {item.state}
        </span>
      </div>
    </button>
  );
}
