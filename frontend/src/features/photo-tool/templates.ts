/**
 * Photo Tool — built-in template library.
 *
 * Templates are pure data. Each template specifies its own paper size and
 * a list of slots (positions on that paper, in px @ 300 DPI).
 *
 * SERVER NEVER SEES PIXELS — see /ARCHITECTURE.md §3.1.
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

// Common card sizes (px @ 300 DPI)
const CARD_W = mm(85.6);  // Aadhaar / PAN / credit card
const CARD_H = mm(54);
const PASSPORT_W = mm(35); // Indian passport photo
const PASSPORT_H = mm(45);
const VISA_W = mm(50);     // US/Schengen visa photo (square)
const VISA_H = mm(50);
const SMALL_W = mm(25);    // school/college small photo
const SMALL_H = mm(30);

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
};

/** Generate slots for a centered grid on the given paper. */
function gridSlots(
  paper: PaperPreset,
  cols: number, rows: number,
  cardW: number, cardH: number,
  gap = 60,
  imageIndex = 0,
  fit: 'contain' | 'cover' = 'contain'
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
        w: cardW,
        h: cardH,
        imageIndex,
        fit,
      });
    }
  }
  return slots;
}

// ── Templates ────────────────────────────────────────────────────────────
// "Free" templates — fit one image to the entire printable area.
function freeTemplate(id: string, name: string, paper: PaperPreset, description: string): Template {
  const m = mm(5);
  return {
    id, name, description, imagesNeeded: 1, paper,
    slots: [{ x: m, y: m, w: paper.w - 2 * m, h: paper.h - 2 * m, imageIndex: 0, fit: 'contain' }],
  };
}

export const TPL_FREE_A4_P = freeTemplate('free-a4p', 'A4 Portrait', PAPER_A4_P, 'Fit image to A4');
export const TPL_FREE_A4_L = freeTemplate('free-a4l', 'A4 Landscape', PAPER_A4_L, 'Fit image to landscape A4');
export const TPL_FREE_4X6_P = freeTemplate('free-4x6p', '4×6 Portrait', PAPER_4X6_P, 'Fit image to 4×6 portrait');
export const TPL_FREE_4X6_L = freeTemplate('free-4x6l', '4×6 Landscape', PAPER_4X6_L, 'Fit image to 4×6 landscape');

export const TPL_AADHAAR_2: Template = {
  id: 'aadhaar-2',
  name: 'Aadhaar — 2 copies',
  description: 'Same image, 2 cards stacked',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: (() => {
    const x = Math.round((PAPER_A4_P.w - CARD_W) / 2);
    const y1 = Math.round((PAPER_A4_P.h / 2 - CARD_H) / 2);
    const y2 = Math.round(PAPER_A4_P.h / 2 + (PAPER_A4_P.h / 2 - CARD_H) / 2);
    return [
      { x, y: y1, w: CARD_W, h: CARD_H, imageIndex: 0, fit: 'contain' as const },
      { x, y: y2, w: CARD_W, h: CARD_H, imageIndex: 0, fit: 'contain' as const },
    ];
  })(),
};

export const TPL_PAN_4: Template = {
  id: 'pan-4',
  name: 'PAN — 4 copies',
  description: '2×2 grid of PAN cards',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: gridSlots(PAPER_A4_P, 2, 2, CARD_W, CARD_H),
};

export const TPL_PASSPORT_4: Template = {
  id: 'passport-4',
  name: 'Passport photo — 4 copies',
  description: '4 photos at 35×45mm',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: gridSlots(PAPER_A4_P, 2, 2, PASSPORT_W, PASSPORT_H, 60, 0, 'cover'),
};

export const TPL_PASSPORT_8: Template = {
  id: 'passport-8',
  name: 'Passport photo — 8 copies',
  description: '8 photos at 35×45mm',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: gridSlots(PAPER_A4_P, 2, 4, PASSPORT_W, PASSPORT_H, 60, 0, 'cover'),
};

export const TPL_VISA_4: Template = {
  id: 'visa-4',
  name: 'Visa photo — 4 copies',
  description: '4 photos at 50×50mm (square)',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: gridSlots(PAPER_A4_P, 2, 2, VISA_W, VISA_H, 60, 0, 'cover'),
};

export const TPL_VISA_6: Template = {
  id: 'visa-6',
  name: 'Visa photo — 6 copies',
  description: '6 photos at 50×50mm (square)',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: gridSlots(PAPER_A4_P, 2, 3, VISA_W, VISA_H, 60, 0, 'cover'),
};

export const TPL_SMALL_8: Template = {
  id: 'small-8',
  name: 'Small photo — 8 copies',
  description: '8 photos at 25×30mm (school/college)',
  imagesNeeded: 1,
  paper: PAPER_A4_P,
  slots: gridSlots(PAPER_A4_P, 2, 4, SMALL_W, SMALL_H, 60, 0, 'cover'),
};

// Landscape templates — operator picks paper layout via the orientation buttons
export const TPL_PASSPORT_4_L: Template = {
  id: 'passport-4-landscape',
  name: 'Passport photo — 4 copies (landscape)',
  description: '4 photos on A4 landscape',
  imagesNeeded: 1,
  paper: PAPER_A4_L,
  slots: gridSlots(PAPER_A4_L, 2, 2, PASSPORT_W, PASSPORT_H, 60, 0, 'cover'),
};

export const TPL_BANNER: Template = {
  id: 'banner',
  name: 'Wide banner',
  description: 'Single image, A4 landscape',
  imagesNeeded: 1,
  paper: PAPER_A4_L,
  slots: [{ x: mm(5), y: mm(5), w: PAPER_A4_L.w - 2 * mm(5), h: PAPER_A4_L.h - 2 * mm(5), imageIndex: 0, fit: 'contain' }],
};

export const TEMPLATES: Template[] = [
  TPL_FREE_A4_P, TPL_FREE_A4_L,
  TPL_FREE_4X6_P, TPL_FREE_4X6_L,
  TPL_AADHAAR_2, TPL_PAN_4,
  TPL_PASSPORT_4, TPL_PASSPORT_8, TPL_PASSPORT_4_L,
  TPL_VISA_4, TPL_VISA_6,
  TPL_SMALL_8,
  TPL_BANNER,
];

// Backward-compat re-exports (some callers still import these)
export const TPL_FREE = TPL_FREE_A4_P;
export const A4_W_PX = PAPER_A4_P.w;
export const A4_H_PX = PAPER_A4_P.h;
