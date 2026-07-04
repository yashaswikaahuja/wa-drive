/**
 * Signup contact verification — sends/checks short-lived OTP codes.
 *  • email → Resend (HTTP API, no sandbox) or Amazon SES — chosen by EMAIL_PROVIDER
 *  • phone → whatsapp-resolver /send  (the always-on wwebjs oracle; if RESOLVER_URL configured)
 * Both channels no-op when unconfigured, so the flow degrades gracefully.
 */
import crypto from 'crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SES_FROM, AWS_REGION, RESOLVER_URL, WA_SECRET,
  EMAIL_PROVIDER, EMAIL_FROM, RESEND_API_KEY } from '../config.js';

const ses = SES_FROM ? new SESClient({ region: AWS_REGION }) : null;

export function genCode(): string {
  return String(crypto.randomInt(100000, 1000000)); // 6-digit
}

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

const body = (code: string) =>
  `Your CyberControl verification code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this message.`;

// Single email dispatcher — picks the configured provider. No-op if none configured.
async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (EMAIL_PROVIDER === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, text }),
    });
    if (!r.ok) {
      const e = await r.text().catch(() => '');
      throw new Error(`Resend send failed (${r.status}): ${e}`);
    }
    return;
  }
  if (EMAIL_PROVIDER === 'ses' && ses) {
    await ses.send(new SendEmailCommand({
      Source: EMAIL_FROM,
      Destination: { ToAddresses: [to] },
      Message: { Subject: { Data: subject }, Body: { Text: { Data: text } } },
    }));
    return;
  }
  // no email provider configured → no-op
}

export async function sendEmailOtp(email: string, code: string): Promise<void> {
  if (!EMAIL_PROVIDER) return;
  await sendMail(email, 'Your CyberControl verification code', body(code));
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
// verified by Google). Best-effort: no-op if no email provider; callers ignore failures.
export async function sendWelcomeEmail(email: string, name?: string | null): Promise<void> {
  if (!EMAIL_PROVIDER || !email) return;
  const hi = name ? `Hi ${name},` : 'Hello,';
  await sendMail(email, 'Welcome to CyberControl 🎉',
    `${hi}\n\nWelcome to CyberControl — your workspace is ready.\n\n` +
    `You can now connect WhatsApp and Google Drive, add your operators, and start ` +
    `processing customer documents.\n\nGlad to have you on board!\n\n— The CyberControl Team`);
}
