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

test.describe('File Manager phone folders drawer', () => {
  test('hamburger opens folders navigation drawer', async ({ page }) => {
    await page.goto('/app/files', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const openFolders = page.getByRole('button', { name: 'Open folders' });
    await expect(openFolders).toBeVisible();
    await openFolders.click();

    const drawer = page.getByRole('dialog', { name: 'Folders' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: /All customers/ })).toBeVisible();
    await expect(drawer.getByRole('button', { name: /Recent/ })).toBeVisible();
    await expect(drawer.getByPlaceholder('Search customers…')).toBeVisible();

    await drawer.getByRole('button', { name: 'Close folders' }).click();
    await expect(drawer).toHaveCount(0);
  });

  test('Recent view opens from drawer', async ({ page }) => {
    await page.route('**/drive/files/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'r1',
            fileName: 'aadhaar_front.jpg',
            customerId: '919006615450',
            customerName: 'Shubham Kumar',
            source: 'whatsapp',
            mimeType: 'image/jpeg',
            timestamp: '2026-10-14T10:00:00Z',
          },
          {
            id: 'r2',
            fileName: 'pan.pdf',
            customerId: '919031329418',
            customerName: 'Om~',
            source: 'whatsapp',
            mimeType: 'application/pdf',
            timestamp: '2026-10-13T10:00:00Z',
          },
        ]),
      });
    });

    await page.goto('/app/files', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: 'Open folders' }).click();
    const drawer = page.getByRole('dialog', { name: 'Folders' });
    await drawer.getByRole('button', { name: /Recent/ }).click();
    await expect(drawer).toHaveCount(0);

    await expect(page.getByPlaceholder('Search recent files…')).toBeVisible();
    await expect(page.getByText('Shubham Kumar').last()).toBeVisible();

    const filters = page.getByRole('tablist', { name: 'File type filter' });
    await expect(filters).toBeVisible();
    await expect(filters.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true');
    await filters.getByRole('tab', { name: /PDFs/ }).click();
    await expect(filters.getByRole('tab', { name: /PDFs/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Om~').last()).toBeVisible();
    await expect(page.getByText(/aadhaar/i)).toHaveCount(0);

    await filters.getByRole('tab', { name: /All/ }).click();
    const sort = page.getByRole('group', { name: 'Sort files' });
    await expect(sort.getByRole('button', { name: 'Newest' })).toHaveAttribute('aria-pressed', 'true');
    await sort.getByRole('button', { name: 'Name' }).click();
    await expect(sort.getByRole('button', { name: 'Name' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/aadhaar/i).first()).toBeVisible();
  });
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
