/**
 * Contact verification — short-lived OTP codes + account notifications.
 *  • email OTP + welcome → services/email (Resend/SES transport + branded templates)
 *  • phone OTP           → whatsapp-resolver /send (the always-on wwebjs oracle)
 * Channels no-op when unconfigured, so the signup/verify flow degrades gracefully.
 */
import crypto from 'crypto';
import { RESOLVER_URL, WA_SECRET, EMAIL_PROVIDER } from '../config.js';
import { sendMail } from './email/send.js';
import { otpEmail, welcomeEmail } from './email/templates.js';

export function genCode(): string {
  return String(crypto.randomInt(100000, 1000000)); // 6-digit
}

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

// Plaintext OTP line used by the WhatsApp channel.
const smsBody = (code: string) =>
  `Your CyberControl verification code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this message.`;

export async function sendEmailOtp(email: string, code: string): Promise<void> {
  if (!EMAIL_PROVIDER) return;
  const m = otpEmail(code);
  await sendMail(email, m.subject, m.html, m.text);
}

export async function sendPhoneOtp(phone: string, code: string): Promise<void> {
  if (!RESOLVER_URL) return;
  const r = await fetch(`${RESOLVER_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
    body: JSON.stringify({ phone, message: smsBody(code) }),
  });
  if (!r.ok) {
    const e: any = await r.json().catch(() => ({}));
    throw new Error(e.error || 'Failed to send WhatsApp code');
  }
}

// Greeting for accounts that skip OTP (e.g. Google sign-in — email already verified by Google).
// Best-effort: no-op if no email provider; callers ignore failures.
export async function sendWelcomeEmail(email: string, name?: string | null): Promise<void> {
  if (!EMAIL_PROVIDER || !email) return;
  const m = welcomeEmail(name);
  await sendMail(email, m.subject, m.html, m.text);
}
