import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuthStore } from './stores/authStore';
import LoginPage from './pages/LoginPage';
import WhatsAppInboxPage from './pages/WhatsAppInboxPage';
import FileStitchPage from './pages/FileStitchPage';
import FormReadyPage from './pages/FormReadyPage';
import ProfilesPage from './pages/ProfilesPage';
import MappingsPage from './pages/MappingsPage';
import AdaptersPage from './pages/AdaptersPage';
import DashboardPage from './pages/DashboardPage';

const NAV = [
  { path: '/', icon: 'dashboard', label: 'Dashboard' },
  { path: '/inbox', icon: 'inbox', label: 'Inbox' },
  { path: '/profiles', icon: 'people', label: 'Profiles' },
  { path: '/mappings', icon: 'schema', label: 'Mappings' },
  { path: '/adapters', icon: 'extension', label: 'Adapters' },
];

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuthStore();

  return (
    <div className="h-screen flex overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-[240px] bg-[#0d1220] border-r border-border flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="h-14 flex items-center gap-3 px-4 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[18px]" style={{fontVariationSettings:"'FILL' 1"}}>bolt</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">CyberControl</h1>
            <p className="text-[10px] text-muted-foreground">Operator Hub</p>
          </div>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-1 overflow-y-auto">
          {NAV.map(n => (
            <NavLink key={n.path} to={n.path} onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `sidebar-item ${isActive || (n.path === '/inbox' && location.pathname === '/stitch') || (n.path === '/inbox' && location.pathname === '/form-ready') ? 'active' : ''}`}>
              <span className="material-symbols-outlined text-[20px]">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[14px]">person</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.name || 'Operator'}</p>
              <p className="text-[10px] text-muted-foreground">{user?.role || ''} · v5.30</p>
            </div>
            <button onClick={logout} className="text-[10px] text-red-400 hover:text-red-300" title="Logout">
              <span className="material-symbols-outlined text-[16px]">logout</span>
            </button>
          </div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center gap-3 px-4 border-b border-border shrink-0 bg-[#0d1220]/80 backdrop-blur-sm md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-white/5">
            <span className="material-symbols-outlined text-[22px] text-[#94a3b8]">menu</span>
          </button>
          <span className="text-sm font-bold text-white">CyberControl</span>
        </header>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) return <LoginPage />;

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/inbox" element={<WhatsAppInboxPage />} />
          <Route path="/photo-stitch" element={<FileStitchPage />} />
          <Route path="/stitch" element={<FileStitchPage />} />
          <Route path="/form-ready" element={<FormReadyPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/mappings" element={<MappingsPage />} />
          <Route path="/adapters" element={<AdaptersPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
