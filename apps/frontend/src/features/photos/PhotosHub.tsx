import { Link, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';

/**
 * Media Desk shell — home shows job tiles; job pages get a back link.
 */
export default function PhotosHub() {
  const loc = useLocation();
  const atHome = /\/app\/photos\/?$/.test(loc.pathname);

  return (
    <div className="pt-paper flex flex-col h-full md:h-[calc(100vh-4rem)] w-full max-w-full overflow-x-hidden">
      {!atHome && (
        <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: 'hsl(var(--pt-border, var(--border)))' }}>
          <Link to="/app/photos" className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[hsl(27_95%_55%)]">
            <ArrowLeft size={14} /> Media Desk
          </Link>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
