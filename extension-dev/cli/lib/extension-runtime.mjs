/**
 * Launch Chromium with unpacked extension and run __ccDebugRun in the SW.
 * DEBUG BRANCH ONLY — never merge to master.
 */
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT, resolveChromePath } from './chrome.mjs';

const EXT_DIR = resolve(ROOT, 'extension');
const FIXTURES = resolve(ROOT, 'extension-dev/tests/fixtures');

export async function launchExtensionContext(opts = {}) {
  const browserPkg = resolve(ROOT, 'extension-dev/tests/browser/package.json');
  const req = createRequire(browserPkg);
  const { chromium } = req('playwright-core');
  const executablePath = resolveChromePath(opts.chromePath) || undefined;
  const extPath = resolve(EXT_DIR);
  if (!existsSync(join(extPath, 'manifest.json'))) {
    throw new Error(`Extension manifest missing at ${extPath}`);
  }
  if (!existsSync(join(extPath, 'background.js'))) {
    throw new Error(`background.js missing at ${extPath}`);
  }

  // Extensions require headed Chrome (not headless Chromium shell)
  const userDataDir = mkdtempSync(join(tmpdir(), 'cc-debug-ext-'));
  const launchArgs = [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
    '--allow-file-access-from-files',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
  ];

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      executablePath,
      args: launchArgs,
      ignoreDefaultArgs: ['--disable-extensions'],
    });
  } catch (e) {
    throw new Error(`Failed to launch Chrome with extension: ${e.message}`);
  }

  // Wait for MV3 service worker (poll — waitForEvent is flaky on first install)
  const deadline = Date.now() + (opts.timeoutMs || 45000);
  let worker = null;
  while (Date.now() < deadline) {
    const workers = context.serviceWorkers();
    if (workers.length) {
      worker = workers[0];
      break;
    }
    // Nudge: open a blank page so Chrome fully starts extension
    try {
      const p = context.pages()[0] || (await context.newPage());
      await p.goto('about:blank').catch(() => {});
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  if (!worker) {
    await context.close().catch(() => {});
    throw new Error(
      'No extension service worker appeared. ' +
        'Is Chrome blocking extensions? Try closing other Chrome instances. ' +
        `extPath=${extPath}`
    );
  }

  // Ensure bridge is present
  let ping = null;
  for (let i = 0; i < 30; i++) {
    try {
      worker = context.serviceWorkers()[0] || worker;
      ping = await worker.evaluate(() => {
        if (typeof globalThis.__ccDebugPing === 'function') return globalThis.__ccDebugPing();
        return {
          ok: false,
          error: 'bridge_missing',
          keys: Object.keys(globalThis).filter((k) => k.startsWith('__cc') || k.startsWith('Cc')).slice(0, 20),
        };
      });
      if (ping?.ok) break;
    } catch (e) {
      ping = { ok: false, error: String(e.message || e) };
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  if (!ping?.ok) {
    await context.close().catch(() => {});
    throw new Error(
      'Extension debug bridge not found in service worker. ' +
        'Ensure background.js has __ccDebugRun (debug/cc-cli branch). ' +
        JSON.stringify(ping)
    );
  }

  return { context, worker, ping, userDataDir, executablePath, extPath };
}

export function resolveFixtureUrl(fixtureOrUrl) {
  if (!fixtureOrUrl) {
    const def = resolve(FIXTURES, 'perception-native.html');
    return pathToFileURL(def).href;
  }
  if (/^https?:/i.test(fixtureOrUrl) || /^file:/i.test(fixtureOrUrl)) return fixtureOrUrl;
  const candidates = [
    resolve(fixtureOrUrl),
    resolve(FIXTURES, fixtureOrUrl),
    resolve(FIXTURES, fixtureOrUrl.endsWith('.html') ? fixtureOrUrl : `${fixtureOrUrl}.html`),
  ];
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error(`Fixture/URL not found: ${fixtureOrUrl}`);
  return pathToFileURL(hit).href;
}

/**
 * Open page in extension context, run __ccDebugRun, scan truth.
 */
export async function runExtensionFill(opts = {}) {
  const { context, worker, ping, executablePath } = await launchExtensionContext(opts);
  try {
    const page = await context.newPage();
    const url = resolveFixtureUrl(opts.fixture || opts.url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs || 60000 });

    // Find the tab id Chrome assigns (via SW)
    const tabId = await worker.evaluate(async (pageUrl) => {
      const tabs = await chrome.tabs.query({});
      // Prefer exact url match; file:// may vary on encoding
      let tab = tabs.find((t) => t.url === pageUrl);
      if (!tab) {
        const bare = pageUrl.split('?')[0];
        tab = tabs.find((t) => (t.url || '').startsWith(bare) || bare.endsWith((t.url || '').split('/').pop() || '___'));
      }
      if (!tab) {
        // last non-extension tab
        tab = tabs.filter((t) => t.url && !t.url.startsWith('chrome') && !t.url.startsWith('chrome-extension')).pop();
      }
      return tab?.id || null;
    }, url);

    if (!tabId) {
      throw new Error('Could not resolve chrome.tabs id for fixture page');
    }

    const runOpts = {
      tabId,
      mode: opts.mode || 'offline',
      maxSteps: opts.maxSteps || 5,
      forceLie: !!opts.forceLie,
      plan: opts.plan || null,
      profile: opts.profile || null,
      backendUrl: opts.backendUrl || null,
      accessToken: opts.accessToken || null,
      executionPreference: opts.executionPreference || 'AUTO',
      runtimeVersion: 'debug-cli-ext',
    };

    const result = await worker.evaluate(async (o) => {
      if (typeof globalThis.__ccDebugRun !== 'function') {
        return { ok: false, error: 'bridge_missing' };
      }
      return globalThis.__ccDebugRun(o);
    }, runOpts);

    // Also page-side main world scan (Playwright page context = main world)
    const pageMainScan = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input, select, textarea')).map((el) => ({
        tag: el.tagName,
        id: el.id || null,
        name: el.name || null,
        type: el.type || null,
        value: 'value' in el ? String(el.value ?? '') : null,
        checked: 'checked' in el ? !!el.checked : null,
      }))
    );

    if (opts.keepOpen) {
      console.log('--keep-open: leaving extension browser open 90s...');
      await page.waitForTimeout(90_000);
    }

    return {
      result,
      pageMainScan,
      tabId,
      url,
      ping,
      executablePath,
    };
  } finally {
    if (!opts.keepOpen) {
      await context.close().catch(() => {});
    }
  }
}
