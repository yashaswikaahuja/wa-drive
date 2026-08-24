import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: 'prints', label: 'Print sheets' },
  { to: 'process', label: 'Background & Aadhaar' },
  { to: 'form', label: 'Form photo' },
];

const activeStyle = { background: 'linear-gradient(180deg, hsl(27 95% 58%), hsl(22 92% 50%))', color: '#fff' } as const;

/**
 * One "Photos" home for all three photo tools. The tab bar switches between
 * nested routes (prints / process / form); each tool renders in the Outlet
 * and fills the remaining height.
 */
export default function PhotosHub() {
  return (
    <div className="pt-paper flex flex-col h-full md:h-[calc(100vh-4rem)] w-full max-w-full overflow-x-hidden">
      <div className="flex gap-1.5 p-2 border-b overflow-x-auto shrink-0" style={{ borderColor: 'hsl(var(--pt-border))' }}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className="whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-medium transition"
            style={({ isActive }) => (isActive ? activeStyle : { color: 'hsl(var(--pt-muted))' })}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
