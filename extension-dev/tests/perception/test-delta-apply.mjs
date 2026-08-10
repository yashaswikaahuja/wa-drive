#!/usr/bin/env node
/**
 * PageDelta apply + composed graph invariants — #133 IMP-P1-02
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const { applyPageDelta, validateComposedGraph } = require(resolve(ROOT, 'extension/perception/delta-apply.js'));
const { validateGraphInvariants } = require(resolve(ROOT, 'extension/perception/graph-invariants.js'));

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function ev() {
  return [{ source: 'derived', detector: 'edge-factory', detector_version: '2.0.0', confidence: 1, facts: ['structural.parent_child'], signals: ['structural.parent_child'] }];
}

function baseSnap() {
  return {
    kind: 'page_snapshot',
    schema_version: '2.0.0',
    producer: { name: 'cybercontrol-browser-perception', version: '1.0.0', detectors: {} },
    snapshot_id: 'snap.base',
    document_id: 'doc.1',
    revision: 0,
    observed_at: new Date().toISOString(),
    canonical_hash: 'sha256:' + 'a'.repeat(64),
    page: { origin: 'https://ex.test', path: '/', route_key: null, title: 't', language: 'en', viewport: { width: 1, height: 1, device_pixel_ratio: 1, scroll_x: 0, scroll_y: 0 } },
    contexts: [{ context_id: 'ctx.top', parent_context_id: null, kind: 'top_level', document_id: 'doc.1', origin: null, access: 'accessible', root_node_id: 'n.page', diagnostic_code: null }],
    nodes: {
      'n.page': {
        node_id: 'n.page', kind: 'page', context_id: 'ctx.top', parent_id: null, order: 0,
        observed: { accessible_name: null, role: 'document', sanitized_text: null, language: null, description: null, value_state: 'not_applicable' },
        state: { visible: true, enabled: true, readonly: false, required: false, focused: false, expanded: null, selected: null, checked: null },
        geometry: null, privacy: { classification: 'ordinary', redacted: false, reason: null },
        evidence: [{ source: 'observed', detector: 't', detector_version: '1', confidence: 1, facts: ['t'] }],
        affordances: [], widget: null,
      },
      'n.form': {
        node_id: 'n.form', kind: 'form', context_id: 'ctx.top', parent_id: 'n.page', order: 1,
        observed: { accessible_name: null, role: 'form', sanitized_text: null, language: null, description: null, value_state: 'not_applicable' },
        state: { visible: true, enabled: true, readonly: false, required: false, focused: false, expanded: null, selected: null, checked: null },
        geometry: null, privacy: { classification: 'ordinary', redacted: false, reason: null },
        evidence: [{ source: 'observed', detector: 't', detector_version: '1', confidence: 1, facts: ['t'] }],
        affordances: [], widget: null,
      },
      'n.lab': {
        node_id: 'n.lab', kind: 'content', context_id: 'ctx.top', parent_id: 'n.form', order: 2,
        observed: { accessible_name: null, role: null, sanitized_text: 'Name', language: null, description: null, value_state: 'not_applicable' },
        state: { visible: true, enabled: true, readonly: false, required: false, focused: false, expanded: null, selected: null, checked: null },
        geometry: null, privacy: { classification: 'ordinary', redacted: false, reason: null },
        evidence: [{ source: 'observed', detector: 't', detector_version: '1', confidence: 1, facts: ['t'] }],
        affordances: [], widget: null,
      },
      'n.input': {
        node_id: 'n.input', kind: 'control', context_id: 'ctx.top', parent_id: 'n.form', order: 3,
        observed: { accessible_name: 'Name', role: 'textbox', sanitized_text: null, language: null, description: null, value_state: 'empty' },
        state: { visible: true, enabled: true, readonly: false, required: false, focused: false, expanded: null, selected: null, checked: null },
        geometry: null, privacy: { classification: 'ordinary', redacted: false, reason: null },
        evidence: [{ source: 'observed', detector: 't', detector_version: '1', confidence: 1, facts: ['t'] }],
        affordances: ['type_text'], widget: { behavior_kind: 'text_entry', status: 'recognized', confidence: 0.95, cardinality: 'none', interaction_mode: 'native', implementation_hint: null, adapter_id: 'native-text' },
      },
    },
    edges: [
      { edge_id: 'e.contains.n.page.n.form', type: 'contains', source_id: 'n.page', target_id: 'n.form', evidence: ev() },
      { edge_id: 'e.contains.n.form.n.lab', type: 'contains', source_id: 'n.form', target_id: 'n.lab', evidence: ev() },
      { edge_id: 'e.contains.n.form.n.input', type: 'contains', source_id: 'n.form', target_id: 'n.input', evidence: ev() },
      {
        edge_id: 'e.labels.n.lab.n.input', type: 'labels', source_id: 'n.lab', target_id: 'n.input',
        evidence: [{ source: 'observed', detector: 'edge-factory', detector_version: '2.0.0', confidence: 0.95, facts: ['html.label_for'], signals: ['html.label_for'] }],
      },
    ],
    state: { signals: [], candidates: [] },
    diagnostics: [],
    privacy: { classification: 'ordinary', redacted: false, reason: null },
  };
}

console.log('\n=== Delta Apply / Composed Graph ===');

{
  const base = baseSnap();
  ok(validateGraphInvariants(base).valid, 'base graph valid');

  // Remove label node + labels edge + contains to lab
  const delta = {
    kind: 'page_delta',
    schema_version: '2.0.0',
    producer: base.producer,
    document_id: 'doc.1',
    base_snapshot_id: 'snap.base',
    base_revision: 0,
    revision: 1,
    observed_at: new Date().toISOString(),
    result_snapshot_id: 'snap.next',
    result_canonical_hash: 'sha256:' + 'b'.repeat(64),
    operations: [
      { op: 'remove', entity: 'edge', id: 'e.labels.n.lab.n.input' },
      { op: 'remove', entity: 'edge', id: 'e.contains.n.form.n.lab' },
      { op: 'remove', entity: 'node', id: 'n.lab' },
    ],
    diagnostics: [],
    privacy: base.privacy,
  };

  const applied = applyPageDelta(base, delta);
  ok(applied.ok, `apply succeeds (${applied.errors.join('; ')})`);
  ok(!applied.snapshot.nodes['n.lab'], 'label node removed');
  ok(!applied.snapshot.edges.some((e) => e.type === 'labels'), 'labels edge gone');
  ok(validateGraphInvariants(applied.snapshot).valid, 'composed graph still valid');

  const composed = validateComposedGraph(base, delta, validateGraphInvariants);
  ok(composed.ok, `validateComposedGraph ok (${composed.errors.join('; ')})`);
}

{
  // Invalid composed: remove contains without fixing parent_id
  const base = baseSnap();
  const delta = {
    kind: 'page_delta',
    schema_version: '2.0.0',
    producer: base.producer,
    document_id: 'doc.1',
    base_snapshot_id: 'snap.base',
    base_revision: 0,
    revision: 1,
    observed_at: new Date().toISOString(),
    result_snapshot_id: 'snap.bad',
    result_canonical_hash: 'sha256:' + 'c'.repeat(64),
    operations: [
      { op: 'remove', entity: 'edge', id: 'e.contains.n.form.n.input' },
    ],
    diagnostics: [],
    privacy: base.privacy,
  };
  const composed = validateComposedGraph(base, delta, validateGraphInvariants);
  ok(!composed.ok, 'broken parent_id/contains after delta rejected');
  ok(composed.errors.some((e) => e.includes('contains') || e.includes('parent_id')), 'mentions contains/parent');
}

{
  const base = baseSnap();
  const delta = {
    kind: 'page_delta',
    schema_version: '2.0.0',
    producer: base.producer,
    document_id: 'doc.OTHER',
    base_snapshot_id: 'snap.base',
    base_revision: 0,
    revision: 1,
    observed_at: new Date().toISOString(),
    result_snapshot_id: 'snap.x',
    result_canonical_hash: 'sha256:' + 'd'.repeat(64),
    operations: [],
    diagnostics: [],
    privacy: base.privacy,
  };
  const applied = applyPageDelta(base, delta);
  ok(!applied.ok, 'document_id mismatch rejected');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
