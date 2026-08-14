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
 * Phase 4.6: Dynamic mode loops one step at a time until fill_complete or failure.
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
  let plan = planBody.plan || planBody.action_plan || planBody;
  if (!plan || !plan.steps || plan.steps.length === 0) {
    if (planBody.fill_complete) {
      return {
        ok: true, filled: 0, failed: 0, skipped: 0, records: [],
        observationError: null, operatorMessage: 'All fields already filled.', pageSnapshot,
      };
    }
    return {
      ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null,
      operatorMessage: 'No fields could be mapped for this form.',
      error: 'empty_plan', pageSnapshot,
    };
  }

  // ── Phase 4.6: Dynamic one-action loop ──────────────────────────────
  // If plan_clamped (dynamic mode), loop: execute 1 step → observe →
  // re-perceive → re-plan → repeat until fill_complete or failure.
  const isDynamic = planBody.plan_clamped === true;
  const sessionId = planBody.session?.id || null;
  let totalFilled = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let allRecords = [];
  let lastObservationError = null;
  let lastPageSnapshot = pageSnapshot;
  let lastPlan = plan;
  const MAX_DYNAMIC_TURNS = 30;

  for (let turn = 0; turn < (isDynamic ? MAX_DYNAMIC_TURNS : 1); turn++) {
    if (turn > 0) {
      progress(`Dynamic turn ${turn + 1}: re-perceiving...`, 50 + turn);
      const [rePercResult] = await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          if (!globalThis.CcPerception?.perceivePage) return { error: 'perception_not_loaded' };
          return await globalThis.CcPerception.perceivePage({ mode: 'snapshot', includeGeometry: true });
        },
      });
      lastPageSnapshot = rePercResult?.result;
      if (!lastPageSnapshot || lastPageSnapshot.kind !== 'page_snapshot') break;

      progress(`Dynamic turn ${turn + 1}: re-planning...`, 55 + turn);
      const rePlanResponse = await fetch(backendUrl + '/fill-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({
          snapshot: lastPageSnapshot,
          profileId: profile.id,
          operator_execution_preference: executionPreference || 'AUTO',
          session_id: sessionId,
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
      if (!rePlanResponse.ok) break;
      const rePlanBody = await rePlanResponse.json();
      if (rePlanBody.fill_complete) break;
      plan = rePlanBody.plan || rePlanBody.action_plan || rePlanBody;
      if (!plan || !plan.steps || plan.steps.length === 0) break;
      lastPlan = plan;
    }

    progress(`Executing ${plan.steps.length} step${plan.steps.length > 1 ? 's' : ''}...`, 70 + turn);
    const [execResult] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (actionPlan) => {
        if (!globalThis.CcActionPlanExecutor?.execute) {
          throw new Error('ActionPlan executor not loaded');
        }
        if (typeof globalThis.ccExecutor === 'function' || globalThis.__ccLegacyFillActive) {
          throw new Error('Legacy fill path must not run with ActionPlan v3');
        }
        if (globalThis.CcDomEvidence?.startObserving) {
          const registry = globalThis.CcPerception?.getBindingRegistry?.();
          globalThis.CcDomEvidence.startObserving(actionPlan, registry);
        }
        let observation;
        try {
          observation = await globalThis.CcActionPlanExecutor.execute(actionPlan);
        } finally {
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
      if (turn === 0) {
        return {
          ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null,
          operatorMessage: opMsg('gateway_error', 'Execution failed'),
          error: 'invalid_observation', pageSnapshot: lastPageSnapshot, plan,
        };
      }
      break;
    }

    // Report observation to server
    let observationError = null;
    try {
      const query = new URLSearchParams({
        sessionId: sessionId || '',
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
    lastObservationError = observationError;

    // Accumulate results
    const stepResults = executionObservation.steps || [];
    const filled = stepResults.filter((r) => r.status === 'succeeded').length;
    const failed = stepResults.filter((r) => r.status === 'failed').length;
    const skipped = stepResults.filter((r) => r.status === 'skipped').length;
    totalFilled += filled;
    totalFailed += failed;
    totalSkipped += skipped;

    const resultByStep = new Map(stepResults.map((r) => [r.step_id, r]));
    const records = (plan.steps || []).map((step) => {
      const result = resultByStep.get(step.step_id);
      return {
        label: step.target?.node_id || step.step_id,
        result: result?.status === 'succeeded' ? 'filled' : (result?.status || 'skipped'),
        value: step.action?.value || '',
        source: 'server-plan',
      };
    });
    allRecords = allRecords.concat(records);

    // Stop loop on failure or abort
    if (failed > 0 || executionObservation.outcome === 'aborted' || executionObservation.outcome === 'rejected') {
      break;
    }
  }

  let operatorMessage = null;
  if (totalFailed > 0) {
    operatorMessage = opMsg('step_failed', `${totalFailed} step(s) failed`);
  } else if (lastObservationError) {
    operatorMessage = 'Fields changed, but session evidence was not saved.';
  } else {
    const turnLabel = isDynamic && allRecords.length > 1 ? ` (${allRecords.length} turns)` : '';
    operatorMessage = `Fill complete: ${totalFilled} ok, ${totalFailed} failed, ${totalSkipped} skipped${turnLabel}`;
  }

  return {
    ok: totalFailed === 0,
    pageSnapshot: lastPageSnapshot,
    plan: lastPlan,
    filled: totalFilled,
    failed: totalFailed,
    skipped: totalSkipped,
    records: allRecords,
    observationError: lastObservationError,
    operatorMessage,
  };
}

const api = { PRODUCT_PATH_SCRIPTS, runProductFill };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.CcFillOrchestrator = api;
})();
