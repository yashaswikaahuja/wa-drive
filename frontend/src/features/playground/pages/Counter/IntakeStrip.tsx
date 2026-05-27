import { Image as ImageIcon, FileText, Printer, Download, Paperclip, MessageCircle } from 'lucide-react';
import { intake, type IntakeItem } from './data';

export default function IntakeStrip() {
  return (
    <section
      aria-label="WhatsApp intake"
      className="shrink-0 bg-cc-surface border-t border-cc-border"
    >
      <header className="flex items-center justify-between px-6 h-10">
        <div className="flex items-center gap-2 text-sm">
          <MessageCircle size={14} className="text-cc-success" aria-hidden="true" />
          <span className="font-semibold text-cc-text">WhatsApp intake</span>
          <span className="text-cc-text-tertiary">·</span>
          <span className="text-xs text-cc-text-secondary">{intake.length} new files</span>
        </div>
        <button type="button" className="text-xs text-cc-primary hover:text-cc-primary-hover">
          Open chat →
        </button>
      </header>

      <div className="px-6 pb-3 flex gap-2.5 overflow-x-auto">
        {intake.map((it, i) => (
          <Card key={i} it={it} />
        ))}
      </div>
    </section>
  );
}

function Card({ it }: { it: IntakeItem }) {
  const FileIcon = it.kind === 'pdf' ? FileText : ImageIcon;
  return (
    <article
      className="rounded-md p-2.5 shrink-0 w-64 bg-cc-bg border border-cc-border hover:border-cc-border-strong transition-colors"
      aria-label={`${it.who} sent ${it.file}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className={`w-7 h-7 rounded grid place-items-center shrink-0 ${
            it.unknown ? 'bg-cc-warning-soft text-cc-warning' : 'bg-cc-primary-soft text-cc-primary'
          }`}
        >
          <FileIcon size={14} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate text-cc-text">{it.who}</div>
          <div className="text-[10px] truncate text-cc-text-tertiary">
            {it.file} · {it.size}
          </div>
        </div>
        <span className="text-[10px] shrink-0 text-cc-text-tertiary tabular-nums">{it.when}</span>
      </div>

      {it.match && (
        <div className="text-[10px] px-2 py-0.5 rounded mb-1.5 bg-cc-success-soft text-cc-success truncate">
          → {it.match}
        </div>
      )}
      {it.unknown && (
        <div className="text-[10px] px-2 py-0.5 rounded mb-1.5 bg-cc-warning-soft text-cc-warning">
          Unknown sender
        </div>
      )}

      <div className="flex gap-1 mt-1">
        <IconBtn label="Print" icon={Printer} />
        <IconBtn label="Download" icon={Download} />
        <IconBtn label="Attach" icon={Paperclip} primary />
      </div>
    </article>
  );
}

function IconBtn({ icon: Icon, label, primary }: { icon: any; label: string; primary?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        'flex-1 h-7 rounded text-[11px] font-medium flex items-center justify-center gap-1 transition-colors',
        primary
          ? 'bg-cc-primary text-white hover:bg-cc-primary-hover'
          : 'bg-cc-surface text-cc-text-secondary border border-cc-border hover:bg-cc-surface-hover',
      ].join(' ')}
    >
      <Icon size={12} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
