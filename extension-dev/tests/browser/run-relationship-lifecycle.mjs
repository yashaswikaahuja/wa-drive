#!/usr/bin/env node
/**
 * IMP-P1-04 (#133) — Browser relationship lifecycle regression
 *
 * Verifies labels relationship appears, then disappears after DOM mutation,
 * new perception revises graph, composed PageDelta is invariant-valid,
 * and no stale labels edge survives node removal.
 *
 * Run: node extension-dev/tests/browser/run-relationship-lifecycle.mjs
 */
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const EXT_DIR = resolve(ROOT, 'extension');
const require = createRequire(import.meta.url);
const { applyPageDelta, validateComposedGraph } = require(resolve(ROOT, 'extension/perception/delta-apply.js'));
const { validateGraphInvariants } = require(resolve(ROOT, 'extension/perception/graph-invariants.js'));

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.CHROME_PATH,
].filter(Boolean);
const executablePath = CHROME_PATHS.find((p) => existsSync(p)) || undefined;

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
  'runtime/dom-gateway.js',
];

const FIXTURE_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Rel Lifecycle</title></head>
<body>
<form id="f">
  <label id="lab" for="name">Full Name</label>
  <input id="name" type="text" name="name" />
  <button type="submit" id="go">Submit</button>
</form>
</body></html>`;

async function inject(page) {
  for (const s of PERCEPTION_SCRIPTS) {
    await page.evaluate(readFileSync(resolve(EXT_DIR, s), 'utf8'));
  }
  await page.evaluate(async () => {
    await globalThis.CcValidator.initValidator({ schema: null });
    await globalThis.CcPerception.initPerception({
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
    });
  });
}

async function perceive(page) {
  return page.evaluate(async () => globalThis.CcPerception.perceivePage({ mode: 'snapshot' }));
}

function labelEdges(snapshot) {
  return (snapshot.edges || []).filter((e) => e.type === 'labels');
}

function edgeKeys(snapshot) {
  return new Set((snapshot.edges || []).map((e) => `${e.type}|${e.source_id}|${e.target_id}`));
}

function diffOps(base, next) {
  // Minimal op construction for edges/nodes by id (mirrors delta-emitter intent)
  const ops = [];
  const baseNodes = new Set(Object.keys(base.nodes));
  const nextNodes = new Set(Object.keys(next.nodes));
  for (const id of baseNodes) {
    if (!nextNodes.has(id)) ops.push({ op: 'remove', entity: 'node', id });
  }
  for (const id of nextNodes) {
    if (!baseNodes.has(id)) ops.push({ op: 'add', entity: 'node', id, value: next.nodes[id] });
  }
  const baseEdges = new Map(base.edges.map((e) => [e.edge_id, e]));
  const nextEdges = new Map(next.edges.map((e) => [e.edge_id, e]));
  for (const [id] of baseEdges) {
    if (!nextEdges.has(id)) ops.push({ op: 'remove', entity: 'edge', id });
  }
  for (const [id, e] of nextEdges) {
    if (!baseEdges.has(id)) ops.push({ op: 'add', entity: 'edge', id, value: e });
  }
  return ops;
}

async function main() {
  console.log('CyberControl — Relationship Lifecycle Browser Tests (#133)\n');
  const browser = await chromium.launch({
    headless: true,
    executablePath,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(FIXTURE_HTML, { waitUntil: 'domcontentloaded' });
    await inject(page);

    const snap0 = await perceive(page);
    ok('rev0 is page_snapshot', snap0.kind === 'page_snapshot');
    const gi0 = validateGraphInvariants(snap0);
    ok('rev0 graph invariants valid', gi0.valid, gi0.errors?.slice(0, 3).join('; '));
    const labels0 = labelEdges(snap0);
    ok('rev0 has labels relationship', labels0.length >= 1, `count=${labels0.length}`);
    ok('rev0 has contains edges', snap0.edges.some((e) => e.type === 'contains'));
    ok('rev0 no depends_on', !snap0.edges.some((e) => e.type === 'depends_on'));

    // SPA-like mutation: remove label element
    await page.evaluate(() => {
      document.getElementById('lab')?.remove();
    });

    // Force new document lifecycle for a clean re-perception of mutated DOM
    // (same page document; revision advances via revisionManager)
    const snap1 = await page.evaluate(async () => {
      // Reset node/edge counters so IDs are fresh but graph reflects new DOM
      if (globalThis.CcNodeFactory?.resetNodeCounter) globalThis.CcNodeFactory.resetNodeCounter();
      if (globalThis.CcEdgeFactory?.resetEdgeCounter) globalThis.CcEdgeFactory.resetEdgeCounter();
      return globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
    });

    ok('rev1 is page_snapshot', snap1.kind === 'page_snapshot');
    ok('rev1 revision > rev0', snap1.revision > snap0.revision);
    const gi1 = validateGraphInvariants(snap1);
    ok('rev1 graph invariants valid', gi1.valid, gi1.errors?.slice(0, 3).join('; '));
    const labels1 = labelEdges(snap1);
    ok('rev1 has no labels edge after label removal', labels1.length === 0, `count=${labels1.length}`);

    // No stale "Full Name" content node as label source
    const contentWithName = Object.values(snap1.nodes).filter(
      (n) => n.kind === 'content' && /Full Name/i.test(n.observed?.sanitized_text || '')
    );
    ok('rev1 no Full Name content node', contentWithName.length === 0);

    // Build typed delta ops (node_ids may churn between full re-perceives —
    // when ids churn, composition of edge ops alone is not meaningful.
    // We still prove: (1) each snapshot invariant-valid; (2) labels removed;
    // (3) when node_ids are stable, composition works — unit-tested in test-delta-apply.
    // Here, also run composition when we force same document_id and synthesize
    // ops using semantic edge keys via full node replace strategy.
    const semanticDelta = {
      kind: 'page_delta',
      schema_version: '2.0.0',
      producer: snap1.producer,
      document_id: snap1.document_id,
      base_snapshot_id: snap0.snapshot_id,
      base_revision: snap0.revision,
      revision: snap1.revision,
      observed_at: snap1.observed_at,
      result_snapshot_id: snap1.snapshot_id,
      result_canonical_hash: snap1.canonical_hash,
      // Replace contexts + nodes + edges for full lifecycle composition proof
      operations: [
        ...(snap0.contexts || []).map((c) => ({ op: 'remove', entity: 'context', id: c.context_id })),
        ...(snap1.contexts || []).map((c) => ({
          op: 'add', entity: 'context', id: c.context_id, value: c,
        })),
        ...Object.keys(snap0.nodes).map((id) => ({ op: 'remove', entity: 'node', id })),
        ...Object.keys(snap1.nodes).map((id) => ({ op: 'add', entity: 'node', id, value: snap1.nodes[id] })),
        ...(snap0.edges || []).map((e) => ({ op: 'remove', entity: 'edge', id: e.edge_id })),
        ...(snap1.edges || []).map((e) => ({ op: 'add', entity: 'edge', id: e.edge_id, value: e })),
      ],
      diagnostics: [],
      privacy: snap1.privacy,
    };

    // Align document_id for composition (same browsing document across re-perceives)
    const baseForCompose = { ...snap0, document_id: snap1.document_id };
    semanticDelta.base_revision = baseForCompose.revision;

    const composed = validateComposedGraph(baseForCompose, semanticDelta, validateGraphInvariants);
    ok('composed graph from lifecycle delta is invariant-valid', composed.ok, composed.errors?.slice(0, 3).join('; '));
    if (composed.snapshot) {
      ok(
        'composed graph has no labels edges',
        !(composed.snapshot.edges || []).some((e) => e.type === 'labels')
      );
    }

    // Private leak check
    const blob = JSON.stringify(snap1);
    ok('no selector keys in rev1', !/"selector"/.test(blob) && !/"xpath"/.test(blob));
  } finally {
    await browser.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
