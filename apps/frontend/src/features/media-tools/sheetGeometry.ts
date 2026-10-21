const MM_TO_PX = 300 / 25.4;
export const mm = (n: number) => Math.round(n * MM_TO_PX);

export const PAPER_4X6_L = { id: '4x6-landscape', w: 1800, h: 1200 };
export const PAPER_A4_P = { id: 'a4-portrait', w: 2480, h: 3508 };
export const PAPER_A4_L = { id: 'a4-landscape', w: 3508, h: 2480 };

export const PASSPORT_SLOT = { w: mm(35), h: mm(45) };

/** Physical size in mm for jsPDF (width × height of one sheet). */
export const PAPER_MM: Record<string, { wMm: number; hMm: number; orient: 'portrait' | 'landscape' }> = {
  'a4-portrait': { wMm: 210, hMm: 297, orient: 'portrait' },
  'a4-landscape': { wMm: 297, hMm: 210, orient: 'landscape' },
  '4x6-landscape': { wMm: 152.4, hMm: 101.6, orient: 'landscape' },
};
