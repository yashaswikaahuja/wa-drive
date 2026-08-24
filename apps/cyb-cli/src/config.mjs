import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_API = 'https://api.cybercontrol.fun/api';
export const APP_NAME = 'cybercontrol';
export const CLI_VERSION = '0.1.0';

export function configDir() {
  if (process.env.CYB_CONFIG_DIR) return process.env.CYB_CONFIG_DIR;
  if (platform() === 'win32') {
    const base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
    return join(base, 'cybercontrol');
  }
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(xdg, 'cybercontrol');
}

export function credentialsPath() {
  return join(configDir(), 'credentials.json');
}

export function resolveApiBase(flags = {}) {
  return (
    flags.api ||
    process.env.CYB_API_URL ||
    process.env.CC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    DEFAULT_API
  ).replace(/\/$/, '');
}
