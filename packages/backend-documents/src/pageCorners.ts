/**
 * Find the paper in a customer photo with a Mistral vision model (#346).
 *
 * The photo is shrunk, a labelled 10% grid is drawn on it (vision models read
 * positions far better against a ruler), and the model returns the four page
 * corners as 0..1000 coordinates. Returns `document: false` for photos that are
 * not a sheet or card (selfies, passport photos, scenes).
 */
import sharp from 'sharp';

export type PageCorner = { x: number; y: number };
export type PageCornersResult = {
  document: boolean;
  /** tl, tr, br, bl; normalized 0..1. Present only when `document` is true. */
  corners?: PageCorner[];
  model: string;
  ms: number;
};

/** Models the caller may pick (for A/B testing). First is the default. */
export const PAGE_CORNER_MODELS = [
  'mistral-medium-latest',
  'pixtral-large-latest',
  'mistral-small-latest',
  'pixtral-12b-2409',
] as const;

const MAX_SIDE = 1024;

const PROMPT = `You are locating a paper document in a phone photo.
A grid is drawn on the image. Labels on the edges give positions from 0 to 1000
(x from left to right, y from top to bottom). Gridlines are every 100.

If the photo shows a sheet of paper, a printed form, a certificate, a receipt or an
ID card, return the four corners of that one document (the physical paper or card
edge, not a printed border or table inside it). If part of the paper runs off the
photo, use the photo edge (0 or 1000) there. If there is no document (a selfie,
a passport-size photo, people, a room), return {"document": false}.

Reply with JSON only:
{"document": true, "tl": [x, y], "tr": [x, y], "br": [x, y], "bl": [x, y]}`;

function gridSvg(w: number, h: number): Buffer {
  const lines: string[] = [];
  const font = Math.max(12, Math.round(Math.min(w, h) / 45));
  for (let k = 1; k < 10; k++) {
    const x = Math.round((w * k) / 10);
    const y = Math.round((h * k) / 10);
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}"/>`, `<line x1="0" y1="${y}" x2="${w}" y2="${y}"/>`);
    const label = String(k * 100);
    lines.push(
      `<text x="${x + 3}" y="${font + 2}">${label}</text>`,
      `<text x="${x + 3}" y="${h - 4}">${label}</text>`,
      `<text x="3" y="${y - 3}">${label}</text>`,
      `<text x="${w - font * 2.2}" y="${y - 3}">${label}</text>`,
    );
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<g stroke="#ff00ff" stroke-opacity="0.55" stroke-width="1">${lines.filter((l) => l.startsWith('<line')).join('')}</g>` +
      `<g fill="#ff00ff" font-family="sans-serif" font-size="${font}" font-weight="bold" stroke="#ffffff" stroke-width="3" paint-order="stroke">` +
      `${lines.filter((l) => l.startsWith('<text')).join('')}</g></svg>`,
  );
}

function point(v: unknown): PageCorner | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const x = Number(v[0]);
  const y = Number(v[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const c = (n: number) => Math.max(0, Math.min(1, n / 1000));
  return { x: c(x), y: c(y) };
}

function polyArea(q: PageCorner[]) {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    const n = q[(i + 1) % q.length];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

export async function detectPageCorners(image: Buffer, opts: { model?: string } = {}): Promise<PageCornersResult> {
  const key = process.env['MISTRAL_API_KEY'] || '';
  if (!key) throw new Error('MISTRAL_API_KEY is not configured');
  const model = (PAGE_CORNER_MODELS as readonly string[]).includes(opts.model || '') ? opts.model! : PAGE_CORNER_MODELS[0];

  const base = sharp(image, { failOn: 'none' }).rotate().resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true });
  const { data: px, info } = await base.clone().jpeg().toBuffer({ resolveWithObject: true });
  const jpeg = await sharp(px)
    .composite([{ input: gridSvg(info.width, info.height), top: 0, left: 0 }])
    .jpeg({ quality: 82 })
    .toBuffer();

  const t0 = Date.now();
  let text = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (r.ok) {
      const data = (await r.json()) as any;
      text = String(data?.choices?.[0]?.message?.content || '');
      break;
    }
    if (r.status === 429 && attempt < 2) {
      await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)));
      continue;
    }
    throw new Error(`Mistral ${model} failed: ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`);
  }
  const ms = Date.now() - t0;

  let parsed: any = {};
  try {
    parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch {
    parsed = {};
  }
  if (parsed.document !== true) return { document: false, model, ms };
  const corners = [point(parsed.tl), point(parsed.tr), point(parsed.br), point(parsed.bl)];
  if (corners.some((c) => !c)) return { document: false, model, ms };
  const quad = corners as PageCorner[];
  // A tiny or degenerate answer is not a usable crop.
  if (polyArea(quad) < 0.05) return { document: false, model, ms };
  return { document: true, corners: quad, model, ms };
}
