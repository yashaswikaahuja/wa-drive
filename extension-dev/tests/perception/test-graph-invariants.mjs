#!/usr/bin/env node
/**
 * Graph invariant tests — Phase 3.3 / issue #131 / #130 P1
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const { validateGraphInvariants } = require(resolve(ROOT, 'extension/perception/graph-invariants.js'));

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function baseSnapshot(overrides = {}) {
  const nodes = {
    'ctx.top.1.page.1': {
      node_id: 'ctx.top.1.page.1',
      kind: 'page',
      context_id: 'ctx.top.1',
      parent_id: null,
      order: 0,
      observed: {},
      state: {},
      privacy: { classification: 'ordinary', redacted: false },
      evidence: [{ source: 'observed', detector: 't', detector_version: '1', confidence: 1, facts: ['t'] }],
      affordances: [],
      widget: null,
    },
    'ctx.top.1.form.2': {
      node_id: 'ctx.top.1.form.2',
      kind: 'form',
      context_id: 'ctx.top.1',
      parent_id: 'ctx.top.1.page.1',
      order: 1,
      observed: {},
      state: {},
      privacy: { classification: 'ordinary', redacted: false },
      evidence: [{ source: 'observed', detector: 't', detector_version: '1', confidence: 1, facts: ['t'] }],
      affordances: [],
      widget: null,
    },
    'ctx.top.1.input.3': {
      node_id: 'ctx.top.1.input.3',
      kind: 'control',
      context_id: 'ctx.top.1',
      parent_id: 'ctx.top.1.form.2',
      order: 2,
      observed: { accessible_name: 'Name' },
      state: {},
      privacy: { classification: 'ordinary', redacted: false },
      evidence: [{ source: 'observed', detector: 't', detector_version: '1', confidence: 1, facts: ['t'] }],
      affordances: ['type_text'],
      widget: { behavior_kind: 'text_entry' },
    },
  };
  const edges = [
    {
      edge_id: 'e.contains.page.form',
      type: 'contains',
      source_id: 'ctx.top.1.page.1',
      target_id: 'ctx.top.1.form.2',
      evidence: [{ source: 'derived', detector: 'edge-factory', detector_version: '2.0.0', confidence: 1, facts: ['structural.parent_child'], signals: ['structural.parent_child'] }],
    },
    {
      edge_id: 'e.contains.form.input',
      type: 'contains',
      source_id: 'ctx.top.1.form.2',
      target_id: 'ctx.top.1.input.3',
      evidence: [{ source: 'derived', detector: 'edge-factory', detector_version: '2.0.0', confidence: 1, facts: ['structural.parent_child'], signals: ['structural.parent_child'] }],
    },
    {
      edge_id: 'e.btc.input',
      type: 'belongs_to_context',
      source_id: 'ctx.top.1.input.3',
      target_id: 'ctx.top.1',
      evidence: [{ source: 'derived', detector: 'edge-factory', detector_version: '2.0.0', confidence: 1, facts: ['structural.context_membership'], signals: ['structural.context_membership'] }],
    },
  ];
  return {
    contexts: [{ context_id: 'ctx.top.1', kind: 'top_level', access: 'accessible', document_id: 'doc.1', parent_context_id: null, root_node_id: 'ctx.top.1.page.1', origin: null, diagnostic_code: null }],
    nodes,
    edges,
    ...overrides,
  };
}

console.log('\n=== Graph Invariants ===');

{
  const r = validateGraphInvariants(baseSnapshot());
  ok(r.valid, 'valid graph passes');
  ok(r.errors.length === 0, 'no errors on valid graph');
}

{
  const s = baseSnapshot();
  s.nodes['ctx.top.1.input.3'].parent_id = 'ctx.top.1.page.1'; // wrong parent vs contains
  const r = validateGraphInvariants(s);
  ok(!r.valid, 'parent_id/contains mismatch fails');
  ok(r.errors.some((e) => e.includes('contains parent') || e.includes('parent_id')), 'mismatch message present');
}

{
  const s = baseSnapshot();
  s.edges = s.edges.filter((e) => e.target_id !== 'ctx.top.1.input.3' || e.type !== 'contains');
  const r = validateGraphInvariants(s);
  ok(!r.valid, 'missing contains for parent_id fails');
}

{
  const s = baseSnapshot();
  // cycle
  s.nodes['ctx.top.1.page.1'].parent_id = 'ctx.top.1.input.3';
  s.edges.push({
    edge_id: 'e.cycle',
    type: 'contains',
    source_id: 'ctx.top.1.input.3',
    target_id: 'ctx.top.1.page.1',
    evidence: [{ source: 'derived', detector: 't', detector_version: '1', confidence: 1, facts: ['x.y'], signals: ['x.y'] }],
  });
  const r = validateGraphInvariants(s);
  ok(!r.valid, 'containment cycle fails');
  ok(r.errors.some((e) => e.includes('cycle')), 'cycle mentioned');
}

{
  const s = baseSnapshot();
  s.edges.push({
    edge_id: 'e.dep',
    type: 'depends_on',
    source_id: 'ctx.top.1.input.3',
    target_id: 'ctx.top.1.form.2',
    evidence: [{ source: 'derived', detector: 't', detector_version: '1', confidence: 0.5, facts: ['x.y'], signals: ['x.y'] }],
  });
  const r = validateGraphInvariants(s);
  ok(!r.valid, 'depends_on forbidden');
  ok(r.errors.some((e) => e.includes('depends_on')), 'depends_on error text');
}

{
  const s = baseSnapshot();
  s.edges.push({
    edge_id: 'e.dangle',
    type: 'transitions_to',
    source_id: 'ctx.top.1.input.3',
    target_id: 'ctx.top.1.missing.99',
    evidence: [{ source: 'derived', detector: 't', detector_version: '1', confidence: 0.5, facts: ['x.y'], signals: ['x.y'] }],
  });
  const r = validateGraphInvariants(s);
  ok(!r.valid, 'dangling transitions_to fails');
}

{
  const s = baseSnapshot();
  s.edges.push({
    edge_id: 'e.ghost',
    type: 'labels',
    source_id: 'ctx.top.1.missing.label',
    target_id: 'ctx.top.1.input.3',
    evidence: [{ source: 'derived', detector: 't', detector_version: '1', confidence: 0.5, facts: ['x.y'], signals: ['x.y'] }],
  });
  const r = validateGraphInvariants(s);
  ok(!r.valid, 'unresolved edge source fails');
}

{
  const s = baseSnapshot();
  s.nodes['ctx.top.1.input.3'].context_id = 'ctx.unknown';
  const r = validateGraphInvariants(s);
  ok(!r.valid, 'unknown context_id fails');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
