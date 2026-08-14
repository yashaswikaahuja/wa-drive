#!/usr/bin/env node
/**
 * DOM Evidence Emitter — Phase 4.2 unit + adversarial tests
 * Issue #196: Dynamic DOM behavior evidence
 * Does not require browser. Uses Node.js built-ins only.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(import.meta.url);

// Load binding registry (dependency)
const bindingMod = require(resolve(ROOT, 'extension/perception/binding-registry.js'));
const BindingRegistry = bindingMod.BindingRegistry || globalThis.CcBindingRegistry;

// Load DOM evidence emitter
const domEvidence = require(resolve(ROOT, 'extension/runtime/dom-evidence.js'));
const { DomEvidenceEmitter, EVIDENCE_TYPES, MAX_EVIDENCE_PER_PLAN } = domEvidence;

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) { passed++; console.log('  \u2713', message); }
  else { failed++; console.error('  \u2717', message); }
}

// ─── Mock DOM Infrastructure ─────────────────────────────────────────

/** Minimal DOM element mock. */
function createElement(tag, opts = {}) {
  const attrs = new Map();
  const style = opts.style || {};
  const el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    id: opts.id || null,
    children: opts.children || [],
    parentNode: opts.parentNode || null,
    isConnected: opts.isConnected !== false,
    offsetParent: opts.visible !== false ? {} : null,
    style,
    getAttribute(name) { return attrs.get(name) || null; },
    setAttribute(name, val) { attrs.set(name, val); },
    hasAttribute(name) { return attrs.has(name); },
    contains(other) {
      if (other === el) return true;
      for (const child of el.children) {
        if (child === other) return true;
        if (child.contains?.(other)) return true;
      }
      return false;
    },
    closest() { return null; },
  };
  if (opts.role) attrs.set('role', opts.role);
  if (opts.hidden) attrs.set('hidden', '');
  return el;
}

/** Build a mock binding registry with entries. */
function buildRegistry(bindings) {
  const registry = new BindingRegistry();
  for (const b of bindings) {
    registry.bind(b.contextId, b.nodeId, b.element, b.adapterId || null, b.revision || 1);
  }
  return registry;
}

/** Build a mock plan with given steps. */
function makePlan(steps, overrides = {}) {
  return {
    kind: 'action_plan',
    schema_version: '3.0.0',
    plan_id: overrides.plan_id || 'plan:test-evidence',
    correlation_id: overrides.correlation_id || 'corr:test-evidence',
    steps: steps.map((s, i) => ({
      step_id: s.step_id || `step:${i}`,
      target: { context_id: s.context_id || 'ctx.top.1', node_id: s.node_id || `node:${i}` },
      action: s.action || { op: 'type_text', value: 'test' },
      risk: 'safe',
      postcondition: { type: 'none' },
      ...s,
    })),
    ...overrides,
  };
}

/** Minimal mock root for observation. */
const MOCK_ROOT = createElement('body');

/** Create a mock observeMutations function that gives us manual control. */
function createMockObserver() {
  let callback = null;
  const handle = {
    disconnected: false,
    disconnect() { handle.disconnected = true; callback = null; },
  };
  const observeFn = (_root, cb) => {
    callback = cb;
    return handle;
  };
  const emit = (records) => { if (callback) callback(records); };
  return { observeFn, emit, handle };
}

/** Create a mock MutationRecord. */
function mutationRecord(type, opts = {}) {
  return {
    type,
    target: opts.target || null,
    addedNodes: opts.addedNodes || [],
    removedNodes: opts.removedNodes || [],
    attributeName: opts.attributeName || null,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

console.log('\n=== DOM Evidence Emitter — Phase 4.2 ===');

// ─── Module Exports ──────────────────────────────────────────────────

console.log('\n--- Module Exports ---');
ok(typeof DomEvidenceEmitter === 'function', 'DomEvidenceEmitter is exported as constructor');
ok(Array.isArray(EVIDENCE_TYPES), 'EVIDENCE_TYPES is exported as array');
ok(EVIDENCE_TYPES.length === 9, 'EVIDENCE_TYPES has 9 entries');
ok(typeof MAX_EVIDENCE_PER_PLAN === 'number', 'MAX_EVIDENCE_PER_PLAN is exported');
ok(MAX_EVIDENCE_PER_PLAN === 50, 'MAX_EVIDENCE_PER_PLAN is 50');

// ─── API Surface ─────────────────────────────────────────────────────

console.log('\n--- API Surface ---');
{
  const emitter = new DomEvidenceEmitter();
  ok(typeof emitter.startObserving === 'function', 'startObserving is a function');
  ok(typeof emitter.stopObserving === 'function', 'stopObserving is a function');
  ok(typeof emitter.getEvidence === 'function', 'getEvidence is a function');
  ok(typeof emitter.onEvidence === 'function', 'onEvidence is a function');
  ok(typeof emitter.reset === 'function', 'reset is a function');
}

// ─── Evidence Type: control_removed ──────────────────────────────────

console.log('\n--- control_removed ---');
{
  const element = createElement('input', { id: 'fname' });
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:fname', element }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:fname' }]);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  // Simulate removing the planned target
  const parent = createElement('div', { children: [element] });
  emit([mutationRecord('childList', {
    target: parent,
    removedNodes: [element],
  })]);

  const events = emitter.getEvidence();
  ok(events.length >= 1, 'control_removed: emits at least one event');
  ok(events[0].type === 'control_removed', 'control_removed: correct type');
  ok(events[0].context_id === 'ctx.top.1', 'control_removed: correct context_id');
  ok(events[0].node_id === 'node:fname', 'control_removed: correct node_id');
  ok(events[0].severity_hint === 'hard', 'control_removed: severity is hard');
  ok(events[0].plan_id === 'plan:test-evidence', 'control_removed: carries plan_id');
  ok(events[0].correlation_id === 'corr:test-evidence', 'control_removed: carries correlation_id');
  ok(typeof events[0].timestamp === 'string', 'control_removed: has timestamp');

  emitter.stopObserving();
}

// ─── Evidence Type: control_recreated ────────────────────────────────

console.log('\n--- control_recreated ---');
{
  const element = createElement('input', { id: 'fname' });
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:fname', element }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:fname' }]);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  // Step 1: Remove the target
  const parent = createElement('div', { children: [element] });
  emit([mutationRecord('childList', {
    target: parent,
    removedNodes: [element],
  })]);

  ok(emitter.getEvidence().some(e => e.type === 'control_removed'), 'control_recreated: first removal detected');

  // Step 2: Re-add (simulating recreation — binding still resolves to same element)
  emit([mutationRecord('childList', {
    target: parent,
    addedNodes: [element],
  })]);

  const events = emitter.getEvidence();
  const recreated = events.find(e => e.type === 'control_recreated');
  ok(!!recreated, 'control_recreated: event emitted after re-add');
  ok(recreated?.context_id === 'ctx.top.1', 'control_recreated: correct context_id');
  ok(recreated?.node_id === 'node:fname', 'control_recreated: correct node_id');
  ok(recreated?.severity_hint === 'hard', 'control_recreated: severity is hard');

  emitter.stopObserving();
}

// ─── Evidence Type: option_set_changed ───────────────────────────────

console.log('\n--- option_set_changed ---');
{
  const selectEl = createElement('select', { id: 'country' });
  selectEl.children = [createElement('option'), createElement('option'), createElement('option')];
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:country', element: selectEl }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:country', action: { op: 'select_option' } }]);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  // Simulate options being changed
  const newOption = createElement('option');
  selectEl.children.push(newOption);
  emit([mutationRecord('childList', {
    target: selectEl,
    addedNodes: [newOption],
  })]);

  const events = emitter.getEvidence();
  const optEvt = events.find(e => e.type === 'option_set_changed');
  ok(!!optEvt, 'option_set_changed: event emitted');
  ok(optEvt?.context_id === 'ctx.top.1', 'option_set_changed: correct context_id');
  ok(optEvt?.node_id === 'node:country', 'option_set_changed: correct node_id');
  ok(optEvt?.severity_hint === 'soft', 'option_set_changed: severity is soft');
  ok(optEvt?.after?.option_count === 4, 'option_set_changed: after has option_count');

  emitter.stopObserving();
}

// ─── Evidence Type: subtree_replaced ─────────────────────────────────

console.log('\n--- subtree_replaced ---');
{
  const el1 = createElement('input', { id: 'field1' });
  const el2 = createElement('input', { id: 'field2' });
  const container = createElement('div', { children: [el1, el2] });
  const registry = buildRegistry([
    { contextId: 'ctx.top.1', nodeId: 'node:f1', element: el1 },
    { contextId: 'ctx.top.1', nodeId: 'node:f2', element: el2 },
  ]);
  const plan = makePlan([
    { context_id: 'ctx.top.1', node_id: 'node:f1' },
    { context_id: 'ctx.top.1', node_id: 'node:f2' },
  ]);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  // Simulate removing the entire container (subtree with multiple planned targets)
  emit([mutationRecord('childList', {
    target: createElement('body'),
    removedNodes: [container],
  })]);

  const events = emitter.getEvidence();
  const subtreeEvt = events.find(e => e.type === 'subtree_replaced');
  ok(!!subtreeEvt, 'subtree_replaced: event emitted for container with multiple planned targets');
  ok(subtreeEvt?.severity_hint === 'hard', 'subtree_replaced: severity is hard');
  ok(subtreeEvt?.before?.target_count === 2, 'subtree_replaced: before has target_count');

  emitter.stopObserving();
}

// ─── Evidence Type: cascade_triggered ────────────────────────────────

console.log('\n--- cascade_triggered ---');
{
  const stateEl = createElement('select', { id: 'state' });
  const cityEl = createElement('select', { id: 'city' });
  cityEl.children = [createElement('option')];
  const registry = buildRegistry([
    { contextId: 'ctx.top.1', nodeId: 'node:state', element: stateEl },
    { contextId: 'ctx.top.1', nodeId: 'node:city', element: cityEl },
  ]);
  const plan = makePlan([
    { step_id: 'step:state', context_id: 'ctx.top.1', node_id: 'node:state', action: { op: 'select_option' } },
    { step_id: 'step:city', context_id: 'ctx.top.1', node_id: 'node:city', action: { op: 'select_option' } },
  ]);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  // Simulate: step on 'state' was executed, causing mutation on 'city'
  emitter.notifyStepExecuted('step:state', 'ctx.top.1', 'node:state');

  // Now a mutation occurs: the city element itself is removed and re-added (cascade)
  const parent = createElement('div', { children: [cityEl] });
  emit([mutationRecord('childList', {
    target: parent,
    removedNodes: [cityEl],
    addedNodes: [cityEl],
  })]);

  const events = emitter.getEvidence();
  const cascadeEvt = events.find(e => e.type === 'cascade_triggered');
  ok(!!cascadeEvt, 'cascade_triggered: event emitted');
  ok(cascadeEvt?.context_id === 'ctx.top.1', 'cascade_triggered: correct context_id');
  ok(cascadeEvt?.node_id === 'node:city', 'cascade_triggered: correct node_id');
  ok(cascadeEvt?.severity_hint === 'soft', 'cascade_triggered: severity is soft');
  ok(cascadeEvt?.before?.trigger_target === 'node:state', 'cascade_triggered: before has trigger target');

  emitter.stopObserving();
}

// ─── Evidence Type: widget_recreated ─────────────────────────────────

console.log('\n--- widget_recreated ---');
{
  const widgetEl = createElement('div', { id: 'dropdown-widget', children: [createElement('span'), createElement('ul')] });
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:widget', element: widgetEl }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:widget' }]);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  // Simulate widget structure being rebuilt (removed and re-added with different structure)
  const newWidgetEl = createElement('div', { id: 'dropdown-widget', children: [createElement('input'), createElement('div'), createElement('div')] });
  // Update the binding to point to the new element (simulating rebind)
  registry.rebind('ctx.top.1', 'node:widget', newWidgetEl);

  emit([mutationRecord('childList', {
    target: createElement('body'),
    removedNodes: [widgetEl],
    addedNodes: [newWidgetEl],
  })]);

  const events = emitter.getEvidence();
  const widgetEvt = events.find(e => e.type === 'widget_recreated');
  ok(!!widgetEvt, 'widget_recreated: event emitted');
  ok(widgetEvt?.context_id === 'ctx.top.1', 'widget_recreated: correct context_id');
  ok(widgetEvt?.node_id === 'node:widget', 'widget_recreated: correct node_id');
  ok(widgetEvt?.severity_hint === 'hard', 'widget_recreated: severity is hard');
  ok(widgetEvt?.before?.fingerprint != null, 'widget_recreated: has before fingerprint');
  ok(widgetEvt?.after?.fingerprint != null, 'widget_recreated: has after fingerprint');
  ok(widgetEvt?.before?.fingerprint !== widgetEvt?.after?.fingerprint, 'widget_recreated: fingerprints differ');

  emitter.stopObserving();
}

// ─── Evidence Type: visibility_changed ───────────────────────────────

console.log('\n--- visibility_changed ---');
{
  const element = createElement('input', { id: 'hidden-field', visible: true });
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:hidden', element }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:hidden' }]);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  // Simulate display:none applied
  element.style.display = 'none';
  emit([mutationRecord('attributes', {
    target: element,
    attributeName: 'style',
  })]);

  const events = emitter.getEvidence();
  const visEvt = events.find(e => e.type === 'visibility_changed');
  ok(!!visEvt, 'visibility_changed: event emitted');
  ok(visEvt?.context_id === 'ctx.top.1', 'visibility_changed: correct context_id');
  ok(visEvt?.node_id === 'node:hidden', 'visibility_changed: correct node_id');
  ok(visEvt?.after?.visible === false, 'visibility_changed: after shows not visible');
  ok(visEvt?.before?.visible === true, 'visibility_changed: before shows visible');
  ok(visEvt?.severity_hint === 'hard', 'visibility_changed: hiding is hard severity');

  emitter.stopObserving();
}

// ─── Evidence Type: document_changed ─────────────────────────────────

console.log('\n--- document_changed ---');
{
  const element = createElement('input');
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:x', element }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:x' }]);
  const { observeFn } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  emitter.emitDocumentChanged({ context_id: 'ctx.top.1', before: { url: '/page1' }, after: { url: '/page2' } });

  const events = emitter.getEvidence();
  ok(events.length === 1, 'document_changed: emits one event');
  ok(events[0].type === 'document_changed', 'document_changed: correct type');
  ok(events[0].severity_hint === 'hard', 'document_changed: severity is hard');
  ok(events[0].before?.url === '/page1', 'document_changed: before payload');
  ok(events[0].after?.url === '/page2', 'document_changed: after payload');
  ok(events[0].plan_id === 'plan:test-evidence', 'document_changed: carries plan_id');

  emitter.stopObserving();
}

// ─── Evidence Type: frame_changed ────────────────────────────────────

console.log('\n--- frame_changed ---');
{
  const frameEl = createElement('iframe');
  const registry = buildRegistry([{ contextId: 'ctx.frame.1', nodeId: 'node:frame', element: frameEl }]);
  const plan = makePlan([{ context_id: 'ctx.frame.1', node_id: 'node:frame' }]);
  const { observeFn } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  emitter.emitFrameChanged({
    context_id: 'ctx.frame.1',
    node_id: 'node:frame',
    before: { src: '/old' },
    after: { src: '/new' },
  });

  const events = emitter.getEvidence();
  ok(events.length === 1, 'frame_changed: emits one event');
  ok(events[0].type === 'frame_changed', 'frame_changed: correct type');
  ok(events[0].context_id === 'ctx.frame.1', 'frame_changed: correct context_id');
  ok(events[0].severity_hint === 'hard', 'frame_changed: planned target gets hard severity');
  ok(events[0].before?.src === '/old', 'frame_changed: before payload');
  ok(events[0].after?.src === '/new', 'frame_changed: after payload');

  emitter.stopObserving();
}

// ─── Noise Filtering ─────────────────────────────────────────────────

console.log('\n--- Noise Filtering ---');
{
  const plannedEl = createElement('input', { id: 'planned' });
  const unplannedEl = createElement('input', { id: 'unplanned' });
  const registry = buildRegistry([
    { contextId: 'ctx.top.1', nodeId: 'node:planned', element: plannedEl },
  ]);
  // Only 'node:planned' is in the plan
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:planned' }]);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  // Mutation on a non-planned element — should produce NO evidence
  emit([mutationRecord('childList', {
    target: createElement('div'),
    removedNodes: [unplannedEl],
  })]);

  ok(emitter.getEvidence().length === 0, 'noise: mutation on non-planned element produces no evidence');

  // Attribute mutation on non-planned element
  emit([mutationRecord('attributes', {
    target: unplannedEl,
    attributeName: 'style',
  })]);

  ok(emitter.getEvidence().length === 0, 'noise: attribute change on non-planned element produces no evidence');

  // Now a mutation on the planned element DOES produce evidence
  emit([mutationRecord('childList', {
    target: createElement('div'),
    removedNodes: [plannedEl],
  })]);

  ok(emitter.getEvidence().length >= 1, 'noise: mutation on planned element DOES produce evidence');

  emitter.stopObserving();
}

// ─── Bounded Output ──────────────────────────────────────────────────

console.log('\n--- Bounded Output ---');
{
  const elements = [];
  const bindings = [];
  const steps = [];
  for (let i = 0; i < 60; i++) {
    const el = createElement('input', { id: `field-${i}` });
    elements.push(el);
    bindings.push({ contextId: 'ctx.top.1', nodeId: `node:${i}`, element: el });
    steps.push({ context_id: 'ctx.top.1', node_id: `node:${i}` });
  }
  const registry = buildRegistry(bindings);
  const plan = makePlan(steps);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  // Emit 60 removal mutations — should cap at 50
  for (let i = 0; i < 60; i++) {
    emit([mutationRecord('childList', {
      target: createElement('div', { children: [elements[i]] }),
      removedNodes: [elements[i]],
    })]);
  }

  const events = emitter.getEvidence();
  ok(events.length <= MAX_EVIDENCE_PER_PLAN, `bounded: ${events.length} events <= ${MAX_EVIDENCE_PER_PLAN} max`);
  ok(events.length === MAX_EVIDENCE_PER_PLAN, `bounded: exactly ${MAX_EVIDENCE_PER_PLAN} events emitted`);

  emitter.stopObserving();
}

// ─── Correlation ─────────────────────────────────────────────────────

console.log('\n--- Correlation ---');
{
  const element = createElement('input');
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:x', element }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:x' }], {
    plan_id: 'plan:specific-123',
    correlation_id: 'corr:specific-456',
  });
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  emit([mutationRecord('childList', {
    target: createElement('div', { children: [element] }),
    removedNodes: [element],
  })]);

  const events = emitter.getEvidence();
  ok(events[0].plan_id === 'plan:specific-123', 'correlation: event carries specific plan_id');
  ok(events[0].correlation_id === 'corr:specific-456', 'correlation: event carries specific correlation_id');
  ok(events[0].step_id === 'step:0', 'correlation: event carries step_id of upcoming step');

  emitter.stopObserving();
}

// ─── No Strategic Logic ──────────────────────────────────────────────

console.log('\n--- No Strategic Logic ---');
{
  const element = createElement('input');
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:x', element }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:x' }]);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  emit([mutationRecord('childList', {
    target: createElement('div', { children: [element] }),
    removedNodes: [element],
  })]);

  emitter.emitDocumentChanged({ context_id: 'ctx.top.1' });
  emitter.emitFrameChanged({ context_id: 'ctx.top.1', node_id: 'node:x' });

  const events = emitter.getEvidence();
  for (const evt of events) {
    ok(!('execution_mode' in evt), `no-strategy: event ${evt.type} has no execution_mode`);
    ok(!('next_action' in evt), `no-strategy: event ${evt.type} has no next_action`);
    ok(!('recommendation' in evt), `no-strategy: event ${evt.type} has no recommendation`);
    ok(!('retry_strategy' in evt), `no-strategy: event ${evt.type} has no retry_strategy`);
  }

  emitter.stopObserving();
}

// ─── Public Refs Only ────────────────────────────────────────────────

console.log('\n--- Public Refs Only ---');
{
  const element = createElement('input', { id: 'private-test' });
  element.className = 'form-control ng-model-xyz';
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:x', element }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:x' }]);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  emit([mutationRecord('childList', {
    target: createElement('div', { children: [element] }),
    removedNodes: [element],
  })]);

  emitter.emitDocumentChanged({ context_id: 'ctx.top.1' });

  const events = emitter.getEvidence();
  const serialized = JSON.stringify(events);
  ok(!serialized.includes('querySelector'), 'public-refs: no querySelector in output');
  ok(!serialized.includes('xpath'), 'public-refs: no xpath in output');
  ok(!serialized.includes('css-selector'), 'public-refs: no css-selector in output');
  ok(!serialized.includes('.form-control'), 'public-refs: no CSS class selectors in output');
  ok(!serialized.includes('#private-test'), 'public-refs: no DOM id selectors in output');
  ok(!serialized.includes('liveNodeReference'), 'public-refs: no live node references in output');
  ok(!serialized.includes('liveElement'), 'public-refs: no live element references in output');

  // Verify events only have public refs (context_id, node_id)
  for (const evt of events) {
    if (evt.context_id) ok(typeof evt.context_id === 'string', `public-refs: context_id is string in ${evt.type}`);
    if (evt.node_id) ok(typeof evt.node_id === 'string', `public-refs: node_id is string in ${evt.type}`);
  }

  emitter.stopObserving();
}

// ─── Lifecycle: reset ────────────────────────────────────────────────

console.log('\n--- Lifecycle ---');
{
  const element = createElement('input');
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:x', element }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:x' }]);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  emit([mutationRecord('childList', {
    target: createElement('div', { children: [element] }),
    removedNodes: [element],
  })]);

  ok(emitter.getEvidence().length > 0, 'lifecycle: has evidence before reset');
  emitter.reset();
  ok(emitter.getEvidence().length === 0, 'lifecycle: evidence cleared after reset');

  // Can still observe after reset
  emit([mutationRecord('childList', {
    target: createElement('div', { children: [element] }),
    removedNodes: [element],
  })]);

  ok(emitter.getEvidence().length > 0, 'lifecycle: can still observe after reset');

  emitter.stopObserving();
}

// ─── Lifecycle: stopObserving disconnects ────────────────────────────

{
  const element = createElement('input');
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:x', element }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:x' }]);
  const { observeFn, emit, handle } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });
  emitter.stopObserving();

  ok(handle.disconnected, 'lifecycle: stopObserving disconnects observer');

  // Mutations after stop should not produce evidence
  emit([mutationRecord('childList', {
    target: createElement('div', { children: [element] }),
    removedNodes: [element],
  })]);
  ok(emitter.getEvidence().length === 0, 'lifecycle: no evidence after stopObserving');
}

// ─── onEvidence callback ─────────────────────────────────────────────

console.log('\n--- onEvidence callback ---');
{
  const element = createElement('input');
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:x', element }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:x' }]);
  const { observeFn, emit } = createMockObserver();

  const received = [];
  const emitter = new DomEvidenceEmitter();
  emitter.onEvidence((evt) => received.push(evt));
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  emit([mutationRecord('childList', {
    target: createElement('div', { children: [element] }),
    removedNodes: [element],
  })]);

  ok(received.length >= 1, 'onEvidence: callback fired');
  ok(received[0].type === 'control_removed', 'onEvidence: received correct event type');
}

// ─── Listener error isolation ────────────────────────────────────────

{
  const element = createElement('input');
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:x', element }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:x' }]);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.onEvidence(() => { throw new Error('listener crash'); });
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  // Should not throw even though listener throws
  let threw = false;
  try {
    emit([mutationRecord('childList', {
      target: createElement('div', { children: [element] }),
      removedNodes: [element],
    })]);
  } catch { threw = true; }

  ok(!threw, 'onEvidence: listener error does not crash emitter');
  ok(emitter.getEvidence().length >= 1, 'onEvidence: evidence still emitted despite listener error');

  emitter.stopObserving();
}

// ─── Evidence Event Structure ────────────────────────────────────────

console.log('\n--- Event Structure ---');
{
  const element = createElement('input');
  const registry = buildRegistry([{ contextId: 'ctx.top.1', nodeId: 'node:x', element }]);
  const plan = makePlan([{ context_id: 'ctx.top.1', node_id: 'node:x' }]);
  const { observeFn, emit } = createMockObserver();

  const emitter = new DomEvidenceEmitter();
  emitter.startObserving(plan, registry, { observeMutations: observeFn, root: MOCK_ROOT });

  emit([mutationRecord('childList', {
    target: createElement('div', { children: [element] }),
    removedNodes: [element],
  })]);

  const evt = emitter.getEvidence()[0];
  const requiredFields = ['type', 'timestamp', 'plan_id', 'step_id', 'correlation_id', 'context_id', 'node_id', 'severity_hint'];
  for (const field of requiredFields) {
    ok(field in evt, `structure: event has required field '${field}'`);
  }
  ok('before' in evt, 'structure: event has optional before field');
  ok('after' in evt, 'structure: event has optional after field');

  // Timestamp is ISO format
  ok(/^\d{4}-\d{2}-\d{2}T/.test(evt.timestamp), 'structure: timestamp is ISO format');

  // severity_hint is 'hard' or 'soft'
  ok(evt.severity_hint === 'hard' || evt.severity_hint === 'soft', 'structure: severity_hint is hard or soft');

  emitter.stopObserving();
}

// ─── EVIDENCE_TYPES enum completeness ────────────────────────────────

console.log('\n--- EVIDENCE_TYPES enum ---');
{
  const expected = [
    'control_removed', 'control_recreated', 'option_set_changed',
    'subtree_replaced', 'cascade_triggered', 'widget_recreated',
    'visibility_changed', 'document_changed', 'frame_changed',
  ];
  for (const type of expected) {
    ok(EVIDENCE_TYPES.includes(type), `enum: EVIDENCE_TYPES includes '${type}'`);
  }
  ok(Object.isFrozen(EVIDENCE_TYPES), 'enum: EVIDENCE_TYPES is frozen');
}

// ─── Summary ─────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
