import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useEffect } from 'react';
import { useAuthStore } from './features/auth/store';
import { extensionBridge } from './shared/extensionBridge';
import Toasts from './shared/Toasts';
import { API_URL } from './shared/api';
import api from './shared/api';
import Login from './features/auth/Login';
import Layout from './shared/Layout';

// Lazy-loaded routes — each becomes a separate chunk
const Dashboard = lazy(() => import('./features/dashboard/Dashboard'));
const Customers = lazy(() => import('./features/customers/Customers'));
const CustomerDetail = lazy(() => import('./features/customers/CustomerDetail'));
const Jobs = lazy(() => import('./features/jobs/Jobs'));
const NewJob = lazy(() => import('./features/jobs/NewJob'));
const JobDetail = lazy(() => import('./features/jobs/JobDetail'));
const WhatsApp = lazy(() => import('./features/whatsapp/WhatsApp'));
const FormDirectory = lazy(() => import('./features/forms/FormDirectory'));
const FormPhotoTool = lazy(() => import('./features/forms/FormPhotoTool'));
const Stitch = lazy(() => import('./features/services/Stitch'));
const PhotoTool = lazy(() => import('./features/photo-tool/PhotoTool'));
const PhotosHub = lazy(() => import('./features/photos/PhotosHub'));
const PlaygroundIndex = lazy(() => import('./features/playground/PlaygroundIndex'));
const PlaygroundCounter = lazy(() => import('./features/playground/pages/Counter'));
const SharedProfile = lazy(() => import('./features/customers/SharedProfile'));
const Settings = lazy(() => import('./features/settings/Settings'));
const Overview = lazy(() => import('./features/admin/Overview'));
const Sessions = lazy(() => import('./features/admin/Sessions'));
const Corrections = lazy(() => import('./features/admin/Corrections'));
const Mappings = lazy(() => import('./features/admin/Mappings'));
const Operators = lazy(() => import('./features/admin/Operators'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 rounded-full animate-spin" style={{ border: '2px solid hsl(27 95% 55% / 0.25)', borderTopColor: 'hsl(27 95% 55%)' }} />
    </div>
  );
}

export default function App() {
  const { accessToken, refreshToken, user, setUser, logout } = useAuthStore();
  const authed = !!accessToken;

  useEffect(() => {
    if (authed) {
      extensionBridge.connect({ accessToken, refreshToken, user, backendUrl: API_URL }).catch(() => {});
    } else {
      extensionBridge.disconnect();
    }
    return () => { /* keep retry loop alive on route change */ };
  }, [authed, accessToken]);

  // Boot-time session validation: refresh the live user (role/status) and bounce dead/suspended
  // sessions. A 401 is handled by the api interceptor (single-flight refresh, else logout);
  // transient/offline errors keep the cached session so the app still opens offline.
  useEffect(() => {
    if (!authed) return;
    let alive = true;
    api.get('/auth/me')
      .then((r) => {
        if (!alive) return;
        const u = r.data;
        if (u?.status && u.status !== 'active') { logout(); return; }
        setUser({ id: u.id, workspaceId: u.workspace_id, name: u.name, email: u.email, role: u.role });
      })
      .catch(() => { /* interceptor handles 401; ignore transient/offline errors */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Public preview route — design playground and shared profiles accessible without login
  const isPlayground = typeof window !== 'undefined' && window.location.pathname.startsWith('/design-playground');
  const isSharedProfile = typeof window !== 'undefined' && window.location.pathname.startsWith('/shared/');
  if (!authed && !isPlayground && !isSharedProfile) return <Login />;

  return (
    <BrowserRouter>
      <Toasts />
      <Routes>
        <Route path="/design-playground" element={<Suspense fallback={<PageLoader />}><PlaygroundIndex /></Suspense>} />
        <Route path="/design-playground/counter" element={<Suspense fallback={<PageLoader />}><PlaygroundCounter /></Suspense>} />
        <Route path="/shared/:token" element={<Suspense fallback={<PageLoader />}><SharedProfile /></Suspense>} />
        <Route element={<Layout />}>
          <Route path="/app" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
          <Route path="/app/customers" element={<Suspense fallback={<PageLoader />}><Customers /></Suspense>} />
          <Route path="/app/customers/:id" element={<Suspense fallback={<PageLoader />}><CustomerDetail /></Suspense>} />
          <Route path="/app/jobs" element={<Suspense fallback={<PageLoader />}><Jobs /></Suspense>} />
          <Route path="/app/jobs/new" element={<Suspense fallback={<PageLoader />}><NewJob /></Suspense>} />
          <Route path="/app/jobs/:id" element={<Suspense fallback={<PageLoader />}><JobDetail /></Suspense>} />
          <Route path="/app/whatsapp" element={<Suspense fallback={<PageLoader />}><WhatsApp /></Suspense>} />
          <Route path="/app/forms" element={<Suspense fallback={<PageLoader />}><FormDirectory /></Suspense>} />
          {/* Unified Photos hub (mode tabs) */}
          <Route path="/app/photos" element={<Suspense fallback={<PageLoader />}><PhotosHub /></Suspense>}>
            <Route index element={<Navigate to="/app/photos/prints" replace />} />
            <Route path="prints" element={<Suspense fallback={<PageLoader />}><PhotoTool /></Suspense>} />
            <Route path="process" element={<Suspense fallback={<PageLoader />}><Stitch /></Suspense>} />
            <Route path="form" element={<Suspense fallback={<PageLoader />}><FormPhotoTool /></Suspense>} />
          </Route>
          {/* Back-compat redirects (preserve query string) */}
          <Route path="/app/photo" element={<RedirectWithSearch to="/app/photos/prints" />} />
          <Route path="/app/stitch" element={<RedirectWithSearch to="/app/photos/process" />} />
          <Route path="/app/forms/photo" element={<RedirectWithSearch to="/app/photos/form" />} />
          <Route path="/app/documents" element={<Placeholder title="Documents" />} />
          <Route path="/app/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
          <Route element={<AdminOnly />}>
            <Route path="/admin" element={<Suspense fallback={<PageLoader />}><Overview /></Suspense>} />
            <Route path="/admin/corrections" element={<Suspense fallback={<PageLoader />}><Corrections /></Suspense>} />
            <Route path="/admin/sessions" element={<Suspense fallback={<PageLoader />}><Sessions /></Suspense>} />
            <Route path="/admin/mappings" element={<Suspense fallback={<PageLoader />}><Mappings /></Suspense>} />
            <Route path="/admin/operators" element={<Suspense fallback={<PageLoader />}><Operators /></Suspense>} />
          </Route>
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function RedirectWithSearch({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={to + search} replace />;
}

// Route guard: only admins may enter /admin/*; operators are sent to their dashboard.
function AdminOnly() {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'admin') return <Navigate to="/app" replace />;
  return <Outlet />;
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center px-4">
      <p className="pt-display text-xl font-bold" style={{ color: 'hsl(var(--pt-ink))' }}>{title}</p>
      <p className="text-sm pt-muted mt-1.5">This section is coming soon.</p>
    </div>
  );
}
