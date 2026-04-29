import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { Button, Avatar, Space, Typography } from 'antd';
import { GoogleOutlined, LogoutOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { API_BASE_URL } from '../utils/helpers';
export default function GoogleDriveLogin() {
    const { accessToken, setAccessToken } = useAuthStore();
    // Sync token to backend on mount and whenever it changes
    useEffect(() => {
        const sync = () => axios.post(`${API_BASE_URL}/drive/token`, { accessToken }).catch(console.error);
        sync();
        // Retry after 3s in case backend wasn't ready
        const t = setTimeout(sync, 3000);
        return () => clearTimeout(t);
    }, [accessToken]);
    const login = useGoogleLogin({
        scope: 'https://www.googleapis.com/auth/drive.file',
        onSuccess: (res) => setAccessToken(res.access_token),
        onError: () => console.error('[Google] Login failed'),
    });
    if (accessToken) {
        return (_jsxs(Space, { children: [_jsx(Avatar, { style: { background: '#52c41a' }, icon: _jsx(GoogleOutlined, {}), size: 24 }), _jsx(Typography.Text, { type: "success", children: "Drive connected" }), _jsx(Button, { size: "small", icon: _jsx(LogoutOutlined, {}), onClick: () => setAccessToken(null), children: "Disconnect" })] }));
    }
    return (_jsx(Button, { icon: _jsx(GoogleOutlined, {}), onClick: () => login(), children: "Connect Google Drive" }));
}
