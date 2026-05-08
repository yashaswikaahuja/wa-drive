// tests/validate-adapters.js
// Playwright-based adapter validation — tests each saved adapter against the live form
'use strict';

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ADAPTERS_FILE = path.resolve(__dirname, '../data/adapters.json');
const CHROMIUM_PATH = '/usr/bin/chromium';
const TIMEOUT = 20000;

function getAllAdapters() {
  try {
    const raw = JSON.parse(fs.readFileSync(ADAPTERS_FILE, 'utf8'));
    const result = [];
    for (const [hostname, components] of Object.entries(raw)) {
      for (const [componentClass, adapter] of Object.entries(components)) {
        result.push({ hostname, componentClass, ...adapter });
      }
    }
    return result;
  } catch { return []; }
}

function markStale(hostname, componentClass) {
  try {
    const raw = JSON.parse(fs.readFileSync(ADAPTERS_FILE, 'utf8'));
    if (raw[hostname]?.[componentClass]) {
      raw[hostname][componentClass].stale = true;
      raw[hostname][componentClass].lastValidatedAt = new Date().toISOString();
      fs.writeFileSync(ADAPTERS_FILE, JSON.stringify(raw, null, 2));
    }
  } catch {}
}

function markActive(hostname, componentClass) {
  try {
    const raw = JSON.parse(fs.readFileSync(ADAPTERS_FILE, 'utf8'));
    if (raw[hostname]?.[componentClass]) {
      raw[hostname][componentClass].stale = false;
      raw[hostname][componentClass].lastValidatedAt = new Date().toISOString();
      fs.writeFileSync(ADAPTERS_FILE, JSON.stringify(raw, null, 2));
    }
  } catch {}
}

async function validateAdapter(adapter) {
  const url = `https://${adapter.hostname}`;
  const result = { hostname: adapter.hostname, componentClass: adapter.componentClass, status: 'unknown', detail: '' };

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      timeout: TIMEOUT,
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

    // Check if the trigger selector exists on the page
    const triggerExists = await page.locator(adapter.triggerSelector).count() > 0;
    if (!triggerExists) {
      result.status = 'stale';
      result.detail = `triggerSelector "${adapter.triggerSelector}" not found on ${url}`;
      markStale(adapter.hostname, adapter.componentClass);
      return result;
    }

    // Check if the component class exists
    const compExists = await page.locator(`div.${adapter.componentClass}`).count() > 0;
    if (!compExists) {
      result.status = 'stale';
      result.detail = `componentClass "div.${adapter.componentClass}" not found on ${url}`;
      markStale(adapter.hostname, adapter.componentClass);
      return result;
    }

    result.status = 'ok';
    result.detail = `triggerSelector and componentClass found on ${url}`;
    markActive(adapter.hostname, adapter.componentClass);
  } catch (e) {
    result.status = 'error';
    result.detail = e.message.slice(0, 200);
    // Network errors don't mark as stale — site may be temporarily down
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  return result;
}

// Run validation for all adapters sequentially (1 at a time — low memory VM)
async function validateAll() {
  const adapters = getAllAdapters();
  console.log(`[CC] validate-adapters: checking ${adapters.length} adapters`);
  const results = [];
  for (const adapter of adapters) {
    console.log(`[CC] validating ${adapter.hostname}/${adapter.componentClass}...`);
    const r = await validateAdapter(adapter);
    console.log(`[CC] result: ${r.status} — ${r.detail}`);
    results.push(r);
  }
  return results;
}

module.exports = { validateAll, validateAdapter, getAllAdapters };
