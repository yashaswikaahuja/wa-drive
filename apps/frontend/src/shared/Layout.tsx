import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { memo, useMemo, useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../features/auth/store';
import { extensionBridge } from './extensionBridge';
import VerifyBanner from './VerifyBanner';
import LocationBanner from './LocationBanner';

/** Full-bleed panes — no Layout main padding (avoids white gap above toolbars). */
const FULL_BLEED = new Set(['/app/files', '/app/whatsapp', '/app/photos/doc-print', '/app/photos/printdoc']);
import {
  Users, ChatCircle, Camera, Gear, FolderOpen,
  UserCircle, SignOut, Lightning, Plugs, MagnifyingGlass,
  List, PushPin, PushPinSlash,
} from '@phosphor-icons/react';

const ExtensionStatus = memo(({ expanded }: { expanded: boolean }) => {
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
    <div className={`flex items-center gap-2 px-2 py-1.5 ${expanded ? '' : 'justify-center px-0'}`} title={label}>
      <Plugs size={14} className="shrink-0" style={{ color: 'hsl(var(--pt-muted))' }} />
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {expanded && (
        <span className="text-[11px] truncate" style={{ color: 'hsl(var(--pt-muted))' }}>{label}</span>
      )}
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

const NavItem = memo(({ path, icon: Icon, label, end, onNavigate, expanded }: any) => {
  const badge = path === '/app/whatsapp' ? parseInt(localStorage.getItem('cc-wa-unread') || '0') : 0;
  return (
    <NavLink
      to={path}
      end={end}
      onClick={onNavigate}
      title={label}
      className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''} ${expanded ? '' : 'justify-center px-2'}`}
    >
      <span className="relative flex shrink-0">
        <Icon size={18} weight={undefined} />
        {badge > 0 && !expanded && (
          <span
            className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
            style={{ background: 'hsl(var(--whatsapp))' }}
          />
        )}
      </span>
      {expanded && <span>{label}</span>}
      {badge > 0 && expanded && (
        <span
          className="ml-auto w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center font-bold"
          style={{ background: 'hsl(var(--whatsapp))' }}
        >
          {badge}
        </span>
      )}
    </NavLink>
  );
});

type SidebarBodyProps = {
  user: any;
  logout: () => void;
  expanded: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  onNavigate?: () => void;
  showPin?: boolean;
};

const SidebarBody = memo(({ user, logout, expanded, pinned, onTogglePin, onNavigate, showPin }: SidebarBodyProps) => {
  const isAdmin = user?.role === 'admin';
  const nav = useMemo(() => isAdmin
    ? [...OPERATOR_NAV, { path: '', icon: null, label: 'Admin' }, ...ADMIN_NAV]
    : OPERATOR_NAV, [isAdmin]);

  return (
    <>
      <div
        className={`h-14 flex items-center gap-2.5 px-4 border-b shrink-0 ${expanded ? '' : 'px-0 justify-center'}`}
        style={{ borderColor: 'hsl(var(--pt-border))', background: 'linear-gradient(180deg, hsl(var(--chrome)) 0%, hsl(var(--chrome-deep)) 100%)' }}
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg shrink-0" style={{ background: 'hsl(var(--marigold) / 0.18)' }}>
          <Lightning size={16} weight="fill" style={{ color: 'hsl(var(--marigold))' }} />
        </span>
        {expanded && (
          <span className="pt-display text-[15px] font-bold tracking-tight text-white">
            Cyber<span style={{ color: 'hsl(var(--marigold))' }}>Control</span>
          </span>
        )}
      </div>
      <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto overflow-x-hidden" style={{ scrollbarGutter: expanded ? 'stable both-edges' : 'auto' }}>
        {nav.map((n, i) => n.path === ''
          ? (
            expanded ? (
              <div
                key={i}
                className="pt-label text-[10px] px-3 pt-4 pb-1"
                style={{ color: 'hsl(var(--pt-muted))' }}
              >
                {n.label}
              </div>
            ) : (
              <div key={i} className="h-3" aria-hidden />
            )
          )
          : <NavItem key={n.path} {...n} onNavigate={onNavigate} expanded={expanded} />
        )}
      </nav>
      <div className="p-3 border-t space-y-2 shrink-0" style={{ borderColor: 'hsl(var(--pt-border))', background: 'hsl(var(--paper) / 0.55)' }}>
        {showPin && onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            className={`flex items-center gap-2 w-full rounded-lg px-2 py-1.5 transition-colors ${expanded ? '' : 'justify-center'}`}
            style={{ color: 'hsl(var(--pt-muted))' }}
            title={pinned ? 'Auto-collapse when pointer leaves' : 'Keep sidebar open'}
            aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
            aria-pressed={!!pinned}
          >
            {pinned ? <PushPinSlash size={16} /> : <PushPin size={16} />}
            {expanded && (
              <span className="text-[11px]">{pinned ? 'Unpin' : 'Keep open'}</span>
            )}
          </button>
        )}
        <ExtensionStatus expanded={expanded} />
        <div className={`flex items-center gap-2 px-2 ${expanded ? '' : 'justify-center px-0'}`}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ background: 'hsl(var(--marigold) / 0.16)', color: 'hsl(var(--marigold-deep))' }}
            title={user?.name || 'Operator'}
          >
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          {expanded && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: 'hsl(var(--ink))' }}>{user?.name}</p>
              <p className="text-[10px] capitalize" style={{ color: 'hsl(var(--pt-muted))' }}>{user?.role}</p>
            </div>
          )}
          <button
            type="button"
            onClick={logout}
            className="transition-colors shrink-0"
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
    </>
  );
});

function readPinnedPreference(): boolean {
  try {
    const pinned = localStorage.getItem('cc-sidebar-pinned');
    if (pinned === '1') return true;
    if (pinned === '0') return false;
    // Migrate: old key stored collapsed=0 when the operator wanted a permanent wide rail.
    if (localStorage.getItem('cc-sidebar-collapsed') === '0') return true;
  } catch { /* private mode */ }
  return false; // NPCI default: icon rail + hover expand
}

export default function Layout() {
  const { user, logout } = useAuthStore();
  const { pathname } = useLocation();
  const fullBleed = FULL_BLEED.has(pathname) || pathname.startsWith('/app/photos/pdf');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pinned, setPinned] = useState(readPinnedPreference);
  const [hovered, setHovered] = useState(false);
  const desktopExpanded = pinned || hovered;

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cc-sidebar-pinned', next ? '1' : '0');
        localStorage.removeItem('cc-sidebar-collapsed');
      } catch { /* private mode */ }
      return next;
    });
  }, []);

  const shellStyle = {
    background: 'hsl(var(--pt-card))',
    borderColor: 'hsl(var(--pt-border))',
  } as const;

  return (
    <div className="pt-paper h-dvh max-h-dvh flex flex-col md:flex-row overflow-hidden">
      {/* Mobile top bar — ink strip like landing header (sticky so it cannot scroll away and leave a gap above fixed panes) */}
      <div
        className="md:hidden sticky top-0 z-30 flex items-center justify-between h-12 px-3 border-b shrink-0"
        style={{ borderColor: 'hsl(var(--chrome) / 0.55)', background: 'hsl(var(--chrome))' }}
      >
        <button onClick={() => setMobileOpen(true)} className="pt-toolbtn text-white/90 hover:text-white" aria-label="Open menu" style={{ color: 'rgba(255,255,255,0.9)' }}>
          <List size={20} />
        </button>
        <span className="pt-display text-sm font-bold tracking-tight text-white">
          Cyber<span style={{ color: 'hsl(var(--marigold))' }}>Control</span>
        </span>
        <span className="w-9" />
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile drawer — always full labels */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-60 flex flex-col border-r transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ ...shellStyle, boxShadow: '4px 0 24px -18px hsl(220 30% 8% / 0.18)' }}
      >
        <SidebarBody
          user={user}
          logout={logout}
          expanded
          onNavigate={() => setMobileOpen(false)}
          showPin={false}
        />
      </aside>

      {/* Desktop NPCI-style rail: narrow by default, expands over content on hover */}
      <div
        className={`hidden md:block relative shrink-0 self-stretch transition-[width] duration-200 ease-out ${
          pinned ? 'w-56' : 'w-16'
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <aside
          className={`absolute inset-y-0 left-0 flex flex-col border-r h-full overflow-hidden transition-[width,box-shadow] duration-200 ease-out ${
            desktopExpanded ? 'w-56' : 'w-16'
          } ${!pinned && desktopExpanded ? 'z-40' : 'z-10'}`}
          style={{
            ...shellStyle,
            boxShadow: !pinned && desktopExpanded
              ? '8px 0 28px -12px hsl(220 30% 8% / 0.28)'
              : '4px 0 24px -18px hsl(220 30% 8% / 0.18)',
          }}
          aria-expanded={desktopExpanded}
          data-sidebar={pinned ? 'pinned' : desktopExpanded ? 'hover' : 'rail'}
        >
          <SidebarBody
            user={user}
            logout={logout}
            expanded={desktopExpanded}
            pinned={pinned}
            onTogglePin={togglePin}
            showPin
          />
        </aside>
      </div>

      <main
        className={`flex-1 min-w-0 overflow-x-hidden ${
          // Documents / File Manager own their scroll panes — page scroll breaks the phone inbox↔chat split.
          fullBleed ? 'p-0 flex flex-col overflow-hidden' : 'p-4 md:p-7 overflow-y-auto'
        }`}
      >
        {!fullBleed && (
          <>
            <VerifyBanner />
            <LocationBanner />
          </>
        )}
        <div className={fullBleed ? 'flex-1 min-h-0 flex flex-col' : 'mx-auto w-full max-w-6xl'}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
