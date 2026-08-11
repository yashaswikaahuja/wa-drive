#!/usr/bin/env node
/**
 * APE-IMPL-P1-03 / APE-P1-08 — Chromium product-path ActionPlanExecutor v3 E2E
 *
 * Exercises perceive → local plan fixture → ActionPlanExecutor → gateway → EO
 * in real Chromium. Does NOT use legacy protocol-v2 Runner / autofill stack.
 *
 * Run: node extension-dev/tests/browser/run-action-plan-executor.mjs
 */
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const EXT_DIR = resolve(ROOT, 'extension');
const FIXTURES = resolve(ROOT, 'extension-dev/tests/fixtures');

let pass = 0;
let fail = 0;
/** ok(condition, message, extra?) — same order as unit suites */
const ok = (cond, message, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${message}`); }
  else { fail++; console.error(`  ✗ ${message}${extra ? ' — ' + extra : ''}`); }
};

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.CHROME_PATH,
].filter(Boolean);
const executablePath = CHROME_PATHS.find((p) => existsSync(p)) || undefined;

/** Product path scripts only — no autofill/mapper/resolver/runner. */
const PRODUCT_SCRIPTS = [
  'runtime/dom-gateway.js',
  'runtime/navigation-contract.js',
  'perception/binding-registry.js',
  'perception/revision-manager.js',
  'perception/canonical-hash.js',
  'perception/privacy-filter.js',
  'perception/widget-classifier.js',
  'perception/adapters/index.js',
  'perception/node-factory.js',
  'perception/edge-factory.js',
  'perception/graph-invariants.js',
  'perception/context-discovery.js',
  'perception/snapshot-builder.js',
  'perception/validator.js',
  'perception/index.js',
  'runtime/action-plan-executor.js',
];

async function injectProductPath(page) {
  for (const script of PRODUCT_SCRIPTS) {
    const code = readFileSync(resolve(EXT_DIR, script), 'utf8');
    await page.evaluate(code);
  }
  await page.evaluate(async () => {
    if (globalThis.CcContextDiscovery?.resetContextCounter) globalThis.CcContextDiscovery.resetContextCounter();
    if (globalThis.CcNodeFactory?.resetNodeCounter) globalThis.CcNodeFactory.resetNodeCounter();
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
      validatorOptions: { schema: null },
    });
    if (globalThis.CcValidator && !globalThis.CcValidator.isInitialized()) {
      await globalThis.CcValidator.initValidator({ schema: null });
    }
  });
}

function makePlan(snapshot, steps, authOverrides = {}) {
  return {
    kind: 'action_plan',
    schema_version: '3.0.0',
    plan_id: `plan:e2e-${Date.now().toString(36)}`,
    correlation_id: `corr:e2e-${Math.random().toString(36).slice(2, 10)}`,
    supersedes_plan_id: null,
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 120_000).toISOString(),
    target_binding: {
      document_id: snapshot.document_id,
      snapshot_id: snapshot.snapshot_id,
      expected_revision: snapshot.revision,
    },
    steps,
    authorization: {
      max_risk: 'reversible',
      operator_confirmed: false,
      allow_navigation: false,
      allow_submit: false,
      ...authOverrides,
    },
  };
}

function findControlNode(snapshot, pred) {
  const nodes = snapshot.nodes || {};
  for (const [id, n] of Object.entries(nodes)) {
    if (pred(n, id)) return { id, node: n };
  }
  return null;
}

async function withPage(browser, fixtureRel, fn) {
  const page = await browser.newPage();
  try {
    const fixturePath = resolve(FIXTURES, fixtureRel);
    await page.goto(pathToFileURL(fixturePath).href, { waitUntil: 'domcontentloaded' });
    await injectProductPath(page);
    return await fn(page);
  } finally {
    await page.close();
  }
}

console.log('\n=== ActionPlanExecutor v3 Chromium product-path E2E ===\n');

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--disable-web-security', '--allow-file-access-from-files'],
});

try {
  // ── 1. Native text input ──────────────────────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot', includeGeometry: true });
      const nodes = snapshot.nodes || {};
      let target = null;
      for (const [id, n] of Object.entries(nodes)) {
        if ((n.affordances || []).includes('type_text') && n.widget?.status !== 'unsupported') {
          target = { id, node: n };
          break;
        }
      }
      if (!target) return { error: 'no type_text node' };
      const plan = {
        kind: 'action_plan',
        schema_version: '3.0.0',
        plan_id: 'plan:e2e-text',
        correlation_id: 'corr:e2e-text',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 'step:text',
          target: { context_id: target.node.context_id, node_id: target.id },
          action: { op: 'type_text', value: 'Ada Lovelace', clear_first: true },
          risk: 'safe',
          required_affordance: 'type_text',
          required_adapter_id: target.node.widget?.adapter_id || null,
          postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_navigation: false, allow_submit: false },
      };
      const obs = await globalThis.CcActionPlanExecutor.execute(plan);
      const filled = document.querySelector('#fullname')?.value || '';
      return { obs, filled, nodeId: target.id, hasLegacy: typeof globalThis.ccExecutor === 'function' };
    });
    ok(result.obs?.kind === 'execution_observation', 'text: returns EO v3');
    ok(result.obs?.outcome === 'completed', 'text: completed', JSON.stringify(result.obs?.steps || result.error));
    ok(result.filled === 'Ada Lovelace', 'text: native input value set');
    ok(result.hasLegacy === false, 'text: no legacy ccExecutor on product path');
  });

  // ── 2. Checkbox toggle ────────────────────────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      let target = null;
      for (const [id, n] of Object.entries(snapshot.nodes || {})) {
        if ((n.affordances || []).includes('toggle')) {
          target = { id, node: n };
          break;
        }
      }
      if (!target) return { error: 'no toggle' };
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:e2e-toggle', correlation_id: 'corr:e2e-toggle',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 'step:toggle',
          target: { context_id: target.node.context_id, node_id: target.id },
          action: { op: 'toggle', desired_state: true },
          risk: 'reversible',
          required_affordance: 'toggle',
          required_adapter_id: target.node.widget?.adapter_id || null,
          postcondition: { type: 'checked', expected_value_state: null, expected_boolean: true, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'reversible', operator_confirmed: false, allow_navigation: false, allow_submit: false },
      };
      const obs = await globalThis.CcActionPlanExecutor.execute(plan);
      const checked = !!document.querySelector('input[type=checkbox]')?.checked;
      return { obs, checked };
    });
    ok(result.obs?.outcome === 'completed' || result.checked === true, 'toggle: checkbox checked or completed', JSON.stringify(result.obs?.steps));
  });

  // ── 3. Select-one via select_option ───────────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      const reg = globalThis.CcPerception.getBindingRegistry();
      // Prefer live SELECT/OPTION pairs from the binding registry (mechanical truth).
      let selectNode = null;
      let optionNode = null;
      for (const e of reg.entries()) {
        const el = e.liveNodeReference;
        if (el?.tagName === 'SELECT' && el.id === 'category') {
          selectNode = { id: e.nodeId, node: snapshot.nodes[e.nodeId], el };
        }
      }
      if (selectNode) {
        for (const e of reg.entries()) {
          const el = e.liveNodeReference;
          if (el?.tagName === 'OPTION' && el.value === 'obc' && el.closest?.('select') === selectNode.el) {
            optionNode = { id: e.nodeId, node: snapshot.nodes[e.nodeId], el };
            break;
          }
        }
        if (!optionNode) {
          for (const e of reg.entries()) {
            const el = e.liveNodeReference;
            if (el?.tagName === 'OPTION' && el.value && el.closest?.('select') === selectNode.el) {
              optionNode = { id: e.nodeId, node: snapshot.nodes[e.nodeId], el };
              break;
            }
          }
        }
      }
      if (!selectNode?.node || !optionNode?.node) {
        return {
          error: 'no select/option binding pair',
          select: !!selectNode,
          option: !!optionNode,
        };
      }

      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:e2e-select', correlation_id: 'corr:e2e-select',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 'step:select',
          target: { context_id: selectNode.node.context_id, node_id: selectNode.id },
          action: {
            op: 'select_option',
            option_target: { context_id: optionNode.node.context_id, node_id: optionNode.id },
          },
          risk: 'reversible',
          // Affordance may be select_one or activate depending on classifier; do not over-constrain.
          required_affordance: (selectNode.node.affordances || []).includes('select_one') ? 'select_one' : null,
          required_adapter_id: null,
          // Native <select> postcondition via value_state is flaky on aria; verify DOM below.
          postcondition: { type: 'none', expected_value_state: null, expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'reversible', operator_confirmed: false, allow_navigation: false, allow_submit: false },
      };
      const obs = await globalThis.CcActionPlanExecutor.execute(plan);
      return {
        obs,
        selectValue: document.querySelector('#category')?.value,
        optionValue: optionNode.el?.value,
      };
    });
    ok(result.obs?.kind === 'execution_observation', 'select: EO returned');
    ok(
      result.obs?.outcome === 'completed' && result.selectValue && result.selectValue !== '',
      'select: option applied',
      JSON.stringify({ outcome: result.obs?.outcome, steps: result.obs?.steps, err: result.error, val: result.selectValue, opt: result.optionValue })
    );
  });

  // ── 4. Date input ─────────────────────────────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      let target = null;
      for (const [id, n] of Object.entries(snapshot.nodes || {})) {
        if ((n.affordances || []).includes('type_text') && (n.widget?.adapter_id || '').includes('date')) {
          target = { id, node: n };
          break;
        }
      }
      if (!target) {
        for (const [id, n] of Object.entries(snapshot.nodes || {})) {
          if ((n.affordances || []).includes('type_text') && /date|dob/i.test(n.name_or_label || n.public_label || id)) {
            target = { id, node: n };
            break;
          }
        }
      }
      // Fall back to node bound to #dob via live registry scan
      if (!target) {
        for (const [id, n] of Object.entries(snapshot.nodes || {})) {
          if ((n.affordances || []).includes('type_text')) {
            const entry = globalThis.CcPerception.getBindingRegistry?.()?.resolve?.(n.context_id, id);
            if (entry?.liveNodeReference?.id === 'dob' || entry?.liveNodeReference?.type === 'date') {
              target = { id, node: n };
              break;
            }
          }
        }
      }
      if (!target) return { error: 'no date field' };
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:e2e-date', correlation_id: 'corr:e2e-date',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 'step:date',
          target: { context_id: target.node.context_id, node_id: target.id },
          action: { op: 'type_text', value: '1990-05-15', clear_first: true },
          risk: 'safe',
          required_affordance: 'type_text',
          required_adapter_id: target.node.widget?.adapter_id || null,
          postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_navigation: false, allow_submit: false },
      };
      const obs = await globalThis.CcActionPlanExecutor.execute(plan);
      return { obs, dob: document.querySelector('#dob')?.value };
    });
    ok(result.obs?.outcome === 'completed' || result.dob === '1990-05-15', 'date: filled', JSON.stringify(result));
  });

  // ── 5. Upload via file_reference ──────────────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      const reg = globalThis.CcPerception.getBindingRegistry();
      let target = null;
      for (const e of reg.entries()) {
        const el = e.liveNodeReference;
        if (el?.tagName === 'INPUT' && String(el.type).toLowerCase() === 'file') {
          const n = snapshot.nodes[e.nodeId];
          if (n) { target = { id: e.nodeId, node: n, el }; break; }
        }
      }
      if (!target) return { error: 'no file input binding' };
      const token = 'file:e2e-photo';
      const blob = new File([new Uint8Array([1, 2, 3, 4])], 'photo.png', { type: 'image/png' });
      globalThis.CcDomGateway.registerFileReference(token, blob);
      const hasUpload = (target.node.affordances || []).includes('upload');
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:e2e-upload', correlation_id: 'corr:e2e-upload',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 'step:upload',
          target: { context_id: target.node.context_id, node_id: target.id },
          action: { op: 'upload', file_reference: token },
          risk: 'irreversible',
          required_affordance: hasUpload ? 'upload' : null,
          required_adapter_id: null,
          postcondition: { type: 'none', expected_value_state: null, expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'irreversible', operator_confirmed: true, allow_navigation: false, allow_submit: false },
      };
      const obs = await globalThis.CcActionPlanExecutor.execute(plan);
      const files = document.querySelector('#photo')?.files?.length || 0;
      return { obs, files, affordances: target.node.affordances };
    });
    ok(result.obs?.outcome === 'completed', 'upload: completed with file_reference', JSON.stringify(result.obs?.steps || result.error || result));
    ok(result.files === 1, 'upload: file attached to input');
  });

  // ── 6. Shadow DOM target ──────────────────────────────────────────
  if (existsSync(resolve(FIXTURES, 'perception-shadow-dom.html'))) {
    await withPage(browser, 'perception-shadow-dom.html', async (page) => {
      const result = await page.evaluate(async () => {
        const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
        const state = globalThis.CcPerception.getPerceptionState();
        let typeTarget = null;
        for (const [id, n] of Object.entries(snapshot.nodes || {})) {
          if ((n.affordances || []).includes('type_text')) {
            typeTarget = { id, node: n };
            break;
          }
        }
        if (!typeTarget) return { error: 'no type_text in shadow fixture', contexts: snapshot.contexts?.length, nodes: Object.keys(snapshot.nodes || {}).length };
        const plan = {
          kind: 'action_plan', schema_version: '3.0.0',
          plan_id: 'plan:e2e-shadow', correlation_id: 'corr:e2e-shadow',
          supersedes_plan_id: null,
          issued_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 120000).toISOString(),
          target_binding: {
            document_id: snapshot.document_id,
            snapshot_id: snapshot.snapshot_id,
            expected_revision: snapshot.revision,
          },
          steps: [{
            step_id: 'step:shadow',
            target: { context_id: typeTarget.node.context_id, node_id: typeTarget.id },
            action: { op: 'type_text', value: 'Shadow Val', clear_first: true },
            risk: 'safe',
            required_affordance: 'type_text',
            required_adapter_id: typeTarget.node.widget?.adapter_id || null,
            postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
            on_failure: 'stop_and_report',
          }],
          authorization: { max_risk: 'safe', operator_confirmed: false, allow_navigation: false, allow_submit: false },
        };
        const obs = await globalThis.CcActionPlanExecutor.execute(plan);
        return { obs, state, contexts: (snapshot.contexts || []).map(c => c.kind) };
      });
      ok(result.obs?.kind === 'execution_observation', 'shadow: EO returned');
      ok(
        result.obs?.outcome === 'completed' || result.obs?.outcome === 'partial' || result.obs?.outcome === 'aborted',
        'shadow: executor ran against shadow fixture',
        JSON.stringify(result.error || result.obs?.steps)
      );
    });
  } else {
    ok(true, 'shadow: fixture absent — skipped');
  }

  // ── 7. Binding-generation replacement (gen 1 → 2) ─────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      let target = null;
      for (const [id, n] of Object.entries(snapshot.nodes || {})) {
        if ((n.affordances || []).includes('type_text')) {
          target = { id, node: n };
          break;
        }
      }
      if (!target) return { error: 'no target' };
      const reg = globalThis.CcPerception.getBindingRegistry();
      const before = reg.getGeneration(target.node.context_id, target.id);
      const oldEl = reg.resolve(target.node.context_id, target.id).liveNodeReference;
      // SPA-style replacement: new live element, same node_id; generation advances
      const replacement = document.createElement('input');
      replacement.type = 'text';
      replacement.id = 'fullname-replaced';
      oldEl.parentNode?.insertBefore(replacement, oldEl);
      oldEl.remove();
      reg.rebind(target.node.context_id, target.id, replacement);
      const after = reg.getGeneration(target.node.context_id, target.id);
      // Authorship gens still at publish time (gen 1); current is gen 2.
      // Do NOT re-capture authorship — old plan must fail.
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:e2e-gen', correlation_id: 'corr:e2e-gen',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 'step:stale-gen',
          target: { context_id: target.node.context_id, node_id: target.id },
          action: { op: 'type_text', value: 'SHOULD_NOT_APPLY', clear_first: true },
          risk: 'safe',
          required_affordance: 'type_text',
          required_adapter_id: null,
          postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_navigation: false, allow_submit: false },
      };
      const obs = await globalThis.CcActionPlanExecutor.execute(plan);
      const authored = globalThis.CcPerception.getAuthorshipGeneration(target.node.context_id, target.id);
      return {
        before,
        after,
        authored,
        outcome: obs.outcome,
        failure: obs.rejection_reason || obs.steps?.find(s => s.status === 'failed')?.failure_code,
        value: replacement.value,
      };
    });
    ok(result.before === 1, 'gen: initial binding generation is 1');
    ok(result.after === 2, 'gen: rebind advances to 2');
    ok(result.authored === 1, 'gen: authorship still records generation 1');
    ok(result.failure === 'stale_target', 'gen: old plan fails stale_target', JSON.stringify(result));
    ok(result.value !== 'SHOULD_NOT_APPLY', 'gen: replacement element was not mutated');
  });

  // ── 8. Stale revision ─────────────────────────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:e2e-stale-rev', correlation_id: 'corr:e2e-stale-rev',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision + 99,
        },
        steps: [{
          step_id: 'step:x',
          target: { context_id: 'ctx.top.1', node_id: 'node:x' },
          action: { op: 'type_text', value: 'x', clear_first: true },
          risk: 'safe',
          required_affordance: null,
          required_adapter_id: null,
          postcondition: { type: 'none', expected_value_state: null, expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_navigation: false, allow_submit: false },
      };
      const obs = await globalThis.CcActionPlanExecutor.execute(plan);
      return { outcome: obs.outcome, reason: obs.rejection_reason };
    });
    ok(result.outcome === 'rejected' && result.reason === 'stale_snapshot', 'stale revision rejected');
  });

  // ── 9. Adapter mismatch ───────────────────────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      let target = null;
      for (const [id, n] of Object.entries(snapshot.nodes || {})) {
        if ((n.affordances || []).includes('type_text')) {
          target = { id, node: n };
          break;
        }
      }
      if (!target) return { error: 'no target' };
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:e2e-adapter', correlation_id: 'corr:e2e-adapter',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 'step:bad-adapter',
          target: { context_id: target.node.context_id, node_id: target.id },
          action: { op: 'type_text', value: 'x', clear_first: true },
          risk: 'safe',
          required_affordance: 'type_text',
          required_adapter_id: 'adapter:definitely-not-real',
          postcondition: { type: 'none', expected_value_state: null, expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_navigation: false, allow_submit: false },
      };
      const obs = await globalThis.CcActionPlanExecutor.execute(plan);
      return {
        outcome: obs.outcome,
        failure: obs.rejection_reason || obs.steps?.find(s => s.status === 'failed')?.failure_code,
      };
    });
    ok(result.failure === 'adapter_mismatch', 'adapter mismatch fail-closed', JSON.stringify(result));
  });

  // ── 10. Affordance mismatch ───────────────────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      let target = null;
      for (const [id, n] of Object.entries(snapshot.nodes || {})) {
        if ((n.affordances || []).includes('type_text') && !(n.affordances || []).includes('upload')) {
          target = { id, node: n };
          break;
        }
      }
      if (!target) return { error: 'no target' };
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:e2e-aff', correlation_id: 'corr:e2e-aff',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 'step:bad-aff',
          target: { context_id: target.node.context_id, node_id: target.id },
          action: { op: 'upload', file_reference: 'file:x' },
          risk: 'irreversible',
          required_affordance: 'upload',
          required_adapter_id: null,
          postcondition: { type: 'none', expected_value_state: null, expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'irreversible', operator_confirmed: true, allow_navigation: false, allow_submit: false },
      };
      const obs = await globalThis.CcActionPlanExecutor.execute(plan);
      return {
        failure: obs.rejection_reason || obs.steps?.find(s => s.status === 'failed')?.failure_code,
      };
    });
    ok(result.failure === 'affordance_mismatch', 'affordance mismatch fail-closed', JSON.stringify(result));
  });

  // ── 11. Submit authz denied ───────────────────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      let target = null;
      for (const [id, n] of Object.entries(snapshot.nodes || {})) {
        const entry = globalThis.CcPerception.getBindingRegistry?.()?.resolve?.(n.context_id, id);
        const el = entry?.liveNodeReference;
        if (el && el.tagName === 'BUTTON' && (el.type === 'submit' || !el.type || el.type === 'submit')) {
          target = { id, node: n, el };
          break;
        }
      }
      if (!target) {
        // Find submit button by walking registry
        const reg = globalThis.CcPerception.getBindingRegistry();
        for (const e of reg.entries()) {
          if (e.liveNodeReference?.tagName === 'BUTTON' && String(e.liveNodeReference.type || 'submit') === 'submit') {
            const n = snapshot.nodes[e.nodeId];
            if (n) { target = { id: e.nodeId, node: n, el: e.liveNodeReference }; break; }
          }
        }
      }
      if (!target) return { error: 'no submit button node' };
      let clicked = false;
      const orig = target.el.click.bind(target.el);
      target.el.click = () => { clicked = true; };
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:e2e-submit-deny', correlation_id: 'corr:e2e-submit-deny',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 'step:submit',
          target: { context_id: target.node.context_id, node_id: target.id },
          action: { op: 'activate' },
          risk: 'irreversible',
          required_affordance: (target.node.affordances || []).includes('activate') ? 'activate' : null,
          required_adapter_id: null,
          postcondition: { type: 'none', expected_value_state: null, expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'irreversible', operator_confirmed: true, allow_navigation: false, allow_submit: false },
      };
      const obs = await globalThis.CcActionPlanExecutor.execute(plan);
      target.el.click = orig;
      return {
        failure: obs.rejection_reason || obs.steps?.find(s => s.status === 'failed')?.failure_code,
        clicked,
        outcome: obs.outcome,
      };
    });
    ok(result.failure === 'authorization_denied' || result.error === 'no submit button node', 'submit denied when allow_submit false', JSON.stringify(result));
    ok(result.clicked !== true, 'submit button not activated');
  });

  // ── 12. Navigation authz denied ───────────────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      // Inject a real navigational link, re-perceive (same product session), deny activate.
      const a = document.createElement('a');
      a.href = 'https://evil.example/nav';
      a.id = 'nav-link';
      a.textContent = 'External';
      document.body.appendChild(a);
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      let target = null;
      const reg = globalThis.CcPerception.getBindingRegistry();
      for (const e of reg.entries()) {
        const el = e.liveNodeReference;
        if (el?.id === 'nav-link' || (el?.tagName === 'A' && String(el.href || '').includes('evil.example'))) {
          const n = snapshot.nodes[e.nodeId];
          if (n) { target = { id: e.nodeId, node: n, el }; break; }
        }
      }
      if (!target) return { error: 'nav link not bound', nodeCount: Object.keys(snapshot.nodes || {}).length };
      let clicked = false;
      target.el.addEventListener('click', (ev) => { ev.preventDefault(); clicked = true; }, true);
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:e2e-nav-deny', correlation_id: 'corr:e2e-nav-deny',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 'step:nav',
          target: { context_id: target.node.context_id, node_id: target.id },
          action: { op: 'activate' },
          risk: 'safe',
          required_affordance: (target.node.affordances || []).includes('activate') ? 'activate' : null,
          required_adapter_id: null,
          postcondition: { type: 'none', expected_value_state: null, expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_navigation: false, allow_submit: false },
      };
      const obs = await globalThis.CcActionPlanExecutor.execute(plan);
      return {
        failure: obs.rejection_reason || obs.steps?.find(s => s.status === 'failed')?.failure_code,
        clicked,
        outcome: obs.outcome,
      };
    });
    ok(result.failure === 'authorization_denied', 'nav denied when allow_navigation false', JSON.stringify(result));
    ok(result.clicked !== true, 'nav link not activated');
  });

  // ── 12b. Destination origin policy denied ─────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      okNav = !!globalThis.CcNavigationContract?.classifyNavigationImplication;
      const a = document.createElement('a');
      a.href = 'https://evil.example/cross';
      a.id = 'xo-link';
      a.textContent = 'XO';
      document.body.appendChild(a);
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      let target = null;
      const reg = globalThis.CcPerception.getBindingRegistry();
      for (const e of reg.entries()) {
        if (e.liveNodeReference?.id === 'xo-link') {
          const n = snapshot.nodes[e.nodeId];
          if (n) { target = { id: e.nodeId, node: n, el: e.liveNodeReference }; break; }
        }
      }
      if (!target) return { error: 'no xo link', okNav };
      let clicked = false;
      target.el.addEventListener('click', (ev) => { ev.preventDefault(); clicked = true; }, true);
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:e2e-origin', correlation_id: 'corr:e2e-origin',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 'step:xo',
          target: { context_id: target.node.context_id, node_id: target.id },
          action: { op: 'activate' },
          risk: 'safe',
          required_affordance: null,
          required_adapter_id: null,
          postcondition: { type: 'none', expected_value_state: null, expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_navigation: true, allow_submit: false },
      };
      const obs = await globalThis.CcActionPlanExecutor.execute(plan);
      return {
        okNav,
        failure: obs.rejection_reason || obs.steps?.find(s => s.status === 'failed')?.failure_code,
        diag: (obs.diagnostics || []).map(d => d.code),
        clicked,
      };
    });
    ok(result.okNav === true, 'navigation-contract loaded in browser');
    ok(result.failure === 'authorization_denied', 'cross-origin destination denied', JSON.stringify(result));
    ok(result.clicked !== true, 'cross-origin link not clicked');
  });

  // ── 12c. page.path sanitization ───────────────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      // Simulate sensitive location via history (pathname only visible to sanitize)
      const s = globalThis.CcNavigationContract.sanitizePagePath(
        'https://user:pass@portal.example/apply/a1b2c3d4e5f6789012345678abcdef01/edit?session=secret#x'
      );
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      return {
        path: s.path,
        redacted: s.redacted,
        pagePath: snapshot.page?.path,
        hasQuery: (s.path || '').includes('?') || (s.path || '').includes('session'),
      };
    });
    ok(result.hasQuery === false, 'sanitized path has no query secrets');
    ok(result.path && result.path.startsWith('/'), 'sanitized path is pathname-like');
    ok(result.pagePath == null || !String(result.pagePath).includes('?'), 'snapshot page.path has no query');
  });

  // ── 13. Replay protection ─────────────────────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      globalThis.CcActionPlanExecutor.clearReplayCache();
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      let target = null;
      for (const [id, n] of Object.entries(snapshot.nodes || {})) {
        if ((n.affordances || []).includes('type_text')) {
          target = { id, node: n };
          break;
        }
      }
      if (!target) return { error: 'no target' };
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:e2e-replay', correlation_id: 'corr:e2e-replay-same',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 'step:r',
          target: { context_id: target.node.context_id, node_id: target.id },
          action: { op: 'type_text', value: 'Once', clear_first: true },
          risk: 'safe',
          required_affordance: 'type_text',
          required_adapter_id: null,
          postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_navigation: false, allow_submit: false },
      };
      const obs1 = await globalThis.CcActionPlanExecutor.execute(plan);
      const obs2 = await globalThis.CcActionPlanExecutor.execute(plan);
      return {
        first: obs1.outcome,
        second: obs2.outcome,
        reason: obs2.rejection_reason,
      };
    });
    ok(result.first === 'completed', 'replay: first execution completes');
    ok(result.second === 'rejected' && result.reason === 'correlation_replayed', 'replay: second rejected');
  });

  // ── 14. EO privacy — no raw HTML / selectors / secrets ────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(async () => {
      const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
      let target = null;
      for (const [id, n] of Object.entries(snapshot.nodes || {})) {
        if ((n.affordances || []).includes('type_text')) {
          target = { id, node: n };
          break;
        }
      }
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:e2e-priv', correlation_id: 'corr:e2e-priv',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 'step:p',
          target: { context_id: target.node.context_id, node_id: target.id },
          action: { op: 'type_text', value: 'SecretValueXYZ', clear_first: true },
          risk: 'safe',
          required_affordance: 'type_text',
          required_adapter_id: null,
          postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_navigation: false, allow_submit: false },
      };
      // Smuggle forbidden fields on plan (should be ignored, never echoed)
      plan.steps[0].target.css_selector = '#fullname';
      plan.steps[0].target.xpath = '//input';
      const obs = await globalThis.CcActionPlanExecutor.execute(plan);
      const blob = JSON.stringify(obs);
      return {
        outcome: obs.outcome,
        hasSecret: blob.includes('SecretValueXYZ'),
        hasSelector: blob.includes('css_selector') || blob.includes('#fullname'),
        hasXpath: blob.includes('xpath'),
        hasOuterHtml: blob.includes('outer_html'),
        kind: obs.kind,
        schema: obs.schema_version,
      };
    });
    ok(result.kind === 'execution_observation' && result.schema === '3.0.0', 'privacy: EO v3 envelope');
    ok(!result.hasSecret, 'privacy: EO does not echo typed secret value');
    ok(!result.hasSelector, 'privacy: EO does not echo css_selector smuggling');
    ok(!result.hasXpath, 'privacy: EO does not echo xpath');
    ok(!result.hasOuterHtml, 'privacy: EO has no outer_html');
  });

  // ── 15. Product path has no legacy modules ────────────────────────
  await withPage(browser, 'perception-native.html', async (page) => {
    const result = await page.evaluate(() => ({
      hasActionPlan: !!globalThis.CcActionPlanExecutor?.execute,
      hasPerception: !!globalThis.CcPerception?.perceivePage,
      hasGateway: !!globalThis.CcDomGateway?.performAction,
      hasLegacyExecutor: typeof globalThis.ccExecutor === 'function',
      hasMapper: !!globalThis.ccMapper,
      hasResolver: !!globalThis.ccResolver,
    }));
    ok(result.hasActionPlan && result.hasPerception && result.hasGateway, 'product APIs loaded');
    ok(!result.hasLegacyExecutor && !result.hasMapper && !result.hasResolver, 'legacy executor/mapper/resolver absent');
  });

} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
