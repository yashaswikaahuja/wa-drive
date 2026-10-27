import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';

/**
 * PDF Tools — end-to-end through the real shipped UI (production preview build).
 * Each tool: deep-link a source PDF from "Drive", run its op, intercept the
 * Download, and verify the resulting PDF's page count with pdf-lib. Also asserts
 * no horizontal overflow at desktop + phone widths, and that Save posts
 * source=printdoc (so output never shows in WhatsApp).
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

/** Build a labelled N-page PDF so pages are distinguishable. */
async function makePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`PAGE ${i + 1}`, { x: 40, y: 200, size: 40, color: rgb(0, 0, 0) });
  }
  return Buffer.from(await doc.save());
}

let lastUpload: { source?: string } = {};

async function setup(page: Page, pdf: Buffer) {
  lastUpload = {};
  await page.addInitScript((auth) => localStorage.setItem('cc-auth', JSON.stringify(auth)), AUTH);
  await page.route('**/socket.io/**', (route) => route.abort());
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('/drive/files/ws')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'drv-pdf1', driveFileId: 'drv-pdf1', fileName: 'customer_doc.pdf', customerId: '919000000001', customerName: 'Shubham', source: 'whatsapp' }]),
      });
      return;
    }
    if (url.includes('/drive/download/')) {
      await route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf });
      return;
    }
    if (url.includes('/customers/upload')) {
      const body = req.postData() || '';
      const m = /name="source"\r?\n\r?\n([^\r]+)/.exec(body);
      lastUpload.source = m ? m[1] : undefined;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, fileId: 'drv-out1', fileName: 'out.pdf' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function openTool(page: Page, tool: string) {
  await page.goto(`/app/photos/pdf/${tool}?fileId=drv-pdf1`, { waitUntil: 'domcontentloaded' });
  const later = page.getByRole('button', { name: /^Later$/i });
  if (await later.isVisible().catch(() => false)) await later.click();
  await expect(page.locator('[data-pdf-tool="1"]')).toBeVisible({ timeout: 15000 });
}

/** Click Download, capture the file, return its page count. */
async function downloadPageCount(page: Page): Promise<number> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-pdf-download="1"]').click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const doc = await PDFDocument.load(Buffer.concat(chunks), { ignoreEncryption: true });
  return doc.getPageCount();
}

async function noOverflow(page: Page) {
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW, `horizontal overflow: ${scrollW} > ${clientW}`).toBeLessThanOrEqual(clientW + 1);
}

test.describe('PDF Tools (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test.beforeEach(async ({ page }) => { await setup(page, await makePdf(5)); });

  test('hub lists all five tools with no overflow', async ({ page }) => {
    await page.goto('/app/photos/pdf?fileId=drv-pdf1', { waitUntil: 'domcontentloaded' });
    const later = page.getByRole('button', { name: /^Later$/i });
    if (await later.isVisible().catch(() => false)) await later.click();
    for (const t of ['organize', 'merge', 'split', 'compress', 'resize']) {
      await expect(page.locator(`[data-pdf-tool-card="${t}"]`)).toBeVisible();
    }
    await noOverflow(page);
  });

  test('Split: keep 1-3 → 3-page PDF; Save posts source=printdoc', async ({ page }) => {
    test.setTimeout(60_000);
    await openTool(page, 'split');
    await page.locator('[data-pdf-ranges="1"]').fill('1-3');
    await page.locator('[data-pdf-run="1"]').click();
    expect(await downloadPageCount(page)).toBe(3);
    // Save routes with the hidden-from-WhatsApp provenance.
    await page.locator('[data-pdf-save="1"]').click();
    await expect.poll(() => lastUpload.source, { timeout: 10000 }).toBe('printdoc');
    await noOverflow(page);
  });

  test('Organize: delete two pages → 3-page PDF', async ({ page }) => {
    test.setTimeout(60_000);
    await openTool(page, 'organize');
    await expect(page.locator('[data-pdf-grid="1"] [data-pdf-page]').first()).toBeVisible({ timeout: 20000 });
    // Delete the first page twice (list shifts up), leaving 3.
    await page.locator('[data-pdf-page="0"] [data-pdf-delete]').click();
    await page.locator('[data-pdf-page="0"] [data-pdf-delete]').click();
    await page.locator('[data-pdf-apply="1"]').click();
    expect(await downloadPageCount(page)).toBe(3);
    await noOverflow(page);
  });

  test('Organize: rotate + reorder still emits all 5 pages', async ({ page }) => {
    test.setTimeout(60_000);
    await openTool(page, 'organize');
    await expect(page.locator('[data-pdf-grid="1"] [data-pdf-page]').first()).toBeVisible({ timeout: 20000 });
    await page.locator('[data-pdf-page="0"] [data-pdf-rotate]').click();
    await page.locator('[data-pdf-page="0"] [data-pdf-move-down]').click();
    await page.locator('[data-pdf-apply="1"]').click();
    expect(await downloadPageCount(page)).toBe(5);
  });

  test('Merge: add the same PDF again → 10 pages', async ({ page }) => {
    test.setTimeout(60_000);
    await openTool(page, 'merge');
    await expect(page.locator('[data-pdf-list="1"] [data-pdf-item]')).toHaveCount(1);
    // Add a second copy via the hidden input.
    await page.locator('[data-pdf-add-input="1"]').setInputFiles({
      name: 'extra.pdf', mimeType: 'application/pdf', buffer: await makePdf(5),
    });
    await expect(page.locator('[data-pdf-list="1"] [data-pdf-item]')).toHaveCount(2);
    await page.locator('[data-pdf-combine="1"]').click();
    expect(await downloadPageCount(page)).toBe(10);
    await noOverflow(page);
  });

  test('Compress: produces a valid 5-page PDF and shows new size', async ({ page }) => {
    test.setTimeout(90_000);
    await openTool(page, 'compress');
    await page.locator('[data-pdf-level="small"]').click();
    await page.locator('[data-pdf-run="1"]').click();
    await expect(page.locator('[data-pdf-after="1"]')).toBeVisible({ timeout: 40000 });
    expect(await downloadPageCount(page)).toBe(5);
    await noOverflow(page);
  });

  test('Resize: A4 output keeps 5 pages', async ({ page }) => {
    test.setTimeout(60_000);
    await openTool(page, 'resize');
    await page.locator('[data-pdf-paper="a4"]').click();
    await page.locator('[data-pdf-run="1"]').click();
    expect(await downloadPageCount(page)).toBe(5);
    await noOverflow(page);
  });
});

test.describe('PDF Tools (phone)', () => {
  test.beforeEach(async ({ page }) => { await setup(page, await makePdf(5)); });

  test('phone: split runs and the action bar is reachable with no overflow', async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openTool(page, 'split');
    await page.locator('[data-pdf-ranges="1"]').fill('1-2');
    await page.locator('[data-pdf-run="1"]').click();
    await expect(page.locator('[data-pdf-actionbar="1"]')).toBeVisible();
    expect(await downloadPageCount(page)).toBe(2);
    await noOverflow(page);
  });
});
