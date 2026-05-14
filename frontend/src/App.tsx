import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/operator/Dashboard';
import Customers from './pages/operator/Customers';
import Jobs from './pages/operator/Jobs';
import NewJob from './pages/operator/NewJob';
import Settings from './pages/operator/Settings';
import WhatsApp from './pages/operator/WhatsApp';
import Stitch from './pages/operator/Stitch';
import Overview from './pages/admin/Overview';
import Sessions from './pages/admin/Sessions';
import Corrections from './pages/admin/Corrections';

export default function App() {
  const { isAuthenticated } = useAuthStore();
  // Handle Google OAuth callback (token in URL hash)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.slice(1));
      const accessToken = params.get('access_token');
      if (accessToken) {
        import('./lib/api').then(({ default: api }) => {
          api.post('/drive/token', { accessToken }).then(() => {
            window.history.replaceState(null, '', '/app/settings');
            window.location.reload();
          }).catch(() => {});
        });
      }
    }
  }, []);

  if (!isAuthenticated) return <Login />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/customers" element={<Customers />} />
          <Route path="/app/jobs" element={<Jobs />} />
          <Route path="/app/jobs/new" element={<NewJob />} />
          <Route path="/app/whatsapp" element={<WhatsApp />} />
          <Route path="/app/stitch" element={<Stitch />} />
          <Route path="/app/documents" element={<Placeholder title="Documents" />} />
          <Route path="/app/settings" element={<Settings />} />
          <Route path="/admin" element={<Overview />} />
          <Route path="/admin/corrections" element={<Corrections />} />
          <Route path="/admin/sessions" element={<Sessions />} />
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
