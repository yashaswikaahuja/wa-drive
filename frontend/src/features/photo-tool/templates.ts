/**
 * Photo Tool — built-in template library.
 *
 * Templates are pure data. Each template specifies its own paper size and
 * a list of slots (positions on that paper, in px @ 300 DPI).
 *
 * SERVER NEVER SEES PIXELS — see /ARCHITECTURE.md §3.1.
 *
 * Design goals (2026-06 rewrite):
 *  - Density-first: fill the sheet so operators don't waste photo paper.
 *  - Real jobs: the flagship "8 passport photos on a 4×6" sheet, plus
 *    full-A4 sheets for passport / visa / stamp / small / ID-card sizes.
 *  - Cut-lines: thin guides between cells so photos can be trimmed cleanly.
 *  - Shared crop: for "N copies of one photo" the operator crops ONCE and
 *    every copy follows (see `sharedCrop`).
 */

const MM_TO_PX = 300 / 25.4;
export const mm = (n: number) => Math.round(n * MM_TO_PX);

// ── Paper presets ────────────────────────────────────────────────────────
export type PaperPreset = {
  id: string;
  name: string;
  w: number;
  h: number;
};

export const PAPER_A4_P: PaperPreset    = { id: 'a4-portrait',    name: 'A4 Portrait',    w: 2480, h: 3508 };
export const PAPER_A4_L: PaperPreset    = { id: 'a4-landscape',   name: 'A4 Landscape',   w: 3508, h: 2480 };
export const PAPER_A5_P: PaperPreset    = { id: 'a5-portrait',    name: 'A5 Portrait',    w: 1748, h: 2480 };
export const PAPER_A5_L: PaperPreset    = { id: 'a5-landscape',   name: 'A5 Landscape',   w: 2480, h: 1748 };
export const PAPER_4X6_P: PaperPreset   = { id: '4x6-portrait',   name: '4×6 Portrait',   w: 1200, h: 1800 };
export const PAPER_4X6_L: PaperPreset   = { id: '4x6-landscape',  name: '4×6 Landscape',  w: 1800, h: 1200 };

export const PAPERS: PaperPreset[] = [PAPER_A4_P, PAPER_A4_L, PAPER_A5_P, PAPER_A5_L, PAPER_4X6_P, PAPER_4X6_L];

// Common photo / card sizes (px @ 300 DPI)
const CARD_W = mm(85.6);  // Aadhaar / PAN / credit card (CR80)
const CARD_H = mm(54);
const PASSPORT_W = mm(35); // Indian passport photo 35×45 mm
const PASSPORT_H = mm(45);
const VISA_W = mm(50);     // US / Schengen visa photo (square)
const VISA_H = mm(50);
const SMALL_W = mm(25);    // school / college small photo 25×30 mm
const SMALL_H = mm(30);
const STAMP_W = mm(20);    // stamp size 20×25 mm
const STAMP_H = mm(25);

export type Slot = {
  x: number;
  y: number;
  w: number;
  h: number;
  imageIndex: number;
  fit: 'contain' | 'cover';
};

export type Template = {
  id: string;
  name: string;
  description: string;
  imagesNeeded: number;
  paper: PaperPreset;
  slots: Slot[];
  /** Draw thin trim guides around each slot (for cutting). Default off. */
  cutLines?: boolean;
  /** All slots show ONE source image with a single shared crop/zoom/pan
   *  (i.e. "N copies of the same photo"). Default off. */
  sharedCrop?: boolean;
};

const DEFAULT_GAP = mm(3);     // ~3 mm between cells
const DEFAULT_MARGIN = mm(4);  // ~4 mm printable margin

/** Lay out an explicit cols×rows grid, centered on the paper. */
function gridSlots(
  paper: PaperPreset,
  cols: number, rows: number,
  cardW: number, cardH: number,
  gap = DEFAULT_GAP,
  imageIndex = 0,
  fit: 'contain' | 'cover' = 'cover'
): Slot[] {
  const totalW = cols * cardW + (cols - 1) * gap;
  const totalH = rows * cardH + (rows - 1) * gap;
  const startX = Math.round((paper.w - totalW) / 2);
  const startY = Math.round((paper.h - totalH) / 2);
  const slots: Slot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({
        x: startX + c * (cardW + gap),
        y: startY + r * (cardH + gap),
        w: cardW, h: cardH, imageIndex, fit,
      });
    }
  }
  return slots;
}

/** Fill the sheet with as many cells of (cardW×cardH) as fit, centered. */
function fillSheet(
  paper: PaperPreset,
  cardW: number, cardH: number,
  opts: { gap?: number; margin?: number; fit?: 'contain' | 'cover' } = {}
): Slot[] {
  const gap = opts.gap ?? DEFAULT_GAP;
  const margin = opts.margin ?? DEFAULT_MARGIN;
  const fit = opts.fit ?? 'cover';
  const availW = paper.w - 2 * margin;
  const availH = paper.h - 2 * margin;
  const cols = Math.max(1, Math.floor((availW + gap) / (cardW + gap)));
  const rows = Math.max(1, Math.floor((availH + gap) / (cardH + gap)));
  return gridSlots(paper, cols, rows, cardW, cardH, gap, 0, fit);
}

/** Count how many cells a fillSheet would produce (for labels). */
function fillCount(paper: PaperPreset, cardW: number, cardH: number, gap = DEFAULT_GAP, margin = DEFAULT_MARGIN): number {
  const cols = Math.max(1, Math.floor((paper.w - 2 * margin + gap) / (cardW + gap)));
  const rows = Math.max(1, Math.floor((paper.h - 2 * margin + gap) / (cardH + gap)));
  return cols * rows;
}

// "Fit one image to the whole printable area" — no cutting, no shared crop.
function freeTemplate(id: string, name: string, paper: PaperPreset, description: string): Template {
  const m = mm(5);
  return {
    id, name, description, imagesNeeded: 1, paper,
    slots: [{ x: m, y: m, w: paper.w - 2 * m, h: paper.h - 2 * m, imageIndex: 0, fit: 'contain' }],
  };
}

// ── PASSPORT 35×45 ─────────────────────────────────────────────────────────
// Flagship job: 8 passport photos on a 4×6" glossy sheet (4 cols × 2 rows,
// landscape — that is what actually fits at true 35×45 mm).
export const TPL_PASSPORT_4X6_8: Template = {
  id: 'passport-4x6-8',
  name: 'Passport · 8 on 4×6',
  description: '8 photos (35×45mm) on 4×6 glossy',
  imagesNeeded: 1,
  paper: PAPER_4X6_L,
  slots: gridSlots(PAPER_4X6_L, 4, 2, PASSPORT_W, PASSPORT_H),
  cutLines: true,
  sharedCrop: true,
};

export const TPL_PASSPORT_A4_FILL: Template = {
  id: 'passport-a4-fill',
  name: `Passport · fill A4 (${fillCount(PAPER_A4_P, PASSPORT_W, PASSPORT_H)})`,
  description: 'Pack a full A4 with 35×45mm photos',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: fillSheet(PAPER_A4_P, PASSPORT_W, PASSPORT_H),
  cutLines: true,
  sharedCrop: true,
};

export const TPL_PASSPORT_4: Template = {
  id: 'passport-a4-4',
  name: 'Passport · 4 on A4',
  description: '4 photos (35×45mm), centered',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: gridSlots(PAPER_A4_P, 2, 2, PASSPORT_W, PASSPORT_H),
  cutLines: true,
  sharedCrop: true,
};

// ── VISA 50×50 (square) ──────────────────────────────────────────────────
export const TPL_VISA_4X6: Template = {
  id: 'visa-4x6',
  name: 'Visa · 6 on 4×6',
  description: '50×50mm square photos on 4×6',
  imagesNeeded: 1,
  paper: PAPER_4X6_L,
  slots: gridSlots(PAPER_4X6_L, 3, 2, VISA_W, VISA_H),
  cutLines: true,
  sharedCrop: true,
};

export const TPL_VISA_A4_FILL: Template = {
  id: 'visa-a4-fill',
  name: `Visa · fill A4 (${fillCount(PAPER_A4_P, VISA_W, VISA_H)})`,
  description: 'Pack a full A4 with 50×50mm photos',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: fillSheet(PAPER_A4_P, VISA_W, VISA_H),
  cutLines: true,
  sharedCrop: true,
};

// ── STAMP 20×25 / SMALL 25×30 ───────────────────────────────────────────
export const TPL_STAMP_A4_FILL: Template = {
  id: 'stamp-a4-fill',
  name: `Stamp · fill A4 (${fillCount(PAPER_A4_P, STAMP_W, STAMP_H)})`,
  description: 'Pack a full A4 with 20×25mm stamp photos',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: fillSheet(PAPER_A4_P, STAMP_W, STAMP_H),
  cutLines: true,
  sharedCrop: true,
};

export const TPL_SMALL_A4_FILL: Template = {
  id: 'small-a4-fill',
  name: `Small · fill A4 (${fillCount(PAPER_A4_P, SMALL_W, SMALL_H)})`,
  description: 'Pack a full A4 with 25×30mm photos',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: fillSheet(PAPER_A4_P, SMALL_W, SMALL_H),
  cutLines: true,
  sharedCrop: true,
};

// ── ID CARDS (Aadhaar / PAN, 85.6×54) ────────────────────────────────────
export const TPL_AADHAAR_2: Template = {
  id: 'aadhaar-2',
  name: 'ID card · 2 copies',
  description: 'Aadhaar/PAN at exact size, 2 copies',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: gridSlots(PAPER_A4_P, 1, 2, CARD_W, CARD_H, mm(8), 0, 'contain'),
  cutLines: true,
  sharedCrop: true,
};

export const TPL_CARD_FB: Template = {
  id: 'card-fb',
  name: 'ID card · front + back',
  description: 'Two images: front & back, exact size',
  imagesNeeded: 2,
  paper: PAPER_A4_P,
  slots: (() => {
    const s = gridSlots(PAPER_A4_P, 1, 2, CARD_W, CARD_H, mm(8), 0, 'contain');
    if (s[1]) s[1].imageIndex = 1; // second slot = back (image #2)
    return s;
  })(),
  cutLines: true,
  // not sharedCrop — two different source images
};

export const TPL_CARD_FILL: Template = {
  id: 'card-fill',
  name: `ID card · fill A4 (${fillCount(PAPER_A4_P, CARD_W, CARD_H)})`,
  description: 'Pack a full A4 with ID cards',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: fillSheet(PAPER_A4_P, CARD_W, CARD_H, { fit: 'contain' }),
  cutLines: true,
  sharedCrop: true,
};

// ── FREE COMPOSE / FIT (no cut-lines, no shared crop) ─────────────────────
export const TPL_COMPOSE_A4_P: Template = {
  id: 'compose-a4p',
  name: 'Free Compose · A4 Portrait',
  description: 'Drop multiple images, arrange freely',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: [],
};

export const TPL_COMPOSE_A4_L: Template = {
  id: 'compose-a4l',
  name: 'Free Compose · A4 Landscape',
  description: 'Drop multiple images, arrange freely',
  imagesNeeded: 1,
  paper: PAPER_A4_L,
  slots: [],
};

export const TPL_FREE_A4_P = freeTemplate('free-a4p', 'Fit · A4 Portrait', PAPER_A4_P, 'Fit one image to A4');
export const TPL_FREE_A4_L = freeTemplate('free-a4l', 'Fit · A4 Landscape', PAPER_A4_L, 'Fit one image to landscape A4');
export const TPL_FREE_4X6_P = freeTemplate('free-4x6p', 'Fit · 4×6 Portrait', PAPER_4X6_P, 'Fit one image to 4×6 portrait');
export const TPL_FREE_4X6_L = freeTemplate('free-4x6l', 'Fit · 4×6 Landscape', PAPER_4X6_L, 'Fit one image to 4×6 landscape');

// Order: most-common jobs first (1–9 keyboard shortcuts hit these).
export const TEMPLATES: Template[] = [
  TPL_PASSPORT_4X6_8,
  TPL_PASSPORT_A4_FILL,
  TPL_PASSPORT_4,
  TPL_VISA_4X6,
  TPL_VISA_A4_FILL,
  TPL_STAMP_A4_FILL,
  TPL_SMALL_A4_FILL,
  TPL_AADHAAR_2,
  TPL_CARD_FB,
  TPL_CARD_FILL,
  TPL_COMPOSE_A4_P, TPL_COMPOSE_A4_L,
  TPL_FREE_A4_P, TPL_FREE_A4_L,
  TPL_FREE_4X6_P, TPL_FREE_4X6_L,
];

// Backward-compat re-exports (PhotoTool falls back to TPL_FREE).
export const TPL_FREE = TPL_FREE_A4_P;
export const A4_W_PX = PAPER_A4_P.w;
export const A4_H_PX = PAPER_A4_P.h;

// Grouped, by real cybercafe job — drives the organized template picker.
export type TemplateGroup = { title: string; hint: string; templates: Template[] };
export const TEMPLATE_GROUPS: TemplateGroup[] = [
  { title: 'Documents · Xerox', hint: 'Print a scan', templates: [TPL_FREE_A4_P, TPL_FREE_A4_L, TPL_FREE_4X6_P, TPL_FREE_4X6_L] },
  { title: 'Passport & ID Photos', hint: 'Glossy', templates: [TPL_PASSPORT_4X6_8, TPL_PASSPORT_A4_FILL, TPL_PASSPORT_4, TPL_VISA_4X6, TPL_VISA_A4_FILL] },
  { title: 'Stamp & Small', hint: 'School / college', templates: [TPL_STAMP_A4_FILL, TPL_SMALL_A4_FILL] },
  { title: 'ID Cards', hint: 'Aadhaar / PAN', templates: [TPL_AADHAAR_2, TPL_CARD_FB, TPL_CARD_FILL] },
  { title: 'Custom', hint: 'Arrange freely', templates: [TPL_COMPOSE_A4_P, TPL_COMPOSE_A4_L] },
];
