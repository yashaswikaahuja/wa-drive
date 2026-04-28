import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import WhatsAppInboxPage from './pages/WhatsAppInboxPage';
export default function App() {
    return (_jsx(BrowserRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true }, children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(WhatsAppInboxPage, {}) }), _jsx(Route, { path: "/photo-stitch", element: _jsx("div", { style: { padding: 24 }, children: "Photo Stitch (coming soon)" }) })] }) }));
}
