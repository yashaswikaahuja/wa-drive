import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_REFRESH_SECRET, ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY } from '../config.js';

export function signAccessToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function signRefreshToken(payload: object) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const decoded: any = jwt.verify(header.slice(7), JWT_SECRET);
    (req as any).user = { userId: decoded.userId, workspaceId: decoded.workspaceId, role: decoded.role, sessionId: decoded.sessionId };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Role gate — use AFTER authMiddleware. Rejects with 403 if the authenticated
 * user's role isn't in the allowed set. e.g. router.use(authMiddleware, requireRole('admin'))
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req as any).user?.role;
    if (!role || !roles.includes(role)) return res.status(403).json({ error: 'Forbidden: insufficient role' });
    next();
  };
}
