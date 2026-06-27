import { NavLink, Outlet } from 'react-router-dom';
import { memo, useMemo, useEffect, useState } from 'react';
import { useAuthStore } from '../features/auth/store';
import { extensionBridge } from './extensionBridge';
import {
  Users, ChatCircle, Camera, Gear,
  ChartPie, PencilSimple, Brain, Broadcast, UserCircle, SignOut, Lightning, Plugs, MagnifyingGlass,
  List, X
} from '@phosphor-icons/react';

const ExtensionStatus = memo(() => {
  const [status, setStatus] = useState<'unknown' | 'connecting' | 'connected' | 'disconnected'>('unknown');
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => extensionBridge.onStatus((s, v) => { setStatus(s); setVersion(v); }), []);
  const dot = status === 'connected' ? 'bg-green-400' : status === 'connecting' ? 'bg-amber-400 animate-pulse' : status === 'disconnected' ? 'bg-red-400' : 'bg-gray-500';
  const label = status === 'connected' ? `Extension v${version || '?'}` : status === 'connecting' ? 'Connecting...' : status === 'disconnected' ? 'Extension off' : 'Checking...';
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <Plugs size={14} className="text-gray-500" />
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="text-[11px] text-gray-500">{label}</span>
    </div>
  );
});

const OPERATOR_NAV = [
  { path: '/app', icon: Lightning, label: 'Today', end: true },
  { path: '/app/customers', icon: Users, label: 'Customers' },
  { path: '/app/forms', icon: MagnifyingGlass, label: 'Find Form' },
  { path: '/app/whatsapp', icon: ChatCircle, label: 'Documents' },
  { path: '/app/photo', icon: Camera, label: 'Photo Tool' },
  { path: '/app/settings', icon: Gear, label: 'Settings' },
];

const ADMIN_NAV = [
  { path: '/admin', icon: ChartPie, label: 'Overview', end: true },
  { path: '/admin/corrections', icon: PencilSimple, label: 'Corrections' },
  { path: '/admin/mappings', icon: Brain, label: 'Mappings' },
  { path: '/admin/sessions', icon: Broadcast, label: 'Sessions' },
  { path: '/admin/operators', icon: UserCircle, label: 'Operators' },
];

const NavItem = memo(({ path, icon: Icon, label, end, onNavigate }: any) => {
  const badge = path === '/app/whatsapp' ? parseInt(localStorage.getItem('cc-wa-unread') || '0') : 0;
  return (
    <NavLink to={path} end={end} onClick={onNavigate}
      className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
      <Icon size={18} weight={undefined} />
      <span>{label}</span>
      {badge > 0 && <span className="ml-auto w-4 h-4 rounded-full bg-green-500 text-white text-[9px] flex items-center justify-center font-bold">{badge}</span>}
    </NavLink>
  );
});

const Sidebar = memo(({ user, logout, open, onClose }: any) => {
  const isAdmin = user?.role === 'admin';
  const nav = useMemo(() => isAdmin
    ? [...OPERATOR_NAV, { path: '', icon: null, label: 'Admin' }, ...ADMIN_NAV]
    : OPERATOR_NAV, [isAdmin]);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 w-60 flex flex-col border-r transition-transform duration-200 md:static md:z-auto md:w-52 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))' }}
    >
      <div className="h-12 flex items-center gap-2 px-4 border-b" style={{ borderColor: 'hsl(var(--pt-border))' }}>
        <span className="grid h-7 w-7 place-items-center rounded-md" style={{ background: 'hsl(var(--pt-ink))' }}>
          <Lightning size={15} weight="fill" style={{ color: 'hsl(var(--pt-marigold))' }} />
        </span>
        <span className="pt-display text-sm font-bold tracking-tight">Cyber<span style={{ color: 'hsl(var(--pt-marigold-deep))' }}>Control</span></span>
        <button onClick={onClose} className="ml-auto md:hidden pt-toolbtn" aria-label="Close menu">
          <X size={18} />
        </button>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {nav.map((n, i) => n.path === ''
          ? <div key={i} className="text-[10px] uppercase tracking-wider text-gray-600 px-3 pt-4 pb-1">{n.label}</div>
          : <NavItem key={n.path} {...n} onNavigate={onClose} />
        )}
      </nav>
      <div className="p-3 border-t space-y-2" style={{ borderColor: 'hsl(var(--pt-border))' }}>
        <ExtensionStatus />
        <div className="flex items-center gap-2 px-2">
          <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold"
            style={{ background: 'hsl(var(--pt-marigold) / 0.15)', color: 'hsl(var(--pt-marigold-deep))' }}>
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: 'hsl(var(--pt-ink))' }}>{user?.name}</p>
            <p className="text-[10px] pt-muted">{user?.role}</p>
          </div>
          <button onClick={logout} className="pt-muted hover:text-red-500 transition-colors" title="Logout">
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

      <Sidebar user={user} logout={logout} open={open} onClose={() => setOpen(false)} />

      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
