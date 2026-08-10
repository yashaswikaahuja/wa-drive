#!/usr/bin/env node
/**
 * Edge factory + relationship tests — Phase 3.3 / issue #131
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const {
  deriveEdges,
  makeEdge,
  stableEdgeId,
} = require(resolve(ROOT, 'extension/perception/edge-factory.js'));
const { validateGraphInvariants } = require(resolve(ROOT, 'extension/perception/graph-invariants.js'));

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function node(id, kind, parent, order, extra = {}) {
  return {
    node_id: id,
    kind,
    context_id: 'ctx.top.1',
    parent_id: parent,
    order,
    observed: {
      accessible_name: extra.accessible_name || null,
      role: extra.role || null,
      sanitized_text: extra.sanitized_text || null,
      language: null,
      description: null,
      value_state: 'not_applicable',
    },
    state: {
      visible: true, enabled: true, readonly: false, required: false,
      focused: false, expanded: null, selected: null, checked: null,
    },
    privacy: { classification: 'ordinary', redacted: false, reason: null },
    evidence: [{ source: 'observed', detector: 't', detector_version: '1', confidence: 1, facts: ['tag:x'] }],
    affordances: extra.affordances || [],
    widget: extra.widget || null,
    geometry: null,
  };
}

const contexts = [{
  context_id: 'ctx.top.1',
  parent_context_id: null,
  kind: 'top_level',
  document_id: 'doc.1',
  origin: 'https://example.test',
  access: 'accessible',
  root_node_id: 'n.page',
  diagnostic_code: null,
}];

console.log('\n=== Edge Factory Relationships ===');

// Basic containment tree
{
  const nodesMap = {
    'n.page': node('n.page', 'page', null, 0),
    'n.form': node('n.form', 'form', 'n.page', 1),
    'n.lbl': node('n.lbl', 'content', 'n.form', 2, { sanitized_text: 'Full Name' }),
    'n.input': node('n.input', 'control', 'n.form', 3, {
      accessible_name: 'Full Name',
      widget: { behavior_kind: 'text_entry', status: 'recognized', confidence: 0.95 },
      affordances: ['type_text'],
    }),
    'n.submit': node('n.submit', 'control', 'n.form', 4, {
      accessible_name: 'Submit',
      role: 'button',
      widget: { behavior_kind: 'action', status: 'recognized', confidence: 0.9 },
      affordances: ['activate'],
    }),
  };
  const factMeta = {
    'n.lbl': { id: 'lbl-name', tag: 'label', htmlFor: 'name', labelledByIds: [], describedByIds: [], controlsIds: [], ownsIds: [], errorMessageIds: [] },
    'n.input': { id: 'name', tag: 'input', type: 'text', labelledByIds: [], describedByIds: [], controlsIds: [], ownsIds: [], errorMessageIds: [] },
    'n.submit': { id: 'go', tag: 'button', type: 'submit', labelledByIds: [], describedByIds: [], controlsIds: [], ownsIds: [], errorMessageIds: [] },
  };

  const edges = deriveEdges(nodesMap, contexts, { factMeta });
  const types = edges.map((e) => e.type);

  ok(edges.some((e) => e.type === 'contains' && e.source_id === 'n.page' && e.target_id === 'n.form'), 'contains page→form');
  ok(edges.some((e) => e.type === 'contains' && e.source_id === 'n.form' && e.target_id === 'n.input'), 'contains form→input');
  ok(edges.every((e) => e.type !== 'depends_on'), 'no depends_on emitted');
  ok(edges.some((e) => e.type === 'labels' && e.source_id === 'n.lbl' && e.target_id === 'n.input'), 'labels via label[for]');
  ok(edges.some((e) => e.type === 'belongs_to_context'), 'belongs_to_context present');
  ok(edges.some((e) => e.type === 'controls' && e.source_id === 'n.form' && e.target_id === 'n.input'), 'form controls input');
  ok(edges.some((e) => e.type === 'confirms' && e.source_id === 'n.submit' && e.target_id === 'n.form'), 'submit confirms form');

  // Graph invariants on derived edges
  for (const n of Object.values(nodesMap)) {
    // ensure required shape for invariants
    if (!n.privacy) n.privacy = { classification: 'ordinary', redacted: false };
  }
  const gi = validateGraphInvariants({ nodes: nodesMap, edges, contexts });
  ok(gi.valid, `derived graph invariants valid (${gi.errors.join('; ')})`);

  // Determinism
  const edges2 = deriveEdges(nodesMap, contexts, { factMeta });
  ok(JSON.stringify(edges) === JSON.stringify(edges2), 'deriveEdges is deterministic');
}

// aria-labelledby / describedby / errormessage / controls
{
  const nodesMap = {
    'n.page': node('n.page', 'page', null, 0),
    'n.lab': node('n.lab', 'content', 'n.page', 1, { sanitized_text: 'Email' }),
    'n.help': node('n.help', 'content', 'n.page', 2, { sanitized_text: 'Use work email' }),
    'n.err': node('n.err', 'validation_message', 'n.page', 4, { role: 'alert', sanitized_text: 'Required' }),
    'n.ctrl': node('n.ctrl', 'control', 'n.page', 3, {
      accessible_name: 'Email',
      widget: { behavior_kind: 'text_entry' },
      affordances: ['type_text'],
    }),
    'n.panel': node('n.panel', 'region', 'n.page', 5, { role: 'dialog' }),
    'n.btn': node('n.btn', 'control', 'n.page', 6, {
      accessible_name: 'Open',
      role: 'button',
      widget: { behavior_kind: 'action' },
      affordances: ['activate'],
    }),
  };
  const factMeta = {
    'n.lab': { id: 'lab1', tag: 'span', labelledByIds: [], describedByIds: [], controlsIds: [], ownsIds: [], errorMessageIds: [] },
    'n.help': { id: 'help1', tag: 'span', labelledByIds: [], describedByIds: [], controlsIds: [], ownsIds: [], errorMessageIds: [] },
    'n.err': { id: 'err1', tag: 'span', labelledByIds: [], describedByIds: [], controlsIds: [], ownsIds: [], errorMessageIds: [] },
    'n.ctrl': {
      id: 'email', tag: 'input', type: 'email',
      labelledByIds: ['lab1'], describedByIds: ['help1'], errorMessageIds: ['err1'],
      controlsIds: [], ownsIds: [],
    },
    'n.panel': { id: 'dlg', tag: 'div', labelledByIds: [], describedByIds: [], controlsIds: [], ownsIds: [], errorMessageIds: [] },
    'n.btn': {
      id: 'open', tag: 'button', type: 'button', hasPopup: 'dialog',
      labelledByIds: [], describedByIds: [], controlsIds: ['dlg'], ownsIds: [], errorMessageIds: [],
    },
  };

  const edges = deriveEdges(nodesMap, contexts, { factMeta });
  ok(edges.some((e) => e.type === 'labels' && e.source_id === 'n.lab' && e.evidence[0].source === 'observed'), 'aria-labelledby labels (observed)');
  ok(edges.some((e) => e.type === 'describes' && e.source_id === 'n.help' && e.target_id === 'n.ctrl'), 'aria-describedby describes');
  ok(edges.some((e) => e.type === 'error_for' && e.source_id === 'n.err' && e.target_id === 'n.ctrl'), 'aria-errormessage error_for');
  ok(edges.some((e) => e.type === 'validates' && e.target_id === 'n.ctrl'), 'validates edge');
  ok(edges.some((e) => e.type === 'controls' && e.source_id === 'n.btn' && e.target_id === 'n.panel'), 'aria-controls');
  ok(edges.some((e) => e.type === 'overlays' && e.source_id === 'n.panel'), 'overlays for haspopup dialog');
  ok(edges.some((e) => e.type === 'transitions_to' && e.source_id === 'n.btn' && e.target_id === 'n.panel'), 'transitions_to only to existing node');
  ok(edges.every((e) => e.type !== 'depends_on'), 'still no depends_on');

  const gi = validateGraphInvariants({ nodes: nodesMap, edges, contexts });
  ok(gi.valid, `ARIA graph valid (${gi.errors.join('; ')})`);
}

// Repeated sections
{
  const nodesMap = {
    'n.page': node('n.page', 'page', null, 0),
    'n.s1': node('n.s1', 'region', 'n.page', 1),
    'n.s1a': node('n.s1a', 'control', 'n.s1', 2, { widget: { behavior_kind: 'text_entry' } }),
    'n.s1b': node('n.s1b', 'control', 'n.s1', 3, { widget: { behavior_kind: 'text_entry' } }),
    'n.s2': node('n.s2', 'region', 'n.page', 4),
    'n.s2a': node('n.s2a', 'control', 'n.s2', 5, { widget: { behavior_kind: 'text_entry' } }),
    'n.s2b': node('n.s2b', 'control', 'n.s2', 6, { widget: { behavior_kind: 'text_entry' } }),
  };
  const edges = deriveEdges(nodesMap, contexts, { factMeta: {} });
  ok(edges.some((e) => e.type === 'repeats' && e.source_id === 'n.s1' && e.target_id === 'n.s2'), 'repeats sibling regions');
  ok(edges.some((e) => e.type === 'visually_groups_with'), 'visually_groups_with siblings');
}

// No dangling transitions_to when target missing
{
  const nodesMap = {
    'n.page': node('n.page', 'page', null, 0),
    'n.btn': node('n.btn', 'control', 'n.page', 1, {
      role: 'button',
      widget: { behavior_kind: 'action' },
      affordances: ['activate'],
    }),
  };
  const factMeta = {
    'n.btn': {
      id: 'b', tag: 'button', type: 'button',
      controlsIds: ['does-not-exist'], labelledByIds: [], describedByIds: [], ownsIds: [], errorMessageIds: [],
    },
  };
  const edges = deriveEdges(nodesMap, contexts, { factMeta });
  ok(!edges.some((e) => e.type === 'transitions_to'), 'no transitions_to to missing id');
  ok(edges.every((e) => e.target_id in nodesMap || e.type === 'belongs_to_context'), 'all edge targets resolve');
}

// Stable edge ids
{
  const id1 = stableEdgeId('contains', 'a.b', 'c.d');
  const id2 = stableEdgeId('contains', 'a.b', 'c.d');
  ok(id1 === id2, 'stableEdgeId deterministic');
  ok(/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(id1), 'stableEdgeId matches Identifier pattern');
  const e = makeEdge('labels', 'n1', 'n2', { source: 'derived', confidence: 0.7, facts: ['heuristic.adjacent_label'], signals: ['heuristic.adjacent_label'] });
  ok(e.edge_id && e.evidence[0].detector === 'edge-factory', 'makeEdge shape');
}

// Duplicate labels → distinct node ids, both can label different controls
{
  const nodesMap = {
    'n.page': node('n.page', 'page', null, 0),
    'n.l1': node('n.l1', 'content', 'n.page', 1, { sanitized_text: 'City' }),
    'n.c1': node('n.c1', 'control', 'n.page', 2, { accessible_name: 'City', widget: { behavior_kind: 'text_entry' } }),
    'n.l2': node('n.l2', 'content', 'n.page', 3, { sanitized_text: 'City' }),
    'n.c2': node('n.c2', 'control', 'n.page', 4, { accessible_name: 'City', widget: { behavior_kind: 'text_entry' } }),
  };
  const factMeta = {
    'n.l1': { id: 'l1', tag: 'label', htmlFor: 'c1', labelledByIds: [], describedByIds: [], controlsIds: [], ownsIds: [], errorMessageIds: [] },
    'n.c1': { id: 'c1', tag: 'input', labelledByIds: [], describedByIds: [], controlsIds: [], ownsIds: [], errorMessageIds: [] },
    'n.l2': { id: 'l2', tag: 'label', htmlFor: 'c2', labelledByIds: [], describedByIds: [], controlsIds: [], ownsIds: [], errorMessageIds: [] },
    'n.c2': { id: 'c2', tag: 'input', labelledByIds: [], describedByIds: [], controlsIds: [], ownsIds: [], errorMessageIds: [] },
  };
  const edges = deriveEdges(nodesMap, contexts, { factMeta });
  const labelEdges = edges.filter((e) => e.type === 'labels');
  ok(labelEdges.length >= 2, 'duplicate label texts map to distinct controls');
  ok(labelEdges.some((e) => e.source_id === 'n.l1' && e.target_id === 'n.c1'), 'label1→c1');
  ok(labelEdges.some((e) => e.source_id === 'n.l2' && e.target_id === 'n.c2'), 'label2→c2');
}

// Privacy: evidence facts must not look like selectors/html
{
  const nodesMap = {
    'n.page': node('n.page', 'page', null, 0),
    'n.c': node('n.c', 'control', 'n.page', 1, { widget: { behavior_kind: 'text_entry' } }),
  };
  const edges = deriveEdges(nodesMap, contexts, { factMeta: {} });
  const blob = JSON.stringify(edges);
  ok(!/querySelector|outerHTML|xpath/i.test(blob), 'no selector/html smuggling in edges');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
