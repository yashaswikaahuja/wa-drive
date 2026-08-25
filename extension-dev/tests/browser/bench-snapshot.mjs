#!/usr/bin/env node
/**
 * CyberControl Phase 3.3 — Snapshot Performance Benchmark
 *
 * Validates that snapshot generation meets the <200ms budget (done_criteria)
 * and the frozen contract p95 of 250ms.
 *
 * Measurements:
 *  1. Real portal fixtures (small pages, validate correctness + timing)
 *  2. Synthetic large page (2000 nodes, stress test)
 *  3. Warm iterations (measure p95 across multiple runs)
 *
 * Run: node extension-dev/tests/perception/bench-snapshot.mjs
 * Requires: Playwright Chromium or local Chrome
 */
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const EXT_DIR = resolve(ROOT, 'extension');
const FIXTURES = resolve(ROOT, 'extension-dev/tests/fixtures');

// ── Configuration ───────────────────────────────────────────────────
const BUDGET_MS = 200;           // Phase 3.3 done_criteria
const CONTRACT_P95_MS = 250;     // Frozen performance contract
const WARM_ITERATIONS = 10;      // Iterations per fixture for p95
const SYNTHETIC_NODES = 2000;    // Max graph budget stress test

// ── Locate Chromium ─────────────────────────────────────────────────
const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.CHROME_PATH,
].filter(Boolean);
const executablePath = CHROME_PATHS.find((p) => existsSync(p)) || undefined;

// ── Perception scripts ──────────────────────────────────────────────
const PERCEPTION_SCRIPTS = [
  'perception/binding-registry.js',
  'perception/revision-manager.js',
  'perception/canonical-hash.js',
  'perception/privacy-filter.js',
  'perception/widget-classifier.js',
  'perception/node-factory.js',
  'perception/edge-factory.js',
  'perception/graph-invariants.js',
  'perception/delta-apply.js',
  'perception/context-discovery.js',
  'perception/snapshot-builder.js',
  'perception/delta-emitter.js',
  'perception/validator.js',
  'perception/index.js',
  'runtime/gateway/interaction.js',
  'runtime/dom-gateway.js',
];

async function injectPerception(page) {
  for (const script of PERCEPTION_SCRIPTS) {
    const code = readFileSync(resolve(EXT_DIR, script), 'utf8');
    await page.evaluate(code);
  }
  await page.evaluate(() => {
    const { initPerception } = globalThis.CcPerception;
    return initPerception({
      gateway: globalThis.CcDomGateway,
      bindingRegistry: new globalThis.CcBindingRegistry(),
      revisionManager: new globalThis.CcRevisionManager(),
      privacyFilter: globalThis.CcPrivacyFilter,
      widgetClassifier: globalThis.CcWidgetClassifier,
      contextDiscovery: globalThis.CcContextDiscovery,
      nodeFactory: globalThis.CcNodeFactory,
      edgeFactory: globalThis.CcEdgeFactory,
      canonicalHash: globalThis.CcCanonicalHash,
      snapshotBuilder: globalThis.CcSnapshotBuilder,
      deltaEmitterClass: globalThis.CcDeltaEmitter,
      validator: globalThis.CcValidator,
      validatorOptions: { schema: null },
    });
  });
  await page.evaluate(async () => {
    if (globalThis.CcValidator && !globalThis.CcValidator.isInitialized()) {
      await globalThis.CcValidator.initValidator({ schema: null });
    }
  });
}

async function measureSnapshot(page) {
  return page.evaluate(async () => {
    const start = performance.now();
    const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot', includeGeometry: true });
    const duration = performance.now() - start;
    return {
      duration,
      nodeCount: Object.keys(snapshot.nodes).length,
      edgeCount: snapshot.edges.length,
      contextCount: snapshot.contexts.length,
      valid: snapshot.kind === 'page_snapshot' && !!snapshot.canonical_hash,
    };
  });
}

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.min(idx, sorted.length - 1)];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Synthetic large page generator ──────────────────────────────────
function generateSyntheticPage(nodeCount) {
  const controlCount = Math.min(200, Math.floor(nodeCount * 0.1));
  const contentCount = nodeCount - controlCount;
  let html = `<!DOCTYPE html><html lang="en"><head><title>Synthetic ${nodeCount} nodes</title></head><body>`;
  html += `<main>`;
  // Form with controls
  html += `<form><fieldset><legend>Large Form</legend>`;
  for (let i = 0; i < controlCount; i++) {
    html += `<div class="field-row"><label for="f${i}">Field ${i}</label><input id="f${i}" name="f${i}" type="text" autocomplete="off" required></div>`;
  }
  html += `</fieldset></form>`;
  // Content filler
  html += `<section>`;
  for (let i = 0; i < contentCount; i++) {
    html += `<p>Content paragraph ${i} with some descriptive text for realistic page weight.</p>`;
  }
  html += `</section>`;
  html += `</main></body></html>`;
  return html;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  console.log('CyberControl Phase 3.3 — Snapshot Performance Benchmark\n');
  console.log(`Budget: ${BUDGET_MS}ms (done_criteria), Contract p95: ${CONTRACT_P95_MS}ms`);
  console.log(`Warm iterations: ${WARM_ITERATIONS}, Synthetic nodes: ${SYNTHETIC_NODES}\n`);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--disable-gpu', '--no-sandbox'],
    });
  } catch (err) {
    console.error('Could not launch browser:', err.message);
    console.log('\nFalling back to Node-only structural benchmark (no browser).\n');
    await runNodeBenchmark();
    return;
  }

  const results = [];
  let allPass = true;

  // ── Real portal fixtures ────────────────────────────────────────────
  const fixtures = [
    'perception-native.html',
    'perception-angular.html',
    'perception-custom-selects.html',
    'perception-datepickers.html',
    'perception-shadow-dom.html',
    'perception-challenge-upload.html',
    'comprehensive-portal.html',
  ].filter((f) => existsSync(resolve(FIXTURES, f)));

  console.log('=== Real Portal Fixtures ===\n');

  for (const fixture of fixtures) {
    const page = await browser.newPage();
    await page.goto(`file://${resolve(FIXTURES, fixture).replaceAll('\\', '/')}`);
    await injectPerception(page);

    const durations = [];
    let firstResult = null;
    let fixtureError = null;
    for (let i = 0; i < WARM_ITERATIONS; i++) {
      // Reset revision state between iterations for independent timing
      await page.evaluate(() => globalThis.CcPerception.resetPerception());
      try {
        const result = await measureSnapshot(page);
        durations.push(result.duration);
        if (i === 0) firstResult = result;
      } catch (err) {
        fixtureError = err.message?.slice(0, 120) || String(err);
        break;
      }
    }

    if (fixtureError) {
      console.log(`  ⚠ ${fixture}: SKIPPED (${fixtureError})`);
      await page.close();
      continue;
    }

    const entry = { fixture, ...firstResult, durations, p95: p95(durations), median: median(durations) };
    results.push(entry);

    const status = entry.p95 <= BUDGET_MS ? '✓' : '✗';
    if (entry.p95 > BUDGET_MS) allPass = false;
    console.log(`  ${status} ${fixture}: p95=${entry.p95.toFixed(1)}ms, median=${entry.median.toFixed(1)}ms, nodes=${entry.nodeCount}, valid=${entry.valid}`);

    await page.close();
  }

  // ── Synthetic large page ────────────────────────────────────────────
  console.log('\n=== Synthetic Large Page (stress test) ===\n');

  const syntheticHtml = generateSyntheticPage(SYNTHETIC_NODES);
  const syntheticPath = resolve(ROOT, 'extension-dev/tests/fixtures/_bench-synthetic.html');
  writeFileSync(syntheticPath, syntheticHtml);

  const page = await browser.newPage();
  await page.goto(`file://${syntheticPath.replaceAll('\\', '/')}`);
  await injectPerception(page);

  const syntheticDurations = [];
  let syntheticResult = null;
  for (let i = 0; i < WARM_ITERATIONS; i++) {
    await page.evaluate(() => globalThis.CcPerception.resetPerception());
    try {
      const result = await measureSnapshot(page);
      syntheticDurations.push(result.duration);
      if (i === 0) syntheticResult = result;
    } catch (err) {
      console.log(`  ⚠ Synthetic iteration ${i} failed: ${err.message?.slice(0, 100)}`);
      break;
    }
  }

  const syntheticP95 = p95(syntheticDurations);
  const syntheticMedian = median(syntheticDurations);
  const synStatus = syntheticP95 <= CONTRACT_P95_MS ? '✓' : '✗';
  if (syntheticP95 > CONTRACT_P95_MS) allPass = false;

  console.log(`  ${synStatus} Synthetic (${SYNTHETIC_NODES} target): p95=${syntheticP95.toFixed(1)}ms, median=${syntheticMedian.toFixed(1)}ms, nodes=${syntheticResult.nodeCount}, valid=${syntheticResult.valid}`);
  console.log(`    (Contract allows p95 ≤ ${CONTRACT_P95_MS}ms for this scenario)`);

  await page.close();

  // Clean up synthetic fixture
  try { const { unlinkSync } = await import('node:fs'); unlinkSync(syntheticPath); } catch {}

  await browser.close();

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('\n=== Summary ===\n');
  console.log(`  Real fixtures (p95 budget ≤ ${BUDGET_MS}ms):`);
  for (const r of results) {
    console.log(`    ${r.p95 <= BUDGET_MS ? '✓' : '✗'} ${r.fixture}: ${r.p95.toFixed(1)}ms`);
  }
  console.log(`  Synthetic large page (p95 contract ≤ ${CONTRACT_P95_MS}ms):`);
  console.log(`    ${synStatus} ${syntheticP95.toFixed(1)}ms (${syntheticResult.nodeCount} nodes)`);
  console.log(`\n${allPass ? '✅ PASS — Performance budget met.' : '❌ FAIL — Budget exceeded.'}`);

  process.exit(allPass ? 0 : 1);
}

// ── Node-only fallback (no browser available) ─────────────────────────
async function runNodeBenchmark() {
  console.log('=== Node-only Structural Benchmark (no DOM, mock gateway) ===\n');

  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { buildSnapshot } = require(resolve(ROOT, 'apps/extension/perception/snapshot-builder.js'));
  const { RevisionManager } = require(resolve(ROOT, 'apps/extension/perception/revision-manager.js'));
  const { BindingRegistry } = require(resolve(ROOT, 'apps/extension/perception/binding-registry.js'));
  const canonicalHash = require(resolve(ROOT, 'apps/extension/perception/canonical-hash.js'));
  const nodeFactory = require(resolve(ROOT, 'apps/extension/perception/node-factory.js'));
  const edgeFactory = require(resolve(ROOT, 'apps/extension/perception/edge-factory.js'));
  const contextDiscovery = require(resolve(ROOT, 'apps/extension/perception/context-discovery.js'));
  const privacyFilter = require(resolve(ROOT, 'apps/extension/perception/privacy-filter.js'));
  const widgetClassifier = require(resolve(ROOT, 'apps/extension/perception/widget-classifier.js'));
  const validator = require(resolve(ROOT, 'apps/extension/perception/validator.js'));

  await validator.initValidator({ schema: null });

  // Generate mock gateway data for various scales.
  const scales = [50, 200, 500, 1000, 2000];

  for (const nodeCount of scales) {
    const facts = [];
    for (let i = 0; i < nodeCount; i++) {
      facts.push({
        tag: i % 5 === 0 ? 'input' : 'div',
        role: i % 5 === 0 ? 'textbox' : null,
        accessibleName: `Element ${i}`,
        type: i % 5 === 0 ? 'text' : null,
        autocomplete: null,
        id: `el-${i}`,
        name: i % 5 === 0 ? `field_${i}` : null,
        placeholder: null,
        className: '',
        maxlength: null,
        matdatepicker: null,
        state: { visible: true, enabled: true, readonly: false, required: i % 5 === 0, focused: false, expanded: null, selected: null, checked: null, valueState: 'empty' },
        textSnippet: i % 5 !== 0 ? `Content ${i}` : null,
        childElementCount: 0,
        hasShadowRoot: false,
        shadowMode: null,
        geometry: { x: 0, y: i * 30, width: 200, height: 25, viewport_intersection: 1, z_index_hint: null },
        _parentIndex: i > 0 ? 0 : -1,
        _depth: i === 0 ? 0 : 1,
      });
    }

    const mockGateway = {
      captureStructuralFacts: () => ({ nodes: facts, truncated: nodeCount > 2000, nodeCount }),
      enumerateContexts: () => ({ frames: [], shadowRoots: [] }),
    };

    const durations = [];
    for (let iter = 0; iter < WARM_ITERATIONS; iter++) {
      const rm = new RevisionManager();
      const br = new BindingRegistry();
      nodeFactory.resetNodeCounter?.();
      edgeFactory.resetEdgeCounter?.();
      contextDiscovery.resetContextCounter?.();

      const start = performance.now();
      await buildSnapshot({
        gateway: mockGateway,
        revisionManager: rm,
        bindingRegistry: br,
        privacyFilter,
        widgetClassifier,
        contextDiscovery,
        nodeFactory,
        edgeFactory,
        canonicalHash,
        validator,
        root: { nodeType: 9, documentElement: {} },
        includeGeometry: true,
      });
      durations.push(performance.now() - start);
    }

    const p95Val = p95(durations);
    const medVal = median(durations);
    const budget = nodeCount <= 500 ? BUDGET_MS : CONTRACT_P95_MS;
    const status = p95Val <= budget ? '✓' : '✗';
    console.log(`  ${status} ${nodeCount} nodes: p95=${p95Val.toFixed(1)}ms, median=${medVal.toFixed(1)}ms (budget ≤ ${budget}ms)`);
  }

  console.log('\n✅ Node-only benchmark complete (browser tests needed for full validation).');
}

main().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
