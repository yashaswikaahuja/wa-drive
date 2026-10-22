import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

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

    const frame = page.frameLocator('iframe[title="PDF document"]');
    const pdfPage = frame.locator('.page').first();
    await expect(pdfPage).toBeVisible({ timeout: 25000 });
    await expect(frame.locator('#thumbnailView')).toBeVisible({ timeout: 15000 });
    const sheet = await pdfPage.boundingBox();
    const vp = page.viewportSize();
    expect(sheet).toBeTruthy();
    expect(sheet!.width).toBeGreaterThan((vp?.width ?? 1280) * 0.4);
    expect(sheet!.height).toBeGreaterThan(240);

    // Crop the photo already on the sheet. Wait until that rebuild is the open PDF, then move it.
    const stamp = frame.locator('.stampEditor[data-cyber-placed="1"]').first();
    await expect(stamp).toBeVisible({ timeout: 20000 });
    const pdf = page.locator('[data-doc-print-pdf="1"]');
    const readyBeforeCrop = await pdf.getAttribute('data-doc-print-ready');
    await page.locator('[data-doc-print-viewer-tool="crop"]').click();
    await expect(page.locator('[data-image-crop="1"]')).toBeVisible();
    await page.locator('[data-crop-apply="1"]').click();
    await expect(pdf).not.toHaveAttribute('data-doc-print-ready', readyBeforeCrop || '0', { timeout: 25000 });
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
