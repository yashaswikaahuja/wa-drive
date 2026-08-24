import { spawn } from 'node:child_process';
import { platform } from 'node:os';

/** Open a URL in the default browser (best-effort). */
export function openBrowser(url) {
  const p = platform();
  try {
    if (p === 'win32') {
      // `start` is a shell builtin; empty title required when URL is quoted
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
      return true;
    }
    if (p === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
      return true;
    }
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}
