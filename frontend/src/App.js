import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import WhatsAppInboxPage from './pages/WhatsAppInboxPage';
import FileStitchPage from './pages/FileStitchPage';
import FormReadyPage from './pages/FormReadyPage';
import ProfilesPage from './pages/ProfilesPage';
import MappingsPage from './pages/MappingsPage';
export default function App() {
    return (_jsx(BrowserRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true }, children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(WhatsAppInboxPage, {}) }), _jsx(Route, { path: "/photo-stitch", element: _jsx(FileStitchPage, {}) }), _jsx(Route, { path: "/stitch", element: _jsx(FileStitchPage, {}) }), _jsx(Route, { path: "/form-ready", element: _jsx(FormReadyPage, {}) }), _jsx(Route, { path: "/profiles", element: _jsx(ProfilesPage, {}) }), _jsx(Route, { path: "/mappings", element: _jsx(MappingsPage, {}) })] }) }));
}
