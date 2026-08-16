/* Product-path fill orchestration (MIG-POPUP-01 / #166).
 * Loaded in extension popup context only — not injected into pages.
 * Keeps PRODUCT_PATH_SCRIPTS and perceive→plan→execute sequence out of popup UI code.
 */
(function () {
'use strict';

/**
 * Scripts injected into the active tab for product ActionPlan path.
 * Order matters (deps before consumers). IIFE-wrapped for re-inject safety.
 */
const PRODUCT_PATH_SCRIPTS = Object.freeze([
  'runtime/errors.js',
  'runtime/gateway/interaction.js',
  'runtime/dom-gateway.js',
  'runtime/navigation-contract.js',
  'perception/visual-context.js',
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
  'runtime/dom-evidence.js',
]);

/**
 * Run product fill: perceive → /fill-plan → ActionPlanExecutor → /fill-observation.
 *
 * @param {object} ctx
 * @param {number} ctx.tabId
 * @param {object} ctx.profile
 * @param {string} ctx.backendUrl
 * @param {string} ctx.accessToken
 * @param {string} ctx.runtimeVersion
 * @param {string} [ctx.executionPreference] - AUTO | STATIC | DYNAMIC (default AUTO)
 * @param {(text: string, pct?: number) => void} [ctx.onProgress]
 * @returns {Promise<{
 *   ok: boolean,
 *   pageSnapshot?: object,
 *   plan?: object,
 *   executionObservation?: object,
 *   filled: number,
 *   failed: number,
 *   skipped: number,
 *   records: object[],
 *   observationError: string|null,
 *   operatorMessage: string|null,
 *   error?: string
 * }>}
 */
async function runProductFill(ctx) {
  const {
    tabId,
    profile,
    backendUrl,
    accessToken,
    runtimeVersion,
    executionPreference,
    onProgress,
  } = ctx;

  const progress = (t, p) => {
    if (typeof onProgress === 'function') onProgress(t, p);
  };

  const errors = (typeof globalThis !== 'undefined' && globalThis.CcRuntimeErrors) || null;
  const opMsg = (code, detail) => (
    errors?.operatorMessageFor
      ? errors.operatorMessageFor(code, detail)
      : (detail || code || 'Something went wrong')
  );

  if (!tabId) {
    return {
      ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null,
      operatorMessage: opMsg('gateway_error', 'No active tab'),
      error: 'no_tab',
    };
  }

  progress('Perceiving page structure...', 30);

  const [loadedCheck] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => !!(
      globalThis.CcDomGateway
      && globalThis.CcBindingRegistry
      && globalThis.CcPerception
      && globalThis.CcActionPlanExecutor
    ),
  });
  if (!loadedCheck?.result) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: PRODUCT_PATH_SCRIPTS.slice(),
    });
  }

  // Seed navigation origin allowlist (never public IR)
  try {
    const allowStore = await chrome.storage.local.get('navigationOriginAllowlist');
    const originAllowlist = Array.isArray(allowStore.navigationOriginAllowlist)
      ? allowStore.navigationOriginAllowlist.filter((x) => typeof x === 'string' && x.length > 0)
      : [];
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (list) => {
        if (globalThis.CcNavigationContract?.setOriginAllowlist) {
          globalThis.CcNavigationContract.setOriginAllowlist(list);
        } else {
          globalThis.__ccNavigationOriginAllowlist = Array.isArray(list) ? list : [];
        }
      },
      args: [originAllowlist],
    });
  } catch (e) {
    console.warn('[CC] navigation origin allowlist seed failed:', e.message);
  }

  const [percResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      try {
        if (typeof CcPerception === 'undefined') return { error: 'CcPerception not loaded' };
        if (typeof CcDomGateway === 'undefined') return { error: 'CcDomGateway not loaded' };
        if (typeof CcContextDiscovery !== 'undefined' && CcContextDiscovery.resetContextCounter) {
          CcContextDiscovery.resetContextCounter();
        }
        if (typeof CcNodeFactory !== 'undefined' && CcNodeFactory.resetNodeCounter) {
          CcNodeFactory.resetNodeCounter();
        }
        await CcPerception.initPerception({
          gateway: CcDomGateway,
          bindingRegistry: new CcBindingRegistry(),
          revisionManager: new CcRevisionManager(),
          privacyFilter: CcPrivacyFilter,
          widgetClassifier: CcWidgetClassifier,
          contextDiscovery: CcContextDiscovery,
          nodeFactory: CcNodeFactory,
          edgeFactory: CcEdgeFactory,
          canonicalHash: CcCanonicalHash,
          snapshotBuilder: CcSnapshotBuilder,
          validator: CcValidator,
          validatorOptions: { schema: null },
        });
        if (CcValidator && !CcValidator.isInitialized()) {
          await CcValidator.initValidator({ schema: null });
        }
        return await CcPerception.perceivePage({ mode: 'snapshot', includeGeometry: true });
      } catch (err) {
        return { error: err.message, stack: (err.stack || '').slice(0, 300) };
      }
    },
  });

  const pageSnapshot = percResult?.result;
  if (!pageSnapshot || pageSnapshot.kind !== 'page_snapshot') {
    const errDetail = pageSnapshot?.error || 'perception_failed';
    return {
      ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null,
      operatorMessage: opMsg('gateway_error', 'Perception failed'),
      error: String(errDetail).slice(0, 120),
    };
  }

  progress('Server planning fill...', 55);
  const planResponse = await fetch(backendUrl + '/fill-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
    body: JSON.stringify({
      snapshot: pageSnapshot,
      profileId: profile.id,
      operator_execution_preference: executionPreference || 'AUTO',
      profile: (() => {
        const flat = {};
        const raw = profile.data || profile;
        for (const [k, v] of Object.entries(raw)) {
          flat[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
        }
        if (profile.name) flat.name = flat.name || profile.name;
        return flat;
      })(),
    }),
  });

  if (!planResponse.ok) {
    return {
      ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null,
      operatorMessage: opMsg('gateway_error', 'Server plan failed'),
      error: 'plan_http_' + planResponse.status,
      pageSnapshot,
    };
  }

  const planBody = await planResponse.json();
  const plan = planBody.plan || planBody.action_plan || planBody;
  if (!plan || !plan.steps || plan.steps.length === 0) {
    const emptyTrace = {
      schema: 'cc-fill-trace/v1',
      captured_at: new Date().toISOString(),
      source: 'extension-product-path',
      page: {},
      profile: profile ? { id: profile.id || null, name: profile.name || null } : null,
      plan_response_meta: {
        classification: planBody?.classification || null,
        diagnostics: planBody?.diagnostics || null,
        message: planBody?.message || null,
      },
      perception: {
        node_count: pageSnapshot?.nodes ? Object.keys(pageSnapshot.nodes).length : 0,
        revision: pageSnapshot?.revision,
      },
      plan: { step_count: 0, steps: [] },
      execution: { outcome: null, steps: [] },
      counts: { filled: 0, failed: 0, skipped: 0, lies: 0, page_empty_lie: false },
      step_truth: [],
      gaps: [{
        code: 'EMPTY_PLAN',
        detail: `Server returned no steps. diagnostics=${JSON.stringify(planBody?.diagnostics || {}).slice(0, 400)}`,
      }],
    };
    try {
      await chrome.storage.local.set({ _ccLastFillTrace: emptyTrace, _ccLastFillTraceAt: Date.now() });
    } catch { /* ignore */ }
    return {
      ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null,
      operatorMessage: 'No fields could be mapped for this form.',
      error: 'empty_plan',
      pageSnapshot,
      debugTrace: emptyTrace,
    };
  }

  progress(`Executing ${plan.steps.length} steps...`, 70);
  const [execResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (actionPlan) => {
      if (!globalThis.CcActionPlanExecutor?.execute) {
        throw new Error('ActionPlan executor not loaded');
      }
      if (typeof globalThis.ccExecutor === 'function' || globalThis.__ccLegacyFillActive) {
        throw new Error('Legacy fill path must not run with ActionPlan v3');
      }
      // Phase 4.2: start DOM evidence observation for this plan
      if (globalThis.CcDomEvidence?.startObserving) {
        const registry = globalThis.CcPerception?.getBindingRegistry?.();
        globalThis.CcDomEvidence.startObserving(actionPlan, registry);
      }
      let observation;
      try {
        observation = await globalThis.CcActionPlanExecutor.execute(actionPlan);
      } finally {
        // Phase 4.2: stop observation and attach evidence (even on throw)
        if (globalThis.CcDomEvidence?.stopObserving) {
          globalThis.CcDomEvidence.stopObserving();
          const evidence = globalThis.CcDomEvidence.getEvidence?.() || [];
          if (evidence.length > 0 && observation) {
            observation.dom_evidence = evidence;
          }
        }
      }
      return observation;
    },
    args: [plan],
  });

  const executionObservation = execResult?.result;
  if (!executionObservation || executionObservation.kind !== 'execution_observation') {
    return {
      ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null,
      operatorMessage: opMsg('gateway_error', 'Execution failed'),
      error: 'invalid_observation',
      pageSnapshot,
      plan,
    };
  }

  let observationError = null;
  try {
    const query = new URLSearchParams({
      plan_id: plan.plan_id || '',
      correlation_id: plan.correlation_id || '',
      runtimeVersion: runtimeVersion || '',
    });
    const reportResponse = await fetch(backendUrl + '/fill-observation?' + query.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify(executionObservation),
    });
    if (!reportResponse.ok) observationError = 'HTTP ' + reportResponse.status;
  } catch (e) {
    observationError = e.message;
  }

  const stepResults = executionObservation.steps || [];
  const filled = stepResults.filter((r) => r.status === 'succeeded').length;
  const failed = stepResults.filter((r) => r.status === 'failed').length;
  const skipped = stepResults.filter((r) => r.status === 'skipped').length;

  const resultByStep = new Map(stepResults.map((r) => [r.step_id, r]));
  const records = (plan.steps || []).map((step) => {
    const result = resultByStep.get(step.step_id);
    return {
      label: step.target?.node_id || step.step_id,
      result: result?.status === 'succeeded' ? 'filled' : (result?.status || 'skipped'),
      value: step.action?.value || '',
      source: 'server-plan',
      step_id: step.step_id,
      op: step.action?.op || null,
      node_id: step.target?.node_id || null,
      context_id: step.target?.context_id || null,
      eo_status: result?.status || null,
      failure_code: result?.failure_code || null,
      postcondition_met: result?.postcondition_met ?? null,
      observed_value_state: result?.observed_value_state ?? null,
    };
  });

  // ── DEBUG TRACE (debug/cc-cli): MAIN-world DOM after execute — proves lies ──
  let mainWorldAfter = [];
  let pageUrl = null;
  let pageTitle = null;
  try {
    const [scan] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => ({
        url: location.href,
        title: document.title,
        controls: Array.from(document.querySelectorAll('input, select, textarea')).map((el) => ({
          tag: el.tagName,
          id: el.id || null,
          name: el.name || null,
          type: el.type || null,
          value: 'value' in el ? String(el.value ?? '') : null,
          checked: 'checked' in el ? !!el.checked : null,
        })),
      }),
    });
    pageUrl = scan?.result?.url || null;
    pageTitle = scan?.result?.title || null;
    mainWorldAfter = scan?.result?.controls || [];
  } catch (e) {
    console.warn('[CC] debug MAIN-world scan failed:', e?.message || e);
  }

  // Binding-registry view of plan targets (isolated world — same as executor)
  let bindingDomAfter = [];
  try {
    const [bscan] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (steps) => {
        const reg = globalThis.CcPerception?.getBindingRegistry?.();
        return (steps || []).map((step) => {
          const nodeId = step.target?.node_id;
          let el = null;
          if (reg?.getByNodeId) el = reg.getByNodeId(nodeId)?.liveNodeReference || null;
          if (!el && reg?.entries) {
            for (const e of reg.entries()) {
              if (e.nodeId === nodeId) { el = e.liveNodeReference; break; }
            }
          }
          return {
            step_id: step.step_id,
            node_id: nodeId,
            op: step.action?.op,
            planned_value: step.action?.value ?? step.action?.desired_state ?? null,
            resolved: !!el,
            tag: el?.tagName || null,
            id: el?.id || null,
            name: el?.name || null,
            value: el && 'value' in el ? String(el.value ?? '') : null,
            checked: el && 'checked' in el ? !!el.checked : null,
          };
        });
      },
      args: [plan.steps || []],
    });
    bindingDomAfter = bscan?.result || [];
  } catch (e) {
    console.warn('[CC] debug binding DOM scan failed:', e?.message || e);
  }

  const nonemptyMain = mainWorldAfter.filter((c) => {
    if (c.type === 'hidden' || c.type === 'submit' || c.type === 'button') return false;
    if (c.type === 'checkbox' || c.type === 'radio') return !!c.checked;
    return c.value != null && String(c.value).trim() !== '';
  });

  const stepTruth = (plan.steps || []).map((step) => {
    const eo = resultByStep.get(step.step_id);
    const bind = bindingDomAfter.find((b) => b.step_id === step.step_id);
    const claim = eo?.status === 'succeeded' ? 'ok' : (eo?.status === 'failed' ? 'fail' : (eo?.status || 'unknown'));
    const planned = step.action?.value != null ? String(step.action.value) : null;
    const actual = bind?.value != null ? String(bind.value) : null;
    let stick = 'n/a';
    let lie = false;
    if (step.action?.op === 'type_text' || step.action?.op === 'clear') {
      if (claim === 'ok') {
        const want = step.action?.op === 'clear' ? '' : (planned || '');
        const match = step.action?.op === 'clear' ? actual === '' : (actual === want || (want && actual && actual.includes(want)));
        if (match) stick = 'DOM ok';
        else { stick = 'LIE'; lie = true; }
      } else if (claim === 'fail') stick = 'honest fail';
      else stick = claim;
    } else if (claim === 'ok' && bind && (actual === '' || actual == null) && step.action?.op === 'select_option') {
      stick = 'LIE (select empty)';
      lie = true;
    } else {
      stick = claim;
    }
    return {
      step_id: step.step_id,
      op: step.action?.op,
      node_id: step.target?.node_id,
      claim,
      planned_value: planned,
      binding_value: actual,
      binding_resolved: !!bind?.resolved,
      failure_code: eo?.failure_code || null,
      stick,
      lie,
    };
  });

  const lies = stepTruth.filter((s) => s.lie).length;
  const pageEmptyLie = filled > 0 && nonemptyMain.length === 0;

  const debugTrace = {
    schema: 'cc-fill-trace/v1',
    captured_at: new Date().toISOString(),
    source: 'extension-product-path',
    page: { url: pageUrl, title: pageTitle },
    profile: profile ? { id: profile.id || null, name: profile.name || profile.displayLabel || null } : null,
    runtimeVersion: runtimeVersion || null,
    executionPreference: executionPreference || 'AUTO',
    plan_response_meta: {
      classification: planBody?.classification || null,
      diagnostics: planBody?.diagnostics || null,
      plan_clamped: planBody?.plan_clamped || false,
      message: planBody?.message || null,
    },
    perception: {
      kind: pageSnapshot?.kind,
      document_id: pageSnapshot?.document_id,
      snapshot_id: pageSnapshot?.snapshot_id,
      revision: pageSnapshot?.revision,
      node_count: pageSnapshot?.nodes ? Object.keys(pageSnapshot.nodes).length : 0,
    },
    plan: {
      plan_id: plan.plan_id,
      correlation_id: plan.correlation_id,
      schema_version: plan.schema_version,
      step_count: (plan.steps || []).length,
      steps: plan.steps,
    },
    execution: {
      outcome: executionObservation.outcome,
      observation_id: executionObservation.observation_id,
      steps: stepResults,
      diagnostics: executionObservation.diagnostics || [],
      dom_evidence: executionObservation.dom_evidence || [],
    },
    counts: { filled, failed, skipped, lies, page_empty_lie: pageEmptyLie },
    step_truth: stepTruth,
    main_world_after: mainWorldAfter,
    main_world_nonempty: nonemptyMain.map((c) => c.id || c.name || c.tag),
    binding_dom_after: bindingDomAfter,
    observationError,
    gaps: [
      ...(pageEmptyLie
        ? [{ code: 'PAGE_EMPTY_LIE', detail: `EO filled=${filled} but MAIN world has 0 nonempty controls` }]
        : []),
      ...stepTruth.filter((s) => s.lie).map((s) => ({
        code: 'STEP_LIE',
        step_id: s.step_id,
        detail: `${s.op} claimed ${s.claim} planned=${JSON.stringify(s.planned_value)} binding=${JSON.stringify(s.binding_value)}`,
      })),
      ...(failed > 0
        ? stepResults.filter((r) => r.status === 'failed').map((r) => ({
            code: 'STEP_FAIL',
            step_id: r.step_id,
            detail: r.failure_code || 'failed',
          }))
        : []),
      ...((planBody?.diagnostics?.unmapped_count > 0)
        ? [{ code: 'UNMAPPED_FIELDS', detail: `unmapped_count=${planBody.diagnostics.unmapped_count}` }]
        : []),
    ],
  };

  // Persist last trace for report tooling (debug branch)
  try {
    await chrome.storage.local.set({
      _ccLastFillTrace: debugTrace,
      _ccLastFillTraceAt: Date.now(),
    });
  } catch (e) {
    console.warn('[CC] failed to store fill trace:', e?.message || e);
  }

  let operatorMessage = null;
  if (executionObservation.outcome === 'rejected' || executionObservation.outcome === 'aborted') {
    const reason = executionObservation.rejection_reason || 'plan rejected';
    operatorMessage = opMsg(reason, null);
  } else if (observationError) {
    operatorMessage = 'Fields changed, but session evidence was not saved.';
  } else if (pageEmptyLie || lies > 0) {
    operatorMessage = `Fill reported ${filled} ok but DOM truth failed (lies=${lies}${pageEmptyLie ? ', page empty' : ''}). Trace saved.`;
  } else {
    operatorMessage = `Fill complete: ${filled} ok, ${failed} failed, ${skipped} skipped`;
  }

  return {
    ok: failed === 0 && !pageEmptyLie && lies === 0
      && executionObservation.outcome !== 'aborted' && executionObservation.outcome !== 'rejected',
    pageSnapshot,
    plan,
    executionObservation,
    filled,
    failed,
    skipped,
    records,
    observationError,
    operatorMessage,
    debugTrace,
  };
}

const api = { PRODUCT_PATH_SCRIPTS, runProductFill };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.CcFillOrchestrator = api;
})();
