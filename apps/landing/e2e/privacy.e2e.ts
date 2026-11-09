import { test, expect } from '@playwright/test';

test('privacy policy is a crawlable page', async ({ page }) => {
  const res = await page.goto('/privacy', { waitUntil: 'domcontentloaded' });
  expect(res?.ok(), `GET /privacy status ${res?.status()}`).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible();
  await expect(page.getByText('We do not sell customer data')).toBeVisible();
  await expect(page.getByRole('heading', { name: '4. Chrome extension' })).toBeVisible();
});
