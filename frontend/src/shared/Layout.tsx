import { NavLink, Outlet } from 'react-router-dom';
import { memo, useMemo, useEffect, useState } from 'react';
import { useAuthStore } from '../features/auth/store';
import { extensionBridge } from './extensionBridge';

// Extension connection status indicator
const ExtensionStatus = memo(() => {
  const [status, setStatus] = useState<'unknown' | 'connecting' | 'connected' | 'disconnected'>('unknown');
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => extensionBridge.onStatus((s, v) => { setStatus(s); setVersion(v); }), []);
  const dot =
    status === 'connected' ? 'bg-green-500' :
    status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
    status === 'disconnected' ? 'bg-red-500' :
    'bg-gray-500';
  const label =
    status === 'connected' ? `Extension v${version || '?'}` :
    status === 'connecting' ? 'Connecting…' :
    status === 'disconnected' ? 'Extension off' :
    'Checking…';
  const tooltip =
    status === 'disconnected'
      ? 'Install or enable CyberControl extension. Will retry automatically.'
      : status === 'connected'
      ? `Extension connected — token auto-refreshed every 60s`
      : '';
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#0a0f1c]" title={tooltip}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span className="text-[11px] text-gray-400">{label}</span>
    </div>
  );
});

const OPERATOR_NAV = [
  { path: '/app', icon: '📊', label: 'Dashboard', end: true },
  { path: '/app/customers', icon: '👥', label: 'Customers' },
  { path: '/app/jobs', icon: '📋', label: 'Jobs' },
  { path: '/app/whatsapp', icon: '💬', label: 'WhatsApp' },
  { path: '/app/photo', icon: '📷', label: 'Photo Tool' },
  { path: '/app/documents', icon: '📄', label: 'Documents' },
  { path: '/app/settings', icon: '⚙️', label: 'Settings' },
];

const ADMIN_NAV = [
  { path: '/admin', icon: '📊', label: 'Overview', end: true },
  { path: '/admin/corrections', icon: '✏️', label: 'Corrections' },
  { path: '/admin/mappings', icon: '🧠', label: 'Mappings' },
  { path: '/admin/sessions', icon: '📡', label: 'Sessions' },
  { path: '/admin/operators', icon: '👤', label: 'Operators' },
];

// Memoized nav item — only re-renders when path changes
const NavItem = memo(({ path, icon, label, end }: any) => {
  const badge = path === '/app/whatsapp' ? parseInt(localStorage.getItem('cc-wa-unread') || '0') : 0;
  return (
  <NavLink to={path} end={end}
    className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${isActive ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
    <span className="text-base">{icon}</span>
    <span>{label}</span>
    {badge > 0 && <span className="ml-auto w-5 h-5 rounded-full bg-green-500 text-white text-[10px] flex items-center justify-center font-bold">{badge}</span>}
  </NavLink>
  );
});

// Memoized sidebar — only re-renders when user changes
const Sidebar = memo(({ user, logout }: any) => {
  const isAdmin = user?.role === 'admin';
  const nav = useMemo(() => isAdmin
    ? [...OPERATOR_NAV, { path: '', icon: '', label: '─── Admin ───' }, ...ADMIN_NAV]
    : OPERATOR_NAV, [isAdmin]);

  return (
    <aside className="w-56 bg-[#0d1220] border-r border-white/5 flex flex-col">
      <div className="h-14 flex items-center gap-2 px-4 border-b border-white/5">
        <span className="text-xl">⚡</span>
        <span className="text-sm font-bold text-white">CyberControl</span>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {nav.map((n, i) => n.path === ''
          ? <div key={i} className="text-[10px] text-gray-600 px-3 py-2 mt-3">{n.label}</div>
          : <NavItem key={n.path} {...n} />
        )}
      </nav>
      <div className="p-3 border-t border-white/5 space-y-2">
        <ExtensionStatus />
        <div className="flex items-center gap-2 px-2">
          <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 text-xs font-bold">
            {user?.name?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{user?.name}</p>
            <p className="text-[10px] text-gray-500">{user?.role}</p>
          </div>
          <button onClick={logout} className="text-gray-500 hover:text-red-400 text-xs" title="Logout">⏻</button>
        </div>
      </div>
    </aside>
  );
});

export default function Layout() {
  const { user, logout } = useAuthStore();

  return (
    <div className="h-screen flex bg-[#080d19]">
      <Sidebar user={user} logout={logout} />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
