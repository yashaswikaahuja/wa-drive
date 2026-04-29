import { useEffect, useCallback } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { Button, Avatar, Space, Typography } from 'antd';
import { GoogleOutlined, LogoutOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function syncToken(token: string | null) {
  axios.post(`${API_BASE_URL}/drive/token`, { accessToken: token }).catch(console.error);
}

export default function GoogleDriveLogin() {
  const { accessToken, expiresAt, setAccessToken } = useAuthStore();

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.file',
    onSuccess: (res) => {
      const exp = Date.now() + (res.expires_in ?? 3600) * 1000;
      setAccessToken(res.access_token, exp);
    },
    onError: () => console.error('[Google] Login failed'),
  });

  // Sync token to backend; retry until backend is ready
  const syncAndSchedule = useCallback(() => {
    if (!accessToken) { syncToken(null); return; }

    const now = Date.now();
    const timeLeft = (expiresAt ?? 0) - now;

    if (timeLeft < 5 * 60 * 1000) {
      login();
      return;
    }

    // Retry syncing every 10s for up to 60s (in case backend just restarted)
    let attempts = 0;
    const interval = setInterval(() => {
      syncToken(accessToken);
      attempts++;
      if (attempts >= 6) clearInterval(interval);
    }, 10000);
    syncToken(accessToken); // immediate first attempt

    // Schedule refresh 5 min before expiry
    const refreshIn = timeLeft - 5 * 60 * 1000;
    const t = setTimeout(() => login(), refreshIn);
    return () => { clearInterval(interval); clearTimeout(t); };
  }, [accessToken, expiresAt]);

  useEffect(() => {
    return syncAndSchedule();
  }, [syncAndSchedule]);

  if (accessToken && (expiresAt ?? 0) > Date.now()) {
    return (
      <Space>
        <Avatar style={{ background: '#52c41a' }} icon={<GoogleOutlined />} size={24} />
        <Typography.Text type="success">Drive connected</Typography.Text>
        <Button size="small" icon={<LogoutOutlined />} onClick={() => setAccessToken(null, null)}>
          Disconnect
        </Button>
      </Space>
    );
  }

  return (
    <Button icon={<GoogleOutlined />} onClick={() => login()}>
      Connect Google Drive
    </Button>
  );
}
