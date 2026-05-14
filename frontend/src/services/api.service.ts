import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { API_BASE_URL } from '../utils/helpers';

const api = axios.create({ baseURL: API_BASE_URL });

// Inject token on every request
api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Silent refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      const refreshed = await refreshToken();
      if (refreshed) {
        const { accessToken } = useAuthStore.getState();
        error.config.headers.Authorization = `Bearer ${accessToken}`;
        return api(error.config);
      }
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

async function refreshToken(): Promise<boolean> {
  const { refreshToken: rt } = useAuthStore.getState();
  if (!rt) return false;
  try {
    const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken: rt });
    if (res.data.accessToken) {
      useAuthStore.getState().setTokens(res.data.accessToken, res.data.refreshToken);
      return true;
    }
  } catch {}
  return false;
}

export default api;

// Auth API
export const authApi = {
  login: (email: string | null, phone: string | null, password: string) =>
    axios.post(`${API_BASE_URL}/auth/login`, { email, phone, password }),
  register: (email: string, password: string, name: string) =>
    axios.post(`${API_BASE_URL}/auth/register`, { email, password, name }),
  me: () => api.get('/auth/me'),
};

// Data API
export const dataApi = {
  getProfiles: () => api.get('/profiles'),
  getProfile: (id: string) => api.get(`/profiles/${id}`),
  createProfile: (data: any) => api.post('/profiles', data),
  getSessions: () => api.get('/sessions'),
  getCorrections: () => api.get('/corrections'),
  getMappings: () => api.get('/mappings'),
  getMapping: (key: string) => api.get(`/mappings/${key}`),
  getSessionStats: () => api.get('/sessions/stats'),
};
