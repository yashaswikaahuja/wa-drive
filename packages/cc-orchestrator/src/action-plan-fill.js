/**
 * action-plan-fill — ActionPlan (APE) fill path
 *
 * Product DYNAMIC fill path:
 *   1. Inject PRODUCT_PATH_SCRIPTS if not already loaded
 *   2. Seed navigation origin allowlist
 *   3. Perceive page via CcPerception
 *   4. POST /fill-plan → get ActionPlan
 *   5. Execute via CcActionPlanExecutor (+ DOM evidence)
 *   6. POST /fill-observation
 *   7. POST /sessions
 *
 * Depends on: CcScriptManifests, CcFlattenProfile
 *
 * Public API (on globalThis.CcActionPlanFill):
 *   run(ctx) => Promise<result>
 *
 * See docs/action-plan-fill.md for full documentation.
 */
(function (root) {
  'use strict';

  async function run(ctx) {
    var tabId              = ctx.tabId;
    var profile            = ctx.profile;
    var backendUrl         = ctx.backendUrl;
    var accessToken        = ctx.accessToken;
    var runtimeVersion     = ctx.runtimeVersion;
    var executionPreference = ctx.executionPreference;
    var onProgress         = ctx.onProgress;

    var progress = function (t, p) { if (typeof onProgress === 'function') onProgress(t, p); };
    var errors = (typeof globalThis !== 'undefined' && globalThis.CcRuntimeErrors) || null;
    var opMsg = function (code, detail) {
      return errors && errors.operatorMessageFor
        ? errors.operatorMessageFor(code, detail)
        : (detail || code || 'Something went wrong');
    };

    if (!tabId) {
      return { ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null, operatorMessage: opMsg('gateway_error', 'No active tab'), error: 'no_tab' };
    }

    var manifests = root.CcScriptManifests || {};
    var PRODUCT_SCRIPTS = manifests.PRODUCT_PATH_SCRIPTS || [];

    var _fp = root.CcFlattenProfile || {};
    var flatProfile = _fp.flattenProfile ? _fp.flattenProfile(profile) : (profile && (profile.data || profile)) || {};

    progress('Perceiving page structure...', 30);

    // Inject product scripts if not already loaded
    var loadedCheck = await chrome.scripting.executeScript({
      target: { tabId },
      func: function () {
        return !!(globalThis.CcDomGateway && globalThis.CcBindingRegistry && globalThis.CcPerception && globalThis.CcActionPlanExecutor);
      },
    });
    if (!loadedCheck[0].result) {
      await chrome.scripting.executeScript({ target: { tabId }, files: PRODUCT_SCRIPTS.slice() });
    }

    // Seed navigation origin allowlist
    try {
      var allowStore = await chrome.storage.local.get('navigationOriginAllowlist');
      var originAllowlist = Array.isArray(allowStore.navigationOriginAllowlist)
        ? allowStore.navigationOriginAllowlist.filter(function (x) { return typeof x === 'string' && x.length > 0; })
        : [];
      await chrome.scripting.executeScript({
        target: { tabId },
        func: function (list) {
          if (globalThis.CcNavigationContract && globalThis.CcNavigationContract.setOriginAllowlist) {
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

    // Perceive
    var percResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: async function () {
        try {
          if (typeof CcPerception === 'undefined') return { error: 'CcPerception not loaded' };
          if (typeof CcDomGateway === 'undefined') return { error: 'CcDomGateway not loaded' };
          if (typeof CcContextDiscovery !== 'undefined' && CcContextDiscovery.resetContextCounter) CcContextDiscovery.resetContextCounter();
          if (typeof CcNodeFactory !== 'undefined' && CcNodeFactory.resetNodeCounter) CcNodeFactory.resetNodeCounter();
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
          if (CcValidator && !CcValidator.isInitialized()) await CcValidator.initValidator({ schema: null });
          return await CcPerception.perceivePage({ mode: 'snapshot', includeGeometry: true });
        } catch (err) {
          return { error: err.message, stack: (err.stack || '').slice(0, 300) };
        }
      },
    });

    var pageSnapshot = percResults && percResults[0] && percResults[0].result;
    if (!pageSnapshot || pageSnapshot.kind !== 'page_snapshot') {
      return { ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null, operatorMessage: opMsg('gateway_error', 'Perception failed'), error: String((pageSnapshot && pageSnapshot.error) || 'perception_failed').slice(0, 120) };
    }

    // Plan
    progress('Server planning fill...', 55);
    var planResponse = await fetch(backendUrl + '/fill-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify({ snapshot: pageSnapshot, profileId: profile.id, operator_execution_preference: executionPreference || 'AUTO', profile: flatProfile }),
    });
    if (!planResponse.ok) {
      return { ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null, operatorMessage: opMsg('gateway_error', 'Server plan failed'), error: 'plan_http_' + planResponse.status, pageSnapshot: pageSnapshot };
    }
    var planBody = await planResponse.json();
    var plan = planBody.plan || planBody.action_plan || planBody;
    if (!plan || !plan.steps || plan.steps.length === 0) {
      return { ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null, operatorMessage: 'No fields could be mapped for this form.', error: 'empty_plan', pageSnapshot: pageSnapshot };
    }

    // Execute
    progress('Executing ' + plan.steps.length + ' steps...', 70);
    var execResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: async function (actionPlan) {
        if (!globalThis.CcActionPlanExecutor || !globalThis.CcActionPlanExecutor.execute) throw new Error('ActionPlan executor not loaded');
        if (typeof globalThis.ccExecutor === 'function' || globalThis.__ccLegacyFillActive) throw new Error('Legacy fill path must not run with ActionPlan v3');
        if (globalThis.CcDomEvidence && globalThis.CcDomEvidence.startObserving) {
          var registry = globalThis.CcPerception && globalThis.CcPerception.getBindingRegistry && globalThis.CcPerception.getBindingRegistry();
          globalThis.CcDomEvidence.startObserving(actionPlan, registry);
        }
        var observation;
        try {
          observation = await globalThis.CcActionPlanExecutor.execute(actionPlan);
        } finally {
          if (globalThis.CcDomEvidence && globalThis.CcDomEvidence.stopObserving) {
            globalThis.CcDomEvidence.stopObserving();
            var evidence = (globalThis.CcDomEvidence.getEvidence && globalThis.CcDomEvidence.getEvidence()) || [];
            if (evidence.length > 0 && observation) observation.dom_evidence = evidence;
          }
        }
        return observation;
      },
      args: [plan],
    });

    var executionObservation = execResults && execResults[0] && execResults[0].result;
    if (!executionObservation || executionObservation.kind !== 'execution_observation') {
      return { ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null, operatorMessage: opMsg('gateway_error', 'Execution failed'), error: 'invalid_observation', pageSnapshot: pageSnapshot, plan: plan };
    }

    // Report observation
    var observationError = null;
    try {
      var query = new URLSearchParams({ plan_id: plan.plan_id || '', correlation_id: plan.correlation_id || '', runtimeVersion: runtimeVersion || '' });
      var reportResponse = await fetch(backendUrl + '/fill-observation?' + query.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify(executionObservation),
      });
      if (!reportResponse.ok) observationError = 'HTTP ' + reportResponse.status;
    } catch (e) { observationError = e.message; }

    var stepResults = executionObservation.steps || [];
    var filled  = stepResults.filter(function (r) { return r.status === 'succeeded'; }).length;
    var failed  = stepResults.filter(function (r) { return r.status === 'failed'; }).length;
    var skipped = stepResults.filter(function (r) { return r.status === 'skipped'; }).length;

    var resultByStep = new Map(stepResults.map(function (r) { return [r.step_id, r]; }));
    var hostFromSnap = (function () {
      try { var origin = (pageSnapshot.page && pageSnapshot.page.origin) || (pageSnapshot.page && pageSnapshot.page.url) || ''; return origin ? new URL(origin).hostname : ''; } catch (e) { return ''; }
    }());

    var records = (plan.steps || []).map(function (step) {
      var result = resultByStep.get(step.step_id);
      var planned = (step.action && step.action.value != null) ? step.action.value : ((step.action && step.action.text != null) ? step.action.text : '');
      var actual = (result && result.observed_value_state) || (result && result.actual_value) || (result && result.actualValue) || null;
      return { label: step.target && step.target.node_id || step.step_id, result: result && result.status === 'succeeded' ? 'filled' : ((result && result.status) || 'skipped'), value: planned, plannedValue: planned, actualValue: actual, failReason: (result && result.failure_code) || null, source: 'server-plan', fillMode: 'sequential-ape', hostname: hostFromSnap, verified: result && result.postcondition_met === true };
    });

    // Session
    var sessionId = null;
    try {
      var sessRes = await fetch(backendUrl + '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({ hostname: hostFromSnap, url: (pageSnapshot.page && pageSnapshot.page.url) || (pageSnapshot.page && pageSnapshot.page.origin) || '', semanticFormKey: (pageSnapshot.page && pageSnapshot.page.route_key) || null, runtimeVersion: runtimeVersion || '', totalFilled: filled, totalFailed: failed, totalSkipped: skipped, records: records }),
      });
      if (sessRes.ok) { var sb = await sessRes.json().catch(function () { return {}; }); sessionId = sb.id || null; }
    } catch (e) { console.warn('[CC] session post failed:', e.message); }

    var operatorMessage = null;
    if (executionObservation.outcome === 'rejected' || executionObservation.outcome === 'aborted') {
      operatorMessage = opMsg(executionObservation.rejection_reason || 'plan rejected', null);
    } else if (observationError) {
      operatorMessage = 'Fields changed, but session evidence was not saved.';
    } else {
      operatorMessage = 'Fill complete: ' + filled + ' ok, ' + failed + ' failed, ' + skipped + ' skipped';
    }

    return {
      ok: failed === 0 && executionObservation.outcome !== 'aborted' && executionObservation.outcome !== 'rejected',
      pageSnapshot: pageSnapshot, plan: plan, executionObservation: executionObservation,
      filled: filled, failed: failed, skipped: skipped, records: records,
      observationError: observationError, operatorMessage: operatorMessage,
      sessionId: sessionId, hostname: hostFromSnap,
    };
  }

  root.CcActionPlanFill = { run: run };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcActionPlanFill;
