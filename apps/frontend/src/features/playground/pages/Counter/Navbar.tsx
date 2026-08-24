import { LayoutGrid, Camera, Users, MessageCircle, BarChart3, Settings, Wifi, Printer } from 'lucide-react';

const navItems = [
  { id: 'counter', label: 'Counter', icon: LayoutGrid, badge: 6, active: true },
  { id: 'photo', label: 'Photo Tool', icon: Camera },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, badge: 12 },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

export default function Navbar() {
  return (
    <nav className="flex items-center px-6 h-14 shrink-0 bg-cc-surface border-b border-cc-border" aria-label="Main">
      <div className="flex items-center gap-2 mr-8" aria-label="CyberControl">
        <div className="w-7 h-7 rounded grid place-items-center text-white text-xs font-semibold bg-cc-primary">C</div>
        <span className="text-sm font-semibold text-cc-text">CyberControl</span>
      </div>

      <ul className="flex items-center gap-1" role="list">
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <button
                aria-current={item.active ? 'page' : undefined}
                className={[
                  'px-3 h-9 rounded-md text-sm flex items-center gap-2 transition-colors',
                  item.active
                    ? 'bg-cc-primary-soft text-cc-primary font-medium'
                    : 'text-cc-text-secondary hover:bg-cc-surface-hover hover:text-cc-text',
                ].join(' ')}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={[
                      'min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center tabular-nums',
                      item.active ? 'bg-cc-primary text-white' : 'bg-cc-surface-hover text-cc-text-secondary',
                    ].join(' ')}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <Status icon={Wifi} label="Internet · 42ms" ok />
        <Status icon={Printer} label="Printer · HP M1136" ok />
        <Status icon={MessageCircle} label="WhatsApp · live" ok />
        <div className="w-px h-6 bg-cc-border mx-1" aria-hidden="true" />
        <button aria-label="Settings" className="p-1.5 rounded text-cc-text-secondary hover:bg-cc-surface-hover hover:text-cc-text">
          <Settings size={18} aria-hidden="true" />
        </button>
        <button
          aria-label="Operator menu — Yashaswika"
          className="w-8 h-8 rounded-full grid place-items-center text-sm font-semibold bg-cc-primary-soft text-cc-primary"
        >
          Y
        </button>
      </div>
    </nav>
  );
}

function Status({ icon: Icon, label, ok }: { icon: any; label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5" role="status" aria-label={label} title={label}>
      <Icon size={14} className="text-cc-text-secondary" aria-hidden="true" />
      <span
        className={ok ? 'w-1.5 h-1.5 rounded-full bg-cc-success' : 'w-1.5 h-1.5 rounded-full bg-cc-danger'}
        aria-hidden="true"
      />
    </div>
  );
}
