import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { Button, Avatar, Space, Typography } from 'antd';
import { GoogleOutlined, LogoutOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
function syncToken(token) {
    axios.post(`${API_BASE_URL}/drive/token`, { accessToken: token }).catch(() => { });
}
export default function GoogleDriveLogin() {
    const { accessToken, expiresAt, setAccessToken } = useAuthStore();
    const refreshTimer = useRef(null);
    const isValid = !!accessToken && (expiresAt ?? 0) > Date.now() + 60000; // valid if > 1 min left
    const login = useGoogleLogin({
        scope: 'https://www.googleapis.com/auth/drive.file',
        onSuccess: (res) => {
            const exp = Date.now() + (res.expires_in ?? 3600) * 1000;
            setAccessToken(res.access_token, exp);
            syncToken(res.access_token);
        },
        onError: () => console.error('[Google] Login failed'),
    });
    useEffect(() => {
        if (refreshTimer.current)
            clearTimeout(refreshTimer.current);
        if (!isValid) {
            // Token expired or missing — clear it so UI shows login button
            if (accessToken)
                setAccessToken(null, null);
            syncToken(null);
            return;
        }
        // Sync to hub immediately (hub may have restarted and lost the token)
        syncToken(accessToken);
        // Re-sync every 10 minutes (hub restarts lose the in-memory token)
        const syncInterval = setInterval(() => syncToken(accessToken), 10 * 60 * 1000);
        // Schedule token refresh 5 minutes before expiry
        const refreshIn = (expiresAt - Date.now()) - 5 * 60 * 1000;
        if (refreshIn > 0) {
            refreshTimer.current = setTimeout(() => {
                // Can't auto-refresh without user gesture — just clear so user sees login button
                setAccessToken(null, null);
                syncToken(null);
            }, refreshIn);
        }
        return () => {
            clearInterval(syncInterval);
            if (refreshTimer.current)
                clearTimeout(refreshTimer.current);
        };
    }, [accessToken, expiresAt]);
    if (isValid) {
        return (_jsxs(Space, { children: [_jsx(Avatar, { style: { background: '#52c41a' }, icon: _jsx(GoogleOutlined, {}), size: 24 }), _jsx(Typography.Text, { type: "success", children: "Drive connected" }), _jsx(Button, { size: "small", icon: _jsx(LogoutOutlined, {}), onClick: () => { setAccessToken(null, null); syncToken(null); }, children: "Disconnect" })] }));
    }
    return (_jsx(Button, { icon: _jsx(GoogleOutlined, {}), onClick: () => login(), children: "Connect Google Drive" }));
}
