#!/usr/bin/env node
/**
 * Unit tests for extension/perception/delta-emitter.js
 * Phase 3.3 — Perception Completion
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const { DeltaEmitter, COMPACTION_THRESHOLD } = require(resolve(ROOT, 'extension/perception/delta-emitter.js'));
const { RevisionManager } = require(resolve(ROOT, 'extension/perception/revision-manager.js'));
const { BindingRegistry } = require(resolve(ROOT, 'extension/perception/binding-registry.js'));

let passed = 0;
let failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error(`  ✗ FAIL: ${msg}`); } }

// ── Mocks ─────────────────────────────────────────────────────────────
function makeNode(id, name = 'field', valueState = 'empty') {
  return {
    node_id: id, kind: 'control', context_id: 'ctx.top.1', parent_id: null, order: 0,
    observed: { accessible_name: name, role: 'textbox', sanitized_text: null, language: null, description: null, value_state: valueState },
    state: { visible: true, enabled: true, readonly: false, required: false, focused: false, expanded: null, selected: null, checked: null },
    geometry: null,
    privacy: { classification: 'ordinary', redacted: false, reason: null },
    evidence: [{ source: 'observed', detector: 'dom-gateway', detector_version: '1.0.0', confidence: 1, facts: ['tag:input'] }],
    affordances: ['focus', 'type_text'],
    widget: null,
  };
}

function makeSnapshot(nodes, revision = 0) {
  return {
    kind: 'page_snapshot',
    schema_version: '2.0.0',
    producer: { name: 'cybercontrol-browser-perception', version: '1.0.0', detectors: { 'dom-gateway': '1.0.0' } },
    snapshot_id: `snap.test.${revision}`,
    document_id: 'doc.test.1',
    revision,
    observed_at: new Date().toISOString(),
    canonical_hash: `sha256:${'a'.repeat(64)}`,
    page: { origin: 'https://example.com', path: '/', route_key: null, title: 'Test', language: 'en', viewport: { width: 1280, height: 720, device_pixel_ratio: 1, scroll_x: 0, scroll_y: 0 } },
    contexts: [{ context_id: 'ctx.top.1', parent_context_id: null, kind: 'top_level', document_id: 'doc.test.1', origin: 'https://example.com', access: 'accessible', root_node_id: Object.keys(nodes)[0] || null, diagnostic_code: null }],
    nodes,
    edges: [],
    state: { signals: [], candidates: [] },
    diagnostics: [],
    privacy: { classification: 'ordinary', redacted: false, reason: null },
  };
}

let mockSnapshotResult = null;
const mockGateway = {
  observeMutations: (_root, cb) => {
    mockGateway._mutationCb = cb;
    return { observer: {}, disconnect: () => { mockGateway._mutationCb = null; } };
  },
  _mutationCb: null,
  fireMutations(records) {
    if (this._mutationCb) this._mutationCb(records);
  },
};
const mockSnapshotBuilder = {
  buildSnapshot: async () => mockSnapshotResult,
};
const mockCanonicalHash = {
  computeCanonicalHash: async (s) => s.canonical_hash,
};
const mockValidator = {
  validateDelta: (d) => ({ valid: true, errors: null }),
  validateSnapshot: (s) => ({ valid: true, errors: null }),
  isInitialized: () => true,
};
const mockNodeFactory = {};
const mockEdgeFactory = {};
const mockPrivacyFilter = {};
const mockWidgetClassifier = {};
const mockContextDiscovery = {};

function makeDeps() {
  return {
    gateway: mockGateway,
    revisionManager: new RevisionManager(),
    bindingRegistry: new BindingRegistry(),
    snapshotBuilder: mockSnapshotBuilder,
    canonicalHash: mockCanonicalHash,
    validator: mockValidator,
    nodeFactory: mockNodeFactory,
    edgeFactory: mockEdgeFactory,
    privacyFilter: mockPrivacyFilter,
    widgetClassifier: mockWidgetClassifier,
    contextDiscovery: mockContextDiscovery,
  };
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== Delta Emitter: Construction ===');
{
  const emitter = new DeltaEmitter(makeDeps());
  ok(emitter !== null, 'DeltaEmitter instantiates');
  ok(emitter.getBaseSnapshot() === null, 'no base snapshot before start');
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== Delta Emitter: Start/Stop ===');
{
  const emitter = new DeltaEmitter(makeDeps());
  const base = makeSnapshot({ n1: makeNode('n1') });
  // Use a mock root
  const mockRoot = { nodeType: 1, hasAttribute: () => false };
  emitter.start(base, mockRoot);
  ok(emitter.getBaseSnapshot() === base, 'base snapshot set after start');
  emitter.stop();
  ok(mockGateway._mutationCb === null, 'observer disconnected after stop');
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== Delta Emitter: No-op on unchanged canonical hash ===');
{
  const deps = makeDeps();
  let deltaReceived = null;
  const base = makeSnapshot({ n1: makeNode('n1') }, 0);
  // Return same hash — no change
  mockSnapshotResult = { ...base, revision: 1, snapshot_id: 'snap.test.1' };
  mockSnapshotResult.canonical_hash = base.canonical_hash;

  const emitter = new DeltaEmitter(deps, {
    settleMs: 10,
    coalesceMs: 50,
    onDelta: (d) => { deltaReceived = d; },
  });
  const mockRoot = { nodeType: 1, hasAttribute: () => false };
  emitter.start(base, mockRoot);

  // Fire mutation
  mockGateway.fireMutations([{ type: 'attributes', target: { id: 'x' } }]);
  await sleep(80);
  emitter.stop();

  ok(deltaReceived === null, 'no delta emitted when canonical hash unchanged');
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== Delta Emitter: Emits delta on node change ===');
{
  const deps = makeDeps();
  let deltaReceived = null;
  // Use 10 nodes so 1 replace op (1) does not exceed 10*0.5=5 (compaction threshold).
  const nodes = {};
  for (let i = 1; i <= 10; i++) nodes[`n${i}`] = makeNode(`n${i}`, `field${i}`, 'empty');
  const base = makeSnapshot(nodes, 0);
  const changedNodes = { ...nodes, n1: makeNode('n1', 'field1', 'nonempty') };
  const changed = makeSnapshot(changedNodes, 1);
  changed.canonical_hash = `sha256:${'b'.repeat(64)}`;
  changed.snapshot_id = 'snap.test.1';
  mockSnapshotResult = changed;

  const emitter = new DeltaEmitter(deps, {
    settleMs: 10,
    coalesceMs: 50,
    onDelta: (d) => { deltaReceived = d; },
  });
  const mockRoot = { nodeType: 1, hasAttribute: () => false };
  emitter.start(base, mockRoot);

  mockGateway.fireMutations([{ type: 'attributes', target: { id: 'x' } }]);
  await sleep(80);
  emitter.stop();

  ok(deltaReceived !== null, 'delta emitted on change');
  ok(deltaReceived.kind === 'page_delta', 'emitted object is page_delta');
  ok(deltaReceived.base_snapshot_id === 'snap.test.0', 'base_snapshot_id correct');
  ok(deltaReceived.base_revision === 0, 'base_revision correct');
  ok(deltaReceived.revision === 1, 'new revision correct');
  ok(deltaReceived.result_snapshot_id === 'snap.test.1', 'result_snapshot_id correct');
  ok(deltaReceived.result_canonical_hash === changed.canonical_hash, 'result_canonical_hash matches');
  ok(Array.isArray(deltaReceived.operations), 'operations is array');
  ok(deltaReceived.operations.length >= 1, 'at least one operation (replace n1)');
  const replaceOp = deltaReceived.operations.find((o) => o.op === 'replace' && o.entity === 'node' && o.id === 'n1');
  ok(!!replaceOp, 'replace node op for n1');
  ok(replaceOp.value.observed.value_state === 'nonempty', 'replaced node has updated value_state');
  ok(deltaReceived.privacy.classification === 'ordinary', 'privacy aggregated correctly');
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== Delta Emitter: Node addition and removal ===');
{
  const deps = makeDeps();
  let deltaReceived = null;
  // Use 10 base nodes. Remove 1, add 1 = 2 ops, under 10*0.5=5.
  const nodes = {};
  for (let i = 1; i <= 10; i++) nodes[`n${i}`] = makeNode(`n${i}`, `f${i}`);
  const base = makeSnapshot(nodes, 0);
  // Remove n1, add n11
  const changedNodes = { ...nodes };
  delete changedNodes.n1;
  changedNodes.n11 = makeNode('n11', 'email');
  const changed = makeSnapshot(changedNodes, 1);
  changed.canonical_hash = `sha256:${'c'.repeat(64)}`;
  changed.snapshot_id = 'snap.test.1';
  mockSnapshotResult = changed;

  const emitter = new DeltaEmitter(deps, {
    settleMs: 10,
    coalesceMs: 50,
    onDelta: (d) => { deltaReceived = d; },
  });
  const mockRoot = { nodeType: 1, hasAttribute: () => false };
  emitter.start(base, mockRoot);

  mockGateway.fireMutations([{ type: 'childList', target: {} }]);
  await sleep(80);
  emitter.stop();

  ok(deltaReceived !== null, 'delta emitted on structural change');
  const removeOp = deltaReceived.operations.find((o) => o.op === 'remove' && o.entity === 'node' && o.id === 'n1');
  const addOp = deltaReceived.operations.find((o) => o.op === 'add' && o.entity === 'node' && o.id === 'n11');
  ok(!!removeOp, 'remove op for n1');
  ok(!!addOp, 'add op for n11');
  ok(addOp.value.node_id === 'n11', 'add op carries the new node value');
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== Delta Emitter: Compaction (large delta → full snapshot) ===');
{
  const deps = makeDeps();
  let emitted = null;
  // Base has 2 nodes. Change all 2 → 3 brand-new nodes = over 50%.
  const base = makeSnapshot({ n1: makeNode('n1'), n2: makeNode('n2') }, 0);
  const changed = makeSnapshot({ n3: makeNode('n3'), n4: makeNode('n4'), n5: makeNode('n5') }, 1);
  changed.canonical_hash = `sha256:${'d'.repeat(64)}`;
  changed.snapshot_id = 'snap.test.1';
  mockSnapshotResult = changed;

  const emitter = new DeltaEmitter(deps, {
    settleMs: 10,
    coalesceMs: 50,
    onDelta: (d) => { emitted = d; },
  });
  const mockRoot = { nodeType: 1, hasAttribute: () => false };
  emitter.start(base, mockRoot);

  mockGateway.fireMutations([{ type: 'childList', target: {} }]);
  await sleep(80);
  emitter.stop();

  // Should emit full snapshot (compaction) because ops > 50% of base node count.
  // 2 removes + 3 adds = 5 ops > 2*0.5 = 1
  ok(emitted !== null, 'something emitted');
  ok(emitted.kind === 'page_snapshot', 'compaction emits full snapshot');
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== Delta Emitter: Privacy aggregation with secret nodes ===');
{
  const deps = makeDeps();
  let deltaReceived = null;
  const nodes = {};
  for (let i = 1; i <= 10; i++) nodes[`n${i}`] = makeNode(`n${i}`, `f${i}`);
  const base = makeSnapshot(nodes, 0);
  const secretNode = makeNode('n1', 'password', 'masked');
  secretNode.privacy = { classification: 'secret', redacted: true, reason: 'password' };
  secretNode.observed.sanitized_text = null;
  const changedNodes = { ...nodes, n1: secretNode };
  const changed = makeSnapshot(changedNodes, 1);
  changed.canonical_hash = `sha256:${'e'.repeat(64)}`;
  changed.snapshot_id = 'snap.test.1';
  mockSnapshotResult = changed;

  const emitter = new DeltaEmitter(deps, {
    settleMs: 10,
    coalesceMs: 50,
    onDelta: (d) => { deltaReceived = d; },
  });
  const mockRoot = { nodeType: 1, hasAttribute: () => false };
  emitter.start(base, mockRoot);

  mockGateway.fireMutations([{ type: 'attributes', target: {} }]);
  await sleep(80);
  emitter.stop();

  ok(deltaReceived !== null, 'delta emitted');
  ok(deltaReceived.privacy.classification === 'secret', 'privacy elevated to secret');
  ok(deltaReceived.privacy.redacted === true, 'redacted flag set');
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== Delta Emitter: Validation failure falls back to snapshot ===');
{
  const deps = makeDeps();
  let emitted = null;
  let errorReceived = null;
  // Override validator to reject delta.
  deps.validator = {
    ...mockValidator,
    validateDelta: () => ({ valid: false, errors: ['test_forced_failure'] }),
  };
  const nodes = {};
  for (let i = 1; i <= 10; i++) nodes[`n${i}`] = makeNode(`n${i}`, `f${i}`, 'empty');
  const base = makeSnapshot(nodes, 0);
  const changedNodes = { ...nodes, n1: makeNode('n1', 'f1', 'nonempty') };
  const changed = makeSnapshot(changedNodes, 1);
  changed.canonical_hash = `sha256:${'f'.repeat(64)}`;
  changed.snapshot_id = 'snap.test.1';
  mockSnapshotResult = changed;

  const emitter = new DeltaEmitter(deps, {
    settleMs: 10,
    coalesceMs: 50,
    onDelta: (d) => { emitted = d; },
    onError: (e) => { errorReceived = e; },
  });
  const mockRoot = { nodeType: 1, hasAttribute: () => false };
  emitter.start(base, mockRoot);

  mockGateway.fireMutations([{ type: 'attributes', target: {} }]);
  await sleep(80);
  emitter.stop();

  ok(errorReceived !== null, 'error callback invoked on validation failure');
  ok(emitted !== null, 'fallback emission happened');
  ok(emitted.kind === 'page_snapshot', 'fallback is full snapshot');
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== Delta Emitter: setBaseSnapshot / getBaseSnapshot ===');
{
  const emitter = new DeltaEmitter(makeDeps());
  const snap = makeSnapshot({ n1: makeNode('n1') });
  emitter.setBaseSnapshot(snap);
  ok(emitter.getBaseSnapshot() === snap, 'setBaseSnapshot/getBaseSnapshot round-trip');
}

// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== Delta Emitter: Coalesce window batches rapid mutations ===');
{
  const deps = makeDeps();
  let emitCount = 0;
  const nodes = {};
  for (let i = 1; i <= 10; i++) nodes[`n${i}`] = makeNode(`n${i}`, `f${i}`, 'empty');
  const base = makeSnapshot(nodes, 0);
  const changedNodes = { ...nodes, n1: makeNode('n1', 'f1', 'nonempty') };
  const changed = makeSnapshot(changedNodes, 1);
  changed.canonical_hash = `sha256:${'9'.repeat(64)}`;
  changed.snapshot_id = 'snap.test.1';
  mockSnapshotResult = changed;

  const emitter = new DeltaEmitter(deps, {
    settleMs: 30,
    coalesceMs: 200,
    onDelta: () => { emitCount++; },
  });
  const mockRoot = { nodeType: 1, hasAttribute: () => false };
  emitter.start(base, mockRoot);

  // Fire 5 rapid mutations within settleMs — should coalesce to 1 emit.
  for (let i = 0; i < 5; i++) {
    mockGateway.fireMutations([{ type: 'attributes', target: {} }]);
    await sleep(5);
  }
  await sleep(80);
  emitter.stop();

  ok(emitCount === 1, `rapid mutations coalesced to 1 emission (got ${emitCount})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
