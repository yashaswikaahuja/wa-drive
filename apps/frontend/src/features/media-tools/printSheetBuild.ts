/** Shared passport sheet layout — used by Print page and Photo Editor same-session print. */
import { mm, PAPER_4X6_L, PAPER_A4_P, PASSPORT_SLOT } from './sheetGeometry';

export type PaperId = '4x6' | 'a4';

export async function buildPassportSheet(
  img: HTMLImageElement | HTMLCanvasElement,
  count: number,
  paperId: PaperId,
): Promise<Blob> {
  const paper = paperId === 'a4' ? PAPER_A4_P : PAPER_4X6_L;
  const slotW = PASSPORT_SLOT.w;
  const slotH = PASSPORT_SLOT.h;
  const gap = mm(paperId === 'a4' ? 4 : 3);
  const margin = mm(paperId === 'a4' ? 10 : 6);
  const nw = 'naturalWidth' in img ? (img.naturalWidth || img.width) : img.width;
  const nh = 'naturalHeight' in img ? (img.naturalHeight || img.height) : img.height;

  const usableW = paper.w - margin * 2;
  const usableH = paper.h - margin * 2;
  const cols = Math.max(1, Math.floor((usableW + gap) / (slotW + gap)));
  const rowsPerPage = Math.max(1, Math.floor((usableH + gap) / (slotH + gap)));
  const perPage = cols * rowsPerPage;
  const pages = Math.max(1, Math.ceil(count / perPage));

  const c = document.createElement('canvas');
  c.width = paper.w;
  c.height = paper.h * pages;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';

  const drawCover = (x: number, y: number) => {
    const sa = nw / nh;
    const da = slotW / slotH;
    let sx = 0, sy = 0, sw = nw, sh = nh;
    if (sa > da) { sw = nh * da; sx = (nw - sw) / 2; }
    else { sh = nw / da; sy = (nh - sh) * 0.35; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, slotW, slotH);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, slotW - 1, slotH - 1);
  };

  const n = Math.max(1, Math.min(100, count));
  for (let i = 0; i < n; i++) {
    const page = Math.floor(i / perPage);
    const idx = i % perPage;
    const r = Math.floor(idx / cols);
    const col = idx % cols;
    const gridW = cols * slotW + (cols - 1) * gap;
    const gridH = rowsPerPage * slotH + (rowsPerPage - 1) * gap;
    const ox = Math.round((paper.w - gridW) / 2);
    const oy = page * paper.h + Math.round((paper.h - gridH) / 2);
    drawCover(ox + col * (slotW + gap), oy + r * (slotH + gap));
  }

  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92);
  });
}
