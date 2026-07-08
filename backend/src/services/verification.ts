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
import { otpMessage, welcomeMessage } from './whatsapp/templates.js';
import { renderOtpCard, renderWelcomeCard } from './whatsapp/render.js';

export function genCode(): string {
  return String(crypto.randomInt(100000, 1000000)); // 6-digit
}

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

export async function sendEmailOtp(email: string, code: string): Promise<void> {
  if (!EMAIL_PROVIDER) return;
  const m = otpEmail(code);
  await sendMail(email, m.subject, m.html, m.text);
}

// Low-level: send an arbitrary text to a WhatsApp number via the resolver oracle.
async function sendWhatsApp(phone: string, message: string): Promise<void> {
  if (!RESOLVER_URL) return;
  const r = await fetch(`${RESOLVER_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
    body: JSON.stringify({ phone, message }),
  });
  if (!r.ok) {
    const e: any = await r.json().catch(() => ({}));
    throw new Error(e.error || 'Failed to send WhatsApp message');
  }
}

// Low-level: send a base64 PNG (branded card) as an image with a caption.
async function sendWhatsAppMedia(phone: string, media: string, caption: string): Promise<void> {
  if (!RESOLVER_URL) return;
  const r = await fetch(`${RESOLVER_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
    body: JSON.stringify({ phone, media, caption }),
  });
  if (!r.ok) {
    const e: any = await r.json().catch(() => ({}));
    throw new Error(e.error || 'Failed to send WhatsApp image');
  }
}

// Generic WhatsApp text — used by the health monitor to send the owner a digest.
export async function notifyWhatsApp(phone: string, message: string): Promise<void> {
  await sendWhatsApp(phone, message);
}

// OTP → branded PNG card + a caption that still contains the code as text (so it stays copyable).
// Falls back to plain text if rendering or media-send fails, so delivery never breaks.
export async function sendPhoneOtp(phone: string, code: string): Promise<void> {
  if (!RESOLVER_URL) return;
  const caption = otpMessage(code);
  try {
    const png = await renderOtpCard(code);
    await sendWhatsAppMedia(phone, png, caption);
  } catch {
    await sendWhatsApp(phone, caption);
  }
}

// Greeting for accounts that skip OTP (e.g. Google sign-in — email already verified by Google).
// Best-effort: no-op if no email provider; callers ignore failures.
export async function sendWelcomeEmail(email: string, name?: string | null): Promise<void> {
  if (!EMAIL_PROVIDER || !email) return;
  const m = welcomeEmail(name);
  await sendMail(email, m.subject, m.html, m.text);
}

// WhatsApp welcome (parity with the email one) — branded PNG card + caption, text fallback.
// Best-effort: no-op if the resolver isn't configured; callers ignore failures.
export async function sendPhoneWelcome(phone: string, name?: string | null): Promise<void> {
  if (!RESOLVER_URL || !phone) return;
  const caption = welcomeMessage(name);
  try {
    const png = await renderWelcomeCard(name);
    await sendWhatsAppMedia(phone, png, caption);
  } catch {
    await sendWhatsApp(phone, caption).catch(() => {});
  }
}
