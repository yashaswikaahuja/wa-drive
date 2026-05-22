import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[extension-service] FATAL: JWT_SECRET is not set (must match hub)');
  process.exit(1);
}

/**
 * Verifies the Authorization: Bearer <jwt> header.
 * On success, sets req.user = { userId, workspaceId, role }
 * On failure, returns 401.
 */
export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'missing bearer token' });
  try {
    const decoded = jwt.verify(m[1], JWT_SECRET);
    if (!decoded.workspaceId) return res.status(401).json({ error: 'token missing workspaceId' });
    req.user = {
      userId: decoded.userId,
      workspaceId: decoded.workspaceId,
      role: decoded.role,
    };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token: ' + e.message });
  }
}
