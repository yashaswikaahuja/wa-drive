/**
 * One-shot: does CDP isolated-world value set show up in page main world?
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '../../..');
const req = createRequire(resolve(ROOT, 'extension-dev/tests/browser/package.json'));
const { chromium } = req('playwright-core');
const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  process.env.CHROME_PATH,
].find((p) => p && existsSync(p));

const browser = await chromium.launch({ headless: true, executablePath: chrome });
const page = await browser.newPage();
await page.goto('data:text/html,<input id="t">');
const client = await page.context().newCDPSession(page);
const { frameTree } = await client.send('Page.getFrameTree');
const frameId = frameTree.frame.id;
const { executionContextId } = await client.send('Page.createIsolatedWorld', {
  frameId,
  worldName: 'cc_debug_iso',
  grantUniveralAccess: true,
});
await client.send('Runtime.evaluate', {
  expression: 'document.querySelector("#t").value = "ISO_VALUE"',
  contextId: executionContextId,
  returnByValue: true,
});
const v = await page.evaluate(() => document.querySelector('#t').value);
console.log(JSON.stringify({ executionContextId, mainWorldValue: v, isolatedWritesReachMain: v === 'ISO_VALUE' }));
await browser.close();
process.exit(v === 'ISO_VALUE' ? 0 : 1);
