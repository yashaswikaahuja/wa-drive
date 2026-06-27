import { defineConfig, devices } from '@playwright/test';

/**
 * Landing-site E2E. Uses a `.e2e.ts` testMatch so these specs don't collide
 * with the vitest unit tests (`*.test.ts` / `*.spec.ts`). Builds the site
 * and serves the production bundle on :4174, then runs against emulated
 * phone + desktop viewports.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4174' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'Pixel 5', use: { ...devices['Pixel 5'] } },
    { name: 'iPhone 12', use: { ...devices['iPhone 12'], browserName: 'chromium' } },
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
  ],
});
