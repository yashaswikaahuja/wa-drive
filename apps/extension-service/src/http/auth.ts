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
  req.user = parsed.user;
  next();
}
