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

function newTaskId() {
  return `task.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}

function slimFields(fields: any) {
  if (!Array.isArray(fields)) return null;
  if (fields.length > 80) return null;
  const slim = [];
  for (const field of fields) {
    if (!field || typeof field !== 'object') continue;
    const value = field.value == null ? '' : String(field.value);
    if (!field.selector || !value) continue;
    slim.push({
      selector: String(field.selector).slice(0, 300),
      value: value.slice(0, 200),
      type: field.type ? String(field.type).slice(0, 40) : 'text',
      label: field.label ? String(field.label).slice(0, 180) : '',
      visualLabel: field.visualLabel ? String(field.visualLabel).slice(0, 180) : (field.label ? String(field.label).slice(0, 180) : ''),
    });
  }
  return slim;
}

async function deliver(req: any, res: any, message: any, timeoutMs: number) {
  const pending = waitForBrowserTask(message.taskId, timeoutMs);
  const session = dispatchBrowserTask(req.user.workspaceId, message);
  if (!session) {
    cancelBrowserTask(message.taskId);
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
    res.status(code).json({ error: (err && err.message) || 'browser_task_failed', taskId: message.taskId });
  }
}

router.post('/', authMiddleware, async (req: any, res: any) => {
  const task = req.body && req.body.task;
  const taskId = newTaskId();
  if (task === 'open_url') {
    const url = req.body && req.body.url;
    if (!allowedPageUrl(url)) return res.status(400).json({ error: 'url must be http or https' });
    return deliver(req, res, { type: 'browser_task', task: 'open_url', url, taskId }, 15000);
  }
  if (task === 'read_form') {
    return deliver(req, res, {
      type: 'browser_task',
      task: 'read_form',
      tabId: req.body.tabId || null,
      taskId,
    }, 20000);
  }
  if (task === 'fill_form') {
    const fields = slimFields(req.body && req.body.fields);
    if (!fields || !fields.length) return res.status(400).json({ error: 'fields required' });
    return deliver(req, res, {
      type: 'browser_task',
      task: 'fill_form',
      tabId: req.body.tabId || null,
      fields,
      taskId,
    }, 60000);
  }
  return res.status(400).json({ error: 'unsupported task' });
});

export default router;
