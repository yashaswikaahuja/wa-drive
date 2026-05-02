import { BrowserRouter, Routes, Route } from 'react-router-dom';
import WhatsAppInboxPage from './pages/WhatsAppInboxPage';
import FileStitchPage from './pages/FileStitchPage';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<WhatsAppInboxPage />} />
        <Route path="/photo-stitch" element={<FileStitchPage />} />
        <Route path="/stitch" element={<FileStitchPage />} />
      </Routes>
    </BrowserRouter>
  );
}
