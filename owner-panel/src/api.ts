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
  createdAt: string | null;
  lastActiveAt: string | null;
  operators: number;
  whatsappConnected: boolean;
  files: number;
}

export interface Config {
  baseUrl: string;
  key: string;
}

export interface Operator {
  id: string; name: string | null; email: string | null; phone: string | null;
  role: string; status: string; createdAt: string | null; updatedAt: string | null;
}
export interface WaSession { phoneNumber: string | null; status: string; connectedAt: string | null; }
export interface FileStats { total: number; last7: number; last30: number; lastUpload: string | null; }
export interface WorkspaceDetail {
  workspace: Workspace;
  operators: Operator[];
  whatsapp: WaSession[];
  files: FileStats;
}

const STORE_KEY = 'cc-owner-cfg';
// Default to the cybercontrol-app VM's tailscale IP + owner port.
const DEFAULT_BASE = 'http://100.112.147.34:3010';

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
export const fetchWorkspaces = (cfg: Config, q: string, sort: string) =>
  get<Workspace[]>(cfg, `/owner/workspaces?limit=500&q=${encodeURIComponent(q)}&sort=${sort}`);
export const fetchWorkspace = (cfg: Config, id: string) =>
  get<WorkspaceDetail>(cfg, `/owner/workspaces/${id}`);
