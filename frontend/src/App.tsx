import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuthStore } from './stores/auth';
import Login from './pages/Login';
import Layout from './components/Layout';

// Lazy-loaded routes — each becomes a separate chunk
const Dashboard = lazy(() => import('./pages/operator/Dashboard'));
const Customers = lazy(() => import('./pages/operator/Customers'));
const Jobs = lazy(() => import('./pages/operator/Jobs'));
const NewJob = lazy(() => import('./pages/operator/NewJob'));
const WhatsApp = lazy(() => import('./pages/operator/WhatsApp'));
const Stitch = lazy(() => import('./pages/operator/Stitch'));
const Settings = lazy(() => import('./pages/operator/Settings'));
const Overview = lazy(() => import('./pages/admin/Overview'));
const Sessions = lazy(() => import('./pages/admin/Sessions'));
const Corrections = lazy(() => import('./pages/admin/Corrections'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Login />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/app" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
          <Route path="/app/customers" element={<Suspense fallback={<PageLoader />}><Customers /></Suspense>} />
          <Route path="/app/jobs" element={<Suspense fallback={<PageLoader />}><Jobs /></Suspense>} />
          <Route path="/app/jobs/new" element={<Suspense fallback={<PageLoader />}><NewJob /></Suspense>} />
          <Route path="/app/whatsapp" element={<Suspense fallback={<PageLoader />}><WhatsApp /></Suspense>} />
          <Route path="/app/stitch" element={<Suspense fallback={<PageLoader />}><Stitch /></Suspense>} />
          <Route path="/app/documents" element={<Placeholder title="Documents" />} />
          <Route path="/app/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={<PageLoader />}><Overview /></Suspense>} />
          <Route path="/admin/corrections" element={<Suspense fallback={<PageLoader />}><Corrections /></Suspense>} />
          <Route path="/admin/sessions" element={<Suspense fallback={<PageLoader />}><Sessions /></Suspense>} />
          <Route path="/admin/mappings" element={<Placeholder title="Mappings" />} />
          <Route path="/admin/operators" element={<Placeholder title="Operators" />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function Placeholder({ title }: { title: string }) {
  return <div className="flex items-center justify-center h-64"><p className="text-gray-500 text-lg">{title} — coming soon</p></div>;
}
