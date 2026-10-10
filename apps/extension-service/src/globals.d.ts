/** Loose ambient types for extension-service (Express Request.user). */
declare namespace Express {
  interface Request {
    user?: {
      userId?: string;
      workspaceId?: string;
      role?: string;
      [key: string]: any;
    };
  }
}
