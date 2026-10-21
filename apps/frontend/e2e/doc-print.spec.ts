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
      if (url.includes('/drive/download/')) {
        await route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  });

  test('4×6 PDF MediaBox matches paper; print iframe uses 4×6 mm', async ({ page }) => {
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

    await page.screenshot({ path: 'C:/Users/yasha/AppData/Local/Temp/doc-print-op/01-a4-loaded.png', fullPage: true });

    // Operator picks 4×6
    await page.getByRole('button', { name: /4×6/i }).click();
    await expect(page.locator('[data-doc-print-paper]')).toHaveAttribute('data-doc-print-paper', '4x6');
    await expect(page.getByText(/Selected:.*4×6/i)).toBeVisible();
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
});
