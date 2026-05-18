import dotenv from 'dotenv';
dotenv.config();
export const DATABASE_URL = process.env.DATABASE_URL || '';
export const PORT = Number(process.env.PORT ?? 3000);
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY = '7d';
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
export const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/drive/callback';
export const WORKER_SECRET = process.env.WORKER_SECRET ?? 'worker-secret';
export const WA_SERVICE = 'http://34.100.147.20:3100';
export const WA_SECRET = 'wa-service-secret-2024';
export const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
export const REMOVE_BG_KEY = process.env.REMOVE_BG_API_KEY ?? 'd9f7QFfqAdFuEzt1dXNqvSxP';
//# sourceMappingURL=config.js.map