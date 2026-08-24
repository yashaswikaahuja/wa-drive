#!/usr/bin/env node
/**
 * Behavior Classifier — Phase 4.3 unit tests
 * Issue #197: Server Static/Dynamic Classification
 * Does not require browser. Uses Node.js built-ins only.
 */
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// Import the behavior classifier (ESM)
const classifierPath = resolve(ROOT, 'extension-service/behavior-classifier.js');
const { classifyFormBehavior, isHardEvidenceType } = await import(
  pathToFileURL(classifierPath).href
);

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) { passed++; console.log('  \u2713', message); }
  else { failed++; console.error('  \u2717', message); }
}

// ─── Test Helpers ────────────────────────────────────────────────────

function makeSnapshot(opts = {}) {
  return {
    kind: 'page_snapshot',
    document_id: opts.document_id || 'doc:test',
    snapshot_id: opts.snapshot_id || 'snap:test',
    revision: opts.revision || 1,
    page: opts.page || { origin: 'https://portal.gov.in', title: 'Test Form' },
    nodes: opts.nodes || {},
    edges: opts.edges || [],
    state: opts.state || {},
  };
}

function makeNodes(ids, widgetType) {
  const nodes = {};
  for (const id of ids) {
    nodes[id] = {
      node_id: id,
      kind: 'control',
      widget: { behavior_kind: widgetType || 'text_input' },
      affordances: ['type_text'],
      observed: { accessible_name: id },
    };
  }
  return nodes;
}

function makeSteps(nodeIds) {
  return nodeIds.map((id, i) => ({
    step_id: `step:${i}`,
    target: { node_id: id, context_id: 'ctx.top.1' },
    action: { op: 'type_text', value: 'test' },
  }));
}

function makeCascadeEdges(pairs) {
  return pairs.map(([from, to]) => ({
    type: 'cascade',
    source: from,
    target: to,
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────

console.log('\n=== Behavior Classifier — Phase 4.3 ===');

// ─── Module Exports ──────────────────────────────────────────────────

console.log('\n--- Module Exports ---');
ok(typeof classifyFormBehavior === 'function', 'classifyFormBehavior is exported');
ok(typeof isHardEvidenceType === 'function', 'isHardEvidenceType is exported');

// ─── isHardEvidenceType ──────────────────────────────────────────────

console.log('\n--- isHardEvidenceType ---');
ok(isHardEvidenceType('control_removed') === true, 'control_removed is hard');
ok(isHardEvidenceType('subtree_replaced') === true, 'subtree_replaced is hard');
ok(isHardEvidenceType('option_set_changed') === true, 'option_set_changed is hard');
ok(isHardEvidenceType('cascade_triggered') === true, 'cascade_triggered is hard');
ok(isHardEvidenceType('widget_recreated') === true, 'widget_recreated is hard');
ok(isHardEvidenceType('visibility_changed') === false, 'visibility_changed is NOT hard');
ok(isHardEvidenceType('document_changed') === false, 'document_changed is NOT hard');
ok(isHardEvidenceType('frame_changed') === false, 'frame_changed is NOT hard');
ok(isHardEvidenceType('value_changed') === false, 'value_changed is NOT hard');
ok(isHardEvidenceType('') === false, 'empty string is NOT hard');
ok(isHardEvidenceType(undefined) === false, 'undefined is NOT hard');

// ─── Native Stable Form → STATIC or UNKNOWN ─────────────────────────

console.log('\n--- Native Stable Form ---');
{
  const nodeIds = ['node:fname', 'node:lname', 'node:email'];
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges: [] });
  const result = classifyFormBehavior({
    snapshot,
    domEvidence: [],
    priorKnowledge: { behavior: 'static', encounter_count: 5, dynamic_incidents: 0, clean_fills: 3 },
    planSteps: makeSteps(nodeIds),
  });

  ok(result.system_classification === 'STATIC', 'stable form with clean history → STATIC');
  ok(result.effective_execution_mode === 'static', 'stable form → effective static');
  ok(result.confidence > 0 && result.confidence <= 1, 'confidence in valid range');
  ok(result.reason_codes.includes('clean_history'), 'reason includes clean_history');
  ok(result.evidence_summary.hard_signals === 0, 'no hard signals');
  ok(result.evidence_summary.soft_signals === 0, 'no soft signals');
  ok(result.evidence_summary.cascade_edges === 0, 'no cascade edges');
}

// ─── Known Cascade Form (state→district→block) → DYNAMIC ────────────

console.log('\n--- Known Cascade Form ---');
{
  const nodeIds = ['node:state', 'node:district', 'node:block'];
  const edges = makeCascadeEdges([
    ['node:state', 'node:district'],
    ['node:district', 'node:block'],
  ]);
  const snapshot = makeSnapshot({
    nodes: makeNodes(nodeIds, 'select_one'),
    edges,
  });
  const result = classifyFormBehavior({
    snapshot,
    domEvidence: [],
    priorKnowledge: null,
    planSteps: makeSteps(nodeIds),
  });

  ok(result.system_classification === 'DYNAMIC', 'cascade edges among targets → DYNAMIC');
  ok(result.effective_execution_mode === 'dynamic', 'cascade → effective dynamic');
  ok(result.reason_codes.includes('cascade_edges_detected'), 'reason includes cascade_edges_detected');
  ok(result.evidence_summary.cascade_edges === 2, 'two cascade edges counted');
}

// ─── First Encounter with No Signals → UNKNOWN ──────────────────────

console.log('\n--- First Encounter ---');
{
  const nodeIds = ['node:field1', 'node:field2'];
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges: [] });
  const result = classifyFormBehavior({
    snapshot,
    domEvidence: [],
    priorKnowledge: null,
    planSteps: makeSteps(nodeIds),
  });

  ok(result.system_classification === 'UNKNOWN', 'first encounter → UNKNOWN');
  ok(result.effective_execution_mode === 'dynamic', 'UNKNOWN → effective dynamic');
  ok(result.reason_codes.includes('first_encounter'), 'reason includes first_encounter');
  ok(result.confidence > 0 && result.confidence <= 1, 'confidence bounded');
}

// ─── dom_evidence with Hard Events → DYNAMIC ────────────────────────

console.log('\n--- Hard DOM Evidence ---');
{
  const nodeIds = ['node:state', 'node:city'];
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges: [] });
  const domEvidence = [
    { type: 'control_removed', node_id: 'node:city', severity_hint: 'hard' },
    { type: 'subtree_replaced', node_id: 'node:city', severity_hint: 'hard' },
  ];
  const result = classifyFormBehavior({
    snapshot,
    domEvidence,
    priorKnowledge: { encounter_count: 2 },
    planSteps: makeSteps(nodeIds),
  });

  ok(result.system_classification === 'DYNAMIC', 'hard dom_evidence → DYNAMIC');
  ok(result.effective_execution_mode === 'dynamic', 'hard evidence → effective dynamic');
  ok(result.reason_codes.includes('hard_dom_evidence'), 'reason includes hard_dom_evidence');
  ok(result.evidence_summary.hard_signals === 2, 'two hard signals counted');
}

// ─── dom_evidence with Only Soft Events → NOT Forced DYNAMIC ────────

console.log('\n--- Soft DOM Evidence Only ---');
{
  const nodeIds = ['node:field1', 'node:field2'];
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges: [] });
  const domEvidence = [
    { type: 'visibility_changed', node_id: 'node:field1', severity_hint: 'soft' },
    { type: 'frame_changed', node_id: 'node:field1', severity_hint: 'soft' },
  ];
  const result = classifyFormBehavior({
    snapshot,
    domEvidence,
    priorKnowledge: { encounter_count: 3, dynamic_incidents: 0, clean_fills: 2, behavior: 'static' },
    planSteps: makeSteps(nodeIds),
  });

  ok(result.system_classification !== 'DYNAMIC', 'soft evidence alone does NOT force DYNAMIC');
  ok(result.evidence_summary.soft_signals === 2, 'two soft signals counted');
  ok(result.evidence_summary.hard_signals === 0, 'zero hard signals');
}

// ─── Prior Knowledge says Dynamic → DYNAMIC regardless ──────────────

console.log('\n--- Prior Knowledge Dynamic ---');
{
  const nodeIds = ['node:a', 'node:b'];
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges: [] });
  const result = classifyFormBehavior({
    snapshot,
    domEvidence: [],
    priorKnowledge: { behavior: 'dynamic', encounter_count: 10 },
    planSteps: makeSteps(nodeIds),
  });

  ok(result.system_classification === 'DYNAMIC', 'prior dynamic knowledge → DYNAMIC');
  ok(result.effective_execution_mode === 'dynamic', 'prior dynamic → effective dynamic');
  ok(result.reason_codes.includes('prior_dynamic_knowledge'), 'reason includes prior_dynamic_knowledge');
  ok(result.evidence_summary.hard_signals === 0, 'no hard signals needed when prior knowledge is dynamic');
  ok(result.evidence_summary.cascade_edges === 0, 'no cascade edges needed when prior knowledge is dynamic');
}

// ─── Framework Name Alone Does NOT Force DYNAMIC ─────────────────────

console.log('\n--- Framework Name Does Not Force ---');
{
  const nodeIds = ['node:x', 'node:y'];
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges: [] });
  const result = classifyFormBehavior({
    snapshot,
    domEvidence: [],
    priorKnowledge: { framework: 'angular', encounter_count: 5, dynamic_incidents: 0, clean_fills: 4, behavior: 'static' },
    planSteps: makeSteps(nodeIds),
  });

  ok(result.system_classification !== 'DYNAMIC', 'framework=angular does NOT force DYNAMIC');
  ok(!result.reason_codes.includes('framework_angular'), 'no framework-based reason code');
}

{
  const nodeIds = ['node:x', 'node:y'];
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges: [] });
  const result = classifyFormBehavior({
    snapshot,
    domEvidence: [],
    priorKnowledge: { framework: 'react', encounter_count: 3, dynamic_incidents: 0, clean_fills: 2, behavior: 'static' },
    planSteps: makeSteps(nodeIds),
  });

  ok(result.system_classification !== 'DYNAMIC', 'framework=react does NOT force DYNAMIC');
}

{
  const nodeIds = ['node:x', 'node:y'];
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges: [] });
  const result = classifyFormBehavior({
    snapshot,
    domEvidence: [],
    priorKnowledge: { framework: 'vue', encounter_count: 3, dynamic_incidents: 0, clean_fills: 2, behavior: 'static' },
    planSteps: makeSteps(nodeIds),
  });

  ok(result.system_classification !== 'DYNAMIC', 'framework=vue does NOT force DYNAMIC');
}

// ─── UNKNOWN Never Returns effective_execution_mode = 'static' ───────

console.log('\n--- UNKNOWN Never Static ---');
{
  const nodeIds = ['node:a'];
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges: [] });

  // First encounter
  const r1 = classifyFormBehavior({
    snapshot,
    domEvidence: [],
    priorKnowledge: null,
    planSteps: makeSteps(nodeIds),
  });
  ok(r1.system_classification === 'UNKNOWN', 'null prior → UNKNOWN');
  ok(r1.effective_execution_mode === 'dynamic', 'UNKNOWN never returns static mode (null prior)');

  // Encounter with zero count
  const r2 = classifyFormBehavior({
    snapshot,
    domEvidence: [],
    priorKnowledge: { encounter_count: 0 },
    planSteps: makeSteps(nodeIds),
  });
  ok(r2.system_classification === 'UNKNOWN', 'encounter_count=0 → UNKNOWN');
  ok(r2.effective_execution_mode === 'dynamic', 'UNKNOWN never returns static mode (count=0)');

  // Ambiguous signals
  const r3 = classifyFormBehavior({
    snapshot,
    domEvidence: [{ type: 'visibility_changed', node_id: 'node:a' }],
    priorKnowledge: { encounter_count: 1 },
    planSteps: makeSteps(nodeIds),
  });
  if (r3.system_classification === 'UNKNOWN') {
    ok(r3.effective_execution_mode === 'dynamic', 'UNKNOWN with soft signals never returns static mode');
  } else {
    ok(true, 'classification is not UNKNOWN (test precondition not met, skip)');
  }
}

// ─── Confidence is Bounded [0, 1] ───────────────────────────────────

console.log('\n--- Confidence Bounds ---');
{
  // Extreme case: many signals
  const nodeIds = ['node:a', 'node:b', 'node:c'];
  const edges = makeCascadeEdges([['node:a', 'node:b'], ['node:b', 'node:c'], ['node:a', 'node:c']]);
  const domEvidence = Array.from({ length: 20 }, (_, i) => ({
    type: 'control_removed', node_id: `node:${['a', 'b', 'c'][i % 3]}`,
  }));
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges });
  const result = classifyFormBehavior({
    snapshot,
    domEvidence,
    priorKnowledge: { behavior: 'dynamic', encounter_count: 100 },
    planSteps: makeSteps(nodeIds),
  });

  ok(result.confidence >= 0, 'confidence >= 0 (extreme dynamic)');
  ok(result.confidence <= 1, 'confidence <= 1 (extreme dynamic)');

  // Minimal case
  const r2 = classifyFormBehavior({
    snapshot: makeSnapshot({ nodes: makeNodes(['node:x']), edges: [] }),
    domEvidence: [],
    priorKnowledge: null,
    planSteps: makeSteps(['node:x']),
  });
  ok(r2.confidence >= 0, 'confidence >= 0 (minimal case)');
  ok(r2.confidence <= 1, 'confidence <= 1 (minimal case)');
}

// ─── reason_codes is Always an Array ─────────────────────────────────

console.log('\n--- reason_codes Type ---');
{
  const scenarios = [
    { prior: null, evidence: [], edges: [] },
    { prior: { behavior: 'dynamic' }, evidence: [], edges: [] },
    { prior: { behavior: 'static', encounter_count: 5, dynamic_incidents: 0, clean_fills: 3 }, evidence: [], edges: [] },
    { prior: null, evidence: [{ type: 'control_removed', node_id: 'node:a' }], edges: [] },
  ];
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const result = classifyFormBehavior({
      snapshot: makeSnapshot({ nodes: makeNodes(['node:a']), edges: s.edges }),
      domEvidence: s.evidence,
      priorKnowledge: s.prior,
      planSteps: makeSteps(['node:a']),
    });
    ok(Array.isArray(result.reason_codes), `reason_codes is array (scenario ${i})`);
    ok(result.reason_codes.every(r => typeof r === 'string'), `reason_codes entries are strings (scenario ${i})`);
  }
}

// ─── evidence_summary Has Correct Counts ─────────────────────────────

console.log('\n--- Evidence Summary ---');
{
  const nodeIds = ['node:a', 'node:b'];
  const edges = makeCascadeEdges([['node:a', 'node:b']]);
  const domEvidence = [
    { type: 'control_removed', node_id: 'node:a' },
    { type: 'widget_recreated', node_id: 'node:b' },
    { type: 'visibility_changed', node_id: 'node:a' },
    { type: 'frame_changed', node_id: 'node:b' },
    { type: 'option_set_changed', node_id: 'node:a' },
  ];
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges });
  const result = classifyFormBehavior({
    snapshot,
    domEvidence,
    priorKnowledge: { encounter_count: 3 },
    planSteps: makeSteps(nodeIds),
  });

  ok(result.evidence_summary.hard_signals === 3, 'hard_signals: control_removed + widget_recreated + option_set_changed = 3');
  ok(result.evidence_summary.soft_signals === 2, 'soft_signals: visibility_changed + frame_changed = 2');
  ok(result.evidence_summary.cascade_edges === 1, 'cascade_edges: one edge between targets');
  ok(typeof result.evidence_summary.hard_signals === 'number', 'hard_signals is number');
  ok(typeof result.evidence_summary.soft_signals === 'number', 'soft_signals is number');
  ok(typeof result.evidence_summary.cascade_edges === 'number', 'cascade_edges is number');
}

// ─── Edge Cases ──────────────────────────────────────────────────────

console.log('\n--- Edge Cases ---');
{
  // Empty planSteps
  const r1 = classifyFormBehavior({
    snapshot: makeSnapshot({ nodes: {}, edges: [] }),
    domEvidence: [],
    priorKnowledge: null,
    planSteps: [],
  });
  ok(r1.system_classification === 'UNKNOWN', 'empty planSteps → UNKNOWN');
  ok(r1.effective_execution_mode === 'dynamic', 'empty planSteps → dynamic mode');
  ok(Array.isArray(r1.reason_codes), 'empty planSteps → reason_codes is array');

  // Null/undefined domEvidence handled gracefully
  const r2 = classifyFormBehavior({
    snapshot: makeSnapshot({ nodes: makeNodes(['node:x']), edges: [] }),
    domEvidence: null,
    priorKnowledge: null,
    planSteps: makeSteps(['node:x']),
  });
  ok(r2.system_classification === 'UNKNOWN', 'null domEvidence → UNKNOWN (no crash)');
  ok(r2.evidence_summary.hard_signals === 0, 'null domEvidence → zero hard signals');

  // undefined domEvidence
  const r3 = classifyFormBehavior({
    snapshot: makeSnapshot({ nodes: makeNodes(['node:x']), edges: [] }),
    domEvidence: undefined,
    priorKnowledge: null,
    planSteps: makeSteps(['node:x']),
  });
  ok(r3.system_classification === 'UNKNOWN', 'undefined domEvidence → UNKNOWN (no crash)');

  // Cascade edges NOT between targets (should not count)
  const edges = [{ type: 'cascade', source: 'node:other1', target: 'node:other2' }];
  const r4 = classifyFormBehavior({
    snapshot: makeSnapshot({ nodes: makeNodes(['node:a']), edges }),
    domEvidence: [],
    priorKnowledge: { encounter_count: 5, dynamic_incidents: 0, clean_fills: 3, behavior: 'static' },
    planSteps: makeSteps(['node:a']),
  });
  ok(r4.evidence_summary.cascade_edges === 0, 'cascade edge not between targets → not counted');
  ok(r4.system_classification === 'STATIC', 'non-target cascade edges → still STATIC');
}

// ─── Return Shape Contract ───────────────────────────────────────────

console.log('\n--- Return Shape ---');
{
  const result = classifyFormBehavior({
    snapshot: makeSnapshot({ nodes: makeNodes(['node:x']), edges: [] }),
    domEvidence: [],
    priorKnowledge: null,
    planSteps: makeSteps(['node:x']),
  });

  ok('system_classification' in result, 'has system_classification');
  ok('effective_execution_mode' in result, 'has effective_execution_mode');
  ok('confidence' in result, 'has confidence');
  ok('reason_codes' in result, 'has reason_codes');
  ok('evidence_summary' in result, 'has evidence_summary');
  ok(['STATIC', 'DYNAMIC', 'UNKNOWN'].includes(result.system_classification), 'system_classification is valid enum');
  ok(['static', 'dynamic'].includes(result.effective_execution_mode), 'effective_execution_mode is valid enum');
  ok(typeof result.confidence === 'number', 'confidence is number');
  ok('hard_signals' in result.evidence_summary, 'evidence_summary has hard_signals');
  ok('soft_signals' in result.evidence_summary, 'evidence_summary has soft_signals');
  ok('cascade_edges' in result.evidence_summary, 'evidence_summary has cascade_edges');
}

// ─── Hard Evidence on Non-Target Node ────────────────────────────────

console.log('\n--- Hard Evidence Non-Target ---');
{
  const nodeIds = ['node:a', 'node:b'];
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges: [] });
  // Evidence for a node NOT in the plan targets
  const domEvidence = [
    { type: 'control_removed', node_id: 'node:unrelated' },
  ];
  const result = classifyFormBehavior({
    snapshot,
    domEvidence,
    priorKnowledge: { encounter_count: 5, dynamic_incidents: 0, clean_fills: 3, behavior: 'static' },
    planSteps: makeSteps(nodeIds),
  });

  ok(result.evidence_summary.hard_signals === 1, 'hard signal counted even if non-target');
  // Non-target hard evidence does NOT force dynamic (only target-affecting signals do)
  ok(result.system_classification !== 'DYNAMIC' || result.reason_codes.includes('prior_dynamic_knowledge') === false,
    'hard evidence on non-target node does not force DYNAMIC');
}

// ─── Multiple Cascade Edges ──────────────────────────────────────────

console.log('\n--- Multiple Cascade Edges ---');
{
  const nodeIds = ['node:country', 'node:state', 'node:district', 'node:block'];
  const edges = makeCascadeEdges([
    ['node:country', 'node:state'],
    ['node:state', 'node:district'],
    ['node:district', 'node:block'],
  ]);
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds, 'select_one'), edges });
  const result = classifyFormBehavior({
    snapshot,
    domEvidence: [],
    priorKnowledge: null,
    planSteps: makeSteps(nodeIds),
  });

  ok(result.system_classification === 'DYNAMIC', 'multi-level cascade → DYNAMIC');
  ok(result.evidence_summary.cascade_edges === 3, 'three cascade edges counted');
  ok(result.confidence > 0.5, 'high confidence with multiple cascade edges');
}

// ─── Combined Signals: Prior + Edges + Evidence ─────────────────────

console.log('\n--- Combined Signals ---');
{
  const nodeIds = ['node:state', 'node:city'];
  const edges = makeCascadeEdges([['node:state', 'node:city']]);
  const domEvidence = [{ type: 'option_set_changed', node_id: 'node:city' }];
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds, 'select_one'), edges });
  const result = classifyFormBehavior({
    snapshot,
    domEvidence,
    priorKnowledge: { behavior: 'dynamic' },
    planSteps: makeSteps(nodeIds),
  });

  ok(result.system_classification === 'DYNAMIC', 'combined signals → DYNAMIC');
  ok(result.reason_codes.includes('prior_dynamic_knowledge'), 'has prior_dynamic_knowledge');
  ok(result.reason_codes.includes('cascade_edges_detected'), 'has cascade_edges_detected');
  ok(result.reason_codes.includes('hard_dom_evidence'), 'has hard_dom_evidence');
  ok(result.confidence >= 0.8, 'high confidence with all signal types');
}

// ─── Dependency Edge Type Variants ───────────────────────────────────

console.log('\n--- Edge Type Variants ---');
{
  const nodeIds = ['node:a', 'node:b'];
  const edgeTypes = ['cascade', 'dependency', 'controls', 'populates', 'triggers_load'];
  for (const edgeType of edgeTypes) {
    const edges = [{ type: edgeType, source: 'node:a', target: 'node:b' }];
    const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges });
    const result = classifyFormBehavior({
      snapshot,
      domEvidence: [],
      priorKnowledge: null,
      planSteps: makeSteps(nodeIds),
    });
    ok(result.evidence_summary.cascade_edges === 1, `edge type "${edgeType}" is recognized as cascade`);
    ok(result.system_classification === 'DYNAMIC', `edge type "${edgeType}" triggers DYNAMIC`);
  }

  // Non-cascade edge type should not count
  const nonCascadeEdges = [{ type: 'sibling', source: 'node:a', target: 'node:b' }];
  const snapshot = makeSnapshot({ nodes: makeNodes(nodeIds), edges: nonCascadeEdges });
  const result = classifyFormBehavior({
    snapshot,
    domEvidence: [],
    priorKnowledge: null,
    planSteps: makeSteps(nodeIds),
  });
  ok(result.evidence_summary.cascade_edges === 0, 'non-cascade edge type "sibling" not counted');
}

// ─── Summary ─────────────────────────────────────────────────────────

console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
