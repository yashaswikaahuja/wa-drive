/**
 * Signup contact verification — sends/checks short-lived OTP codes.
 *  • email → Amazon SES  (if SES_FROM configured)
 *  • phone → whatsapp-resolver /send  (the always-on wwebjs oracle; if RESOLVER_URL configured)
 * Both senders no-op when their channel isn't configured, so the flow degrades gracefully.
 */
import crypto from 'crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SES_FROM, AWS_REGION, RESOLVER_URL, WA_SECRET } from '../config.js';

const ses = SES_FROM ? new SESClient({ region: AWS_REGION }) : null;

export function genCode(): string {
  return String(crypto.randomInt(100000, 1000000)); // 6-digit
}

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

const body = (code: string) =>
  `Your CyberControl verification code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this message.`;

export async function sendEmailOtp(email: string, code: string): Promise<void> {
  if (!ses) return;
  await ses.send(new SendEmailCommand({
    Source: SES_FROM,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: 'Your CyberControl verification code' },
      Body: { Text: { Data: body(code) } },
    },
  }));
}

export async function sendPhoneOtp(phone: string, code: string): Promise<void> {
  if (!RESOLVER_URL) return;
  const r = await fetch(`${RESOLVER_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
    body: JSON.stringify({ phone, message: body(code) }),
  });
  if (!r.ok) {
    const e: any = await r.json().catch(() => ({}));
    throw new Error(e.error || 'Failed to send WhatsApp code');
  }
}

// Greeting for accounts that don't need OTP verification (e.g. Google sign-in — email already
// verified by Google). Best-effort: no-op if SES isn't configured; callers ignore failures.
export async function sendWelcomeEmail(email: string, name?: string | null): Promise<void> {
  if (!ses || !email) return;
  const hi = name ? `Hi ${name},` : 'Hello,';
  await ses.send(new SendEmailCommand({
    Source: SES_FROM,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: 'Welcome to CyberControl 🎉' },
      Body: { Text: { Data:
        `${hi}\n\nWelcome to CyberControl — your workspace is ready.\n\n` +
        `You can now connect WhatsApp and Google Drive, add your operators, and start ` +
        `processing customer documents.\n\nGlad to have you on board!\n\n— The CyberControl Team` } },
    },
  }));
}
