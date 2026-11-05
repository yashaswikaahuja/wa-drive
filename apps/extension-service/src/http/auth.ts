import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[extension-service] FATAL: JWT_SECRET is not set (must match hub)');
  process.exit(1);
}

/**
 * Verifies an Authorization: Bearer <jwt> header.
 * On success, returns { userId, workspaceId, role }.
 */
export function userFromAuthorization(authHeader: any) {
  const auth = String(authHeader || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, error: 'missing bearer token' };
  try {
    const decoded: any = jwt.verify(m[1], JWT_SECRET);
    if (!decoded.workspaceId) return { ok: false, error: 'token missing workspaceId' };
    return {
      ok: true,
      user: {
        userId: decoded.userId,
        workspaceId: decoded.workspaceId,
        role: decoded.role,
        mcpClientId: typeof decoded.mcpClientId === 'string' ? decoded.mcpClientId : null,
        mcpClientName: typeof decoded.mcpClientName === 'string' ? decoded.mcpClientName : null,
        mcpSessionId: typeof decoded.mcpSessionId === 'string' ? decoded.mcpSessionId : null,
      },
    };
  } catch (e: any) {
    return { ok: false, error: 'invalid token: ' + (e && e.message ? e.message : 'rejected') };
  }
}

/**
 * Verifies the Authorization: Bearer <jwt> header.
 * On success, sets req.user = { userId, workspaceId, role }
 * On failure, returns 401.
 */
export function authMiddleware( req: any, res: any, next: any) {
  const parsed = userFromAuthorization(req.headers.authorization || '');
  if (!parsed.ok) return res.status(401).json({ error: parsed.error });
  // MCP access tokens are scoped to POST /api/mcp only. Do not accept them on
  // ordinary REST routes such as /api/profiles/:id or /api/privacy: that would
  // let an MCP client bypass read_profile consent or approve its own request.
  if (parsed.user.mcpClientId || parsed.user.mcpSessionId) {
    return res.status(403).json({ error: 'mcp_token_not_allowed_for_rest_api' });
  }
  req.user = parsed.user;
  next();
}
