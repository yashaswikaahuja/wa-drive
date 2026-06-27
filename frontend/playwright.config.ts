import { defineConfig, devices } from '@playwright/test';

/**
 * Mobile-emulation E2E config. Builds the app and serves the production
 * bundle, then runs specs against an emulated phone viewport so we can
 * catch real mobile layout issues (e.g. horizontal overflow) reliably —
 * unlike ad-hoc headless screenshots, which don't honor narrow widths here.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'Pixel 5', use: { ...devices['Pixel 5'] } },
    // Emulate the iPhone 12 viewport/DPR but run on Chromium so the suite
    // needs only one browser download.
    { name: 'iPhone 12', use: { ...devices['iPhone 12'], browserName: 'chromium' } },
  ],
});
