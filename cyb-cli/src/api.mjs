/**
 * Thin HTTP client for CyberControl API.
 */

export async function apiRequest(apiBase, path, { method = 'GET', token, body, form, timeoutMs = 45000 } = {}) {
  const base = String(apiBase || '').replace(/\/$/, '');
  const url = path.startsWith('http') ? path : base + path;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const cause = e?.cause?.message || e?.message || String(e);
    throw new Error(`Network error ${method} ${url}\n  ${cause}`);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text, url };
}

export async function apiGet(apiBase, token, path) {
  const { ok, status, data, url } = await apiRequest(apiBase, path, { token });
  if (!ok) {
    if (status === 401 || status === 403) {
      throw new Error(`Auth failed HTTP ${status} for ${url}\n  Run: cyb login`);
    }
    throw new Error(`GET ${path} HTTP ${status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

export async function authMe(apiBase, token) {
  return apiGet(apiBase, token, '/auth/me');
}

export async function listSessions(apiBase, token, { limit = 20, offset = 0 } = {}) {
  const data = await apiGet(apiBase, token, `/sessions?limit=${limit}&offset=${offset}`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.sessions)) return data.sessions;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  throw new Error(`Unexpected sessions shape: ${typeof data}`);
}

export async function getSession(apiBase, token, id) {
  return apiGet(apiBase, token, `/sessions/${id}`);
}

export async function startDeviceLogin(apiBase) {
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

export async function pollDeviceLogin(apiBase, deviceCode) {
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

export async function passwordLogin(apiBase, emailOrPhone, password) {
  const body = emailOrPhone.includes('@')
    ? { email: emailOrPhone.trim().toLowerCase(), password }
    : { phone: emailOrPhone.trim(), password };
  const { ok, status, data } = await apiRequest(apiBase, '/auth/login', { method: 'POST', body });
  if (!ok) {
    throw new Error(data?.error || `Login failed HTTP ${status}`);
  }
  return data;
}

export async function refreshTokens(apiBase, refreshToken) {
  const { ok, data } = await apiRequest(apiBase, '/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
  if (!ok) return null;
  return data;
}
