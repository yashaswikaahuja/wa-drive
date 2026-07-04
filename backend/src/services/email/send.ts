/**
 * Email transport — provider dispatch for outbound mail.
 *  • 'resend' → Resend HTTP API (no sandbox)         [primary]
 *  • 'ses'    → Amazon SES (@aws-sdk/client-ses)      [fallback]
 * Chosen by EMAIL_PROVIDER. No-op when unconfigured, so callers degrade gracefully.
 */
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SES_FROM, AWS_REGION, EMAIL_PROVIDER, EMAIL_FROM, RESEND_API_KEY } from '../../config.js';

const ses = SES_FROM ? new SESClient({ region: AWS_REGION }) : null;

export async function sendMail(to: string, subject: string, html: string, text: string): Promise<void> {
  if (EMAIL_PROVIDER === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html, text }),
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
      Message: { Subject: { Data: subject }, Body: { Html: { Data: html }, Text: { Data: text } } },
    }));
    return;
  }
  // no email provider configured → no-op
}
