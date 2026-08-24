import { test, expect } from '@playwright/test';

const NAV_LINKS = ['How it works', 'For operators', 'Used for', 'Memory'];

test('no horizontal overflow on the landing page', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW, `scrollWidth ${scrollW}px exceeds viewport ${clientW}px`).toBeLessThanOrEqual(clientW + 1);
});

test('nav links are reachable', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const width = page.viewportSize()?.width ?? 0;
  const menuButton = page.getByRole('button', { name: /open menu/i });

  if (width < 768) {
    // Mobile: links live behind the hamburger.
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    const menu = page.getByTestId('mobile-menu');
    for (const label of NAV_LINKS) {
      await expect(menu.getByRole('link', { name: label })).toBeVisible();
    }
    await expect(menu.getByRole('link', { name: 'Sign in' })).toBeVisible();
    // Closes again
    await page.getByRole('button', { name: /close menu/i }).click();
    await expect(page.getByTestId('mobile-menu')).toHaveCount(0);
  } else {
    // Desktop: no hamburger, links shown inline in the header.
    await expect(menuButton).toHaveCount(0);
    const header = page.locator('header');
    for (const label of NAV_LINKS) {
      await expect(header.getByRole('link', { name: label })).toBeVisible();
    }
  }
});
