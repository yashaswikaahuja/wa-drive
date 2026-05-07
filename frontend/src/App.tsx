import { BrowserRouter, Routes, Route } from 'react-router-dom';
import WhatsAppInboxPage from './pages/WhatsAppInboxPage';
import FileStitchPage from './pages/FileStitchPage';
import FormReadyPage from './pages/FormReadyPage';
import ProfilesPage from './pages/ProfilesPage';
import MappingsPage from './pages/MappingsPage';
import AdaptersPage from './pages/AdaptersPage';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<WhatsAppInboxPage />} />
        <Route path="/photo-stitch" element={<FileStitchPage />} />
        <Route path="/stitch" element={<FileStitchPage />} />
        <Route path="/form-ready" element={<FormReadyPage />} />
        <Route path="/profiles" element={<ProfilesPage />} />
        <Route path="/mappings" element={<MappingsPage />} />
        <Route path="/adapters" element={<AdaptersPage />} />
      </Routes>
    </BrowserRouter>
  );
}
