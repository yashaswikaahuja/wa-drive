import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const CLI_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(CLI_DIR, '../../..');

const DEFAULT_CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.CHROME_PATH,
  process.env.CC_CHROME_PATH,
].filter(Boolean);

export function resolveChromePath(override) {
  const candidates = [override, ...DEFAULT_CHROME].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

export async function launchBrowser(opts = {}) {
  let chromium;
  try {
    // Resolve from browser package install (same as APE harness)
    const browserPkg = resolve(ROOT, 'extension-dev/tests/browser/package.json');
    if (!existsSync(browserPkg)) {
      throw new Error('extension-dev/tests/browser/package.json missing');
    }
    const req = createRequire(browserPkg);
    ({ chromium } = req('playwright-core'));
    if (!chromium?.launch) throw new Error('playwright-core.chromium.launch missing');
  } catch (e) {
    throw new Error(
      'playwright-core not found. From repo root run:\n' +
        '  cd extension-dev/tests/browser && npm install\n' +
        `Underlying: ${e.message}`
    );
  }

  const executablePath = resolveChromePath(opts.chromePath) || undefined;
  const headed = !!(opts.headed || opts.keepOpen);
  const browser = await chromium.launch({
    headless: !headed,
    executablePath,
    args: ['--disable-web-security', '--allow-file-access-from-files'],
  });
  return { browser, executablePath: executablePath || '(playwright bundled / system default)', headed };
}

export { ROOT };
