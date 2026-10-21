import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

/**
 * Document print layout — JPEG from media-viewer Print lands on /app/photos/doc-print,
 * operator picks paper / adjusts, then Print builds a silent PDF.
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

test.describe('Document print layout', () => {
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

  test('loads A4 layout and prepares PDF on Print', async ({ page }) => {
    await page.goto(
      '/app/photos/doc-print?fileId=drv-doc1&paper=a4&from=/app/whatsapp&name=Shubham',
      { waitUntil: 'domcontentloaded' },
    );

    const root = page.locator('[data-doc-print="1"]');
    await expect(root).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: /print on paper/i })).toBeVisible();
    await expect(page.getByText(/For Shubham/)).toBeVisible();
    await expect(page.getByRole('button', { name: /A4 Portrait/i })).toBeVisible();

    // Switch paper
    await page.getByRole('button', { name: /A4 Landscape/i }).click();
    await expect(page.getByText(/Page 1 of 1/)).toBeVisible();

    // Stub printBlob path: iframe print — just ensure button works and busy clears
    await page.evaluate(() => {
      (window as any).__printCalls = 0;
      const orig = HTMLIFrameElement.prototype;
      // Observe iframe append as proxy for printBlob
      const obs = new MutationObserver((muts) => {
        for (const m of muts) {
          m.addedNodes.forEach((n) => {
            if (n instanceof HTMLIFrameElement) (window as any).__printCalls += 1;
          });
        }
      });
      obs.observe(document.body, { childList: true });
      (window as any).__printObs = obs;
    });

    await page.locator('[data-doc-print-submit="1"]').click();
    await expect(page.getByText(/Opening print dialog|Preparing PDF/i).first()).toBeVisible({
      timeout: 10000,
    });
    await expect
      .poll(async () => page.evaluate(() => (window as any).__printCalls || 0))
      .toBeGreaterThan(0);
  });
});
