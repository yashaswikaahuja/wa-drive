import { Link, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';

/**
 * Media Desk shell — home shows job tiles; job pages get a back link.
 */
export default function PhotosHub() {
  const loc = useLocation();
  const atHome = /\/app\/photos\/?$/.test(loc.pathname);

  return (
    <div className="flex flex-col h-full md:h-[calc(100vh-4rem)] w-full max-w-full overflow-x-hidden">
      {!atHome && (
        <div className="px-3 py-2.5 border-b shrink-0" style={{ borderColor: 'hsl(var(--pt-border))', background: 'hsl(var(--pt-card) / 0.7)' }}>
          <Link
            to="/app/photos"
            className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
            style={{ color: 'hsl(var(--pt-muted))' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'hsl(var(--marigold-deep))'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'hsl(var(--pt-muted))'; }}
          >
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
