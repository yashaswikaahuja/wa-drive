import { NavLink, Outlet } from 'react-router-dom';
import { memo, useMemo, useEffect, useState } from 'react';
import { useAuthStore } from '../features/auth/store';
import { extensionBridge } from './extensionBridge';
import {
  Users, ChatCircle, Camera, Gear,
  ChartPie, PencilSimple, Brain, Broadcast, UserCircle, SignOut, Lightning, Plugs, MagnifyingGlass
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

const NavItem = memo(({ path, icon: Icon, label, end }: any) => {
  const badge = path === '/app/whatsapp' ? parseInt(localStorage.getItem('cc-wa-unread') || '0') : 0;
  return (
    <NavLink to={path} end={end}
      className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
      <Icon size={18} weight={undefined} />
      <span>{label}</span>
      {badge > 0 && <span className="ml-auto w-4 h-4 rounded-full bg-green-500 text-white text-[9px] flex items-center justify-center font-bold">{badge}</span>}
    </NavLink>
  );
});

const Sidebar = memo(({ user, logout }: any) => {
  const isAdmin = user?.role === 'admin';
  const nav = useMemo(() => isAdmin
    ? [...OPERATOR_NAV, { path: '', icon: null, label: 'Admin' }, ...ADMIN_NAV]
    : OPERATOR_NAV, [isAdmin]);

  return (
    <aside className="w-52 flex flex-col border-r" style={{ background: '#0a0a0a', borderColor: 'var(--border)' }}>
      <div className="h-12 flex items-center gap-2 px-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <Lightning size={18} weight="fill" className="text-blue-400" />
        <span className="text-sm font-semibold text-white tracking-tight">CyberControl</span>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {nav.map((n, i) => n.path === ''
          ? <div key={i} className="text-[10px] uppercase tracking-wider text-gray-600 px-3 pt-4 pb-1">{n.label}</div>
          : <NavItem key={n.path} {...n} />
        )}
      </nav>
      <div className="p-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
        <ExtensionStatus />
        <div className="flex items-center gap-2 px-2">
          <div className="w-7 h-7 rounded-md bg-blue-500/10 flex items-center justify-center text-blue-400 text-xs font-semibold">
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-200 truncate">{user?.name}</p>
            <p className="text-[10px] text-gray-500">{user?.role}</p>
          </div>
          <button onClick={logout} className="text-gray-600 hover:text-red-400 transition-colors" title="Logout">
            <SignOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
});

export default function Layout() {
  const { user, logout } = useAuthStore();

  return (
    <div className="h-screen flex" style={{ background: 'var(--background)' }}>
      <Sidebar user={user} logout={logout} />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}

