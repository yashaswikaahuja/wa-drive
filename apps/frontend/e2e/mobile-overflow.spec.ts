import { test, expect } from '@playwright/test';

/**
 * Smoke test: no page should overflow horizontally at a phone width.
 * Auth is seeded into localStorage and the API is mocked so each page
 * renders its shell without a live backend.
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

const photoSpec = encodeURIComponent(JSON.stringify({ width: 200, height: 230, minKB: 20, maxKB: 50, format: 'jpg', bg: 'white' }));
const sigSpec = encodeURIComponent(JSON.stringify({ width: 140, height: 60, minKB: 10, maxKB: 20, format: 'jpg', bg: 'white' }));

const routes: { name: string; path: string }[] = [
  { name: 'Dashboard', path: '/app' },
  { name: 'Customers', path: '/app/customers' },
  { name: 'Form Directory', path: '/app/forms' },
  { name: 'File Manager', path: '/app/files' },
  { name: 'Documents', path: '/app/whatsapp' },
  { name: 'Documents alias', path: '/app/documents' },
  { name: 'Photos home', path: '/app/photos' },
  { name: 'Photos — portal', path: '/app/photos/portal' },
  { name: 'Photos — print', path: '/app/photos/print' },
  { name: 'Photos — scan', path: '/app/photos/scan' },
  { name: 'Settings', path: '/app/settings' },
  { name: 'Operators', path: '/admin/operators' },
  { name: 'Prepare Photo', path: `/app/photos/portal?form=SSC%20CHSL&photo=${photoSpec}&signature=${sigSpec}` },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((auth) => {
    localStorage.setItem('cc-auth', JSON.stringify(auth));
  }, AUTH);
  // Mock REST so pages render without a backend; abort sockets to keep the
  // network quiet (socket.io would otherwise retry forever).
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/socket.io/**', (route) => route.abort());
});

for (const { name, path } of routes) {
  test(`no horizontal overflow — ${name}`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600); // let lazy chunk + reveal animations settle

    const { scrollW, clientW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));

    expect(
      scrollW,
      `${name}: document scrollWidth ${scrollW}px exceeds viewport ${clientW}px`
    ).toBeLessThanOrEqual(clientW + 1);
  });
}

test('Documents alias redirects to WhatsApp receive desk', async ({ page }) => {
  await page.goto('/app/documents', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/app\/whatsapp/);
});

/**
 * NPCI-style desktop rail: icon strip by default, expands while the pointer
 * is over it, collapses when the pointer leaves (unless pinned).
 */
test.describe('Desktop sidebar hover', () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    hasTouch: false,
  });

  test('expands on hover and collapses on leave', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cc-sidebar-pinned', '0');
      localStorage.removeItem('cc-sidebar-collapsed');
    });
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    const aside = page.locator('aside[data-sidebar]');
    await expect(aside).toBeVisible();
    await expect(aside).toHaveAttribute('data-sidebar', 'rail');
    await expect(aside).toHaveAttribute('aria-expanded', 'false');

    await aside.hover();
    await expect(aside).toHaveAttribute('data-sidebar', 'hover');
    await expect(aside).toHaveAttribute('aria-expanded', 'true');
    await expect(aside.getByText('Documents', { exact: true })).toBeVisible();

    await page.locator('main').hover({ position: { x: 200, y: 200 } });
    await expect(aside).toHaveAttribute('data-sidebar', 'rail');
    await expect(aside).toHaveAttribute('aria-expanded', 'false');
  });

  test('pin keeps sidebar open after pointer leaves', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cc-sidebar-pinned', '0');
    });
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    const aside = page.locator('aside[data-sidebar]');
    await aside.hover();
    await aside.getByRole('button', { name: 'Pin sidebar open' }).click();
    await expect(aside).toHaveAttribute('data-sidebar', 'pinned');

    await page.locator('main').hover({ position: { x: 200, y: 200 } });
    await expect(aside).toHaveAttribute('data-sidebar', 'pinned');
    await expect(aside).toHaveAttribute('aria-expanded', 'true');
  });
});
