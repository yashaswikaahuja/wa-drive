import { NavLink, Outlet } from 'react-router-dom';
import { memo, useMemo, useEffect, useState } from 'react';
import { useAuthStore } from '../features/auth/store';
import { extensionBridge } from './extensionBridge';
import {
  Users, ChatCircle, Camera, Gear,
  ChartPie, PencilSimple, Brain, Broadcast, UserCircle, SignOut, Lightning, Plugs, MagnifyingGlass,
  List, X, CaretLeft, CaretRight
} from '@phosphor-icons/react';

const ExtensionStatus = memo(({ collapsed }: { collapsed?: boolean }) => {
  const [status, setStatus] = useState<'unknown' | 'connecting' | 'connected' | 'disconnected'>('unknown');
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => extensionBridge.onStatus((s, v) => { setStatus(s); setVersion(v); }), []);
  const dot = status === 'connected' ? 'bg-green-400' : status === 'connecting' ? 'bg-amber-400 animate-pulse' : status === 'disconnected' ? 'bg-red-400' : 'bg-gray-500';
  const label = status === 'connected' ? `Extension v${version || '?'}` : status === 'connecting' ? 'Connecting...' : status === 'disconnected' ? 'Extension off' : 'Checking...';
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 ${collapsed ? 'md:justify-center md:px-0' : ''}`} title={label}>
      <Plugs size={14} className="text-gray-500 shrink-0" />
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span className={`text-[11px] text-gray-500 truncate ${collapsed ? 'md:hidden' : ''}`}>{label}</span>
    </div>
  );
});

const OPERATOR_NAV = [
  { path: '/app', icon: Lightning, label: 'Today', end: true },
  { path: '/app/customers', icon: Users, label: 'Customers' },
  { path: '/app/forms', icon: MagnifyingGlass, label: 'Find Form' },
  { path: '/app/whatsapp', icon: ChatCircle, label: 'Documents' },
  { path: '/app/photos', icon: Camera, label: 'Photos' },
  { path: '/app/settings', icon: Gear, label: 'Settings' },
];

const ADMIN_NAV = [
  { path: '/admin', icon: ChartPie, label: 'Overview', end: true },
  { path: '/admin/corrections', icon: PencilSimple, label: 'Corrections' },
  { path: '/admin/mappings', icon: Brain, label: 'Mappings' },
  { path: '/admin/sessions', icon: Broadcast, label: 'Sessions' },
  { path: '/admin/operators', icon: UserCircle, label: 'Operators' },
];

const NavItem = memo(({ path, icon: Icon, label, end, onNavigate, collapsed }: any) => {
  const badge = path === '/app/whatsapp' ? parseInt(localStorage.getItem('cc-wa-unread') || '0') : 0;
  return (
    <NavLink to={path} end={end} onClick={onNavigate} title={label}
      className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''} ${collapsed ? 'md:justify-center md:px-2' : ''}`}>
      <span className="relative flex shrink-0">
        <Icon size={18} weight={undefined} />
        {badge > 0 && <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full bg-green-500 hidden ${collapsed ? 'md:block' : ''}`} />}
      </span>
      <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
      {badge > 0 && <span className={`ml-auto w-4 h-4 rounded-full bg-green-500 text-white text-[9px] flex items-center justify-center font-bold ${collapsed ? 'md:hidden' : ''}`}>{badge}</span>}
    </NavLink>
  );
});

const Sidebar = memo(({ user, logout, open, onClose, collapsed, onToggleCollapse }: any) => {
  const isAdmin = user?.role === 'admin';
  const nav = useMemo(() => isAdmin
    ? [...OPERATOR_NAV, { path: '', icon: null, label: 'Admin' }, ...ADMIN_NAV]
    : OPERATOR_NAV, [isAdmin]);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 w-60 flex flex-col border-r transition-all duration-200 md:static md:z-auto md:translate-x-0 ${collapsed ? 'md:w-16' : 'md:w-52'} ${open ? 'translate-x-0' : '-translate-x-full'}`}
      style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))' }}
    >
      <div className={`h-12 flex items-center gap-2 px-4 border-b ${collapsed ? 'md:px-0 md:justify-center' : ''}`} style={{ borderColor: 'hsl(var(--pt-border))' }}>
        <span className="grid h-7 w-7 place-items-center rounded-md shrink-0" style={{ background: 'hsl(var(--pt-ink))' }}>
          <Lightning size={15} weight="fill" style={{ color: 'hsl(var(--pt-marigold))' }} />
        </span>
        <span className={`pt-display text-sm font-bold tracking-tight ${collapsed ? 'md:hidden' : ''}`}>Cyber<span style={{ color: 'hsl(var(--pt-marigold-deep))' }}>Control</span></span>
        <button onClick={onClose} className="ml-auto md:hidden pt-toolbtn" aria-label="Close menu">
          <X size={18} />
        </button>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {nav.map((n, i) => n.path === ''
          ? <div key={i} className={`text-[10px] uppercase tracking-wider text-gray-600 px-3 pt-4 pb-1 ${collapsed ? 'md:hidden' : ''}`}>{n.label}</div>
          : <NavItem key={n.path} {...n} onNavigate={onClose} collapsed={collapsed} />
        )}
      </nav>
      <div className="p-3 border-t space-y-2" style={{ borderColor: 'hsl(var(--pt-border))' }}>
        <button
          onClick={onToggleCollapse}
          className={`hidden md:flex items-center gap-2 w-full rounded-lg px-2 py-1.5 pt-muted transition-colors hover:text-ink ${collapsed ? 'md:justify-center' : ''}`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <CaretRight size={16} /> : <CaretLeft size={16} />}
          <span className={`text-[11px] ${collapsed ? 'md:hidden' : ''}`}>Collapse</span>
        </button>
        <ExtensionStatus collapsed={collapsed} />
        <div className={`flex items-center gap-2 px-2 ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
          <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ background: 'hsl(var(--pt-marigold) / 0.15)', color: 'hsl(var(--pt-marigold-deep))' }}>
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className={`flex-1 min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
            <p className="text-xs font-medium truncate" style={{ color: 'hsl(var(--pt-ink))' }}>{user?.name}</p>
            <p className="text-[10px] pt-muted">{user?.role}</p>
          </div>
          <button onClick={logout} className={`pt-muted hover:text-red-500 transition-colors shrink-0 ${collapsed ? 'md:hidden' : ''}`} title="Logout" aria-label="Log out">
            <SignOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
});

export default function Layout() {
  const { user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('cc-sidebar-collapsed') === '1');
  const toggleCollapse = () => setCollapsed(c => {
    const next = !c;
    localStorage.setItem('cc-sidebar-collapsed', next ? '1' : '0');
    return next;
  });

  return (
    <div className="pt-paper h-screen flex flex-col md:flex-row">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between h-12 px-3 border-b shrink-0" style={{ borderColor: 'hsl(var(--pt-border))' }}>
        <button onClick={() => setOpen(true)} className="pt-toolbtn" aria-label="Open menu">
          <List size={20} />
        </button>
        <span className="pt-display text-sm font-bold tracking-tight">Cyber<span style={{ color: 'hsl(var(--pt-marigold-deep))' }}>Control</span></span>
        <span className="w-9" />
      </div>

      {/* Mobile backdrop */}
      {open && <div className="md:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} />}

      <Sidebar user={user} logout={logout} open={open} onClose={() => setOpen(false)} collapsed={collapsed} onToggleCollapse={toggleCollapse} />

      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
