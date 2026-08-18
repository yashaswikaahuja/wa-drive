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
  'shared/network-idle.js', // T1 sequential settle for APE
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
 * T13 — sequential kernel scripts (legacy-best freeze in product tree).
 * Default café fill path: extract → memory maps → sequential act+settle.
 */
const SEQUENTIAL_KERNEL_SCRIPTS = Object.freeze([
  'shared/network-idle.js',
  'shared/dom-utils.js',
  'shared/label-utils.js',
  'shared/option-match.js',
  'shared/select-apply.js',
  'shared/llm-client.js', // soft residual AI (never hard-throw)
  'autofill/plugins/interface.js',
  'autofill/plugins/cascade-select.js',
  'autofill/plugins/ng-dropdown.js',
  'autofill/plugins/button-click.js',
  'autofill/plugins/keystroke-input.js',
  'drivers/dispatch.js',
  'drivers/dom.js',
  'drivers/input.js',
  'drivers/select.js',
  'drivers/interaction.js',
  'autofill/extractor.js',
  'autofill/mapper.js',
  'autofill/derive.js',
  'autofill/rule-engine.js',
  'autofill/ai-resolve.js',
  'autofill/executor.js',
]);

/**
 * Flatten profile data for sequential mapper.
 */
function flattenProfile(profile) {
  const flat = {};
  const raw = (profile && (profile.data || profile)) || {};
  for (const [k, v] of Object.entries(raw)) {
    flat[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
  }
  if (profile?.name) flat.name = flat.name || profile.name;
  return flat;
}

/**
 * T13 — Sequential kernel fill (default café path).
 * Eyes: extractor. Memory: saved mappings + label-primary fuzzy. Hand: sequential settle.
 */
async function runSequentialKernelFill(ctx) {
  const {
    tabId,
    profile,
    backendUrl,
    accessToken,
    runtimeVersion,
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

  progress('Loading sequential fill kernel...', 25);
  await chrome.scripting.executeScript({
    target: { tabId },
    files: SEQUENTIAL_KERNEL_SCRIPTS.slice(),
  });

  const flat = flattenProfile(profile);
  progress('Extracting fields...', 35);

  // 1) Extract only (no HTTPS)
  const [extractResult] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [flat],
    func: (prof) => {
      if (typeof extractFormFieldsWithFingerprint !== 'function') {
        return { ok: false, error: 'extractor_not_loaded' };
      }
      if (typeof ccDeriveProfile === 'function') {
        try {
          const derived = ccDeriveProfile(prof);
          if (derived && typeof derived === 'object') Object.assign(prof, derived);
        } catch { /* soft */ }
      }
      const { formFields, formKey, semanticFormKey } = extractFormFieldsWithFingerprint();
      if (!formFields.length) return { ok: false, error: 'no fields detected' };
      const visible = formFields.filter((f) => f.visible !== false && f.hidden !== true);
      const fields = (visible.length ? visible : formFields).map((f) => ({
        selector: f.selector,
        id: f.id || '',
        name: f.name || '',
        label: f.label || '',
        type: f.type || 'text',
        options: f.options || null,
        optionSelectors: f.optionSelectors || null,
        placeholder: f.placeholder || '',
      }));
      return {
        ok: true,
        fields,
        profile: prof,
        formKey,
        semanticFormKey: semanticFormKey || formKey,
        hostname: location.hostname,
        url: location.href,
      };
    },
  });

  const extracted = extractResult?.result;
  if (!extracted?.ok) {
    return {
      ok: false, filled: 0, failed: 1, skipped: 0, records: [], observationError: null,
      operatorMessage: opMsg('gateway_error', extracted?.error || 'Extract failed'),
      error: extracted?.error || 'extract_failed',
    };
  }

  // 2) Plan over WSS (Stage C) — HTTPS fallback only if socket down
  progress('Planning over WSS...', 50);
  let transport = 'wss';
  let wssPlan = null;
  try {
    const planResp = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'WSS_FILL_REQUEST',
          formKey: extracted.semanticFormKey || extracted.formKey,
          semanticFormKey: extracted.semanticFormKey || extracted.formKey,
          hostname: extracted.hostname,
          fields: extracted.fields,
          profile: extracted.profile,
          profileId: profile?.id || null,
        },
        (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(resp || { ok: false, error: 'no_response' });
          }
        }
      );
    });
    if (planResp?.ok && planResp.plan) {
      wssPlan = planResp.plan;
      transport = 'wss';
    } else {
      throw new Error(planResp?.error || 'wss_plan_failed');
    }
  } catch (e) {
    console.warn('[CC] WSS fill plan failed, HTTPS fallback:', e.message);
    transport = 'https-fallback';
    progress('WSS unavailable — HTTPS fallback...', 52);
    // HTTPS fallback: fetch mappings/adapters only
    try {
      const headers = { Authorization: 'Bearer ' + accessToken };
      const pk = extracted.semanticFormKey || extracted.formKey;
      let saved = {};
      const mr = await fetch(backendUrl + '/mappings/' + encodeURIComponent(pk), { headers });
      if (mr.ok) saved = await mr.json();
      let adapters = {};
      try {
        const ar = await fetch(backendUrl + '/adapters/' + encodeURIComponent(extracted.hostname), { headers });
        if (ar.ok) adapters = await ar.json();
      } catch { /* ignore */ }
      wssPlan = {
        mapping: {},
        filledBySource: {},
        adapters,
        savedMappings: saved,
        transport: 'https-fallback',
      };
    } catch (e2) {
      return {
        ok: false, filled: 0, failed: 1, skipped: 0, records: [], observationError: null,
        operatorMessage: opMsg('gateway_error', 'Plan failed: ' + (e2.message || e.message)),
        error: 'plan_failed',
      };
    }
  }

  // 3) Execute in page: apply WSS mapping + local residual fuzzyMatch (no HTTPS)
  progress('Filling form (sequential)...', 70);
  const [execResult] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [
      extracted.profile,
      extracted.fields,
      wssPlan?.mapping || {},
      wssPlan?.filledBySource || {},
      wssPlan?.adapters || {},
      wssPlan?.savedMappings || {},
      profile?.id || null,
      transport,
    ],
    func: async (prof, fields, wssMapping, wssFbs, adapters, saved, profileId, fillTransport) => {
      if (typeof fillFormFieldsSequential !== 'function') {
        return { ok: false, error: 'sequential_kernel_not_loaded' };
      }
      try { window._ccProfileId = profileId; } catch { /* ignore */ }

      let mapping = Object.assign({}, wssMapping || {});
      let fbs = Object.assign({}, wssFbs || {});
      const gsk = (l) => (l || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      const isChoiceType = (t) => /radio|checkbox/i.test(String(t || ''));

      function choiceCovered(f) {
        if (mapping[f.selector]) return true;
        if (f.optionSelectors) {
          for (const sel of f.optionSelectors) {
            if (mapping[sel]) return true;
          }
        }
        return false;
      }

      // If WSS plan was thin (HTTPS fallback with empty mapping), apply saved maps locally
      if (saved && Object.keys(mapping).length === 0) {
        for (const f of fields) {
          const sk = gsk(f.label);
          const s = saved[sk] || saved[gsk(f.name)] || null;
          if (!s) continue;
          if (s.profileKey && prof[s.profileKey] != null && String(prof[s.profileKey]).trim() !== '') {
            if (isChoiceType(f.type) && typeof resolveChoiceToOption === 'function') {
              const resolved = resolveChoiceToOption(f, prof[s.profileKey], s.profileKey);
              if (resolved) {
                mapping[resolved.selector] = resolved.entry;
                fbs[resolved.selector] = { label: f.label, profileKey: s.profileKey, source: 'https-saved' };
              }
            } else {
              mapping[f.selector] = { value: prof[s.profileKey], type: f.type, label: f.label, profileKey: s.profileKey };
              fbs[f.selector] = { label: f.label, profileKey: s.profileKey, source: 'https-saved' };
            }
          }
        }
      }

      // Local residual fuzzyMatch (no network)
      const unmapped = fields.filter((f) => !choiceCovered(f));
      if (unmapped.length > 0 && typeof fuzzyMatch === 'function') {
        const fz = fuzzyMatch(unmapped, prof);
        for (const [sel, v] of Object.entries(fz || {})) {
          if (mapping[sel]) continue;
          mapping[sel] = v;
          fbs[sel] = {
            label: (v && v.label) || '',
            source: 'label-primary',
            profileKey: v.profileKey || null,
          };
        }
      }

      const filledCount = await fillFormFieldsSequential(mapping, fbs, adapters || {}, fields);
      let records = [];
      try {
        const raw = document.body.getAttribute('data-cc-records');
        if (raw) records = JSON.parse(raw);
      } catch { /* ignore */ }
      if (!records.length && Array.isArray(window.__ccFillRecords)) records = window.__ccFillRecords;

      const failed = records.filter((r) =>
        (r.result === 'failed' || r.result === 'error') ||
        (r.failReason && r.result !== 'skipped' && r.result !== 'waiting_human' && r.result !== 'filled')
      ).length;
      const skipped = records.filter((r) => r.result === 'skipped' || r.result === 'waiting_human').length;
      const filled = records.filter((r) => r.result === 'filled').length || filledCount || 0;
      records = records.map((r) => ({
        ...r,
        hostname: r.hostname || location.hostname,
        plannedValue: r.plannedValue != null ? r.plannedValue : r.value,
        actualValue: r.actualValue != null ? r.actualValue : r.actual,
        transport: fillTransport,
      }));

      return {
        ok: true,
        filled,
        failed,
        skipped,
        fields: Object.keys(mapping).length,
        records,
        primaryKey: null,
        hostname: location.hostname,
        url: location.href,
        formKey: null,
      };
    },
  });

  const r = execResult?.result || { ok: false, error: 'no_result' };
  if (!r.ok) {
    return {
      ok: false,
      filled: 0,
      failed: 1,
      skipped: 0,
      records: [],
      observationError: null,
      operatorMessage: opMsg('gateway_error', r.error || 'Sequential fill failed'),
      error: r.error || 'sequential_failed',
    };
  }

  // 4) Session evidence over WSS (HTTPS fallback)
  progress('Saving session over WSS...', 92);
  let sessionId = null;
  const sessionPayload = {
    hostname: r.hostname || extracted.hostname,
    url: r.url || extracted.url,
    semanticFormKey: extracted.semanticFormKey || extracted.formKey,
    formKey: extracted.formKey,
    runtimeVersion: runtimeVersion || '',
    totalFilled: r.filled || 0,
    totalFailed: r.failed || 0,
    totalSkipped: r.skipped || 0,
    records: r.records || [],
  };
  try {
    const sessResp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'WSS_FILL_SESSION', ...sessionPayload }, (resp) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(resp || { ok: false });
      });
    });
    if (sessResp?.ok) {
      sessionId = sessResp.id || null;
      transport = transport === 'https-fallback' ? 'https-fallback' : 'wss';
    } else {
      throw new Error(sessResp?.error || 'wss_session_failed');
    }
  } catch (e) {
    console.warn('[CC] WSS session failed, HTTPS fallback:', e.message);
    try {
      const sessRes = await fetch(backendUrl + '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify(sessionPayload),
      });
      if (sessRes.ok) {
        const body = await sessRes.json().catch(() => ({}));
        sessionId = body.id || null;
      }
      transport = 'https-fallback';
    } catch { /* soft */ }
  }

  progress(`Fill done (${transport}): ${r.filled} filled`, 100);
  return {
    ok: (r.failed || 0) === 0,
    filled: r.filled || 0,
    failed: r.failed || 0,
    skipped: r.skipped || 0,
    records: r.records || [],
    observationError: null,
    operatorMessage: `Fill complete: ${r.filled || 0} ok, ${r.failed || 0} failed, ${r.skipped || 0} skipped (${transport})`,
    sessionId,
    hostname: r.hostname || extracted.hostname || '',
    path: 'sequential-kernel',
    transport,
  };
}

/**
 * Run product fill.
 * T13: default café path = sequential kernel (AUTO/STATIC/SEQUENTIAL).
 * ActionPlan/APE only when operator selects DYNAMIC (opt-in).
 *
 * @param {object} ctx
 * @param {number} ctx.tabId
 * @param {object} ctx.profile
 * @param {string} ctx.backendUrl
 * @param {string} ctx.accessToken
 * @param {string} ctx.runtimeVersion
 * @param {string} [ctx.executionPreference] - AUTO | STATIC | SEQUENTIAL | DYNAMIC
 * @param {(text: string, pct?: number) => void} [ctx.onProgress]
 */
async function runProductFill(ctx) {
  const pref = String(ctx.executionPreference || 'AUTO').toUpperCase();
  // DYNAMIC = ActionPlan path (opt-in). Everything else uses sequential kernel.
  if (pref === 'DYNAMIC') {
    return runActionPlanFill(ctx);
  }
  return runSequentialKernelFill(ctx);
}

/**
 * ActionPlan path: perceive → /fill-plan → ActionPlanExecutor → /fill-observation.
 * Opt-in via executionPreference=DYNAMIC (T13).
 */
async function runActionPlanFill(ctx) {
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
    return {
      ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null,
      operatorMessage: 'No fields could be mapped for this form.',
      error: 'empty_plan',
      pageSnapshot,
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
  const hostFromSnap = (() => {
    try {
      const origin = pageSnapshot?.page?.origin || pageSnapshot?.page?.url || '';
      return origin ? new URL(origin).hostname : '';
    } catch { return ''; }
  })();

  const records = (plan.steps || []).map((step) => {
    const result = resultByStep.get(step.step_id);
    const planned = step.action?.value ?? step.action?.text ?? '';
    // T16 — always attempt actualValue from observation postcondition
    const actual =
      result?.observed_value_state
      ?? result?.actual_value
      ?? result?.actualValue
      ?? null;
    return {
      label: step.target?.node_id || step.step_id,
      result: result?.status === 'succeeded' ? 'filled' : (result?.status || 'skipped'),
      value: planned,
      plannedValue: planned,
      actualValue: actual,
      failReason: result?.failure_code || null,
      source: 'server-plan',
      fillMode: 'sequential-ape',
      hostname: hostFromSnap,
      verified: result?.postcondition_met === true,
    };
  });

  // T16 — durable session POST with hostname (product path previously often empty)
  let sessionId = null;
  try {
    const sessRes = await fetch(backendUrl + '/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify({
        hostname: hostFromSnap,
        url: pageSnapshot?.page?.url || pageSnapshot?.page?.origin || '',
        semanticFormKey: pageSnapshot?.page?.route_key || null,
        runtimeVersion: runtimeVersion || '',
        totalFilled: filled,
        totalFailed: failed,
        totalSkipped: skipped,
        records,
      }),
    });
    if (sessRes.ok) {
      const body = await sessRes.json().catch(() => ({}));
      sessionId = body.id || null;
    }
  } catch (e) {
    console.warn('[CC] session post failed:', e.message);
  }

  let operatorMessage = null;
  if (executionObservation.outcome === 'rejected' || executionObservation.outcome === 'aborted') {
    const reason = executionObservation.rejection_reason || 'plan rejected';
    operatorMessage = opMsg(reason, null);
  } else if (observationError) {
    operatorMessage = 'Fields changed, but session evidence was not saved.';
  } else {
    operatorMessage = `Fill complete: ${filled} ok, ${failed} failed, ${skipped} skipped`;
  }

  return {
    ok: failed === 0 && executionObservation.outcome !== 'aborted' && executionObservation.outcome !== 'rejected',
    pageSnapshot,
    plan,
    executionObservation,
    filled,
    failed,
    skipped,
    records,
    observationError,
    operatorMessage,
    sessionId,
    hostname: hostFromSnap,
  };
}

const api = {
  PRODUCT_PATH_SCRIPTS,
  SEQUENTIAL_KERNEL_SCRIPTS,
  runProductFill,
  runSequentialKernelFill,
  runActionPlanFill,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.CcFillOrchestrator = api;
})();
