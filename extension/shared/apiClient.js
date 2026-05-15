/**
 * apiClient — central authenticated API wrapper for extension.
 * Handles: token injection, silent refresh on 401, retry.
 * Tokens stored in chrome.storage.local.
 * Schema: EXECUTION_SCHEMA v1.0
 */

const apiClient = {
  async getTokens() {
    const { accessToken, refreshToken, backendUrl } = await chrome.storage.local.get(['accessToken', 'refreshToken', 'backendUrl']);
    return { accessToken, refreshToken, backendUrl };
  },

  async setTokens(accessToken, refreshToken) {
    await chrome.storage.local.set({ accessToken, refreshToken });
  },

  async clearTokens() {
    await chrome.storage.local.remove(['accessToken', 'refreshToken', 'user']);
  },

  async request(path, options = {}) {
    const { accessToken, backendUrl } = await this.getTokens();
    if (!backendUrl) throw new Error('No backend URL configured');

    const url = `${backendUrl}${path}`;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    let res = await fetch(url, { ...options, headers });

    // Silent refresh on 401
    if (res.status === 401 && accessToken) {
      const refreshed = await this.refresh();
      if (refreshed) {
        const { accessToken: newToken } = await this.getTokens();
        headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(url, { ...options, headers });
      } else {
        await this.clearTokens();
        throw new Error('Session expired');
      }
    }

    return res;
  },

  async get(path) {
    const res = await this.request(path);
    return res.json();
  },

  async post(path, body) {
    const res = await this.request(path, { method: 'POST', body: JSON.stringify(body) });
    return res.json();
  },

  async refresh() {
    try {
      const { refreshToken, backendUrl } = await this.getTokens();
      if (!refreshToken || !backendUrl) return false;
      const res = await fetch(`/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.accessToken && data.refreshToken) {
        await this.setTokens(data.accessToken, data.refreshToken);
        return true;
      }
      return false;
    } catch { return false; }
  },

  async login(email, phone, password) {
    const { backendUrl } = await this.getTokens();
    if (!backendUrl) throw new Error('No backend URL configured');
    const body = { password };
    if (email) body.email = email;
    else body.phone = phone;
    const res = await fetch(`${backendUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.ok && data.accessToken) {
      await this.setTokens(data.accessToken, data.refreshToken);
      await chrome.storage.local.set({ user: data.user });
      return data;
    }
    throw new Error(data.error || 'Login failed');
  },

  async logout() {
    try { await this.request('/auth/logout', { method: 'POST' }); } catch {}
    await this.clearTokens();
  },

  async isAuthenticated() {
    const { accessToken } = await this.getTokens();
    return !!accessToken;
  }
};
