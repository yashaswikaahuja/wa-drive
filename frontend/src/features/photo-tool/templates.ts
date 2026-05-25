/**
 * Photo Tool — built-in template library.
 *
 * Templates are pure data. Each slot is a position in A4 px @ 300 DPI.
 * imageIndex points to which uploaded image fills that slot (0 = first image).
 * fit: 'contain' (fit inside, may letterbox) | 'cover' (fill, may crop).
 *
 * SERVER NEVER SEES PIXELS — see /ARCHITECTURE.md §3.1.
 */

// A4 @ 300 DPI
export const A4_W_PX = 2480;
export const A4_H_PX = 3508;
const MM_TO_PX = 300 / 25.4;
export const mm = (n: number) => Math.round(n * MM_TO_PX);

// Common card sizes
const CARD_W = mm(85.6);  // Aadhaar / PAN / credit card
const CARD_H = mm(54);
const PASSPORT_W = mm(35); // standard Indian passport photo
const PASSPORT_H = mm(45);
const VISA_W = mm(50); // US/Schengen visa photo (square)
const VISA_H = mm(50);
const SMALL_W = mm(25); // school/college small photo
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
  slots: Slot[];
};

/** Generate slots for a centered grid of cards on A4. */
function gridSlots(
  cols: number,
  rows: number,
  cardW: number,
  cardH: number,
  gap = 60,
  imageIndex = 0,
  fit: 'contain' | 'cover' = 'contain'
): Slot[] {
  const totalW = cols * cardW + (cols - 1) * gap;
  const totalH = rows * cardH + (rows - 1) * gap;
  const startX = Math.round((A4_W_PX - totalW) / 2);
  const startY = Math.round((A4_H_PX - totalH) / 2);
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

export const TPL_FREE: Template = {
  id: 'free',
  name: 'Free A4',
  description: 'Fit one image to A4',
  imagesNeeded: 1,
  slots: [{
    x: mm(5), y: mm(5),
    w: A4_W_PX - 2 * mm(5), h: A4_H_PX - 2 * mm(5),
    imageIndex: 0, fit: 'contain',
  }],
};

export const TPL_AADHAAR_2: Template = {
  id: 'aadhaar-2',
  name: 'Aadhaar — 2 copies',
  description: 'Same image, 2 cards stacked',
  imagesNeeded: 1,
  slots: (() => {
    const x = Math.round((A4_W_PX - CARD_W) / 2);
    const y1 = Math.round((A4_H_PX / 2 - CARD_H) / 2);
    const y2 = Math.round(A4_H_PX / 2 + (A4_H_PX / 2 - CARD_H) / 2);
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
  slots: gridSlots(2, 2, CARD_W, CARD_H),
};

export const TPL_PASSPORT_4: Template = {
  id: 'passport-4',
  name: 'Passport photo — 4 copies',
  description: '4 photos at 35×45mm',
  imagesNeeded: 1,
  slots: gridSlots(2, 2, PASSPORT_W, PASSPORT_H, 60, 0, 'cover'),
};

export const TPL_PASSPORT_8: Template = {
  id: 'passport-8',
  name: 'Passport photo — 8 copies',
  description: '8 photos at 35×45mm',
  imagesNeeded: 1,
  slots: gridSlots(2, 4, PASSPORT_W, PASSPORT_H, 60, 0, 'cover'),
};

export const TPL_VISA_4: Template = {
  id: 'visa-4',
  name: 'Visa photo — 4 copies',
  description: '4 photos at 50×50mm (square)',
  imagesNeeded: 1,
  slots: gridSlots(2, 2, VISA_W, VISA_H, 60, 0, 'cover'),
};

export const TPL_VISA_6: Template = {
  id: 'visa-6',
  name: 'Visa photo — 6 copies',
  description: '6 photos at 50×50mm (square)',
  imagesNeeded: 1,
  slots: gridSlots(2, 3, VISA_W, VISA_H, 60, 0, 'cover'),
};

export const TPL_SMALL_8: Template = {
  id: 'small-8',
  name: 'Small photo — 8 copies',
  description: '8 photos at 25×30mm (school/college)',
  imagesNeeded: 1,
  slots: gridSlots(2, 4, SMALL_W, SMALL_H, 60, 0, 'cover'),
};

// Order in this array = order in the sidebar
export const TEMPLATES: Template[] = [
  TPL_FREE,
  TPL_AADHAAR_2,
  TPL_PAN_4,
  TPL_PASSPORT_4,
  TPL_PASSPORT_8,
  TPL_VISA_4,
  TPL_VISA_6,
  TPL_SMALL_8,
];
