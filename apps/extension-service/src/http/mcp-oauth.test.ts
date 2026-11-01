process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://local/none';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { pkceS256, allowedRedirect } = await import('./mcp-oauth.ts');
const crypto = await import('node:crypto');

const verifier = 'a'.repeat(48);
const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
if (pkceS256(verifier) !== expected) {
  console.error('PKCE_FAIL');
  process.exit(1);
}
if (!allowedRedirect('http://127.0.0.1:3000/callback')) process.exit(1);
if (!allowedRedirect('https://claude.ai/api/mcp/auth_callback')) process.exit(1);
if (allowedRedirect('http://evil.example/callback')) process.exit(1);
if (allowedRedirect('javascript:alert(1)')) process.exit(1);
console.log('MCP_OAUTH_OK');
