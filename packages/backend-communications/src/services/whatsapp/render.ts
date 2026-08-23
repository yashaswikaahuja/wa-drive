/**
 * Branded PNG cards for WhatsApp (rendered via sharp SVG→PNG). "Paper" theme
 * (cream #F6F2E9, ink #131A2B, marigold #F98A1E) to match the email templates.
 *  • renderOtpCard(code)     → verification-code card
 *  • renderWelcomeCard(name) → welcome card
 * Returns base64 PNG (no data: prefix) — handed to the resolver which sends it as image media.
 * NOTE: no emoji glyphs in the SVG (the slim runtime has no color-emoji font); emoji live in the
 * text caption instead. Text uses DejaVu (installed in the backend image) via the sans-serif alias.
 */
import sharp from 'sharp';

const CREAM = '#F6F2E9', INK = '#131A2B', MARIGOLD = '#F98A1E', MARIGOLD_DEEP = '#E97612';
const CARD = '#ffffff', BORDER = '#E7E0D2', MUTED = '#8A8474', SUBTLE = '#5B5648', FAINT = '#B8B1A2';
const SANS = 'DejaVu Sans, Liberation Sans, sans-serif';
const MONO = 'DejaVu Sans Mono, monospace';
const W = 800, H = 800;

function esc(s: string): string {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

// CyberControl logo lockup (marigold rounded square + lightning + wordmark) at (x,y).
function logo(x: number, y: number): string {
  const s = 56;
  return `
    <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="14" fill="${MARIGOLD}"/>
    <path d="M ${x + 31} ${y + 12} L ${x + 18} ${y + 32} L ${x + 27} ${y + 32} L ${x + 25} ${y + 45} L ${x + 38} ${y + 25} L ${x + 29} ${y + 25} Z" fill="#ffffff"/>
    <text x="${x + s + 16}" y="${y + 38}" font-family="${SANS}" font-size="30" font-weight="bold" fill="${INK}">Cyber<tspan fill="${MARIGOLD_DEEP}">Control</tspan></text>`;
}

function footer(): string {
  return `<text x="96" y="712" font-family="${SANS}" font-size="17" fill="${FAINT}">© CyberControl · cybercontrol.fun</text>`;
}

async function toPng(svg: string): Promise<string> {
  const buf = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return buf.toString('base64');
}

export async function renderOtpCard(code: string): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${CREAM}"/>
  <rect x="48" y="48" width="${W - 96}" height="${H - 96}" rx="32" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  ${logo(96, 104)}
  <text x="96" y="266" font-family="${SANS}" font-size="42" font-weight="bold" fill="${INK}">Your verification code</text>
  <text x="96" y="312" font-family="${SANS}" font-size="22" fill="${SUBTLE}">Use this code to confirm your WhatsApp number.</text>
  <text x="96" y="344" font-family="${SANS}" font-size="22" fill="${SUBTLE}">It expires in 10 minutes.</text>
  <rect x="96" y="388" width="${W - 192}" height="152" rx="20" fill="#FBF7EF" stroke="#E2B57D" stroke-width="2.5" stroke-dasharray="9 7"/>
  <text x="${W / 2}" y="490" text-anchor="middle" font-family="${MONO}" font-size="84" font-weight="bold" letter-spacing="16" fill="${INK}">${esc(code)}</text>
  <text x="96" y="606" font-family="${SANS}" font-size="20" fill="${MUTED}">Never share this code — our staff will never ask you for it.</text>
  ${footer()}
</svg>`;
  return toPng(svg);
}

export async function renderWelcomeCard(name?: string | null): Promise<string> {
  const who = name ? `, ${esc(name.split(' ')[0])}` : '';
  const step = (n: string, t: string, y: number) => `
    <circle cx="112" cy="${y - 8}" r="17" fill="#FDEBD6"/>
    <text x="112" y="${y - 1}" text-anchor="middle" font-family="${SANS}" font-size="18" font-weight="bold" fill="${MARIGOLD_DEEP}">${n}</text>
    <text x="146" y="${y}" font-family="${SANS}" font-size="22" fill="#3D3A31">${t}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${CREAM}"/>
  <rect x="48" y="48" width="${W - 96}" height="${H - 96}" rx="32" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  ${logo(96, 104)}
  <text x="96" y="270" font-family="${SANS}" font-size="42" font-weight="bold" fill="${INK}">Welcome${who}!</text>
  <text x="96" y="316" font-family="${SANS}" font-size="22" fill="${SUBTLE}">Your workspace is ready. Here's how to get started:</text>
  ${step('1', 'Connect your WhatsApp number', 392)}
  ${step('2', 'Link Google Drive', 452)}
  ${step('3', 'Add your operators and start jobs', 512)}
  <rect x="96" y="566" width="300" height="60" rx="14" fill="${MARIGOLD}"/>
  <text x="246" y="605" text-anchor="middle" font-family="${SANS}" font-size="22" font-weight="bold" fill="#ffffff">Open CyberControl</text>
  ${footer()}
</svg>`;
  return toPng(svg);
}
