/**
 * Thin HTTP client for CyberControl API.
 */
import type { ApiRequestOptions, ApiResponse } from './types.js';

export async function apiRequest(
  apiBase: string,
  path: string,
  { method = 'GET', token, body, form, timeoutMs = 45000 }: ApiRequestOptions = {}
): Promise<ApiResponse> {
  const base = String(apiBase || '').replace(/\/$/, '');
  const url = path.startsWith('http') ? path : base + path;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: string | undefined;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form as any).toString();
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e: any) {
    const cause = e?.cause?.message || e?.message || String(e);
    throw new Error(`Network error ${method} ${url}\n  ${cause}`);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text, url };
}

export async function apiGet(apiBase: string, token: string, path: string): Promise<any> {
  const { ok, status, data, url } = await apiRequest(apiBase, path, { token });
  if (!ok) {
    if (status === 401 || status === 403) {
      throw new Error(`Auth failed HTTP ${status} for ${url}\n  Run: cyb login`);
    }
    throw new Error(`GET ${path} HTTP ${status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

export async function authMe(apiBase: string, token: string): Promise<any> {
  return apiGet(apiBase, token, '/auth/me');
}

export async function listSessions(
  apiBase: string,
  token: string,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<any[]> {
  const data = await apiGet(apiBase, token, `/sessions?limit=${limit}&offset=${offset}`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.sessions)) return data.sessions;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  throw new Error(`Unexpected sessions shape: ${typeof data}`);
}

export async function getSession(apiBase: string, token: string, id: string): Promise<any> {
  return apiGet(apiBase, token, `/sessions/${id}`);
}

export async function startDeviceLogin(apiBase: string): Promise<any> {
  const { ok, status, data } = await apiRequest(apiBase, '/auth/cli/device', { method: 'POST', body: {} });
  if (!ok) {
    throw new Error(
      `Device login not available (HTTP ${status}).\n` +
        `  ${JSON.stringify(data).slice(0, 200)}\n` +
        `  Backend needs /api/auth/cli/* deployed.\n` +
        `  Fallbacks:  cyb login --email you@x.com   or   cyb login --token <jwt>`
    );
  }
  return data;
}

export async function pollDeviceLogin(apiBase: string, deviceCode: string): Promise<any> {
  const { ok, status, data } = await apiRequest(
    apiBase,
    `/auth/cli/poll?device_code=${encodeURIComponent(deviceCode)}`,
    { method: 'GET', timeoutMs: 20000 }
  );
  if (!ok && status !== 404) {
    throw new Error(`Poll failed HTTP ${status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data || { status: 'expired' };
}

export async function passwordLogin(apiBase: string, emailOrPhone: string, password: string): Promise<any> {
  const body = emailOrPhone.includes('@')
    ? { email: emailOrPhone.trim().toLowerCase(), password }
    : { phone: emailOrPhone.trim(), password };
  const { ok, status, data } = await apiRequest(apiBase, '/auth/login', { method: 'POST', body });
  if (!ok) {
    throw new Error(data?.error || `Login failed HTTP ${status}`);
  }
  return data;
}

export async function refreshTokens(apiBase: string, refreshToken: string): Promise<any | null> {
  const { ok, data } = await apiRequest(apiBase, '/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
  if (!ok) return null;
  return data;
}
