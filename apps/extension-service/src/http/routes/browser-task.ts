/**
 * POST /api/browser-task
 * Body: { task: 'open_url', url }
 * Auth: the workspace bearer token. The task is delivered on that workspace's
 * live extension socket. The extension performs it in the browser.
 */
import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { cancelBrowserTask, dispatchBrowserTask, waitForBrowserTask } from '../../ws/browser-task.js';

const router = Router();

function allowedPageUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

router.post('/', authMiddleware, async (req: any, res: any) => {
  const task = req.body && req.body.task;
  const url = req.body && req.body.url;
  if (task !== 'open_url') return res.status(400).json({ error: 'unsupported task' });
  if (!allowedPageUrl(url)) return res.status(400).json({ error: 'url must be http or https' });

  const taskId = `task.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
  const pending = waitForBrowserTask(taskId, 15000);
  const session = dispatchBrowserTask(req.user.workspaceId, {
    type: 'browser_task',
    task: 'open_url',
    url,
    taskId,
  });
  if (!session) {
    cancelBrowserTask(taskId);
    return res.status(409).json({ error: 'no_extension_connected' });
  }
  try {
    const result = await pending;
    res.json({
      ok: true,
      workspaceId: req.user.workspaceId,
      sessionId: session.sessionId,
      result,
    });
  } catch (err: any) {
    const code = err && err.message === 'extension_timeout' ? 504 : 500;
    res.status(code).json({ error: (err && err.message) || 'browser_task_failed', taskId });
  }
});

export default router;
