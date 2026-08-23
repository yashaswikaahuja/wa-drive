/**
 * WhatsApp message templates — plaintext with WhatsApp formatting (*bold*, _italic_, ```mono```)
 * and emojis, in the CyberControl brand voice. Mirrors services/email/templates.ts so the two
 * channels stay consistent. WhatsApp has no HTML — keep to its markdown + short, scannable lines.
 */

const BRAND = '⚡ *CyberControl*';
const APP_URL = 'app.cybercontrol.fun';

// One-time verification code (signup + post-login contact verification).
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

// Greeting after a new account is set up (parity with the welcome email).
export function welcomeMessage(name?: string | null): string {
  const who = name ? ` ${name.split(' ')[0]}` : '';
  return (
    `${BRAND}\n\n` +
    `Welcome${who}! 🎉 Your workspace is ready.\n\n` +
    `Here's how to get started:\n` +
    `1️⃣  Connect your *WhatsApp* number\n` +
    `2️⃣  Link *Google Drive*\n` +
    `3️⃣  Add your *operators* and start processing jobs\n\n` +
    `Open CyberControl 👉 ${APP_URL}`
  );
}
