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
      frameId: Number.isFinite(Number(field.frameId)) ? Number(field.frameId) : null,
    });
  }
  return slim;
}

/**
 * Run one browser task for a workspace. Shared by POST /api/browser-task
 * and the MCP endpoint so both speak to the same extension socket.
 */
export async function executeBrowserTask(workspaceId: string, body: any) {
  const task = body && body.task;
  const taskId = newTaskId();
  let message: any = null;
  let timeoutMs = 20000;
  if (task === 'open_url') {
    const url = body && body.url;
    if (!allowedPageUrl(url)) return { status: 400, payload: { error: 'url must be http or https' } };
    const tabId = Number(body && body.tabId) || 0;
    const newTab = !(tabId || body && body.newTab === false);
    message = {
      type: 'browser_task',
      task: 'open_url',
      url,
      tabId: tabId || null,
      newTab,
      taskId,
    };
    timeoutMs = 15000;
  } else if (task === 'click') {
    const text = body && body.text ? String(body.text).trim() : '';
    const raw = body && body.control;
    const control = raw && typeof raw === 'object' ? {
      selector: raw.selector ? String(raw.selector).slice(0, 300) : '',
      label: raw.label ? String(raw.label).slice(0, 180) : '',
      visualLabel: raw.visualLabel ? String(raw.visualLabel).slice(0, 180) : (raw.label ? String(raw.label).slice(0, 180) : ''),
      type: 'button',
      frameId: Number.isFinite(Number(raw.frameId)) ? Number(raw.frameId) : null,
    } : null;
    if ((!text || text.length > 80) && !(control && (control.selector || control.visualLabel))) {
      return { status: 400, payload: { error: 'text or control required' } };
    }
    message = {
      type: 'browser_task',
      task: 'click',
      text,
      control,
      tabId: body.tabId || null,
      taskId,
    };
    timeoutMs = 20000;
  } else if (task === 'read_form') {
    message = {
      type: 'browser_task',
      task: 'read_form',
      tabId: body && body.tabId || null,
      taskId,
    };
    timeoutMs = 20000;
  } else if (task === 'fill') {
    const profileId = body && body.profileId ? String(body.profileId).slice(0, 80) : '';
    if (!profileId) return { status: 400, payload: { error: 'profileId required' } };
    message = {
      type: 'browser_task',
      task: 'fill',
      profileId,
      tabId: body.tabId || null,
      taskId,
    };
    timeoutMs = 85000;
  } else if (task === 'fill_form') {
    const fields = slimFields(body && body.fields);
    if (!fields || !fields.length) return { status: 400, payload: { error: 'fields required' } };
    message = {
      type: 'browser_task',
      task: 'fill_form',
      tabId: body.tabId || null,
      fields,
      taskId,
    };
    timeoutMs = 60000;
  } else if (task === 'snapshot') {
    const selector = body && body.selector ? String(body.selector).slice(0, 300) : '';
    let rect = null;
    const rawRect = body && body.rect;
    if (rawRect && typeof rawRect === 'object') {
      const width = Number(rawRect.width);
      const height = Number(rawRect.height);
      if (width > 1 && height > 1 && width <= 4000 && height <= 4000) {
        rect = {
          x: Number(rawRect.x) || 0,
          y: Number(rawRect.y) || 0,
          width,
          height,
        };
      }
    }
    const scope = selector || rect ? 'area' : (body && body.scope === 'page' ? 'page' : 'viewport');
    message = {
      type: 'browser_task',
      task: 'snapshot',
      tabId: body && body.tabId || null,
      scope,
      selector,
      rect,
      taskId,
    };
    timeoutMs = scope === 'page' ? 30000 : 20000;
  } else if (task === 'list_tabs') {
    message = { type: 'browser_task', task: 'list_tabs', taskId };
    timeoutMs = 10000;
  } else if (task === 'close_tab') {
    const tabId = Number(body && body.tabId);
    if (!tabId) return { status: 400, payload: { error: 'tabId required' } };
    message = { type: 'browser_task', task: 'close_tab', tabId, taskId };
    timeoutMs = 10000;
  } else if (task === 'focus_tab') {
    const tabId = Number(body && body.tabId);
    if (!tabId) return { status: 400, payload: { error: 'tabId required' } };
    message = { type: 'browser_task', task: 'focus_tab', tabId, taskId };
    timeoutMs = 10000;
  } else if (task === 'scroll') {
    const dy = Math.max(-4000, Math.min(4000, Number(body && body.dy) || 0));
    const dx = Math.max(-4000, Math.min(4000, Number(body && body.dx) || 0));
    const to = body && (body.to === 'top' || body.to === 'bottom') ? body.to : '';
    const selector = body && body.selector ? String(body.selector).slice(0, 300) : '';
    if (!dy && !dx && !to && !selector) return { status: 400, payload: { error: 'dy, to, or selector required' } };
    message = {
      type: 'browser_task',
      task: 'scroll',
      tabId: body && body.tabId || null,
      dy,
      dx,
      to,
      selector,
      taskId,
    };
    timeoutMs = 15000;
  } else if (task === 'history') {
    const action = body && (body.action === 'back' || body.action === 'forward' || body.action === 'reload') ? body.action : '';
    if (!action) return { status: 400, payload: { error: 'action required' } };
    message = {
      type: 'browser_task',
      task: 'history',
      action,
      tabId: body && body.tabId || null,
      taskId,
    };
    timeoutMs = 15000;
  } else if (task === 'mouse_click') {
    const selector = body && body.selector ? String(body.selector).slice(0, 300) : '';
    const x = Number(body && body.x);
    const y = Number(body && body.y);
    const hasPoint = Number.isFinite(x) && Number.isFinite(y);
    if (!selector && !hasPoint) return { status: 400, payload: { error: 'x and y, or selector, required' } };
    const button = body && (body.button === 'right' || body.button === 'middle') ? body.button : 'left';
    const count = Number(body && body.count) === 2 ? 2 : 1;
    message = {
      type: 'browser_task',
      task: 'mouse_click',
      tabId: body && body.tabId || null,
      x: hasPoint ? Math.max(-8000, Math.min(8000, x)) : null,
      y: hasPoint ? Math.max(-8000, Math.min(8000, y)) : null,
      selector,
      frameId: Number.isFinite(Number(body && body.frameId)) ? Number(body.frameId) : null,
      button,
      count,
      taskId,
    };
    timeoutMs = 15000;
  } else if (task === 'keyboard') {
    const text = body && body.text ? String(body.text).slice(0, 300) : '';
    const key = body && body.key ? String(body.key).slice(0, 40) : '';
    const rawKeys = body && Array.isArray(body.keys) ? body.keys : [];
    const keys = [];
    for (let i = 0; i < rawKeys.length && keys.length < 20; i++) {
      const item = String(rawKeys[i] || '').slice(0, 40);
      if (item) keys.push(item);
    }
    if (!text && !key && !keys.length) return { status: 400, payload: { error: 'text, key, or keys required' } };
    message = {
      type: 'browser_task',
      task: 'keyboard',
      tabId: body && body.tabId || null,
      selector: body && body.selector ? String(body.selector).slice(0, 300) : '',
      frameId: Number.isFinite(Number(body && body.frameId)) ? Number(body.frameId) : null,
      text,
      key,
      keys,
      ctrl: !!(body && body.ctrl),
      alt: !!(body && body.alt),
      shift: !!(body && body.shift),
      meta: !!(body && body.meta),
      taskId,
    };
    timeoutMs = 15000;
  } else {
    return { status: 400, payload: { error: 'unsupported task' } };
  }

  const pending = waitForBrowserTask(message.taskId, timeoutMs);
  const session = dispatchBrowserTask(workspaceId, message);
  if (!session) {
    cancelBrowserTask(message.taskId);
    return { status: 409, payload: { error: 'no_extension_connected' } };
  }
  try {
    const result = await pending;
    return {
      status: 200,
      payload: {
        ok: true,
        workspaceId,
        sessionId: session.sessionId,
        result,
      },
    };
  } catch (err: any) {
    const code = err && err.message === 'extension_timeout' ? 504 : 500;
    return { status: code, payload: { error: (err && err.message) || 'browser_task_failed', taskId } };
  }
}

router.post('/', authMiddleware, async (req: any, res: any) => {
  const out = await executeBrowserTask(req.user.workspaceId, req.body || {});
  res.status(out.status).json(out.payload);
});

export default router;
