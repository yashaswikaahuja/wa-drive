import dotenv from 'dotenv';
dotenv.config();

export const DATABASE_URL = process.env.DATABASE_URL || '';
export const PORT = Number(process.env.PORT ?? 3000);

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
export const ACCESS_TOKEN_EXPIRY = '24h';
export const REFRESH_TOKEN_EXPIRY = '7d';

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
export const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/drive/callback';

export const WORKER_SECRET = process.env.WORKER_SECRET ?? 'worker-secret';
export const WA_SERVICE = process.env.WA_SERVICE || 'http://cybercontrol-wa:3100';
export const WA_SECRET = process.env.WA_SECRET || 'wa-service-secret-2024';
// Comma-separated tailnet hostnames of whatsapp-service shards, e.g. "cybercontrol-wa-1,cybercontrol-wa-2".
// Empty → single-instance mode (routing falls back to WA_SERVICE).
export const WA_INSTANCES = (process.env.WA_INSTANCES || '').split(',').map(s => s.trim()).filter(Boolean);
// Sticky-shard ruleset tuning:
//  WA_DEAD_AFTER_MS — an instance is considered dead (off the tailnet) if it hasn't heartbeat within this window.
//    Failover for a workspace happens ONLY when its assigned instance is dead. Keep generous to avoid flapping.
//  WA_MIN_HOLD_MS — minimum time a workspace stays pinned to its instance before any *voluntary* move (load
//    rebalancing). Failover-on-death bypasses this. Default 24h: a logged-in session is not migrated for ≥24h.
export const WA_DEAD_AFTER_MS = Number(process.env.WA_DEAD_AFTER_MS ?? 90_000);
export const WA_MIN_HOLD_MS = Number(process.env.WA_MIN_HOLD_MS ?? 86_400_000);

export const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
export const REMOVE_BG_KEY = process.env.REMOVE_BG_API_KEY ?? 'd9f7QFfqAdFuEzt1dXNqvSxP';
