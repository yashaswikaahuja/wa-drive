/**
 * Branded HTML email templates — "paper" theme (cream #F6F2E9, ink #131A2B, marigold #F98A1E).
 * Brand/origin come from env via backend-core (BRAND_NAME, APP_ORIGIN) so this package stays reusable.
 */
import { APP_ORIGIN, BRAND_NAME } from '@cybercontrol/backend-core';

const APP_URL = APP_ORIGIN;
const BRAND = BRAND_NAME;
const BRAND_HOST = (() => {
  try { return new URL(APP_ORIGIN).host; } catch { return 'app.local'; }
})();

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function shell(innerHtml: string): string {
  const brandHtml = escapeHtml(BRAND);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#F6F2E9;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${brandHtml}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F2E9;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#ffffff;border:1px solid #E7E0D2;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 32px 4px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:36px;height:36px;background:#F98A1E;border-radius:9px;text-align:center;vertical-align:middle;font-size:19px;line-height:36px;">&#9889;</td>
            <td style="padding-left:11px;font-size:19px;font-weight:700;color:#131A2B;letter-spacing:-0.3px;">${brandHtml}</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:22px 32px 6px 32px;">${innerHtml}</td></tr>
        <tr><td style="padding:20px 32px 28px 32px;border-top:1px solid #F0EADD;">
          <p style="margin:0;font-size:11px;color:#9A9384;line-height:1.6;">You received this because this address was used on ${brandHtml}. If it wasn't you, you can safely ignore this email.</p>
          <p style="margin:8px 0 0 0;font-size:11px;color:#B8B1A2;">&copy; ${brandHtml} &middot; ${escapeHtml(BRAND_HOST)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function otpEmail(code: string): { subject: string; html: string; text: string } {
  const inner = `
    <p style="margin:0 0 6px 0;font-size:20px;font-weight:700;color:#131A2B;">Verify your email</p>
    <p style="margin:0 0 22px 0;font-size:14px;color:#5B5648;line-height:1.6;">Enter this code to confirm your email address. It expires in <strong>10 minutes</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td align="center" style="background:#FBF7EF;border:1px dashed #E2B57D;border-radius:12px;padding:20px 0;">
        <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#131A2B;font-family:'Courier New',Courier,monospace;">${escapeHtml(code)}</span>
      </td>
    </tr></table>
    <p style="margin:22px 0 0 0;font-size:12.5px;color:#8A8474;line-height:1.6;">For your security, never share this code. ${escapeHtml(BRAND)} staff will never ask you for it.</p>`;
  return {
    subject: `${code} is your ${BRAND} verification code`,
    html: shell(inner),
    text: `Your ${BRAND} verification code is ${code}. It expires in 10 minutes. Never share this code. If you didn't request it, ignore this email.`,
  };
}

export function welcomeEmail(name?: string | null): { subject: string; html: string; text: string } {
  const who = name ? ` ${escapeHtml(name.split(' ')[0])}` : '';
  const step = (n: string, t: string) =>
    `<tr><td style="padding:8px 0;vertical-align:top;width:26px;"><span style="display:inline-block;width:22px;height:22px;background:#FDEBD6;color:#E97612;border-radius:50%;text-align:center;line-height:22px;font-size:12px;font-weight:700;">${n}</span></td>
     <td style="padding:8px 0 8px 8px;font-size:14px;color:#3D3A31;line-height:1.5;">${t}</td></tr>`;
  const inner = `
    <p style="margin:0 0 6px 0;font-size:20px;font-weight:700;color:#131A2B;">Welcome${who}! &#127881;</p>
    <p style="margin:0 0 18px 0;font-size:14px;color:#5B5648;line-height:1.6;">Your ${escapeHtml(BRAND)} workspace is ready. Here's how to get started:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${step('1', 'Connect your <strong>WhatsApp</strong> number so customers can reach you.')}
      ${step('2', 'Link <strong>Google Drive</strong> to store and deliver documents.')}
      ${step('3', 'Add your <strong>operators</strong> and start processing jobs.')}
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px 0;"><tr>
      <td style="background:#F98A1E;border-radius:10px;">
        <a href="${APP_URL}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Open ${escapeHtml(BRAND)} &rarr;</a>
      </td>
    </tr></table>`;
  return {
    subject: `Welcome to ${BRAND} 🎉`,
    html: shell(inner),
    text: `Welcome${name ? ' ' + name.split(' ')[0] : ''}! Your ${BRAND} workspace is ready.\n\n` +
      `1. Connect your WhatsApp number\n2. Link Google Drive\n3. Add your operators and start processing jobs\n\n` +
      `Open ${BRAND}: ${APP_URL}\n\n— The ${BRAND} Team`,
  };
}
