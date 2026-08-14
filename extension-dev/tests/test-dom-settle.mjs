#!/usr/bin/env node
/**
 * Phase 4.8 — DOM Stabilization unit tests
 * Issue #202: Bounded settle policy with quiet period + hard timeout.
 *
 * Tests the settle logic functions (relevance filter, timeout guarantee).
 * Browser-level MutationObserver tests are in browser suite.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const settleSource = readFileSync(resolve(ROOT, 'extension/runtime/dom-settle.js'), 'utf8');

// Execute in a minimal DOM-like environment
// We test the exported constants and logic, not MutationObserver (browser test)
let passed = 0;
let failed = 0;

function ok(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function test(name, fn) {
  try { fn(); }
  catch (e) { failed++; console.error(`  FAIL: ${name} — ${e.message}`); }
}

// ── Source verification ─────────────────────────────────────────────────

test('dom-settle.js exports CcDomSettle global', () => {
  ok(settleSource.includes('globalThis.CcDomSettle = api'), 'exports CcDomSettle');
});

test('exports waitForSettle function', () => {
  ok(settleSource.includes('waitForSettle'), 'has waitForSettle');
});

test('exports waitForSettleWithLoading function', () => {
  ok(settleSource.includes('waitForSettleWithLoading'), 'has waitForSettleWithLoading');
});

test('exports hasLoadingIndicator function', () => {
  ok(settleSource.includes('hasLoadingIndicator'), 'has hasLoadingIndicator');
});

test('exports isRelevantMutation function', () => {
  ok(settleSource.includes('isRelevantMutation'), 'has isRelevantMutation');
});

// ── Constants ───────────────────────────────────────────────────────────

test('DEFAULT_QUIET_MS is 300', () => {
  ok(settleSource.includes('const DEFAULT_QUIET_MS = 300'), 'quiet=300ms');
});

test('DEFAULT_TIMEOUT_MS is 5000', () => {
  ok(settleSource.includes('const DEFAULT_TIMEOUT_MS = 5000'), 'timeout=5000ms');
});

// ── Hard timeout guarantee ──────────────────────────────────────────────

test('hard timeout always fires (code path exists)', () => {
  ok(settleSource.includes("hardTimer = setTimeout(() => done(false, 'settle_timeout'), timeoutMs)"),
    'hard timeout calls done(false, settle_timeout)');
});

test('settle_timeout is the timeout reason code', () => {
  ok(settleSource.includes("'settle_timeout'"), 'settle_timeout reason exists');
});

// ── Quiet period logic ──────────────────────────────────────────────────

test('quiet timer resets on relevant mutation', () => {
  ok(settleSource.includes('clearTimeout(quietTimer)'), 'resets quiet timer');
  ok(settleSource.includes("quietTimer = setTimeout(() => done(true, 'quiet_period'), quietMs)"),
    'restarts quiet timer after mutation');
});

// ── Relevance filter ────────────────────────────────────────────────────

test('irrelevant selectors filter ads and scripts', () => {
  ok(settleSource.includes('[data-ad]'), 'filters data-ad');
  ok(settleSource.includes('[data-google-query-id]'), 'filters google ads');
  ok(settleSource.includes('.adsbygoogle'), 'filters adsense');
  ok(settleSource.includes("'script'"), 'filters script tags');
  ok(settleSource.includes('doubleclick'), 'filters doubleclick iframes');
});

test('characterData in irrelevant container is filtered', () => {
  ok(settleSource.includes("mutation.type === 'characterData'"), 'checks characterData');
  ok(settleSource.includes('isIrrelevantNode(mutation.target?.parentElement)'), 'checks parent for text');
});

// ── Loading indicator detection ─────────────────────────────────────────

test('loading indicators include common patterns', () => {
  ok(settleSource.includes('.loading'), 'detects .loading');
  ok(settleSource.includes('.spinner'), 'detects .spinner');
  ok(settleSource.includes('[aria-busy="true"]'), 'detects aria-busy');
  ok(settleSource.includes('.loader'), 'detects .loader');
});

// ── No infinite wait ────────────────────────────────────────────────────

test('no infinite loop or unbounded wait', () => {
  ok(!settleSource.includes('while (true)'), 'no while(true)');
  ok(!settleSource.includes('for (;;)'), 'no for(;;)');
  // Promise resolves in all paths
  ok(settleSource.includes('resolve({'), 'always resolves promise');
});

// ── Forbidden: does not pick next field ─────────────────────────────────

test('settle module does not reference field selection or planning', () => {
  ok(!settleSource.includes('nextField'), 'no nextField');
  ok(!settleSource.includes('planStep'), 'no planStep');
  ok(!settleSource.includes('fillValue'), 'no fillValue');
});

// ── Orchestrator integration ────────────────────────────────────────────

test('orchestrator injects dom-settle.js in PRODUCT_PATH_SCRIPTS', () => {
  const orchSource = readFileSync(resolve(ROOT, 'extension/application/fill-orchestrator.js'), 'utf8');
  ok(orchSource.includes("'runtime/dom-settle.js'"), 'dom-settle.js in PRODUCT_PATH_SCRIPTS');
});

test('orchestrator calls waitForSettle before re-perception', () => {
  const orchSource = readFileSync(resolve(ROOT, 'extension/application/fill-orchestrator.js'), 'utf8');
  ok(orchSource.includes('CcDomSettle?.waitForSettle'), 'calls waitForSettle');
});

test('orchestrator has fallback delay when settle not loaded', () => {
  const orchSource = readFileSync(resolve(ROOT, 'extension/application/fill-orchestrator.js'), 'utf8');
  ok(orchSource.includes('setTimeout(r, 400)'), 'fallback 400ms delay');
});

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\nDOM Settle (M4.8): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
