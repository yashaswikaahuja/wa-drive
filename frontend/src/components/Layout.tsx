import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';

const OPERATOR_NAV = [
  { path: '/app', icon: '📊', label: 'Dashboard', end: true },
  { path: '/app/customers', icon: '👥', label: 'Customers' },
  { path: '/app/jobs', icon: '📋', label: 'Jobs' },
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

export default function Layout() {
  const { user, logout } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const nav = isAdmin ? [...OPERATOR_NAV, { path: '', icon: '', label: '─── Admin ───' }, ...ADMIN_NAV] : OPERATOR_NAV;

  return (
    <div className="h-screen flex bg-[#080d19]">
      <aside className="w-56 bg-[#0d1220] border-r border-white/5 flex flex-col">
        <div className="h-14 flex items-center gap-2 px-4 border-b border-white/5">
          <span className="text-xl">⚡</span>
          <span className="text-sm font-bold text-white">CyberControl</span>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {nav.map((n, i) => n.path === '' ? (
            <div key={i} className="text-[10px] text-gray-600 px-3 py-2 mt-3">{n.label}</div>
          ) : (
            <NavLink key={n.path} to={n.path} end={n.end}
              className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${isActive ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              <span className="text-base">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-2 px-2">
            <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 text-xs font-bold">
              {user?.name?.[0] || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.name}</p>
              <p className="text-[10px] text-gray-500">{user?.role}</p>
            </div>
            <button onClick={logout} className="text-gray-500 hover:text-red-400 text-lg" title="Logout">×</button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
