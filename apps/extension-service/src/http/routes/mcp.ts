/**
 * POST /api/mcp
 * Streamable HTTP MCP. Auth is the same workspace bearer as /api/browser-task.
 * The signed-in extension performs each tool in the operator's Chrome.
 */
import { Router } from 'express';
import { userFromAuthorization } from '../auth.js';
import { executeBrowserTask } from './browser-task.js';
import { listWorkspaceProfiles, readWorkspaceProfile } from './profiles.js';
import { respondToMcp } from '../mcp-rpc.js';
import { mountOAuth, unauthorized } from '../mcp-oauth.js';

const router = Router();
mountOAuth(router);

function wantsSse(accept: string) {
  return accept.includes('text/event-stream') && !accept.includes('application/json') && !accept.includes('*/*');
}

router.post('/', async (req: any, res: any) => {
  const parsed = userFromAuthorization(req.headers.authorization || '');
  if (!parsed.ok) return unauthorized(req, res, parsed.error);
  const accept = String(req.headers.accept || '');
  if (accept && !accept.includes('application/json') && !accept.includes('text/event-stream') && !accept.includes('*/*')) {
    return res.status(406).json({ error: 'accept must include application/json or text/event-stream' });
  }
  const outcome = await respondToMcp(req.body, parsed.user.workspaceId, executeBrowserTask, {
    listProfiles: listWorkspaceProfiles,
    readProfile: readWorkspaceProfile,
  });
  if (outcome.kind === 'accept') return res.status(202).end();
  if (wantsSse(accept)) {
    res.status(outcome.status);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.write(`event: message\ndata: ${JSON.stringify(outcome.body)}\n\n`);
    return res.end();
  }
  return res.status(outcome.status).json(outcome.body);
});

export default router;
