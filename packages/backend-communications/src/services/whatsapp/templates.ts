/**
 * WhatsApp message templates — plaintext with WhatsApp formatting.
 * Brand/origin from backend-core env (BRAND_NAME, APP_ORIGIN).
 */
import { APP_ORIGIN, BRAND_NAME } from '@cybercontrol/backend-core';

const BRAND = `⚡ *${BRAND_NAME}*`;
const APP_URL = (() => {
  try { return new URL(APP_ORIGIN).host; } catch { return APP_ORIGIN.replace(/^https?:\/\//, ''); }
})();

export function otpMessage(code: string): string {
  return (
    `${BRAND}\n\n` +
    `Your verification code is\n\n` +
    `\`\`\`${code}\`\`\`\n\n` +
    `It expires in *10 minutes*.\n` +
    `🔒 Never share this code — our staff will never ask you for it.\n\n` +
    `_Didn't request this? You can safely ignore this message._`
  );
}

export function welcomeMessage(name?: string | null): string {
  const who = name ? ` ${name.split(' ')[0]}` : '';
  return (
    `${BRAND}\n\n` +
    `Welcome${who}! 🎉 Your workspace is ready.\n\n` +
    `Here's how to get started:\n` +
    `1️⃣  Connect your *WhatsApp* number\n` +
    `2️⃣  Link *Google Drive*\n` +
    `3️⃣  Add your *operators* and start processing jobs\n\n` +
    `Open ${BRAND_NAME} 👉 ${APP_URL}`
  );
}
