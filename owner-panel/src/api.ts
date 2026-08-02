// Owner API client. Config (base URL + key) is stored locally on the operator's device.

export interface Metrics {
  signups: number;
  active30d: number;
  paying: number;
  churned: number;
  newThisMonth: number;
  newThisWeek: number;
}

export interface Workspace {
  id: string;
  name: string;
  plan: string;
  status: string;
  location: string | null;
  locationSource: string | null;
  lat: number | null;
  lng: number | null;
  email: string | null;
  phone: string | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  operators: number;
  whatsappConnected: boolean;
  whatsappNumber: string | null;
  files: number;
  filesLast7: number;
  health: number;
  healthBand: 'healthy' | 'watch' | 'at-risk' | 'onboarding';
  healthFlags: string[];
}

export interface Config {
  baseUrl: string;
  key: string;
}

export interface Funnel {
  signedUp: number;
  connected: number;
  activated: number;
  weeklyActive: number;
  paying: number;
}

export interface Trends {
  wauSeries: { week: string; active: number }[];
  stickiness: { wau: number; mau: number; ratio: number };
  cohorts: { cohort: string; size: number; retention: (number | null)[] }[];
}

export interface Operator {
  id: string; name: string | null; email: string | null; phone: string | null;
  role: string; status: string; createdAt: string | null; updatedAt: string | null;
}
export interface WaSession {
  phoneNumber: string | null;
  isCurrent: boolean;
  connected: boolean;
  firstConnectedAt: string | null;
  lastConnectedAt: string | null;
  disconnectedAt: string | null;
}
export interface FileStats { total: number; last7: number; last30: number; lastUpload: string | null; }
export interface ActivityEvent {
  action: string;
  properties: Record<string, unknown> | null;
  createdAt: string;
}
export interface WorkspaceDetail {
  workspace: Workspace;
  operators: Operator[];
  whatsapp: WaSession[];
  files: FileStats;
  activity: ActivityEvent[];
}

const STORE_KEY = 'cc-owner-cfg';
// When the panel is served BY the owner listener (same origin), default to that origin — the API is
// right there. When running the local dev server (vite on :5180), fall back to the tailscale IP.
const DEFAULT_BASE =
  typeof window !== 'undefined' && window.location.protocol.startsWith('http') && window.location.port !== '5180'
    ? window.location.origin
    : 'http://100.112.147.34:3010';

export function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const c = JSON.parse(raw); return { baseUrl: c.baseUrl || DEFAULT_BASE, key: c.key || '' }; }
  } catch { /* ignore */ }
  return { baseUrl: DEFAULT_BASE, key: '' };
}

export function saveConfig(c: Config) {
  localStorage.setItem(STORE_KEY, JSON.stringify(c));
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function get<T>(cfg: Config, path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}${path}`, {
      headers: { 'x-owner-key': cfg.key },
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the owner API. Check you are on the tailnet and the URL is correct.');
  }
  if (res.status === 401) throw new ApiError(401, 'Invalid owner key.');
  if (res.status === 403) throw new ApiError(403, 'Off-tailnet — this device is not on the personal network.');
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`;
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const fetchMetrics = (cfg: Config) => get<Metrics>(cfg, '/owner/metrics');
export const fetchFunnel = (cfg: Config) => get<Funnel>(cfg, '/owner/funnel');
export const fetchTrends = (cfg: Config) => get<Trends>(cfg, '/owner/trends');
export const fetchWorkspaces = (cfg: Config, q: string, sort: string) =>
  get<Workspace[]>(cfg, `/owner/workspaces?limit=500&q=${encodeURIComponent(q)}&sort=${sort}`);
export const fetchWorkspace = (cfg: Config, id: string) =>
  get<WorkspaceDetail>(cfg, `/owner/workspaces/${id}`);

export async function patchLocation(cfg: Config, id: string, location: string | null): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/owner/workspaces/${id}`, {
      method: 'PATCH',
      headers: { 'x-owner-key': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ location }),
    });
  } catch { throw new ApiError(0, 'Cannot reach the owner API.'); }
  if (res.status === 401) throw new ApiError(401, 'Invalid owner key.');
  if (!res.ok) {
    let m = `Save failed (${res.status}).`;
    try { m = (await res.json()).error || m; } catch { /* ignore */ }
    throw new ApiError(res.status, m);
  }
}

async function send(cfg: Config, method: string, path: string, body?: unknown): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'x-owner-key': cfg.key, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new ApiError(0, 'Cannot reach the owner API.'); }
  if (res.status === 401) throw new ApiError(401, 'Invalid owner key.');
  if (!res.ok) {
    let m = `Request failed (${res.status}).`;
    try { m = (await res.json()).error || m; } catch { /* ignore */ }
    throw new ApiError(res.status, m);
  }
}

// Block (suspend) or unblock a café — gates login for all its users.
export const setWorkspaceStatus = (cfg: Config, id: string, action: 'block' | 'unblock') =>
  send(cfg, 'PATCH', `/owner/workspaces/${id}/status`, { action });

// Permanently hard-delete a café + all its data. `confirm` must equal the café name.
export const deleteWorkspace = (cfg: Config, id: string, confirm: string) =>
  send(cfg, 'DELETE', `/owner/workspaces/${id}`, { confirm });

export interface AiSettings {
  extractionProvider: string;
  extractionModel: string;
  mistralKey: string;
  textProvider: string;
  textModel: string;
  openrouterKey: string;
  groqKey: string;
}

export const fetchAiSettings = (cfg: Config) => get<AiSettings>(cfg, '/owner/ai-settings');

export async function patchAiSettings(cfg: Config, data: Partial<AiSettings>): Promise<void> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/owner/ai-settings`, {
    method: 'PATCH',
    headers: { 'x-owner-key': cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = 'Save failed';
    try { msg = (await res.json()).error || msg; } catch {}
    throw new ApiError(res.status, msg);
  }
}
