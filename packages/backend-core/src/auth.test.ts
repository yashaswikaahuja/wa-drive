import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './config.js';
import { authMiddleware } from './auth.js';

function responseRecorder() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
}

const ordinaryToken = jwt.sign({ userId: 'operator-1', workspaceId: 'workspace-1', role: 'admin' }, JWT_SECRET);
let ordinaryNext = false;
const ordinaryResponse = responseRecorder();
authMiddleware(
  { headers: { authorization: `Bearer ${ordinaryToken}` } } as any,
  ordinaryResponse as any,
  () => { ordinaryNext = true; },
);
assert.equal(ordinaryNext, true);
assert.equal(ordinaryResponse.statusCode, 200);

const mcpToken = jwt.sign({
  userId: 'operator-1',
  workspaceId: 'workspace-1',
  role: 'admin',
  mcpClientId: 'mcp_client_hash',
  mcpSessionId: 'mcp_session_test',
}, JWT_SECRET);
let mcpNext = false;
const mcpResponse = responseRecorder();
authMiddleware(
  { headers: { authorization: `Bearer ${mcpToken}` } } as any,
  mcpResponse as any,
  () => { mcpNext = true; },
);
assert.equal(mcpNext, false);
assert.equal(mcpResponse.statusCode, 403);
assert.equal(mcpResponse.body.error, 'mcp_token_not_allowed_for_rest_api');

console.log('BACKEND_AUTH_MCP_SCOPE_OK');
