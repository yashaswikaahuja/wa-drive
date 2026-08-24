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
  { name: 'Documents', path: '/app/whatsapp' },
  { name: 'Photos — prints', path: '/app/photos/prints' },
  { name: 'Photos — process', path: '/app/photos/process' },
  { name: 'Settings', path: '/app/settings' },
  { name: 'Admin Overview', path: '/admin' },
  { name: 'Sessions', path: '/admin/sessions' },
  { name: 'Mappings', path: '/admin/mappings' },
  { name: 'Corrections', path: '/admin/corrections' },
  { name: 'Prepare Photo', path: `/app/photos/form?form=SSC%20CHSL&photo=${photoSpec}&signature=${sigSpec}` },
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
