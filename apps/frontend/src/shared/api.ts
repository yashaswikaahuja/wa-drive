import axios from 'axios';
import { useAuthStore } from '../features/auth/store';
import { toast } from './toast';

const PUBLIC_DOMAIN = String(import.meta.env.VITE_PUBLIC_DOMAIN || 'cybercontrol.fun').replace(/^\./, '');
export const API_URL = import.meta.env.VITE_API_URL || `https://api.${PUBLIC_DOMAIN}/api`;
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `https://api.${PUBLIC_DOMAIN}`;

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  // Send/receive the HttpOnly refresh cookie only on auth endpoints. Other cross-origin calls
  // (e.g. extension-service, which returns Access-Control-Allow-Origin: *) must stay
  // non-credentialed — '*' with credentials is rejected by the browser.
  if ((config.url || '').includes('/auth')) config.withCredentials = true;
  return config;
});

// Single-flight token refresh: many requests can 401 at once (e.g. a page that fires
// several calls). Because /auth/refresh ROTATES (revokes the old token), letting each
// 401 refresh independently means all-but-the-first use a now-revoked token → logout.
// So we coalesce: the first 401 kicks off ONE refresh; concurrent 401s await the same
// promise, then all retry with the fresh access token.
let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  const { refreshToken, setTokens } = useAuthStore.getState();
  // Web sends the refresh token via the HttpOnly cookie (withCredentials). A legacy in-memory
  // token (pre-cookie sessions) is still sent as a body fallback until that session gets a cookie
  // on its next refresh — so no one is forced to re-login by this migration.
  refreshPromise = axios
    .post(`${API_URL}/auth/refresh`, refreshToken ? { refreshToken } : {}, { withCredentials: true })
    .then((res) => {
      if (res.data?.accessToken) {
        setTokens(res.data.accessToken, res.data.refreshToken);
        return res.data.accessToken as string;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const config = error.config;
    if (error.response?.status === 401 && config && !config._retry) {
      config._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${newToken}`;
        return api(config);
      }
      useAuthStore.getState().logout();
    }
    if (error.response?.status !== 401 && !(error.config as any)?.skipErrorToast) {
      const msg = error.response?.data?.error || error.response?.data?.message || error.message || 'Request failed';
      toast.error(msg);
    }
    return Promise.reject(error);
  }
);

export default api;
