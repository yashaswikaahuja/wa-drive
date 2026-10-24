import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { crc32, deflateSync } from 'node:zlib';

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

type Ed = { tag: string; type: string; x: number; y: number; sel: boolean; text: string };

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
    await page.locator('[data-doc-print-viewer-tool="text"]').click();
    const pageBox = await frame.locator('.page').first().boundingBox();
    await page.mouse.click(pageBox!.x + pageBox!.width * 0.3, pageBox!.y + pageBox!.height * 0.03);
    await page.keyboard.type('Self attested');
    await page.locator('[data-doc-print-viewer-tool="select"]').click();
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
});
