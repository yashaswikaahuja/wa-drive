import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// auth.ts captures JWT_SECRET at module initialization.
const secret = 'cybercontrol-auth-test-secret';
process.env.JWT_SECRET = secret;
const { userFromAuthorization, authMiddleware } = await import('./auth.ts');

const normalToken = jwt.sign({ userId: 'operator-1', workspaceId: 'workspace-1', role: 'admin' }, secret);
const mcpToken = jwt.sign({
  userId: 'operator-1',
  workspaceId: 'workspace-1',
  role: 'admin',
  mcpClientId: 'mcp_client_hash',
  mcpClientName: 'Test MCP client',
  mcpSessionId: 'mcp_session_test',
}, secret);

const normal = userFromAuthorization(`Bearer ${normalToken}`);
assert.equal(normal.ok, true);
const mcp = userFromAuthorization(`Bearer ${mcpToken}`);
assert.equal(mcp.ok, true);
assert.equal(mcp.user.mcpSessionId, 'mcp_session_test');

function responseRecorder() {
  return {
    statusCode: 200 as number,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
}

let normalNext = false;
const normalResponse = responseRecorder();
authMiddleware(
  { headers: { authorization: `Bearer ${normalToken}` } },
  normalResponse,
  () => { normalNext = true; },
);
assert.equal(normalNext, true);
assert.equal(normalResponse.statusCode, 200);

let mcpNext = false;
const mcpResponse = responseRecorder();
authMiddleware(
  { headers: { authorization: `Bearer ${mcpToken}` } },
  mcpResponse,
  () => { mcpNext = true; },
);
assert.equal(mcpNext, false);
assert.equal(mcpResponse.statusCode, 403);
assert.equal(mcpResponse.body.error, 'mcp_token_not_allowed_for_rest_api');

console.log('AUTH_MCP_SCOPE_OK');
