import { Search, Plus } from 'lucide-react';

export default function Toolbar() {
  return (
    <div className="flex items-center justify-between px-6 h-14 shrink-0 bg-cc-surface border-b border-cc-border">
      <div className="flex items-center gap-2 flex-1 max-w-xl">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-cc-text-tertiary"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Global search"
            placeholder="Search customer, service, document, ARN…"
            className="w-full h-9 pl-9 pr-3 text-sm rounded-md outline-none bg-cc-bg border border-cc-border text-cc-text placeholder-cc-text-tertiary focus:border-cc-primary focus:ring-2 focus:ring-cc-primary/30"
          />
        </div>
        <kbd className="text-[10px] px-1.5 h-5 rounded font-medium bg-cc-surface-hover text-cc-text-secondary flex items-center" aria-label="Ctrl K">
          ⌘K
        </kbd>
      </div>

      <div className="flex items-center gap-5">
        <div className="text-right">
          <div className="text-[10px] font-medium uppercase tracking-wider text-cc-text-tertiary">Today</div>
          <div className="text-sm font-semibold tabular-nums text-cc-text">
            ₹4,260 <span className="text-cc-text-secondary font-normal">· 31 done</span>
          </div>
        </div>
        <button className="px-3 h-9 rounded-md text-sm font-medium text-white bg-cc-primary hover:bg-cc-primary-hover flex items-center gap-2 transition-colors">
          <Plus size={14} aria-hidden="true" />
          New service
        </button>
      </div>
    </div>
  );
}
