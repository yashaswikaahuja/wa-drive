import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { crc32, deflateSync } from 'node:zlib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Operator: adds a second document on top of the customer's page, moves it,
 * writes text, adds whiteout, uses Undo/Redo, then refreshes. Everything stays.
 */

const AUTH = {
  state: {
    accessToken: 'e2e-token',
    refreshToken: 'e2e-refresh',
    user: { id: 'u1', workspaceId: 'ws_e2e0001', name: 'Test Operator', email: 'qa@example.com', role: 'admin' },
    isAuthenticated: true,
  },
  version: 0,
};

function pngChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, sum]);
}

/** Solid RGB PNG of the given size. */
function solidPng(w: number, h: number, r: number, g: number, b: number) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = 1 + w * 3;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      raw[y * row + 1 + x * 3] = r;
      raw[y * row + 2 + x * 3] = g;
      raw[y * row + 3 + x * 3] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const PAGE_PHOTO = solidPng(300, 420, 200, 60, 60);
const SECOND_DOC = solidPng(320, 200, 40, 90, 200);

type Ed = { tag: string; type: string; x: number; y: number; w: number; h: number; sel: boolean; text: string };

async function editors(page: Page): Promise<Ed[]> {
  const frame = page.frames().find((f) => f.url().includes('viewer.html'));
  if (!frame) return [];
  return frame.evaluate(() => {
    const ui = (window as any).PDFViewerApplication?.pdfViewer?._layerProperties?.annotationEditorUIManager;
    if (!ui) return [];
    return ui.getEditors(0).map((e: any) => ({
      tag: e.__cyberTag || '',
      type: e.editorType,
      x: e.x,
      y: e.y,
      w: e.width,
      h: e.height,
      sel: !!e.isSelected,
      text: (e.div?.innerText || '').replace(/\s+/g, ' ').trim(),
    }));
  });
}

async function openEditor(page: Page): Promise<FrameLocator> {
  await page.goto('/app/photos/doc-print?fileId=drv-page&paper=a4&from=/app/files&name=Shubham&phone=cust-1', {
    waitUntil: 'domcontentloaded',
  });
  const later = page.getByRole('button', { name: /^Later$/i });
  if (await later.isVisible().catch(() => false)) await later.click();
  const frame = page.frameLocator('iframe[title="PDF document"]');
  await expect(frame.locator('.stampEditor').first()).toBeVisible({ timeout: 30000 });
  return frame;
}

/** Average colour painted inside the stamp whose tag starts with prefix, [r,g,b]. */
async function stampColor(page: Page, prefix: string): Promise<[number, number, number]> {
  const f = page.frames().find((fr) => fr.url().includes('viewer.html'))!;
  // The UI manager is briefly null while the sheet rebuilds; wait for it.
  await f.waitForFunction(
    (pfx) => {
      const ui = (window as any).PDFViewerApplication?.pdfViewer?._layerProperties?.annotationEditorUIManager;
      const ed = ui?.getEditors?.(0)?.find((e: any) => (e.__cyberTag || '').startsWith(pfx));
      return !!(ed?.div?.querySelector('img') || ed?.div?.querySelector('canvas'));
    },
    prefix,
    { timeout: 15000 },
  );
  return f.evaluate((pfx) => {
    const ui = (window as any).PDFViewerApplication.pdfViewer._layerProperties.annotationEditorUIManager;
    const ed = ui.getEditors(0).find((e: any) => (e.__cyberTag || '').startsWith(pfx));
    const src: HTMLImageElement | HTMLCanvasElement | null = ed?.div?.querySelector('img') || ed?.div?.querySelector('canvas');
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src as CanvasImageSource, 0, 0, 16, 16);
    const d = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) continue;
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      n++;
    }
    n = n || 1;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  }, prefix);
}
async function clickStamp(page: Page, prefix: string, fx = 0.5, fy = 0.5) {
  const f = page.frames().find((fr) => fr.url().includes('viewer.html'))!;
  const box = await f.evaluate((pfx) => {
    const ui = (window as any).PDFViewerApplication.pdfViewer._layerProperties.annotationEditorUIManager;
    const ed = ui.getEditors(0).find((e: any) => (e.__cyberTag || '').startsWith(pfx));
    const r = ed.div.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, prefix);
  const ifr = (await page.locator('iframe[title="PDF document"]').boundingBox())!;
  await page.mouse.click(ifr.x + box.x + box.w * fx, ifr.y + box.y + box.h * fy);
}

/** Average colour of the crop preview image, [r,g,b]. */
async function cropPreviewColor(page: Page): Promise<[number, number, number]> {
  return page.locator('[data-image-crop="1"] img').evaluate((el) => {
    const img = el as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 16, 16);
    const d = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) continue;
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      n++;
    }
    n = n || 1;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

/** Click Print and return the number of pages in the generated PDF blob. */
async function printAndCountPages(page: Page): Promise<number> {
  const b64 = await page.evaluate(async () => {
    const btn = document.querySelector('[data-doc-print-submit="1"]') as HTMLButtonElement | null;
    if (!btn) return '';
    const blobs: Blob[] = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = ((obj: Blob | MediaSource) => {
      if (obj instanceof Blob && (obj.type === 'application/pdf' || obj.size > 500)) blobs.push(obj);
      return orig(obj);
    }) as typeof URL.createObjectURL;
    btn.click();
    const start = Date.now();
    while (Date.now() - start < 25000) {
      if (blobs.length) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    URL.createObjectURL = orig;
    if (!blobs.length) return '';
    const buf = new Uint8Array(await blobs[blobs.length - 1].arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return btoa(s);
  });
  if (!b64) return -1;
  const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  const task = getDocument({ data: bytes });
  const pdf = await task.promise;
  const n = pdf.numPages;
  await task.destroy();
  return n;
}

test.describe('Print editor keeps work (operator)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((auth) => localStorage.setItem('cc-auth', JSON.stringify(auth)), AUTH);
    await page.route('**/socket.io/**', (route) => route.abort());
    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/drive/download/')) {
        await route.fulfill({ status: 200, contentType: 'image/png', body: PAGE_PHOTO });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    page.on('dialog', (d) => d.accept().catch(() => {}));
  });

  test('toolbar is decluttered: no Color or A4 wide; Draw and Highlight kept', async ({ page }) => {
    test.setTimeout(60_000);
    await openEditor(page);
    // Removed tools are gone.
    await expect(page.locator('[data-doc-print-tool="color"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'A4 wide' })).toHaveCount(0);
    // The useful tools remain (including Draw and Highlight).
    for (const tool of ['crop', 'cleanup', 'select', 'text', 'draw', 'highlight', 'box', 'image', 'files', 'undo', 'redo']) {
      await expect(page.locator(`[data-doc-print-tool="${tool}"]`)).toHaveCount(1);
    }
    await expect(page.locator('select[aria-label="Filter"]')).toBeVisible();
    await expect(page.locator('[data-doc-print-copies="1"]')).toBeVisible();
    await expect(page.locator('[data-doc-print-nup="2"]')).toBeVisible();
    // Both papers still offered.
    await expect(page.getByRole('button', { name: 'A4', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '4×6' })).toBeVisible();
  });

  test('second document moves alone, Undo/Redo work, refresh keeps everything', async ({ page }) => {
    test.setTimeout(150_000);
    const frame = await openEditor(page);
    await expect(page.locator('[data-doc-print-tool="undo"]')).toBeDisabled();

    // Add the second document.
    await page.locator('[data-doc-print-image-input]').setInputFiles({
      name: 'second.png',
      mimeType: 'image/png',
      buffer: SECOND_DOC,
    });
    await page.locator('[data-crop-apply="1"]').click({ timeout: 15000 });
    await expect.poll(async () => (await editors(page)).filter((e) => e.type === 'stamp').length, { timeout: 15000 }).toBe(2);
    let eds = await editors(page);
    const parent = eds.find((e) => e.tag && !e.tag.startsWith('x'))!;
    const extra = eds.find((e) => e.tag.startsWith('x'))!;
    expect(parent && extra).toBeTruthy();

    // Clicking the second document selects only it.
    const extraBox = await frame.locator('.stampEditor').filter({ has: frame.locator('canvas') }).evaluateAll((els) => {
      const ui = (window as any).PDFViewerApplication.pdfViewer._layerProperties.annotationEditorUIManager;
      const ed = ui.getEditors(0).find((e: any) => e.__cyberTag?.startsWith('x'));
      const r = ed.div.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, n: els.length };
    });
    const ifr = (await page.locator('iframe[title="PDF document"]').boundingBox())!;
    const cx = ifr.x + extraBox.x + extraBox.w / 2;
    const cy = ifr.y + extraBox.y + extraBox.h / 2;
    await page.mouse.click(cx, cy);
    await expect.poll(async () => (await editors(page)).filter((e) => e.sel).map((e) => e.tag)).toEqual([extra.tag]);

    // Drag it: only the second document moves.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(cx + 6 * k, cy + 15 * k);
    await page.mouse.up();
    await page.waitForTimeout(800);
    eds = await editors(page);
    const movedExtra = eds.find((e) => e.tag === extra.tag)!;
    const sameParent = eds.find((e) => e.tag === parent.tag)!;
    expect(movedExtra.y - extra.y).toBeGreaterThan(0.05);
    expect(Math.abs(sameParent.x - parent.x)).toBeLessThan(0.002);
    expect(Math.abs(sameParent.y - parent.y)).toBeLessThan(0.002);

    // Undo the move, then Redo it.
    await expect(page.locator('[data-doc-print-tool="undo"]')).toBeEnabled();
    await page.locator('[data-doc-print-tool="undo"]').click();
    await expect.poll(async () => (await editors(page)).find((e) => e.tag === extra.tag)?.y).toBeCloseTo(extra.y, 2);
    await expect(page.locator('[data-doc-print-tool="redo"]')).toBeEnabled();
    await page.locator('[data-doc-print-tool="redo"]').click();
    await expect.poll(async () => (await editors(page)).find((e) => e.tag === extra.tag)?.y).toBeCloseTo(movedExtra.y, 2);

    // Text on the empty top margin.
    const pageBox = await frame.locator('.page').first().boundingBox();
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.locator('[data-doc-print-viewer-tool="text"]').click();
      await expect(frame.locator('#editorFreeTextButton')).toHaveAttribute('aria-expanded', 'true', { timeout: 8000 });
      await page.mouse.click(pageBox!.x + pageBox!.width * 0.3, pageBox!.y + pageBox!.height * 0.03);
      await page.waitForTimeout(300);
      await page.keyboard.type('Self attested');
      await page.locator('[data-doc-print-viewer-tool="select"]').click();
      const ok = await page
        .waitForFunction(
          () => {
            const fr = [...document.querySelectorAll('iframe')].find((f) => f.src.includes('viewer.html')) as HTMLIFrameElement;
            const ui = (fr?.contentWindow as any)?.PDFViewerApplication?.pdfViewer?._layerProperties?.annotationEditorUIManager;
            return !!ui?.getEditors(0).some((e: any) => e.editorType === 'freetext' && (e.div?.innerText || '').replace(/\s+/g, ' ').trim() === 'Self attested');
          },
          { timeout: 4000 },
        )
        .then(() => true)
        .catch(() => false);
      if (ok) break;
    }
    await expect.poll(async () => (await editors(page)).some((e) => e.type === 'freetext' && e.text === 'Self attested'), { timeout: 10000 }).toBe(true);

    // Whiteout is kept as its own item.
    await page.locator('[data-doc-print-tool="box"]').click();
    await expect.poll(async () => (await editors(page)).filter((e) => e.type === 'stamp').length, { timeout: 15000 }).toBe(3);
    await page.waitForTimeout(1500);

    // Refresh: second document (moved), whiteout and text all come back.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.frameLocator('iframe[title="PDF document"]').locator('.stampEditor').first()).toBeVisible({ timeout: 30000 });
    await expect.poll(async () => (await editors(page)).filter((e) => e.type === 'stamp').length, { timeout: 20000 }).toBe(3);
    await expect
      .poll(async () => (await editors(page)).some((e) => e.type === 'freetext' && e.text === 'Self attested'), { timeout: 15000 })
      .toBe(true);
    const back = (await editors(page)).find((e) => e.tag === extra.tag);
    expect(back).toBeTruthy();
    expect(back!.y).toBeCloseTo(movedExtra.y, 2);
    // Restored items are not an Undo step.
    await expect(page.locator('[data-doc-print-tool="undo"]')).toBeDisabled();

    // A filter change keeps them too.
    await page.locator('select[aria-label="Filter"]').selectOption('gray');
    await page.waitForTimeout(2000);
    await expect.poll(async () => (await editors(page)).filter((e) => e.type === 'stamp').length, { timeout: 25000 }).toBe(3);
    await expect.poll(async () => (await editors(page)).some((e) => e.type === 'freetext' && e.text === 'Self attested'), { timeout: 15000 }).toBe(true);
  });

  test('Crop targets the selected document, not the first one', async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);

    // Add the blue second document on top of the red customer page.
    await page.locator('[data-doc-print-image-input]').setInputFiles({
      name: 'second.png',
      mimeType: 'image/png',
      buffer: SECOND_DOC,
    });
    await page.locator('[data-crop-apply="1"]').click({ timeout: 15000 });
    await expect.poll(async () => (await editors(page)).filter((e) => e.type === 'stamp').length, { timeout: 15000 }).toBe(2);

    // Select the added (blue) document, then Crop → the cropper must show blue.
    await clickStamp(page, 'x');
    await expect.poll(async () => (await editors(page)).filter((e) => e.sel).map((e) => e.tag[0])).toEqual(['x']);
    await page.locator('[data-doc-print-tool="crop"]').click();
    await expect(page.locator('[data-image-crop="1"]')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(400);
    let [r, g, b] = await cropPreviewColor(page);
    expect(b, `expected blue doc, got rgb(${r},${g},${b})`).toBeGreaterThan(r + 30);
    await page.locator('[data-image-crop="1"]').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('[data-image-crop="1"]')).toBeHidden({ timeout: 10000 });

    // Select the parent (red) document at its top edge (clear of the blue doc), then Crop.
    await clickStamp(page, 'c', 0.5, 0.05);
    await expect.poll(async () => (await editors(page)).filter((e) => e.sel).map((e) => e.tag[0])).toEqual(['c']);
    await page.locator('[data-doc-print-tool="crop"]').click();
    await expect(page.locator('[data-image-crop="1"]')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(400);
    [r, g, b] = await cropPreviewColor(page);
    expect(r, `expected red doc, got rgb(${r},${g},${b})`).toBeGreaterThan(b + 30);
  });

  test('Filter applies to the selected photo only, or to all pages', async ({ page }) => {
    test.setTimeout(140_000);
    await openEditor(page);

    // Add the blue second document over the red customer page.
    await page.locator('[data-doc-print-image-input]').setInputFiles({
      name: 'second.png',
      mimeType: 'image/png',
      buffer: SECOND_DOC,
    });
    await page.locator('[data-crop-apply="1"]').click({ timeout: 15000 });
    await expect.poll(async () => (await editors(page)).filter((e) => e.type === 'stamp').length, { timeout: 15000 }).toBe(2);
    await page.waitForTimeout(1000);

    // Start from Original so colours are the source colours.
    await page.locator('[data-doc-print-filter-scope="all"]').click();
    await page.locator('select[aria-label="Filter"]').selectOption('original');
    await page.waitForTimeout(2500);
    let blue = await stampColor(page, 'x');
    let red = await stampColor(page, 'c');
    expect(blue[2], `blue doc b>r, got ${blue}`).toBeGreaterThan(blue[0] + 30);
    expect(red[0], `red doc r>b, got ${red}`).toBeGreaterThan(red[2] + 30);

    // Selected scope: grayscale the blue doc only. Red parent stays red.
    await page.locator('[data-doc-print-filter-scope="selected"]').click();
    await expect(page.locator('[data-doc-print-filter-scope="selected"]')).toHaveAttribute('aria-checked', 'true');
    await clickStamp(page, 'x');
    await expect.poll(async () => (await editors(page)).filter((e) => e.sel).map((e) => e.tag[0])).toEqual(['x']);
    await page.locator('select[aria-label="Filter"]').selectOption('gray');
    await page.waitForTimeout(3000);
    blue = await stampColor(page, 'x');
    red = await stampColor(page, 'c');
    expect(Math.abs(blue[0] - blue[2]), `blue doc now gray, got ${blue}`).toBeLessThan(14);
    expect(red[0], `red parent still red, got ${red}`).toBeGreaterThan(red[2] + 25);

    // All scope: grayscale everything. Red parent turns gray too.
    await page.locator('[data-doc-print-filter-scope="all"]').click();
    await page.locator('select[aria-label="Filter"]').selectOption('original');
    await page.waitForTimeout(2500);
    await page.locator('select[aria-label="Filter"]').selectOption('gray');
    await page.waitForTimeout(3000);
    red = await stampColor(page, 'c');
    blue = await stampColor(page, 'x');
    expect(Math.abs(red[0] - red[2]), `red parent now gray, got ${red}`).toBeLessThan(14);
    expect(Math.abs(blue[0] - blue[2]), `blue doc still gray, got ${blue}`).toBeLessThan(14);
  });

  test('Copies multiplies the job and N-up packs documents per sheet', async ({ page }) => {
    test.setTimeout(140_000);
    await openEditor(page);
    page.on('dialog', (d) => d.dismiss().catch(() => {}));

    // One document page. Copies = 3 → 3 printed pages.
    await page.locator('[data-doc-print-copies="1"]').fill('3');
    await page.locator('[data-doc-print-copies="1"]').dispatchEvent('input');
    await page.waitForTimeout(400);
    await expect.poll(async () => printAndCountPages(page), { timeout: 40000 }).toBe(3);

    // Back to a single copy.
    await page.locator('[data-doc-print-copies="1"]').fill('1');
    await page.locator('[data-doc-print-copies="1"]').dispatchEvent('input');
    await page.waitForTimeout(400);

    // Add more document pages: a blank sheet plus an image.
    await page.locator('[data-doc-print-blank="1"]').click();
    await page.waitForTimeout(1500);
    await page.locator('[data-doc-print-image-input]').setInputFiles({
      name: 'second.png',
      mimeType: 'image/png',
      buffer: SECOND_DOC,
    });
    await page.locator('[data-crop-apply="1"]').click({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Baseline at 1-up (whatever the job's page count is).
    const base1 = await printAndCountPages(page);
    expect(base1, 'multi-page job prints >1 sheet at 1-up').toBeGreaterThan(1);

    // 2-up packs two document pages per sheet → ceil(n/2) sheets.
    await page.locator('[data-doc-print-nup="2"]').click();
    await page.waitForTimeout(400);
    await expect.poll(async () => printAndCountPages(page), { timeout: 40000 }).toBe(Math.ceil(base1 / 2));

    // 4-up → ceil(n/4) sheets.
    await page.locator('[data-doc-print-nup="4"]').click();
    await page.waitForTimeout(400);
    await expect.poll(async () => printAndCountPages(page), { timeout: 40000 }).toBe(Math.ceil(base1 / 4));

    // 2-up, 2 copies → double the 2-up sheet count.
    await page.locator('[data-doc-print-nup="2"]').click();
    await page.locator('[data-doc-print-copies="1"]').fill('2');
    await page.locator('[data-doc-print-copies="1"]').dispatchEvent('input');
    await page.waitForTimeout(400);
    await expect.poll(async () => printAndCountPages(page), { timeout: 40000 }).toBe(Math.ceil(base1 / 2) * 2);
  });

  test('Card-ID docs land small at the top; a second card sits beside it', async ({ page }) => {
    test.setTimeout(120_000);
    // docType=aadhaar → card placement. The customer page itself is the card image.
    await page.goto('/app/photos/doc-print?fileId=drv-page&docType=aadhaar&paper=a4&from=/app/files&name=Shubham&phone=cust-1', {
      waitUntil: 'domcontentloaded',
    });
    const later = page.getByRole('button', { name: /^Later$/i });
    if (await later.isVisible().catch(() => false)) await later.click();
    const frame = page.frameLocator('iframe[title="PDF document"]');
    await expect(frame.locator('.stampEditor').first()).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(1500);

    const cards = () => editors(page).then((es) => es.filter((e) => e.type === 'stamp'));
    let cs = await cards();
    expect(cs.length).toBe(1);
    // A card box is small (well under half the page height) and near the top.
    expect(cs[0].h, `card height fraction ${cs[0].h}`).toBeLessThan(0.3);
    expect(cs[0].y, `card near top ${cs[0].y}`).toBeLessThan(0.1);

    // Add a second image → it snaps to the next card box, stacked below the first.
    await page.locator('[data-doc-print-image-input]').setInputFiles({
      name: 'second.png',
      mimeType: 'image/png',
      buffer: SECOND_DOC,
    });
    await page.locator('[data-crop-apply="1"]').click({ timeout: 15000 });
    await expect.poll(async () => (await cards()).length, { timeout: 15000 }).toBe(2);
    cs = (await cards()).sort((a, b) => a.x - b.x);
    expect(cs[1].h, `second card small ${cs[1].h}`).toBeLessThan(0.3);
    // Side by side: same top row, second card to the right of the first.
    expect(Math.abs(cs[0].y - cs[1].y), `same row (${cs[0].y} ≈ ${cs[1].y})`).toBeLessThan(0.05);
    expect(cs[1].x, `second card right of first (${cs[0].x} < ${cs[1].x})`).toBeGreaterThan(cs[0].x + 0.1);
  });

  test('A paired card (front+back via id-number) loads both cards side by side at the top', async ({ page }) => {
    test.setTimeout(90_000);
    // Simulates what the launcher produces after /customers/card-siblings pairing:
    // the opened card plus its sibling passed as fileIds → two stacked cards on open.
    await page.goto('/app/photos/doc-print?fileId=drv-page&fileIds=drv-back&docType=aadhaar&paper=a4&from=/app/files&name=Shubham&phone=cust-1', {
      waitUntil: 'domcontentloaded',
    });
    const later = page.getByRole('button', { name: /^Later$/i });
    if (await later.isVisible().catch(() => false)) await later.click();
    const frame = page.frameLocator('iframe[title="PDF document"]');
    await expect(frame.locator('.stampEditor').first()).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(1800);

    const cs = (await editors(page)).filter((e) => e.type === 'stamp').sort((a, b) => a.x - b.x);
    expect(cs.length, `two cards loaded`).toBe(2);
    // Both are small card boxes, side by side on the top row.
    expect(cs[0].h, `first card small ${cs[0].h}`).toBeLessThan(0.3);
    expect(cs[1].h, `second card small ${cs[1].h}`).toBeLessThan(0.3);
    expect(cs[0].y, `first near top ${cs[0].y}`).toBeLessThan(0.1);
    expect(Math.abs(cs[0].y - cs[1].y), `same row (${cs[0].y} ≈ ${cs[1].y})`).toBeLessThan(0.05);
    expect(cs[1].x, `second right of first (${cs[0].x} < ${cs[1].x})`).toBeGreaterThan(cs[0].x + 0.1);
  });

  test('Non-card docs still fill the page', async ({ page }) => {
    test.setTimeout(90_000);
    await openEditor(page); // no docType → normal fill-page layout
    await page.waitForTimeout(1000);
    const cs = (await editors(page)).filter((e) => e.type === 'stamp');
    expect(cs.length).toBe(1);
    // A filled page photo is tall (most of the sheet), unlike a card box.
    expect(cs[0].h, `fill height fraction ${cs[0].h}`).toBeGreaterThan(0.6);
  });
});
