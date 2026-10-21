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

/** 1×1 JPEG — fine for scale-only checks */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z',
  'base64',
);

/** Large SVG so focal zoom can shift the image center measurably */
const BIG_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <rect width="800" height="600" fill="#6b7280"/>
    <rect x="40" y="40" width="80" height="80" fill="#ef4444"/>
    <rect x="680" y="480" width="80" height="80" fill="#22c55e"/>
  </svg>`,
  'utf8',
);

function mockDriveRoutes(
  page: import('@playwright/test').Page,
  body: Buffer,
  contentType: string,
) {
  return page.route('**/api/**', async (route) => {
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
      await route.fulfill({ status: 200, contentType, body });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

test.describe('Media viewer image pinch zoom', () => {
  test.use({
    ...{ hasTouch: true },
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((auth) => {
      localStorage.setItem('cc-auth', JSON.stringify(auth));
    }, AUTH);
    await page.route('**/socket.io/**', (route) => route.abort());
    await mockDriveRoutes(page, TINY_JPEG, 'image/jpeg');
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

    await expect(dialog.locator('[data-mv-dock="1"]').getByText(/%/)).toBeVisible({ timeout: 3000 });
    const scale = await img.evaluate((el) => {
      const t = getComputedStyle(el).transform;
      if (!t || t === 'none') return 1;
      const m = t.match(/matrix\(([^,]+)/);
      return m ? Number(m[1]) : 1;
    });
    expect(scale).toBeGreaterThan(1.3);
  });

  test('pinch zooms toward the pinch midpoint', async ({ page }) => {
    await page.unroute('**/api/**');
    await mockDriveRoutes(page, BIG_SVG, 'image/svg+xml');
    await page.goto('/app/files?view=recent', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/aadhaar/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByText(/aadhaar/i).first().click();

    const dialog = page.getByRole('dialog');
    const img = dialog.locator('img[alt="aadhaar_front.jpg"]');
    await expect(img).toBeVisible();
    await expect.poll(async () => (await img.boundingBox())?.width ?? 0).toBeGreaterThan(100);

    const box = (await img.boundingBox())!;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    // Pinch on the upper-left quadrant (not the image center).
    const fx = box.x + box.width * 0.25;
    const fy = box.y + box.height * 0.25;

    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: fx - 40, y: fy },
        { x: fx + 40, y: fy },
      ],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: fx - 80, y: fy },
        { x: fx + 80, y: fy },
      ],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });

    await expect(dialog.locator('[data-mv-dock="1"]').getByText(/%/)).toBeVisible({ timeout: 3000 });
    const after = (await img.boundingBox())!;
    const afterCenterX = after.x + after.width / 2;
    // Zooming in left of center pushes the visual center right.
    expect(afterCenterX).toBeGreaterThan(centerX + 8);
    expect(after.y + after.height / 2).toBeGreaterThan(centerY + 8);
  });
});

test.describe('Media viewer desktop trackpad pinch', () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    hasTouch: false,
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((auth) => {
      localStorage.setItem('cc-auth', JSON.stringify(auth));
    }, AUTH);
    await page.route('**/socket.io/**', (route) => route.abort());
    await mockDriveRoutes(page, TINY_JPEG, 'image/jpeg');
  });

  test('dock chrome is visible and image is centered in the stage', async ({ page }) => {
    await page.goto('/app/files?view=recent', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/aadhaar/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByText(/aadhaar/i).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-mv-chrome', 'dock-v2');
    await expect(dialog.locator('[data-mv-topbar="1"]')).toBeVisible();
    await expect(dialog.locator('[data-mv-dock="1"]')).toBeVisible();

    const img = dialog.locator('img[alt="aadhaar_front.jpg"]');
    await expect(img).toBeVisible();
    await expect(img).toHaveClass(/object-center/);

    // Centered within the photo stage (between top bar and bottom dock).
    const offsetY = await page.evaluate(() => {
      const stage = document.querySelector('[data-pinch-surface="1"] .relative.flex-1');
      const image = document.querySelector('img[alt="aadhaar_front.jpg"]');
      if (!stage || !image) return 9999;
      const d = stage.getBoundingClientRect();
      const i = image.getBoundingClientRect();
      return i.top + i.height / 2 - (d.top + d.height / 2);
    });
    expect(Math.abs(offsetY)).toBeLessThanOrEqual(56);
  });

  test('ctrl+wheel zooms image only (not the page)', async ({ page }) => {
    await page.goto('/app/files?view=recent', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/aadhaar/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByText(/aadhaar/i).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const img = dialog.locator('img[alt="aadhaar_front.jpg"]');
    await expect(img).toBeVisible();

    const pageScaleBefore = await page.evaluate(() => window.visualViewport?.scale ?? 1);

    // Trackpad pinch = ctrl + wheel (must be cancelled by non-passive listener).
    await img.hover();
    await page.mouse.wheel(0, -400);
    // Playwright mouse.wheel does not set ctrlKey; dispatch a real WheelEvent with cursor coords.
    const box = (await img.boundingBox())!;
    await page.evaluate(
      ({ x, y }) => {
        window.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: -400,
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
        );
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );

    await expect(dialog.locator('[data-mv-dock="1"]').getByText(/%/)).toBeVisible({ timeout: 3000 });
    const scale = await img.evaluate((el) => {
      const t = getComputedStyle(el).transform;
      if (!t || t === 'none') return 1;
      const m = t.match(/matrix\(([^,]+)/);
      return m ? Number(m[1]) : 1;
    });
    expect(scale).toBeGreaterThan(1.2);

    const pageScaleAfter = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    expect(pageScaleAfter).toBe(pageScaleBefore);
  });

  test('ctrl+wheel zooms toward the cursor', async ({ page }) => {
    await page.unroute('**/api/**');
    await mockDriveRoutes(page, BIG_SVG, 'image/svg+xml');
    await page.goto('/app/files?view=recent', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/aadhaar/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByText(/aadhaar/i).first().click();

    const dialog = page.getByRole('dialog');
    const img = dialog.locator('img[alt="aadhaar_front.jpg"]');
    await expect(img).toBeVisible();
    await expect.poll(async () => (await img.boundingBox())?.width ?? 0).toBeGreaterThan(100);

    const box = (await img.boundingBox())!;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const fx = box.x + box.width * 0.2;
    const fy = box.y + box.height * 0.2;

    await page.evaluate(
      ({ x, y }) => {
        window.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: -500,
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
        );
      },
      { x: fx, y: fy },
    );

    await expect(dialog.locator('[data-mv-dock="1"]').getByText(/%/)).toBeVisible({ timeout: 3000 });
    const after = (await img.boundingBox())!;
    expect(after.x + after.width / 2).toBeGreaterThan(centerX + 8);
    expect(after.y + after.height / 2).toBeGreaterThan(centerY + 8);

    const tx = await img.evaluate((el) => {
      const t = getComputedStyle(el).transform;
      if (!t || t === 'none') return 0;
      const m = t.match(/matrix\(([^)]+)\)/);
      if (!m) return 0;
      const parts = m[1].split(',').map((v) => Number(v.trim()));
      return parts[4] ?? 0; // translate X
    });
    expect(tx).not.toBe(0);
  });

  test('zoom-out recenters after focal zoom-in on the opposite side', async ({ page }) => {
    await page.unroute('**/api/**');
    await mockDriveRoutes(page, BIG_SVG, 'image/svg+xml');
    await page.goto('/app/files?view=recent', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/aadhaar/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByText(/aadhaar/i).first().click();

    const dialog = page.getByRole('dialog');
    const img = dialog.locator('img[alt="aadhaar_front.jpg"]');
    await expect(img).toBeVisible();
    await expect.poll(async () => (await img.boundingBox())?.width ?? 0).toBeGreaterThan(100);

    const box = (await img.boundingBox())!;
    const midX = box.x + box.width / 2;
    const midY = box.y + box.height / 2;
    const rightX = box.x + box.width * 0.85;
    const leftX = box.x + box.width * 0.15;

    // Zoom in from the right edge (accumulates pan).
    await page.evaluate(
      ({ x, y }) => {
        window.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: -600,
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
        );
      },
      { x: rightX, y: midY },
    );
    await expect(dialog.locator('[data-mv-dock="1"]').getByText(/%/)).toBeVisible({ timeout: 3000 });

    // Zoom out from the left edge — must settle back to center at 1× (not a 50% stamp).
    for (let i = 0; i < 8; i++) {
      await page.evaluate(
        ({ x, y }) => {
          window.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY: 500,
              ctrlKey: true,
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
            }),
          );
        },
        { x: leftX, y: midY },
      );
    }

    await expect(dialog.getByRole('button', { name: /zoom in/i })).toBeVisible({ timeout: 3000 });
    await expect
      .poll(async () => {
        return img.evaluate((el) => {
          const t = getComputedStyle(el).transform;
          if (!t || t === 'none') return 1;
          const m = t.match(/matrix\(([^,]+)/);
          return m ? Number(m[1]) : 1;
        });
      })
      .toBeLessThanOrEqual(1.05);

    const after = (await img.boundingBox())!;
    const stage = dialog.locator('[data-pinch-surface="1"] .relative.flex-1');
    const stageBox = (await stage.boundingBox())!;
    const imgMidX = after.x + after.width / 2;
    const stageMidX = stageBox.x + stageBox.width / 2;
    expect(Math.abs(imgMidX - stageMidX)).toBeLessThanOrEqual(24);
    // Must not remain a shrunk off-center stamp.
    expect(after.width).toBeGreaterThan(box.width * 0.85);
  });

  test('drag pans when zoomed; double-click toggles zoom', async ({ page }) => {
    await page.unroute('**/api/**');
    await mockDriveRoutes(page, BIG_SVG, 'image/svg+xml');
    await page.goto('/app/files?view=recent', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/aadhaar/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByText(/aadhaar/i).first().click();

    const dialog = page.getByRole('dialog');
    const img = dialog.locator('img[alt="aadhaar_front.jpg"]');
    await expect(img).toBeVisible();
    await expect.poll(async () => (await img.boundingBox())?.width ?? 0).toBeGreaterThan(100);

    const box = (await img.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Zoom via toolbar (reliable under mobile project + desktop overrides).
    await dialog.getByRole('button', { name: /zoom in/i }).click();
    await expect(dialog.getByRole('button', { name: /reset zoom/i })).toBeVisible();
    await expect(dialog.locator('[data-mv-dock="1"]').getByText('200%', { exact: true })).toBeVisible({
      timeout: 3000,
    });

    // Wait for transition-transform to settle (150ms).
    await expect
      .poll(async () => {
        return img.evaluate((el) => {
          const t = getComputedStyle(el).transform;
          if (!t || t === 'none') return 1;
          const m = t.match(/matrix\(([^,]+)/);
          return m ? Number(m[1]) : 1;
        });
      })
      .toBeGreaterThan(1.5);

    const before = (await img.boundingBox())!;
    const beforeMidX = before.x + before.width / 2;

    // Drag right while zoomed — image should pan with the pointer.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy, { steps: 8 });
    await page.mouse.up();

    const after = (await img.boundingBox())!;
    expect(after.x + after.width / 2).toBeGreaterThan(beforeMidX + 20);

    // Double-click on the stage resets to 1×.
    await page.locator('[data-pinch-surface="1"]').evaluate((el, point) => {
      el.dispatchEvent(
        new MouseEvent('dblclick', {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          view: window,
        }),
      );
    }, { x: cx, y: cy });
    await expect(dialog.getByRole('button', { name: /zoom in/i })).toBeVisible({ timeout: 3000 });
    await expect
      .poll(async () => {
        return img.evaluate((el) => {
          const t = getComputedStyle(el).transform;
          if (!t || t === 'none') return 1;
          const m = t.match(/matrix\(([^,]+)/);
          return m ? Number(m[1]) : 1;
        });
      })
      .toBeLessThanOrEqual(1.05);
  });
});
