import { ImagePlus, ExternalLink, MessageCircle, PauseCircle, FileText, User as UserIcon, Image as ImageIcon, Globe, Send, Check, Hourglass, Circle } from 'lucide-react';
import { focused, type Module } from './data';

const moduleIconMap: Record<string, any> = {
  docs: FileText,
  profile: UserIcon,
  photo: ImageIcon,
  portal: Globe,
  submit: Send,
};

export default function WorkCard() {
  return (
    <main className="flex-1 min-w-0 overflow-y-auto p-5 bg-cc-bg" aria-label="Current work">
      <article className="rounded-lg overflow-hidden bg-cc-surface border border-cc-border">
        <Header />
        <ModuleList modules={focused.modules} />
        <RecentActivity />
      </article>
    </main>
  );
}

function Header() {
  return (
    <header className="px-5 py-4 border-b border-cc-border">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cc-text-tertiary">{focused.service}</p>
          <h1 className="text-lg font-semibold text-cc-text mt-0.5">{focused.customer}</h1>
          <p className="text-xs text-cc-text-secondary mt-0.5 tabular-nums">{focused.phone}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-cc-warning-soft text-cc-warning flex items-center gap-1">
            <Hourglass size={10} aria-hidden="true" /> {focused.status}
          </span>
          <span className="text-[11px] text-cc-text-tertiary">Charge ₹{focused.cost}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        <ActionBtn primary icon={ImagePlus}>Prepare photo</ActionBtn>
        <ActionBtn icon={ExternalLink}>Open portal</ActionBtn>
        <ActionBtn icon={MessageCircle}>Message customer</ActionBtn>
        <div className="flex-1" />
        <ActionBtn subtle icon={PauseCircle}>Pause</ActionBtn>
      </div>
    </header>
  );
}

function ActionBtn({
  children,
  icon: Icon,
  primary,
  subtle,
}: {
  children: React.ReactNode;
  icon: any;
  primary?: boolean;
  subtle?: boolean;
}) {
  const className = primary
    ? 'bg-cc-primary text-white hover:bg-cc-primary-hover'
    : subtle
    ? 'text-cc-text-secondary hover:bg-cc-surface-hover'
    : 'bg-cc-surface text-cc-text border border-cc-border hover:border-cc-border-strong';

  return (
    <button
      type="button"
      className={`px-3 h-8 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${className}`}
    >
      <Icon size={13} aria-hidden="true" />
      {children}
    </button>
  );
}

function ModuleList({ modules }: { modules: Module[] }) {
  return (
    <ul role="list" className="px-5 py-1">
      {modules.map((m, i) => (
        <li key={m.key} className={i < modules.length - 1 ? 'border-b border-dashed border-cc-border' : ''}>
          <ModuleRow m={m} />
        </li>
      ))}
    </ul>
  );
}

function ModuleRow({ m }: { m: Module }) {
  const Icon = moduleIconMap[m.key];
  const stateConfig = {
    done: { icon: Check, badge: 'bg-cc-success-soft text-cc-success', label: 'done' },
    pending: { icon: Hourglass, badge: 'bg-cc-warning-soft text-cc-warning', label: 'pending' },
    idle: { icon: Circle, badge: 'bg-cc-surface-hover text-cc-text-tertiary', label: 'not started' },
  }[m.state];
  const StateIcon = stateConfig.icon;

  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className={`w-7 h-7 rounded-full grid place-items-center shrink-0 ${stateConfig.badge}`}>
        <StateIcon size={13} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={13} className="text-cc-text-secondary" aria-hidden="true" />}
          <span className="text-sm font-medium text-cc-text">{m.label}</span>
          <span className="text-[10px] uppercase tracking-wider text-cc-text-tertiary font-medium">— {stateConfig.label}</span>
        </div>
        <p className="text-xs text-cc-text-secondary mt-0.5">{m.summary}</p>
        {m.items && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {m.items.map(d => (
              <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-cc-bg text-cc-text-secondary border border-cc-border">
                {d}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecentActivity() {
  return (
    <section aria-label="Recent activity" className="px-5 py-3 border-t border-cc-border bg-cc-bg/40">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-cc-text-tertiary mb-2">Recent activity</h3>
      <ol role="list" className="space-y-1.5">
        {focused.recent.map((e, i) => (
          <li key={i} className="text-xs flex gap-3">
            <span className="font-medium tabular-nums shrink-0 text-cc-text-tertiary w-16">{e.time}</span>
            <span className="text-cc-text">{e.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
