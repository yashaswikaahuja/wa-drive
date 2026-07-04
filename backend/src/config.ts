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

// Optional signup gate: if set, self-serve /auth/register requires this invite code.
// Empty (default) → registration is open self-serve (current behavior).
export const SIGNUP_CODE = process.env.SIGNUP_CODE || '';

// ── Contact verification for self-serve signup (all optional / progressive) ──
// EMAIL: set SES_FROM (a verified SES identity) to require email OTP at signup.
//        AWS creds come from the standard provider chain (env AWS_ACCESS_KEY_ID/SECRET or instance role).
// PHONE: set RESOLVER_URL (the whatsapp-resolver wwebjs oracle, always-on) to require phone OTP —
//        the backend asks the resolver to WhatsApp the code from its connected number.
// If NEITHER is set, /auth/register creates the account directly (current behavior) — non-breaking.
export const SES_FROM = process.env.SES_FROM || '';            // e.g. "CyberControl <noreply@cybercontrol.fun>"
export const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
export const RESOLVER_URL = process.env.RESOLVER_URL || '';     // e.g. http://cybercontrol-wa:3200

// Email provider: 'resend' (HTTP API, no sandbox) or 'ses' (Amazon). Auto-picks resend if its
// key is present, else ses if SES_FROM is set, else '' (email OTP off — flow degrades to phone-only).
// Sanitize the key: strip any non-printable-ASCII (e.g. a UTF-8 BOM from CI secret entry) that would
// otherwise make an invalid HTTP Authorization header.
export const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').replace(/[^\x21-\x7E]/g, '');
export const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || (RESEND_API_KEY ? 'resend' : (SES_FROM ? 'ses' : ''))).toLowerCase();
// From address used by whichever provider (Resend requires a verified-domain sender; SES a verified identity).
export const EMAIL_FROM = SES_FROM || 'CyberControl <noreply@cybercontrol.fun>';

export const EMAIL_VERIFY = !!EMAIL_PROVIDER;
export const PHONE_VERIFY = !!RESOLVER_URL;
export const OTP_TTL_MS = Number(process.env.OTP_TTL_MS ?? 10 * 60 * 1000);
export const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);

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
// Optional: enables the socket.io Redis adapter so realtime events fan out across multiple backend
// instances. Empty = single-instance (no adapter, current behavior). e.g. redis://cybercontrol-redis:6379
export const REDIS_URL = process.env.REDIS_URL || '';
export const REMOVE_BG_KEY = process.env.REMOVE_BG_API_KEY ?? 'd9f7QFfqAdFuEzt1dXNqvSxP';
