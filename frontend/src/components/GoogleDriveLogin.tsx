import { useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { Button, Avatar, Space, Typography } from 'antd';
import { GoogleOutlined, LogoutOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

export default function GoogleDriveLogin() {
  const { accessToken, setAccessToken } = useAuthStore();

  // Sync token to backend on mount and whenever it changes
  useEffect(() => {
    const sync = () => axios.post('/api/drive/token', { accessToken }).catch(console.error);
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
    return (
      <Space>
        <Avatar style={{ background: '#52c41a' }} icon={<GoogleOutlined />} size={24} />
        <Typography.Text type="success">Drive connected</Typography.Text>
        <Button size="small" icon={<LogoutOutlined />} onClick={() => setAccessToken(null)}>
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
