/** Shared CLI flag / auth shapes. */

export type CliFlags = {
  _: string[];
  command?: string | null;
  help?: boolean;
  version?: boolean;
  api?: string;
  token?: string;
  email?: string;
  password?: string;
  limit?: number;
  pollMs?: number;
  id?: string;
  localOnly?: boolean;
};

export type StoredCredentials = {
  accessToken: string;
  refreshToken?: string | null;
  user?: Record<string, unknown> | null;
  apiBase?: string;
  savedAt?: string;
};

export type AuthContext = {
  apiBase: string;
  accessToken: string;
  refreshToken?: string | null;
  user?: Record<string, unknown> | null;
  source: 'flag' | 'env' | 'file';
  claims?: Record<string, unknown> | null;
};

export type ApiRequestOptions = {
  method?: string;
  token?: string;
  body?: unknown;
  form?: Record<string, string> | URLSearchParams | string[][] | string;
  timeoutMs?: number;
};

export type ApiResponse = {
  ok: boolean;
  status: number;
  data: any;
  text: string;
  url: string;
};

export class AuthError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}
