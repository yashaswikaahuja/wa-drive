import axios from 'axios';
import { useAuthStore } from '../features/auth/store';

export const API_URL = import.meta.env.VITE_API_URL || 'https://api.cybercontrol.fun/api';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      const { refreshToken, setTokens, logout } = useAuthStore.getState();
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          if (res.data.accessToken) {
            setTokens(res.data.accessToken, res.data.refreshToken);
            error.config.headers.Authorization = `Bearer ${res.data.accessToken}`;
            return api(error.config);
          }
        } catch {}
      }
      logout();
    }
    return Promise.reject(error);
  }
);

export default api;
