import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { memo, useMemo, useEffect, useState } from 'react';
import { useAuthStore } from '../features/auth/store';
import { extensionBridge } from './extensionBridge';
import VerifyBanner from './VerifyBanner';
import LocationBanner from './LocationBanner';

/** Full-bleed panes — no Layout main padding (avoids white gap above toolbars). */
const FULL_BLEED = new Set(['/app/files', '/app/whatsapp']);
import {
  Users, ChatCircle, Camera, Gear, FolderOpen,
  UserCircle, SignOut, Lightning, Plugs, MagnifyingGlass,
  List, CaretLeft, CaretRight
} from '@phosphor-icons/react';

const ExtensionStatus = memo(({ collapsed }: { collapsed?: boolean }) => {
  const [status, setStatus] = useState<'unknown' | 'connecting' | 'connected' | 'disconnected'>('unknown');
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => extensionBridge.onStatus((s, v) => { setStatus(s); setVersion(v); }), []);
  const dot =
    status === 'connected' ? 'bg-[hsl(var(--whatsapp))]' :
    status === 'connecting' ? 'bg-[hsl(var(--marigold))] animate-pulse' :
    status === 'disconnected' ? 'bg-[hsl(var(--chaos))]' :
    'bg-[hsl(var(--pt-muted)/0.45)]';
  const label = status === 'connected' ? `Extension v${version || '?'}` : status === 'connecting' ? 'Connecting…' : status === 'disconnected' ? 'Extension off' : 'Checking…';
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 ${collapsed ? 'md:justify-center md:px-0' : ''}`} title={label}>
      <Plugs size={14} className="shrink-0" style={{ color: 'hsl(var(--pt-muted))' }} />
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span className={`text-[11px] truncate ${collapsed ? 'md:hidden' : ''}`} style={{ color: 'hsl(var(--pt-muted))' }}>{label}</span>
    </div>
  );
});

const OPERATOR_NAV = [
  { path: '/app', icon: Lightning, label: 'Today', end: true },
  { path: '/app/customers', icon: Users, label: 'Customers' },
  { path: '/app/forms', icon: MagnifyingGlass, label: 'Find Form' },
  { path: '/app/files', icon: FolderOpen, label: 'File Manager' },
  { path: '/app/whatsapp', icon: ChatCircle, label: 'Documents' },
  { path: '/app/photos', icon: Camera, label: 'Photos' },
  { path: '/app/settings', icon: Gear, label: 'Settings' },
];

// Learning/config (Mappings, Corrections, Sessions, Overview) lives in owner-panel.
// Hub admins only manage Operators so café owners can give employees workspace access.
const ADMIN_NAV = [
  { path: '/admin/operators', icon: UserCircle, label: 'Operators' },
];

const NavItem = memo(({ path, icon: Icon, label, end, onNavigate, collapsed }: any) => {
  const badge = path === '/app/whatsapp' ? parseInt(localStorage.getItem('cc-wa-unread') || '0') : 0;
  return (
    <NavLink to={path} end={end} onClick={onNavigate} title={label}
      className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''} ${collapsed ? 'md:justify-center md:px-2' : ''}`}>
      <span className="relative flex shrink-0">
        <Icon size={18} weight={undefined} />
        {badge > 0 && (
          <span
            className={`absolute -top-1 -right-1 w-2 h-2 rounded-full hidden ${collapsed ? 'md:block' : ''}`}
            style={{ background: 'hsl(var(--whatsapp))' }}
          />
        )}
      </span>
      <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
      {badge > 0 && (
        <span
          className={`ml-auto w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center font-bold ${collapsed ? 'md:hidden' : ''}`}
          style={{ background: 'hsl(var(--whatsapp))' }}
        >
          {badge}
        </span>
      )}
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
      className={`fixed inset-y-0 left-0 z-50 w-60 flex flex-col border-r transition-all duration-200 md:static md:z-auto md:translate-x-0 ${collapsed ? 'md:w-16' : 'md:w-56'} ${open ? 'translate-x-0' : '-translate-x-full'}`}
      style={{
        background: 'hsl(var(--pt-card))',
        borderColor: 'hsl(var(--pt-border))',
        boxShadow: '4px 0 24px -18px hsl(220 30% 8% / 0.18)',
      }}
    >
      <div
        className={`h-14 flex items-center gap-2.5 px-4 border-b ${collapsed ? 'md:px-0 md:justify-center' : ''}`}
        style={{ borderColor: 'hsl(var(--pt-border))', background: 'linear-gradient(180deg, hsl(var(--ink)) 0%, hsl(220 40% 14%) 100%)' }}
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg shrink-0" style={{ background: 'hsl(var(--marigold) / 0.18)' }}>
          <Lightning size={16} weight="fill" style={{ color: 'hsl(var(--marigold))' }} />
        </span>
        <span className={`pt-display text-[15px] font-bold tracking-tight text-white ${collapsed ? 'md:hidden' : ''}`}>
          Cyber<span style={{ color: 'hsl(var(--marigold))' }}>Control</span>
        </span>
      </div>
      <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto" style={{ scrollbarGutter: 'stable both-edges' }}>
        {nav.map((n, i) => n.path === ''
          ? (
            <div
              key={i}
              className={`pt-label text-[10px] px-3 pt-4 pb-1 ${collapsed ? 'md:hidden' : ''}`}
              style={{ color: 'hsl(var(--pt-muted))' }}
            >
              {n.label}
            </div>
          )
          : <NavItem key={n.path} {...n} onNavigate={onClose} collapsed={collapsed} />
        )}
      </nav>
      <div className="p-3 border-t space-y-2" style={{ borderColor: 'hsl(var(--pt-border))', background: 'hsl(var(--paper) / 0.55)' }}>
        <button
          onClick={onToggleCollapse}
          className={`hidden md:flex items-center gap-2 w-full rounded-lg px-2 py-1.5 transition-colors ${collapsed ? 'md:justify-center' : ''}`}
          style={{ color: 'hsl(var(--pt-muted))' }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <CaretRight size={16} /> : <CaretLeft size={16} />}
          <span className={`text-[11px] ${collapsed ? 'md:hidden' : ''}`}>Collapse</span>
        </button>
        <ExtensionStatus collapsed={collapsed} />
        <div className={`flex items-center gap-2 px-2 ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ background: 'hsl(var(--marigold) / 0.16)', color: 'hsl(var(--marigold-deep))' }}
          >
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className={`flex-1 min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
            <p className="text-xs font-semibold truncate" style={{ color: 'hsl(var(--ink))' }}>{user?.name}</p>
            <p className="text-[10px] capitalize" style={{ color: 'hsl(var(--pt-muted))' }}>{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className={`transition-colors shrink-0 ${collapsed ? 'md:hidden' : ''}`}
            style={{ color: 'hsl(var(--pt-muted))' }}
            title="Logout"
            aria-label="Log out"
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--chaos))'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--pt-muted))'; }}
          >
            <SignOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
});

export default function Layout() {
  const { user, logout } = useAuthStore();
  const { pathname } = useLocation();
  const fullBleed = FULL_BLEED.has(pathname);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('cc-sidebar-collapsed') === '1');
  const toggleCollapse = () => setCollapsed(c => {
    const next = !c;
    localStorage.setItem('cc-sidebar-collapsed', next ? '1' : '0');
    return next;
  });

  return (
    <div className="pt-paper h-screen flex flex-col md:flex-row">
      {/* Mobile top bar — ink strip like landing header */}
      <div
        className="md:hidden flex items-center justify-between h-12 px-3 border-b shrink-0"
        style={{ borderColor: 'hsl(var(--ink) / 0.35)', background: 'hsl(var(--ink))' }}
      >
        <button onClick={() => setOpen(true)} className="pt-toolbtn text-white/90 hover:text-white" aria-label="Open menu" style={{ color: 'rgba(255,255,255,0.9)' }}>
          <List size={20} />
        </button>
        <span className="pt-display text-sm font-bold tracking-tight text-white">
          Cyber<span style={{ color: 'hsl(var(--marigold))' }}>Control</span>
        </span>
        <span className="w-9" />
      </div>

      {/* Mobile backdrop */}
      {open && <div className="md:hidden fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]" onClick={() => setOpen(false)} />}

      <Sidebar user={user} logout={logout} open={open} onClose={() => setOpen(false)} collapsed={collapsed} onToggleCollapse={toggleCollapse} />

      <main
        className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden ${
          fullBleed ? 'p-0 flex flex-col' : 'p-4 md:p-7'
        }`}
      >
        <VerifyBanner />
        <LocationBanner />
        <div className={fullBleed ? 'flex-1 min-h-0 flex flex-col' : 'mx-auto w-full max-w-6xl'}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
