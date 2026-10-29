/**
 * Server → extension tasks.
 * HTTP asks for a task. The live workspace socket delivers it.
 * The extension answers with browser_task_result.
 */
import { getWorkspaceSessions, send } from './server.js';

const waiters = new Map<string, (result: any) => void>();

export function waitForBrowserTask(taskId: string, timeoutMs: number) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(taskId);
      reject(new Error('extension_timeout'));
    }, timeoutMs);
    waiters.set(taskId, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

export function resolveBrowserTask(taskId: string, result: any) {
  const done = waiters.get(taskId);
  if (!done) return false;
  waiters.delete(taskId);
  done(result);
  return true;
}

export function cancelBrowserTask(taskId: string) {
  waiters.delete(taskId);
}

/** Send to the newest open socket for this workspace. Returns that session, or null. */
export function dispatchBrowserTask(workspaceId: string, message: any) {
  const sessions = getWorkspaceSessions(workspaceId)
    .filter((session: any) => session && session.ws && session.ws.readyState === 1)
    .sort((a: any, b: any) => (b.connectedAt || 0) - (a.connectedAt || 0));
  const session = sessions[0];
  if (!session) return null;
  if (!send(session.sessionId, message)) return null;
  return session;
}
