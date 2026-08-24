/**
 * Tests for Phase 1.5: ActionPlan Runner, Resolver, Observation.
 * Run: node extension-dev/tests/test-runner.js
 *
 * Uses vm.createContext like other test suites in this project.
 * The runner and resolver need:
 *   - Real Promise (for async dispatch)
 *   - Minimal DOM stubs (elements with .value, .tagName, .id, .name)
 *   - window.ccCapabilities (from registry.js)
 *   - window.ccResolver (from runtime/resolver.js)
 *   - window.ccRunner (from runtime/runner.js)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '../../apps/extension');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

// ── Minimal DOM stubs ───────────────────────────────────────────────────
function makeElement(tag, id, name, opts) {
  opts = opts || {};
  var el = {
    tagName: tag.toUpperCase(),
    id: id || '',
    name: name || '',
    type: opts.type || (tag === 'select' ? undefined : 'text'),
    value: opts.value || '',
    placeholder: opts.placeholder || '',
    checked: false,
    options: opts.options || [],
    selectedIndex: 0,
    onchange: null,
    className: '',
    classList: { contains: function () { return false; }, add: function () {}, remove: function () {} },
    getAttribute: function (a) {
      if (a === 'role') return opts.role || null;
      if (a === 'aria-label') return opts.ariaLabel || null;
      return null;
    },
    closest: function () { return null; },
    querySelector: function () { return null; },
    focus: function () {},
    blur: function () {},
    click: function () {},
    scrollIntoView: function () {},
    dispatchEvent: function () {},
    getBoundingClientRect: function () { return { width: 100, height: 30, top: 0, left: 0 }; },
  };
  return el;
}

function makeOption(text, value, idx) {
  return { text: text, value: value, textContent: text, index: idx || 0, selected: false, getAttribute: function (a) { return a === 'value' ? value : null; } };
}

var fullnameEl = makeElement('input', 'fullname', 'full_name', { placeholder: 'Enter full name' });
var fathernameEl = makeElement('input', 'fathername', 'father_name', { placeholder: 'Father name' });
var emailEl = makeElement('input', 'email', 'email', { type: 'email', placeholder: 'email@example.com' });
var catOpts = [makeOption('Select', '', 0), makeOption('OBC', 'obc', 1), makeOption('SC', 'sc', 2)];
var categoryEl = makeElement('select', 'category', 'category', { options: catOpts });
var mobileEl = makeElement('input', 'mobile', 'mobile', { type: 'tel', placeholder: 'Mobile number' });
var dobEl = makeElement('input', 'dob', 'dob', { placeholder: 'dd-mm-yyyy' });

var elements = [fullnameEl, fathernameEl, emailEl, categoryEl, mobileEl, dobEl];
var elementMap = { fullname: fullnameEl, fathername: fathernameEl, email: emailEl, category: categoryEl, mobile: mobileEl, dob: dobEl };

// ── Build VM context ────────────────────────────────────────────────────
var context = vm.createContext({
  window: {},
  document: {
    body: { dataset: {}, setAttribute: function () {} },
    querySelector: function (sel) {
      if (sel.startsWith('#')) return elementMap[sel.slice(1)] || null;
      return null;
    },
    querySelectorAll: function () { return []; },
    title: 'Test Form',
    createElement: function () { return { textContent: '' }; },
    head: { appendChild: function () {} },
  },
  location: { href: 'http://localhost/test-page', hostname: 'localhost' },
  console: console,
  setTimeout: setTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  clearTimeout: clearTimeout,
  getComputedStyle: function () { return { display: 'block', visibility: 'visible', opacity: '1' }; },
  CSS: { escape: function (s) { return s; } },
  Date: Date,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  JSON: JSON,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  RegExp: RegExp,
  Promise: Promise,
  Error: Error,
  Event: function (type, opts) { return { type: type }; },
  MouseEvent: function (type, opts) { return { type: type }; },
  KeyboardEvent: function (type, opts) { return { type: type }; },
  HTMLInputElement: { prototype: { value: '' } },
  HTMLTextAreaElement: { prototype: { value: '' } },
  HTMLSelectElement: { prototype: Object.create(null, { value: { get: function () { return ''; }, set: function (v) { this._value = v; }, configurable: true } }) },
  MutationObserver: function () { return { observe: function () {}, disconnect: function () {} }; },
  fetch: function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } }); },
  XMLHttpRequest: function () { return { open: function () {}, send: function () {} }; },
});
context.window = context;
context.self = context;
context.globalThis = context;

// ── Load extension scripts ──────────────────────────────────────────────
var scripts = [
  'shared/option-match.js',
  'shared/dom-utils.js',
  'shared/network-idle.js',
  'shared/llm-client.js',
  'shared/select-apply.js',
  'shared/semantic-aliases.js',
  'models/ir.js',
  'capabilities/registry.js',
  'runtime/resolver.js',
  'runtime/runner.js',
];

for (var i = 0; i < scripts.length; i++) {
  var p = path.join(EXT, scripts[i]);
  if (fs.existsSync(p)) {
    var code = fs.readFileSync(p, 'utf8');
    try { vm.runInContext(code, context, { filename: scripts[i] }); }
    catch (e) { console.error('Load error in ' + scripts[i] + ':', e.message); }
  }
}

// ══════════════════════════════════════════════════════════════════════
// SUITE 1: Resolver
// ══════════════════════════════════════════════════════════════════════

console.log('\n═══ Suite: Semantic Target Resolver ═══');

// Set up page context
var fakePageModel = {
  version: '1.0.0',
  url: 'http://localhost/test-page',
  hostname: 'localhost',
  forms: [{
    fields: [
      { fieldId: 'id:fullname', label: 'Full Name', name: 'full_name', selector: '#fullname', placeholder: 'Enter full name' },
      { fieldId: 'id:fathername', label: "Father's Name", name: 'father_name', selector: '#fathername', placeholder: 'Father name' },
      { fieldId: 'id:email', label: 'Email ID', name: 'email', selector: '#email', placeholder: 'email@example.com' },
      { fieldId: 'id:category', label: 'Category', name: 'category', selector: '#category' },
      { fieldId: 'id:mobile', label: 'Mobile Number', name: 'mobile', selector: '#mobile', placeholder: 'Mobile number' },
      { fieldId: 'id:dob', label: 'Date of Birth', name: 'dob', selector: '#dob', placeholder: 'dd-mm-yyyy' },
    ]
  }]
};

// Inject test aliases (simulates service-provided aliases)
if (context.ccSemanticAliases && context.ccSemanticAliases.merge) {
  context.ccSemanticAliases.merge({
    'full_name': ['full name', 'name', 'applicant name'],
    'father_name': ['father', "father's name", 'father name'],
    'dob': ['date of birth', 'dob', 'birth date'],
    'email': ['email', 'e-mail', 'email id'],
    'mobile': ['mobile', 'phone', 'mobile number'],
    'category': ['category', 'caste'],
  });
}

context.ccResolver.setPageContext(fakePageModel, elements);

// field_id
var r1 = context.ccResolver.resolve({ field_id: 'id:fullname' });
ok('Resolve by field_id', r1.element === fullnameEl && r1.method === 'field_id');

var r1b = context.ccResolver.resolve({ field_id: 'id:dob' });
ok('Resolve by field_id (dob)', r1b.element === dobEl);

// semantic_key
var r2 = context.ccResolver.resolve({ semantic_key: 'father_name' });
ok('Resolve by semantic_key (father_name)', r2.element === fathernameEl && r2.method === 'semantic_key');

var r3 = context.ccResolver.resolve({ semantic_key: 'dob' });
ok('Resolve by semantic_key (dob)', r3.element === dobEl && r3.method === 'semantic_key');

var r4 = context.ccResolver.resolve({ semantic_key: 'email' });
ok('Resolve by semantic_key (email)', r4.element === emailEl && r4.method === 'semantic_key');

var r4b = context.ccResolver.resolve({ semantic_key: 'category' });
ok('Resolve by semantic_key (category)', r4b.element === categoryEl && r4b.method === 'semantic_key');

// label
var r5 = context.ccResolver.resolve({ label: 'Full Name' });
ok('Resolve by label (exact)', r5.element === fullnameEl && r5.method === 'label');

var r6 = context.ccResolver.resolve({ label: 'Mobile' });
ok('Resolve by label (fuzzy)', r6.element === mobileEl && r6.method === 'label');

var r6b = context.ccResolver.resolve({ label: 'Date of Birth' });
ok('Resolve by label (Date of Birth)', r6b.element === dobEl && r6b.method === 'label');

// field_index
var r7 = context.ccResolver.resolve({ field_index: 3 });
ok('Resolve by field_index', r7.element === categoryEl && r7.method === 'field_index');

// hint
var r8 = context.ccResolver.resolve({ hint: { name: 'mobile' } });
ok('Resolve by hint.name', r8.element === mobileEl && r8.method === 'hint');

var r9 = context.ccResolver.resolve({ hint: { placeholder: 'dd-mm-yyyy' } });
ok('Resolve by hint.placeholder', r9.element === dobEl && r9.method === 'hint');

// css_selector (deprecated)
var r10 = context.ccResolver.resolve({ css_selector: '#category' });
ok('Resolve by css_selector (deprecated)', r10.element === categoryEl && r10.method === 'css_selector');

// Failures
var r11 = context.ccResolver.resolve({ field_id: 'nonexistent' });
ok('Failure: nonexistent field_id', r11.element === null && r11.error !== null);

var r12 = context.ccResolver.resolve(null);
ok('Failure: null target', r12.element === null && r12.error !== null);

// Priority: field_id > label
var r13 = context.ccResolver.resolve({ field_id: 'id:email', label: 'Full Name' });
ok('Priority: field_id over label', r13.element === emailEl && r13.method === 'field_id');

// Log
var log = context.ccResolver.getResolutionLog();
ok('Resolution log populated', log.length > 0);

// ══════════════════════════════════════════════════════════════════════
// SUITE 2: Linear → Graph Converter
// ══════════════════════════════════════════════════════════════════════

console.log('\n═══ Suite: Linear → Graph Converter ═══');

var linearPlan = {
  plan_id: 'plan_1',
  session_id: 'sess_1',
  actions: [
    { action: 'fill_text', target: { field_id: 'id:fullname' }, value: 'Test', timeout_ms: 3000 },
    { action: 'select_option', target: { field_id: 'id:category' }, value: 'OBC', timeout_ms: 3000 },
    { action: 'fill_text', target: { semantic_key: 'mobile' }, value: '9876543210', timeout_ms: 3000 },
  ]
};

var graph = context.ccRunner.fromLinear(linearPlan);

ok('Graph plan_id preserved', graph.plan_id === 'plan_1');
ok('Graph version = 2', graph.version === 2);
ok('Graph entry_node = n0', graph.entry_node === 'n0');
ok('Graph: 3 actions + 2 terminals = 5 nodes', Object.keys(graph.nodes).length === 5);
ok('Graph: 6 edges (success+failure per action)', graph.edges.length === 6);
ok('Node n0 type = action', graph.nodes.n0.type === 'action');
ok('Node n0 action = fill_text', graph.nodes.n0.action.action === 'fill_text');
ok('terminal_complete exists', graph.nodes.terminal_complete.type === 'terminal');
ok('terminal_abort exists', graph.nodes.terminal_abort.type === 'terminal');
ok('n2 → terminal_complete on success', graph.edges.some(function (e) { return e.from === 'n2' && e.to === 'terminal_complete' && e.condition === 'success'; }));
ok('n0 → terminal_abort on failure', graph.edges.some(function (e) { return e.from === 'n0' && e.to === 'terminal_abort' && e.condition === 'failure'; }));

// Empty plan
var emptyGraph = context.ccRunner.fromLinear({ plan_id: 'empty', actions: [] });
ok('Empty plan: entry → terminal_complete', emptyGraph.entry_node === 'terminal_complete');

// ══════════════════════════════════════════════════════════════════════
// SUITE 3: Graph Execution
// ══════════════════════════════════════════════════════════════════════

console.log('\n═══ Suite: ActionPlan Runner ═══');

// Need to run async tests
async function runAsyncTests() {
  // Execute linear plan
  var obs1 = await context.ccRunner.executeLinear(linearPlan);

  ok('Observation plan_id', obs1.plan_id === 'plan_1');
  ok('Observation protocol_version = 2', obs1.protocol_version === 2);
  ok('Observation has execution_path', Array.isArray(obs1.execution_path) && obs1.execution_path.length > 0);
  ok('First entry is n0', obs1.execution_path[0].node_id === 'n0');
  ok('fill_text status = success', obs1.execution_path[0].status === 'success');
  ok('fill_text actual_value', obs1.execution_path[0].actual_value === 'Test');
  ok('Duration recorded', obs1.execution_path[0].duration_ms >= 0);
  ok('All actions executed', obs1.execution_path.filter(function (e) { return e.node_id.startsWith('n'); }).length === 3);
  ok('Terminal reached', obs1.execution_path.some(function (e) { return e.node_id === 'terminal_complete'; }));
  ok('page_state captured', obs1.page_state !== null);
  ok('page_state.url set', obs1.page_state.url.includes('localhost'));
  ok('DOM: fullname filled', fullnameEl.value === 'Test');
  ok('DOM: mobile filled', mobileEl.value === '9876543210');

  // Checkpoint plan
  var cpPlan = {
    plan_id: 'cp',
    session_id: 's1',
    version: 2,
    entry_node: 'a1',
    nodes: {
      a1: { type: 'action', action: { action: 'fill_text', target: { field_id: 'id:dob' }, value: '15-03-1990', timeout_ms: 3000 } },
      cp1: { type: 'checkpoint', checkpoint: { checkpoint_id: 'personal_done', label: 'Personal details', save_state: false } },
      end: { type: 'terminal', terminal: { status: 'complete', reason: null } },
    },
    edges: [
      { from: 'a1', to: 'cp1', condition: 'success' },
      { from: 'cp1', to: 'end', condition: 'success' },
    ]
  };

  var obs2 = await context.ccRunner.execute(cpPlan);
  ok('Checkpoint recorded', obs2.checkpoints_reached.includes('personal_done'));
  ok('DOB filled', dobEl.value === '15-03-1990');

  // Branch plan (element_exists → success path)
  var branchPlan = {
    plan_id: 'br',
    session_id: 's2',
    version: 2,
    entry_node: 'check',
    nodes: {
      check: { type: 'branch', condition: { condition_type: 'element_exists', target: { css_selector: '#fullname' } } },
      fill: { type: 'action', action: { action: 'fill_text', target: { field_id: 'id:fullname' }, value: 'Branched', timeout_ms: 3000 } },
      skip: { type: 'terminal', terminal: { status: 'complete', reason: 'skipped' } },
      end: { type: 'terminal', terminal: { status: 'complete', reason: null } },
    },
    edges: [
      { from: 'check', to: 'fill', condition: 'success' },
      { from: 'check', to: 'skip', condition: 'failure' },
      { from: 'fill', to: 'end', condition: 'success' },
    ]
  };

  var obs3 = await context.ccRunner.execute(branchPlan);
  ok('Branch: element_exists → success', obs3.execution_path[0].actual_value === 'true');
  ok('Branch: follows success edge → fill', obs3.execution_path.some(function (e) { return e.node_id === 'fill'; }));
  ok('Branch: fill executed', fullnameEl.value === 'Branched');

  // Branch failure path
  var branchPlan2 = {
    plan_id: 'br2',
    session_id: 's3',
    version: 2,
    entry_node: 'check',
    nodes: {
      check: { type: 'branch', condition: { condition_type: 'element_exists', target: { css_selector: '#nonexistent' } } },
      yes: { type: 'terminal', terminal: { status: 'complete', reason: 'found' } },
      no: { type: 'terminal', terminal: { status: 'complete', reason: 'not found' } },
    },
    edges: [
      { from: 'check', to: 'yes', condition: 'success' },
      { from: 'check', to: 'no', condition: 'failure' },
    ]
  };

  var obs4 = await context.ccRunner.execute(branchPlan2);
  ok('Branch: missing element → failure edge', obs4.execution_path.some(function (e) { return e.node_id === 'no'; }));

  // Failed target → failure edge
  var failPlan = {
    plan_id: 'fail',
    session_id: 's4',
    version: 2,
    entry_node: 'bad',
    nodes: {
      bad: { type: 'action', action: { action: 'fill_text', target: { field_id: 'nonexistent' }, value: 'X', timeout_ms: 1000 } },
      ok_end: { type: 'terminal', terminal: { status: 'complete', reason: null } },
      fail_end: { type: 'terminal', terminal: { status: 'aborted', reason: 'target failed' } },
    },
    edges: [
      { from: 'bad', to: 'ok_end', condition: 'success' },
      { from: 'bad', to: 'fail_end', condition: 'failure' },
    ]
  };

  var obs5 = await context.ccRunner.execute(failPlan);
  ok('Failed target → failure edge taken', obs5.execution_path.some(function (e) { return e.node_id === 'fail_end'; }));
  ok('Failed action has error', obs5.execution_path[0].error && obs5.execution_path[0].error.includes('target_not_resolved'));

  // Callbacks
  var events = [];
  await context.ccRunner.executeLinear(
    { plan_id: 'cb', actions: [{ action: 'fill_text', target: { field_id: 'id:email' }, value: 'a@b.c', timeout_ms: 3000 }] },
    { onNodeStart: function (id) { events.push('s:' + id); }, onNodeEnd: function (id, e) { events.push('e:' + id + ':' + e.status); } }
  );
  ok('onNodeStart fires', events.some(function (e) { return e.startsWith('s:'); }));
  ok('onNodeEnd fires with status', events.some(function (e) { return e.includes(':success'); }));

  // Observation structure
  ok('Obs has corrections array', Array.isArray(obs1.corrections));
  ok('Obs has human_interactions array', Array.isArray(obs1.human_interactions));
  ok('Obs has checkpoints_reached array', Array.isArray(obs1.checkpoints_reached));

  // maxNodes guard
  var loopPlan = {
    plan_id: 'loop',
    session_id: 's5',
    version: 2,
    entry_node: 'a',
    nodes: {
      a: { type: 'action', action: { action: 'fill_text', target: { field_id: 'id:fullname' }, value: 'X', timeout_ms: 100 } },
    },
    edges: [
      { from: 'a', to: 'a', condition: 'success' }, // infinite loop
    ]
  };
  var obs6 = await context.ccRunner.execute(loopPlan, { maxNodes: 5 });
  ok('maxNodes guard stops infinite loop', obs6.execution_path.length <= 6);
  ok('maxNodes adds overflow entry', obs6.execution_path.some(function (e) { return e.node_id === '_overflow'; }));
}

runAsyncTests().then(function () {
  console.log('\n═════════════════════════════════════');
  console.log('Runner Tests: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail > 0 ? 1 : 0);
}).catch(function (e) {
  console.error('Runner test error:', e.message, e.stack);
  process.exit(1);
});
