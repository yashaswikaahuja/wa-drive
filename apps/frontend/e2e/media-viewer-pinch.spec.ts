import { test, expect } from '@playwright/test';

/**
 * Image preview pinch-to-zoom in @cybercontrol/media-viewer (File Manager).
 * touchAction:none blocks browser page zoom; content scale must follow two-finger pinch.
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

/** 1×1 JPEG */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z',
  'base64',
);

test.describe('Media viewer image pinch zoom', () => {
  test.use({
    ...{ hasTouch: true },
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((auth) => {
      localStorage.setItem('cc-auth', JSON.stringify(auth));
    }, AUTH);
    await page.route('**/socket.io/**', (route) => route.abort());
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/drive/files')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'img1',
              fileName: 'aadhaar_front.jpg',
              customerId: '919006615450',
              customerName: 'Shubham Kumar',
              source: 'whatsapp',
              mimeType: 'image/jpeg',
              timestamp: '2026-10-14T10:00:00Z',
              driveFileId: 'drv-img1',
            },
          ]),
        });
        return;
      }
      if (url.includes('/drive/download/')) {
        await route.fulfill({
          status: 200,
          contentType: 'image/jpeg',
          body: TINY_JPEG,
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  });

  test('pinch scales image and shows zoom percent', async ({ page }) => {
    await page.goto('/app/files?view=recent', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/aadhaar/i).first()).toBeVisible({ timeout: 10000 });

    await page.getByText(/aadhaar/i).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const img = dialog.locator('img[alt="aadhaar_front.jpg"]');
    await expect(img).toBeVisible();

    const box = await img.boundingBox();
    expect(box).toBeTruthy();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    const client = await page.context().newCDPSession(page);
    // Start pinch (fingers 80px apart)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: cx - 40, y: cy },
        { x: cx + 40, y: cy },
      ],
    });
    // Spread to ~2× (160px apart)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: cx - 80, y: cy },
        { x: cx + 80, y: cy },
      ],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });

    await expect(dialog.getByText(/%/)).toBeVisible({ timeout: 3000 });
    const scale = await img.evaluate((el) => {
      const t = getComputedStyle(el).transform;
      if (!t || t === 'none') return 1;
      const m = t.match(/matrix\(([^,]+)/);
      return m ? Number(m[1]) : 1;
    });
    expect(scale).toBeGreaterThan(1.3);
  });
});
