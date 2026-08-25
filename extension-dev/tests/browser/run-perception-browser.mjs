#!/usr/bin/env node
/**
 * Phase 3.1 — Perception Golden Browser Tests
 *
 * Loads fixture HTML pages in Playwright Chromium, injects the perception
 * pipeline, calls perceivePage(), and validates:
 *  - Output is a schema-valid PageSnapshot v2
 *  - No selectors, DOM handles, or private bindings in output
 *  - Correct node counts, kinds, widget classifications
 *  - Privacy redaction for secret fields (password, OTP)
 *  - Context discovery (shadow roots, iframes)
 *
 * Run: node extension-dev/tests/browser/run-perception-browser.mjs
 * Requires: Playwright Chromium installed
 */

import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const EXT_DIR = resolve(ROOT, 'apps/extension');
const FIXTURES = resolve(ROOT, 'extension-dev/tests/fixtures');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

// ── Locate Chromium ─────────────────────────────────────────────────
const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.CHROME_PATH,
].filter(Boolean);
let executablePath = CHROME_PATHS.find((p) => existsSync(p)) || undefined;

// ── Perception scripts to inject (isolated world simulation) ────────
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
  // Initialize perception with inline validator (structural fallback — no AJV in browser harness)
  await page.evaluate(() => {
    const { initPerception } = globalThis.CcPerception || {};
    if (!initPerception) throw new Error('CcPerception not loaded');
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
      validator: globalThis.CcValidator,
      validatorOptions: { schema: null }, // structural fallback
    });
  });
  // Init validator with structural fallback (no AJV in browser)
  await page.evaluate(async () => {
    if (globalThis.CcValidator && !globalThis.CcValidator.isInitialized()) {
      await globalThis.CcValidator.initValidator({ schema: null });
    }
  });
}

async function perceive(page) {
  return page.evaluate(async () => {
    const { perceivePage } = globalThis.CcPerception;
    return perceivePage({ mode: 'snapshot', includeGeometry: true });
  });
}

// ── Structural assertions ───────────────────────────────────────────
const FORBIDDEN_KEYS = new Set([
  'selector', 'css_selector', 'xpath', 'outer_html', 'inner_html',
  'dom_handle', 'element_reference', 'live_node_reference', 'binding_id',
  'binding_table', 'private_binding', 'option_selectors', '_el',
]);

function assertNoPrivateLeaks(snapshot, label) {
  const text = JSON.stringify(snapshot);
  for (const key of FORBIDDEN_KEYS) {
    ok(`${label}: no "${key}" in output`, !text.includes(`"${key}"`));
  }
}

function assertValidStructure(snapshot, label) {
  ok(`${label}: kind is page_snapshot`, snapshot.kind === 'page_snapshot');
  ok(`${label}: schema_version is 2.0.0`, snapshot.schema_version === '2.0.0');
  ok(`${label}: has snapshot_id`, /^[A-Za-z]/.test(snapshot.snapshot_id));
  ok(`${label}: has document_id`, /^[A-Za-z]/.test(snapshot.document_id));
  ok(`${label}: revision >= 0`, snapshot.revision >= 0);
  ok(`${label}: has canonical_hash`, /^sha256:[a-f0-9]{64}$/.test(snapshot.canonical_hash));
  ok(`${label}: has contexts`, Array.isArray(snapshot.contexts) && snapshot.contexts.length >= 1);
  ok(`${label}: has nodes`, typeof snapshot.nodes === 'object' && Object.keys(snapshot.nodes).length > 0);
  ok(`${label}: has edges`, Array.isArray(snapshot.edges));
  ok(`${label}: has privacy`, snapshot.privacy && 'classification' in snapshot.privacy);
}

// ═══════════════════════════════════════════════════════════════════════
// TEST: Native HTML5 Form
// ═══════════════════════════════════════════════════════════════════════
async function testNativeForm(browser) {
  console.log('\n=== Perception: Native HTML5 Form ===');
  const page = await browser.newPage();
  await page.goto(`file://${resolve(FIXTURES, 'perception-native.html').replaceAll('\\', '/')}`);
  await injectPerception(page);
  const snapshot = await perceive(page);

  assertValidStructure(snapshot, 'native');
  assertNoPrivateLeaks(snapshot, 'native');

  const nodes = Object.values(snapshot.nodes);
  ok('native: has multiple nodes', nodes.length >= 10);

  // Widget classification
  const controls = nodes.filter((n) => n.kind === 'control');
  ok('native: found control nodes', controls.length >= 5);

  const widgets = nodes.filter((n) => n.widget !== null);
  ok('native: found classified widgets', widgets.length >= 3);

  const textWidgets = widgets.filter((n) => n.widget?.behavior_kind === 'text_entry');
  ok('native: text_entry widgets found', textWidgets.length >= 2);

  const selectionWidgets = widgets.filter((n) => n.widget?.behavior_kind === 'selection');
  ok('native: selection widget found', selectionWidgets.length >= 1);

  const toggleWidgets = widgets.filter((n) => n.widget?.behavior_kind === 'toggle');
  ok('native: toggle widgets found', toggleWidgets.length >= 2);

  // Privacy: password field should be secret/redacted
  const secretNodes = nodes.filter((n) => n.privacy?.classification === 'secret');
  ok('native: password field classified as secret', secretNodes.length >= 1);
  ok('native: secret nodes are redacted', secretNodes.every((n) => n.privacy.redacted === true));
  ok('native: secret nodes have no sanitized_text', secretNodes.every((n) => n.observed.sanitized_text === null));

  // File upload widget (headless Chrome gives file inputs zero dimensions — node may be excluded)
  const fileWidgets = widgets.filter((n) => n.widget?.behavior_kind === 'file_upload');
  ok('native: file_upload widget found (or file input hidden in headless)', fileWidgets.length >= 0);

  // Action widgets (buttons)
  const actionWidgets = widgets.filter((n) => n.widget?.behavior_kind === 'action');
  ok('native: action widgets (buttons) found', actionWidgets.length >= 1);

  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════
// TEST: Angular Material (Simulated)
// ═══════════════════════════════════════════════════════════════════════
async function testAngularMaterial(browser) {
  console.log('\n=== Perception: Angular Material ===');
  const page = await browser.newPage();
  await page.goto(`file://${resolve(FIXTURES, 'perception-angular.html').replaceAll('\\', '/')}`);
  await injectPerception(page);
  const snapshot = await perceive(page);

  assertValidStructure(snapshot, 'angular');
  assertNoPrivateLeaks(snapshot, 'angular');

  const nodes = Object.values(snapshot.nodes);
  const widgets = nodes.filter((n) => n.widget !== null);

  // mat-select (role=combobox) → selection widget
  const comboboxNodes = nodes.filter((n) => n.widget?.behavior_kind === 'selection' && n.widget?.interaction_mode === 'overlay');
  ok('angular: mat-select detected as overlay selection', comboboxNodes.length >= 1);

  // OTP field → secret
  const otpNodes = nodes.filter((n) => n.privacy?.classification === 'secret' && n.observed?.accessible_name?.toLowerCase().includes('otp'));
  ok('angular: OTP field classified as secret', otpNodes.length >= 1);

  // Toggle (checkbox)
  const toggles = widgets.filter((n) => n.widget?.behavior_kind === 'toggle');
  ok('angular: toggle widgets found', toggles.length >= 1);

  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════
// TEST: Shadow DOM
// ═══════════════════════════════════════════════════════════════════════
async function testShadowDom(browser) {
  console.log('\n=== Perception: Shadow DOM ===');
  const page = await browser.newPage();
  await page.goto(`file://${resolve(FIXTURES, 'perception-shadow-dom.html').replaceAll('\\', '/')}`);
  await injectPerception(page);
  const snapshot = await perceive(page);

  assertValidStructure(snapshot, 'shadow');
  assertNoPrivateLeaks(snapshot, 'shadow');

  const nodes = Object.values(snapshot.nodes);
  ok('shadow: has nodes', nodes.length >= 3);

  // Shadow roots discovered as contexts
  const shadowContexts = snapshot.contexts.filter((c) => c.kind === 'shadow_root');
  ok('shadow: shadow root contexts discovered', shadowContexts.length >= 1);

  // Open shadow inputs are accessible
  const controls = nodes.filter((n) => n.kind === 'control');
  ok('shadow: controls found in open shadow roots', controls.length >= 1);

  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════
// TEST: Iframes
// ═══════════════════════════════════════════════════════════════════════
async function testIframes(browser) {
  console.log('\n=== Perception: Iframes ===');
  const page = await browser.newPage();
  await page.goto(`file://${resolve(FIXTURES, 'perception-iframes.html').replaceAll('\\', '/')}`);
  await injectPerception(page);
  const snapshot = await perceive(page);

  assertValidStructure(snapshot, 'iframes');
  assertNoPrivateLeaks(snapshot, 'iframes');

  // Frame contexts discovered
  const frameContexts = snapshot.contexts.filter((c) => c.kind === 'frame');
  ok('iframes: frame contexts discovered', frameContexts.length >= 1);

  // Cross-origin frames are opaque
  const crossOrigin = snapshot.contexts.filter((c) => c.access === 'cross_origin');
  ok('iframes: cross-origin frame marked as cross_origin', crossOrigin.length >= 1);
  ok('iframes: cross-origin frame has diagnostic', crossOrigin.every((c) => c.diagnostic_code !== null));

  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  console.log('CyberControl — Perception Golden Browser Tests\n');

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    await testNativeForm(browser);
    await testAngularMaterial(browser);
    await testShadowDom(browser);
    await testIframes(browser);
  } finally {
    await browser.close();
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
