const MM_TO_PX = 300 / 25.4;
export const mm = (n: number) => Math.round(n * MM_TO_PX);

export const PAPER_4X6_L = { id: '4x6-landscape', w: 1800, h: 1200 };
export const PAPER_A4_P = { id: 'a4-portrait', w: 2480, h: 3508 };

export const PASSPORT_SLOT = { w: mm(35), h: mm(45) };
