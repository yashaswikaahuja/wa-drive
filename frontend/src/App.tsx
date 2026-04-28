import { BrowserRouter, Routes, Route } from 'react-router-dom';
import WhatsAppInboxPage from './pages/WhatsAppInboxPage';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<WhatsAppInboxPage />} />
        <Route path="/photo-stitch" element={<div style={{ padding: 24 }}>Photo Stitch (coming soon)</div>} />
      </Routes>
    </BrowserRouter>
  );
}
