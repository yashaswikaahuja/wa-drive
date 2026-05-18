import { Request, Response, NextFunction } from 'express';
export declare function signAccessToken(payload: object): string;
export declare function signRefreshToken(payload: object): string;
export declare function authMiddleware(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=auth.d.ts.map