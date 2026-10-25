import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { crc32, deflateSync } from 'node:zlib';

/**
 * Operator walkthrough: JPEG → paper layout → PDF at exact page size.
 * Guards the bug where 4×6 layout still produced/printed as A4
 * (jsPDF portrait swapped landscape custom sizes; printBlob defaulted iframe to A4).
 */

const AUTH = {
  state: {
    accessToken: 'e2e-token',
    refreshToken: 'e2e-refresh',
    user: {
      id: 'u1',
      workspaceId: 'ws_e2e0001',
      name: 'Test Operator',
      email: 'qa@example.com',
      role: 'admin',
    },
    isAuthenticated: true,
  },
  version: 0,
};

const PNG = readFileSync('C:/Users/yasha/AppData/Local/Temp/doc-print-fixture.png');

function pngChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, sum]);
}

/** 8×8 solid RGB PNG, so a crop can be told apart from another page. */
function solidPng(r: number, g: number, b: number) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(8 * 25);
  for (let y = 0; y < 8; y++) {
    const o = y * 25;
    for (let x = 0; x < 8; x++) {
      raw[o + 1 + x * 3] = r;
      raw[o + 2 + x * 3] = g;
      raw[o + 3 + x * 3] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

test.describe('Document print layout (operator)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((auth) => {
      localStorage.setItem('cc-auth', JSON.stringify(auth));
    }, AUTH);
    await page.route('**/socket.io/**', (route) => route.abort());
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/drive/files/ws')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'drv-photo1',
              fileName: 'customer.jpg',
              fileUrl: 'https://api.cybercontrol.fun/api/drive/download/drv-photo1',
              customerName: 'Shubham',
            },
          ]),
        });
        return;
      }
      if (url.includes('/drive/download/')) {
        await route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  });

  test('4×6 PDF MediaBox matches paper; print iframe uses 4×6 mm', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(
      '/app/photos/doc-print?fileId=drv-doc1&paper=a4&from=/app/whatsapp&name=Shubham',
      { waitUntil: 'domcontentloaded' },
    );

    // Dismiss shop-location gate if present (blocks clicks otherwise).
    const later = page.getByRole('button', { name: /^Later$/i });
    if (await later.isVisible().catch(() => false)) await later.click();

    const root = page.locator('[data-doc-print="1"]');
    await expect(root).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-doc-print-paper]')).toHaveAttribute('data-doc-print-paper', 'a4');
    await expect(page.locator('[data-doc-print-surface]')).toHaveCount(0);
    await expect(page.locator('[data-doc-print-stage="1"]')).toHaveCount(0);

    await page.screenshot({ path: 'C:/Users/yasha/AppData/Local/Temp/doc-print-op/01-a4-loaded.png', fullPage: true });

    // Operator picks 4×6. Wait until THAT sheet is the open PDF, not the previous A4.
    await page.getByRole('button', { name: /4×6/i }).click();
    await expect(page.locator('[data-doc-print-paper]')).toHaveAttribute('data-doc-print-paper', '4x6');
    await expect(page.locator('[data-doc-print-paper]')).toContainText(/4×6/);
    await expect(page.locator('[data-doc-print-pdf="1"]')).toHaveAttribute(
      'data-doc-print-sheet',
      '152.4x101.6',
      { timeout: 25000 },
    );
    await expect(page.locator('select[aria-label="Filter"]')).toHaveValue('auto');

    const frame = page.frameLocator('iframe[title="PDF document"]');
    const pdfPage = frame.locator('.page').first();
    await expect(pdfPage).toBeVisible({ timeout: 25000 });
    // Thumbnails stay closed so the page gets the full width (they covered it on phones).
    await expect(frame.locator('#thumbnailView')).toBeHidden({ timeout: 15000 });
    const sheet = await pdfPage.boundingBox();
    const vp = page.viewportSize();
    expect(sheet).toBeTruthy();
    expect(sheet!.width).toBeGreaterThan((vp?.width ?? 1280) * 0.4);
    expect(sheet!.height).toBeGreaterThan(240);

    // Crop the photo already on the sheet. Wait until that rebuild is the open PDF, then move it.
    const stamp = frame.locator('.stampEditor[data-cyber-placed="1"]').first();
    await expect(stamp).toBeVisible({ timeout: 20000 });
    await page.locator('[data-doc-print-viewer-tool="crop"]').click();
    await expect(page.locator('[data-image-crop="1"]')).toBeVisible();
    await expect(page.locator('[data-crop-handle]')).toHaveCount(4);
    const dot = page.locator('[data-crop-handle="br"]');
    const dotBox = await dot.boundingBox();
    expect(dotBox).toBeTruthy();
    await page.mouse.move(dotBox!.x + dotBox!.width / 2, dotBox!.y + dotBox!.height / 2);
    await page.mouse.down();
    await expect(page.locator('[data-crop-loupe="1"]')).toBeVisible();
    await page.mouse.move(dotBox!.x + dotBox!.width / 2 - 48, dotBox!.y + dotBox!.height / 2 - 32, { steps: 8 });
    await page.mouse.up();
    await page.locator('[data-crop-apply="1"]').click();
    // Crop now updates the photo live (no sheet reload), so just confirm it stays placed.
    await expect(page.locator('[data-image-crop="1"]')).toHaveCount(0, { timeout: 15000 });
    await expect(stamp).toBeVisible({ timeout: 20000 });
    await page.locator('select[aria-label="Filter"]').selectOption('whiteboard');
    await expect(stamp).toBeVisible({ timeout: 20000 });
    const before = await stamp.boundingBox();
    expect(before).toBeTruthy();
    await stamp.click();
    await expect(stamp.locator('.resizer').first()).toBeVisible({ timeout: 5000 });
    const start = await stamp.boundingBox();
    await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
    await page.mouse.down();
    await page.mouse.move(start!.x + start!.width / 2 + 80, start!.y + start!.height / 2, { steps: 10 });
    await page.mouse.up();
    const moved = await stamp.boundingBox();
    expect(moved!.x).toBeGreaterThan(before!.x + 24);

    const sized = await stamp.boundingBox();
    const handle = stamp.locator('.resizer.bottomRight');
    const hb = await handle.boundingBox();
    expect(hb).toBeTruthy();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb!.x + hb!.width / 2 + 48, hb!.y + hb!.height / 2 + 36, { steps: 8 });
    await page.mouse.up();
    const grown = await stamp.boundingBox();
    expect(grown!.width).toBeGreaterThan(sized!.width + 12);

    // One toolbar edits the PDF itself.
    await expect(frame.locator('#editorFreeTextButton')).toBeEnabled({ timeout: 20000 });
    await page.locator('[data-doc-print-viewer-tool="text"]').click();
    await expect(frame.locator('#editorFreeTextButton')).toHaveAttribute('aria-expanded', 'true', { timeout: 10000 });
    await page.screenshot({ path: 'C:/Users/yasha/AppData/Local/Temp/doc-print-op/02-4x6-selected.png', fullPage: true });

    // Wait until Download is enabled (pages loaded).
    const downloadBtn = page.locator('[data-doc-print-download="1"]');
    await expect(downloadBtn).toBeEnabled({ timeout: 10000 });

    // Also capture real download if Chromium emits one.
    const downloadPromise = page.waitForEvent('download', { timeout: 12000 }).catch(() => null);

    // Capture PDF blob via createObjectURL hook; wait until busy clears.
    const box = await page.evaluate(async () => {
      const btn = document.querySelector('[data-doc-print-download="1"]') as HTMLButtonElement | null;
      if (!btn || btn.disabled) return { error: 'download disabled' };

      const blobs: Blob[] = [];
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((obj: Blob | MediaSource) => {
        if (obj instanceof Blob && (obj.type === 'application/pdf' || obj.size > 500)) {
          blobs.push(obj as Blob);
        }
        return orig(obj);
      }) as typeof URL.createObjectURL;

      btn.click();

      // Poll up to 8s for PDF blob (async React handler + jsPDF).
      const start = Date.now();
      while (Date.now() - start < 8000) {
        if (blobs.length) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      URL.createObjectURL = orig;

      // Surface toast errors if any
      const toastText = Array.from(document.querySelectorAll('[data-sonner-toast], .toast, [role="status"]'))
        .map((el) => el.textContent || '')
        .join(' | ');

      if (!blobs.length) {
        return { error: 'no pdf blob', toast: toastText.slice(0, 300) };
      }
      const text = await blobs[blobs.length - 1].text();
      const m = text.match(/\/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/);
      if (!m) return { error: 'no mediabox', head: text.slice(0, 200), toast: toastText.slice(0, 200) };
      const wPt = Number(m[3]) - Number(m[1]);
      const hPt = Number(m[4]) - Number(m[2]);
      return {
        w: (wPt * 25.4) / 72,
        h: (hPt * 25.4) / 72,
        size: blobs[blobs.length - 1].size,
        type: blobs[blobs.length - 1].type,
      };
    });

    expect(box, JSON.stringify(box)).toMatchObject({ w: expect.any(Number), h: expect.any(Number) });
    expect((box as { error?: string }).error).toBeUndefined();
    // 4×6 landscape = 152.4 × 101.6 mm
    expect((box as { w: number }).w).toBeGreaterThan(140);
    expect((box as { w: number }).w).toBeLessThan(165);
    expect((box as { h: number }).h).toBeGreaterThan(90);
    expect((box as { h: number }).h).toBeLessThan(115);

    const download = await downloadPromise;
    if (download) {
      await download.saveAs('C:/Users/yasha/AppData/Local/Temp/doc-print-op/document_4x6.pdf');
    }

    // Print: iframe must advertise 4×6 mm (not hard-coded A4 210×297)
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await page.locator('[data-doc-print-submit="1"]').click();
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const el = document.querySelector('iframe[data-print-w-mm]');
            if (!el) return null;
            return {
              w: Number(el.getAttribute('data-print-w-mm')),
              h: Number(el.getAttribute('data-print-h-mm')),
            };
          }),
        { timeout: 10000 },
      )
      .toEqual({ w: 152.4, h: 101.6 });
    await page.screenshot({ path: 'C:/Users/yasha/AppData/Local/Temp/doc-print-op/03-after-print.png', fullPage: true });
  });

  test('blank paper is the PDF editor and can add a page', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/app/photos/doc-print?paper=a4&from=/app/whatsapp&name=Shubham', {
      waitUntil: 'domcontentloaded',
    });
    const later = page.getByRole('button', { name: /^Later$/i });
    if (await later.isVisible().catch(() => false)) await later.click();

    await expect(page.locator('[data-doc-print="1"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-doc-print-surface]')).toHaveCount(0);
    await expect(page.locator('[data-doc-print-stage="1"]')).toHaveCount(0);
    await expect(page.locator('[data-doc-print-pdf="1"]')).toHaveAttribute('data-doc-print-sheet', '210x297', {
      timeout: 25000,
    });

    const frame = page.frameLocator('iframe[title="PDF document"]');
    await expect(frame.locator('#viewerContainer')).toBeVisible({ timeout: 20000 });
    await expect(frame.locator('.page').first()).toBeVisible({ timeout: 20000 });
    await expect(frame.locator('#cyberBackButton')).toHaveCount(0);
    await expect(frame.locator('#editorFreeTextButton')).toBeEnabled({ timeout: 20000 });
    await expect(page.locator('[data-doc-print-pdf-tools="1"]')).toBeVisible();
    await expect(frame.locator('#editorModeButtons')).toBeHidden();

    await page.locator('[data-doc-print-blank="1"]').click();
    await expect(frame.locator('#numPages')).toContainText('2', { timeout: 30000 });
  });

  test('crop uses the open page, not the first photo', async ({ page }) => {
    test.setTimeout(90_000);
    const red = solidPng(220, 20, 20);
    const blue = solidPng(20, 20, 220);
    await page.route('**/drive/download/**', async (route) => {
      const url = route.request().url();
      const body = url.includes('drv-page2') ? blue : red;
      await route.fulfill({ status: 200, contentType: 'image/png', body });
    });
    await page.goto(
      '/app/photos/doc-print?fileId=drv-page1&fileIds=drv-page2&paper=a4&from=/app/whatsapp&name=Shubham',
      { waitUntil: 'domcontentloaded' },
    );
    const later = page.getByRole('button', { name: /^Later$/i });
    if (await later.isVisible().catch(() => false)) await later.click();

    const frame = page.frameLocator('iframe[title="PDF document"]');
    await expect(frame.locator('#numPages')).toContainText('2', { timeout: 30000 });
    // Placing a photo switches the viewer onto that page. Wait until both are down.
    const pageStamp = (n: number) =>
      frame.locator(`.page[data-page-number="${n}"] .stampEditor[data-cyber-placed="1"]`);
    await expect(pageStamp(2)).toBeVisible({ timeout: 30000 });

    const show = async (n: number) => {
      await expect.poll(async () => {
        const pdf = page.frames().find((f) => f.url().includes('viewer.html'));
        if (!pdf) return 0;
        return pdf.evaluate((target) => {
          const app = (window as unknown as {
            PDFViewerApplication?: {
              pagesCount?: number;
              page: number;
              pdfViewer?: { currentPageNumber?: number };
            };
          }).PDFViewerApplication;
          if (!app?.pdfViewer || (app.pagesCount || 0) < target) return 0;
          app.page = target;
          return app.pdfViewer.currentPageNumber || 0;
        }, n);
      }, { timeout: 15000 }).toBe(n);
    };

    const sampleCrop = async () => {
      const cropImg = page.locator('[data-image-crop="1"] img');
      await expect(cropImg).toBeVisible({ timeout: 10000 });
      return cropImg.evaluate(async (img: HTMLImageElement) => {
        if (!img.complete) await img.decode();
        const c = document.createElement('canvas');
        c.width = 4;
        c.height = 4;
        const g = c.getContext('2d');
        if (!g) return null;
        g.drawImage(img, 0, 0, 4, 4);
        const d = g.getImageData(2, 2, 1, 1).data;
        return [d[0], d[1], d[2]];
      });
    };

    await show(1);
    await page.locator('[data-doc-print-viewer-tool="crop"]').click();
    const onFirst = await sampleCrop();
    expect(onFirst?.[0], `page 1 rgb ${onFirst}`).toBeGreaterThan(180);
    expect(onFirst?.[2], `page 1 rgb ${onFirst}`).toBeLessThan(80);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('[data-image-crop="1"]')).toHaveCount(0);

    await show(2);
    await page.locator('[data-doc-print-viewer-tool="crop"]').click();
    const onSecond = await sampleCrop();
    expect(onSecond?.[2], `page 2 rgb ${onSecond}`).toBeGreaterThan(180);
    expect(onSecond?.[0], `page 2 rgb ${onSecond}`).toBeLessThan(80);

    await page.locator('[data-crop-apply="1"]').click();
    await expect(page.locator('[data-image-crop="1"]')).toHaveCount(0);
    await expect(pageStamp(2)).toBeVisible({ timeout: 30000 });

    await page.locator('[data-doc-print-blank="1"]').click();
    await expect(frame.locator('#numPages')).toContainText('3', { timeout: 30000 });
    await expect(pageStamp(2)).toBeVisible({ timeout: 30000 });
    await show(3);
    await page.locator('[data-doc-print-viewer-tool="crop"]').click();
    await expect(page.getByText('This page has no photo to crop')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('[data-image-crop="1"]')).toHaveCount(0);
  });

  test('PDF viewer accepts text and a File Manager image, print stays A4', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(
      '/app/photos/doc-print?paper=a4&from=/app/whatsapp&name=Shubham&phone=cust-shubham',
      { waitUntil: 'domcontentloaded' },
    );
    const later = page.getByRole('button', { name: /^Later$/i });
    if (await later.isVisible().catch(() => false)) await later.click();

    await expect(page.locator('[data-doc-print-pdf="1"]')).toHaveAttribute('data-doc-print-sheet', '210x297', {
      timeout: 25000,
    });
    const frame = page.frameLocator('iframe[title="PDF document"]');
    const textBtn = frame.locator('#editorFreeTextButton');
    await expect(frame.locator('.page').first()).toBeVisible({ timeout: 20000 });
    await expect(textBtn).toBeEnabled({ timeout: 20000 });
    await page.locator('[data-doc-print-viewer-tool="text"]').click();
    await expect(textBtn).toHaveAttribute('aria-expanded', 'true', { timeout: 10000 });

    const many = Array.from({ length: 70 }, (_, i) => ({
      id: i === 0 ? 'drv-photo1' : `drv-extra-${i}`,
      fileName: i === 0 ? 'customer.jpg' : `photo-${String(i).padStart(2, '0')}.jpg`,
      fileUrl: 'https://api.cybercontrol.fun/api/drive/download/drv-photo1',
      customerId: 'cust-shubham',
      customerName: 'Shubham',
    }));
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/drive/files/ws')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(many) });
        return;
      }
      if (url.includes('/drive/download/')) {
        await route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const dialog = page.getByRole('dialog');
    await page.locator('[data-doc-print-viewer-tool="files"]').click();
    await expect(dialog).toHaveAttribute('data-drive-picker-folder', 'Shubham', { timeout: 15000 });
    await expect(dialog.locator('[data-drive-picker-list="1"] button')).toHaveCount(70);
    await expect(dialog.getByText('70 items')).toBeVisible();
    await dialog.getByRole('button', { name: 'Back to folders' }).click();
    await expect(dialog).toHaveAttribute('data-drive-picker-folder', '');
    await dialog.getByRole('button', { name: /Shubham/ }).click();
    await expect(dialog.locator('[data-drive-picker-list="1"] button')).toHaveCount(70);
    await dialog.getByRole('button', { name: /customer\.jpg/i }).click();
    await expect(page.locator('[data-image-crop="1"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-crop-handle]')).toHaveCount(4);
    await page.locator('[data-crop-apply="1"]').click();
    await expect(frame.locator('.stampEditor').first()).toBeVisible({ timeout: 15000 });

    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    const box = await page.evaluate(async () => {
      const btn = document.querySelector('[data-doc-print-submit="1"]') as HTMLButtonElement | null;
      if (!btn) return { error: 'no print' };
      const blobs: Blob[] = [];
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((obj: Blob | MediaSource) => {
        if (obj instanceof Blob && (obj.type === 'application/pdf' || obj.size > 500)) blobs.push(obj);
        return orig(obj);
      }) as typeof URL.createObjectURL;
      btn.click();
      const start = Date.now();
      while (Date.now() - start < 15000) {
        if (blobs.length) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      URL.createObjectURL = orig;
      if (!blobs.length) return { error: 'no pdf blob' };
      const text = await blobs[blobs.length - 1].text();
      const m = text.match(/\/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/);
      if (!m) return { error: 'no mediabox', head: text.slice(0, 180) };
      const wPt = Number(m[3]) - Number(m[1]);
      const hPt = Number(m[4]) - Number(m[2]);
      return { w: (wPt * 25.4) / 72, h: (hPt * 25.4) / 72 };
    });
    expect(box, JSON.stringify(box)).toMatchObject({ w: expect.any(Number), h: expect.any(Number) });
    expect((box as { error?: string }).error).toBeUndefined();
    expect((box as { w: number }).w).toBeGreaterThan(200);
    expect((box as { w: number }).w).toBeLessThan(220);
    expect((box as { h: number }).h).toBeGreaterThan(285);
    expect((box as { h: number }).h).toBeLessThan(310);
  });
});
