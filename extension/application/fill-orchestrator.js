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
  'runtime/dom-settle.js',
]);

/**
 * Derive a WSS URL from a backend HTTPS URL.
 * e.g. https://api.cybercontrol.fun → wss://api.cybercontrol.fun/ws
 *      http://localhost:3000 → ws://localhost:3000/ws
 */
function deriveWsUrl(backendUrl) {
  const url = new URL(backendUrl);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  url.pathname = url.pathname.replace(/\/$/, '') + '/ws';
  return url.toString();
}

/**
 * Get or create a shared WsClient instance for the given backend.
 * Reuses existing connection if already connected.
 * @returns {WsClient|null}
 */
let _sharedWsClient = null;
let _sharedWsUrl = null;

function _getOrCreateWsClient(backendUrl, accessToken) {
  const WsClientCtor = (typeof globalThis !== 'undefined' && globalThis.CcWsClient) || null;
  if (!WsClientCtor) return null;

  const wsUrl = deriveWsUrl(backendUrl);
  if (_sharedWsClient && _sharedWsUrl === wsUrl && _sharedWsClient.state === 'connected') {
    return _sharedWsClient;
  }
  // Disconnect old if URL changed
  if (_sharedWsClient && _sharedWsUrl !== wsUrl) {
    _sharedWsClient.disconnect();
    _sharedWsClient = null;
  }
  if (!_sharedWsClient) {
    _sharedWsClient = new WsClientCtor({ url: wsUrl, token: accessToken });
    _sharedWsUrl = wsUrl;
  }
  return _sharedWsClient;
}

/**
 * Attempt to connect WsClient (with timeout). Returns true if connected.
 */
async function _ensureWsConnected(client, timeoutMs = 5000) {
  if (client.state === 'connected') return true;
  return new Promise((resolve) => {
    const origOnState = client._onStateChange;
    const timer = setTimeout(() => {
      client._onStateChange = origOnState;
      resolve(false);
    }, timeoutMs);
    client._onStateChange = (state) => {
      if (origOnState) origOnState(state);
      if (state === 'connected') {
        clearTimeout(timer);
        client._onStateChange = origOnState;
        resolve(true);
      } else if (state === 'suspended' || state === 'disconnected') {
        clearTimeout(timer);
        client._onStateChange = origOnState;
        resolve(false);
      }
    };
    client.connect();
  });
}

/**
 * Request a fill plan via WSS. Returns the plan response body or null on failure.
 * Sends fields at TOP LEVEL to match production ws-handlers.js fill_plan_request handler.
 */
async function _requestPlanViaWss(client, body) {
  try {
    // Production handler expects: snapshot, profile, profileId, operator_execution_preference,
    // session_id, workflow_id, dom_evidence — all at message top level (not nested under 'body')
    const response = await client.request('fill_plan_request', body);
    if (response?.type === 'fill_plan_response' || response?.plan || response?.fill_complete != null) {
      return response;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Report an observation via WSS. Returns true on success.
 * Sends fields at TOP LEVEL to match production ws-handlers.js fill_observation_wss handler.
 */
async function _reportObservationViaWss(client, observation, meta) {
  try {
    // Production handler expects: { observation, session_id } at top level
    // Production responds with type: 'fill_observation_ack' (not 'observation_ack')
    const response = await client.request('fill_observation_wss', {
      observation,
      session_id: meta.sessionId || '',
    });
    return response?.type === 'fill_observation_ack' || response?.type === 'observation_ack' || response?.ok === true;
  } catch (e) {
    return false;
  }
}

/**
 * Run product fill: perceive → plan → ActionPlanExecutor → observation.
 * Phase 4.6: Dynamic mode loops one step at a time until fill_complete or failure.
 * Phase 4.10: WSS adaptive transport — auto/wss/https with HTTPS fallback.
 *
 * @param {object} ctx
 * @param {number} ctx.tabId
 * @param {object} ctx.profile
 * @param {string} ctx.backendUrl
 * @param {string} ctx.accessToken
 * @param {string} ctx.runtimeVersion
 * @param {string} [ctx.executionPreference] - AUTO | STATIC | DYNAMIC (default AUTO)
 * @param {string} [ctx.transport] - 'auto' | 'wss' | 'https' (default 'auto')
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
    transport: transportOption,
    workflowId,
    onProgress,
  } = ctx;

  const transport = transportOption || 'auto'; // 'auto' | 'wss' | 'https'
  let usedTransport = 'https'; // Track which transport was actually used

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

  // ── Transport-aware plan request (WSS preferred in auto/wss) ──────
  const planRequestBody = {
    snapshot: pageSnapshot,
    profileId: profile.id,
    operator_execution_preference: executionPreference || 'AUTO',
    workflow_id: workflowId || undefined,
    profile: (() => {
      const flat = {};
      const raw = profile.data || profile;
      for (const [k, v] of Object.entries(raw)) {
        flat[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
      }
      if (profile.name) flat.name = flat.name || profile.name;
      return flat;
    })(),
  };

  let planBody = null;
  let wsClient = null;

  if (transport === 'auto' || transport === 'wss') {
    wsClient = _getOrCreateWsClient(backendUrl, accessToken);
    if (wsClient) {
      const connected = await _ensureWsConnected(wsClient);
      if (connected) {
        planBody = await _requestPlanViaWss(wsClient, planRequestBody);
        if (planBody) usedTransport = 'wss';
      }
    }
  }

  // HTTPS fallback (or primary if transport === 'https')
  if (!planBody) {
    if (transport === 'wss') {
      // Strict WSS mode — no fallback
      return {
        ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null,
        operatorMessage: opMsg('gateway_error', 'WSS connection failed (no fallback)'),
        error: 'wss_unavailable', transport: 'wss',
      };
    }
    const planResponse = await fetch(backendUrl + '/fill-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify(planRequestBody),
    });

    if (!planResponse.ok) {
      return {
        ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null,
        operatorMessage: opMsg('gateway_error', 'Server plan failed'),
        error: 'plan_http_' + planResponse.status,
        pageSnapshot, transport: usedTransport,
      };
    }
    planBody = await planResponse.json();
    usedTransport = 'https';
  }
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

  // ── Phase 4.13: HIM checkpoint — pause for operator confirmation ────
  // If server returned a HIM checkpoint, the first step is irreversible.
  // Extension must pause and obtain operator confirmation before executing.
  if (planBody.him_checkpoint) {
    const checkpoint = planBody.him_checkpoint;
    progress('Waiting for operator confirmation...', 65);

    // Surface checkpoint to operator via chrome.runtime message or popup state
    const confirmed = await new Promise((resolve) => {
      // Store checkpoint for popup/UI to render confirmation dialog
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        chrome.storage.session.set({
          _cc_him_checkpoint: checkpoint,
          _cc_him_pending: true,
        });
        // Listen for confirmation (operator clicks confirm in popup)
        const listener = (changes) => {
          if (changes._cc_him_confirmed?.newValue) {
            chrome.storage.session.onChanged.removeListener(listener);
            chrome.storage.session.remove(['_cc_him_checkpoint', '_cc_him_pending', '_cc_him_confirmed']);
            resolve(true);
          }
          if (changes._cc_him_cancelled?.newValue) {
            chrome.storage.session.onChanged.removeListener(listener);
            chrome.storage.session.remove(['_cc_him_checkpoint', '_cc_him_pending', '_cc_him_cancelled']);
            resolve(false);
          }
        };
        chrome.storage.session.onChanged.addListener(listener);

        // Hard timeout: if no response within checkpoint expiry, cancel
        const expiresIn = Math.max(0, new Date(checkpoint.expires_at).getTime() - Date.now());
        setTimeout(() => {
          chrome.storage.session.onChanged.removeListener(listener);
          chrome.storage.session.remove(['_cc_him_checkpoint', '_cc_him_pending']);
          resolve(false);
        }, Math.min(expiresIn, 120000));
      } else {
        // No storage API (test env) — auto-confirm
        resolve(true);
      }
    });

    if (!confirmed) {
      return {
        ok: false, filled: 0, failed: 0, skipped: 0, records: [],
        observationError: null,
        operatorMessage: 'Operator cancelled irreversible action.',
        error: 'him_cancelled', pageSnapshot, plan,
      };
    }

    // After confirmation: full validateResume (plan active + document + revision)
    progress('Validating resume state...', 68);
    const [resumeCheck] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const state = globalThis.CcPerception?.getPerceptionState?.() || {};
        return { documentId: state.documentId, revision: state.revision };
      },
    });
    const resumeState = resumeCheck?.result || {};

    // Server-side validateResume: checks plan active + document + revision
    try {
      const validateResponse = await fetch(backendUrl + '/him-validate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({
          session_id: sessionId,
          plan_id: plan.plan_id,
          original_document_id: plan.target_binding?.document_id || null,
          current_document_id: resumeState.documentId || null,
          original_revision: plan.target_binding?.expected_revision || 0,
          current_revision: resumeState.revision || 0,
        }),
      });
      if (validateResponse.ok) {
        const validation = await validateResponse.json();
        if (!validation.valid) {
          return {
            ok: false, filled: 0, failed: 0, skipped: 0, records: [],
            observationError: null,
            operatorMessage: `Cannot resume: ${validation.rejection_reason || 'state invalid'}`,
            error: 'him_resume_invalid', pageSnapshot, plan,
          };
        }
        // If revision changed, server says re-perceive needed — but we proceed
        // since the plan is still valid (server will re-plan on next turn if dynamic)
      }
    } catch (e) {
      // Fallback: local document_id check only (non-fatal server error)
      if (resumeState.documentId && plan.target_binding?.document_id &&
          resumeState.documentId !== plan.target_binding.document_id) {
        return {
          ok: false, filled: 0, failed: 0, skipped: 0, records: [],
          observationError: null,
          operatorMessage: 'Page changed during confirmation — cannot continue safely.',
          error: 'him_document_replaced', pageSnapshot, plan,
        };
      }
    }
  }

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
      progress(`Dynamic turn ${turn + 1}: stabilizing...`, 48 + turn);
      // Phase 4.8: Wait for DOM to settle before re-perception
      await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          if (globalThis.CcDomSettle?.waitForSettle) {
            await globalThis.CcDomSettle.waitForSettle();
          } else {
            // Fallback: fixed delay if settle module not loaded
            await new Promise(r => setTimeout(r, 400));
          }
        },
      });
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

      // Transport-aware re-plan
      const rePlanRequestBody = {
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
      };

      let rePlanBody = null;
      if (usedTransport === 'wss' && wsClient && wsClient.state === 'connected') {
        rePlanBody = await _requestPlanViaWss(wsClient, rePlanRequestBody);
      }
      if (!rePlanBody && transport !== 'wss') {
        const rePlanResponse = await fetch(backendUrl + '/fill-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
          body: JSON.stringify(rePlanRequestBody),
        });
        if (!rePlanResponse.ok) break;
        rePlanBody = await rePlanResponse.json();
      }
      if (!rePlanBody) break;
      if (rePlanBody.fill_complete) break;
      plan = rePlanBody.plan || rePlanBody.action_plan || rePlanBody;
      if (!plan || !plan.steps || plan.steps.length === 0) break;
      lastPlan = plan;

      // Phase 4.13: HIM checkpoint on dynamic re-plan turns
      if (rePlanBody.him_checkpoint) {
        progress('Waiting for operator confirmation...', 60 + turn);
        const dynConfirmed = await new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.storage?.session) {
            chrome.storage.session.set({ _cc_him_checkpoint: rePlanBody.him_checkpoint, _cc_him_pending: true });
            const listener = (changes) => {
              if (changes._cc_him_confirmed?.newValue) { chrome.storage.session.onChanged.removeListener(listener); chrome.storage.session.remove(['_cc_him_checkpoint', '_cc_him_pending', '_cc_him_confirmed']); resolve(true); }
              if (changes._cc_him_cancelled?.newValue) { chrome.storage.session.onChanged.removeListener(listener); chrome.storage.session.remove(['_cc_him_checkpoint', '_cc_him_pending', '_cc_him_cancelled']); resolve(false); }
            };
            chrome.storage.session.onChanged.addListener(listener);
            const expiresIn = Math.max(0, new Date(rePlanBody.him_checkpoint.expires_at).getTime() - Date.now());
            setTimeout(() => { chrome.storage.session.onChanged.removeListener(listener); chrome.storage.session.remove(['_cc_him_checkpoint', '_cc_him_pending']); resolve(false); }, Math.min(expiresIn, 120000));
          } else { resolve(true); }
        });
        if (!dynConfirmed) break; // Operator cancelled — stop dynamic loop

        // Phase 4.13: validateResume on dynamic turn (plan race + document + revision)
        progress('Validating resume state...', 62 + turn);
        try {
          const [dynResumeCheck] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const state = globalThis.CcPerception?.getPerceptionState?.() || {};
              return { documentId: state.documentId, revision: state.revision };
            },
          });
          const dynResumeState = dynResumeCheck?.result || {};
          const dynValidateResponse = await fetch(backendUrl + '/him-validate-resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
            body: JSON.stringify({
              session_id: sessionId,
              plan_id: plan.plan_id,
              original_document_id: plan.target_binding?.document_id || null,
              current_document_id: dynResumeState.documentId || null,
              original_revision: plan.target_binding?.expected_revision || 0,
              current_revision: dynResumeState.revision || 0,
            }),
          });
          if (dynValidateResponse.ok) {
            const dynValidation = await dynValidateResponse.json();
            if (!dynValidation.valid) break; // Plan superseded or document replaced — stop
          }
        } catch (e) {
          // Non-fatal: proceed with best effort
        }
      }
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

    // Report observation to server (WSS preferred, HTTPS fallback)
    let observationError = null;
    const obsMeta = {
      sessionId: sessionId || '',
      planId: plan.plan_id || '',
      correlationId: plan.correlation_id || '',
      runtimeVersion: runtimeVersion || '',
    };

    let obsReported = false;
    if (usedTransport === 'wss' && wsClient && wsClient.state === 'connected') {
      obsReported = await _reportObservationViaWss(wsClient, executionObservation, obsMeta);
    }

    if (!obsReported && transport !== 'wss') {
      // HTTPS fallback for observation
      try {
        const query = new URLSearchParams({
          sessionId: obsMeta.sessionId,
          plan_id: obsMeta.planId,
          correlation_id: obsMeta.correlationId,
          runtimeVersion: obsMeta.runtimeVersion,
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
    } else if (!obsReported && transport === 'wss') {
      observationError = 'WSS observation report failed (no fallback)';
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

    // Phase 4.7: Safety demotion — if a STATIC batch was stopped mid-execution
    // due to hard evidence (outcome 'partial' + skipped steps + safety_demotion diagnostic),
    // switch to dynamic one-step continuation for remaining fields.
    const hasSafetyDemotion = (executionObservation.diagnostics || []).some(
      d => d.code === 'safety_demotion'
    );
    if (hasSafetyDemotion && !isDynamic && skipped > 0) {
      // Force switch to dynamic continuation loop for remaining fields
      // Continue the loop as if isDynamic was true from the start
      const remainingTurns = MAX_DYNAMIC_TURNS - turn - 1;
      for (let dynTurn = 0; dynTurn < remainingTurns; dynTurn++) {
        progress(`Safety demotion: dynamic turn ${dynTurn + 1}...`, 50 + dynTurn);
        // Phase 4.8: Wait for DOM to settle before re-perception
        await chrome.scripting.executeScript({
          target: { tabId },
          func: async () => {
            if (globalThis.CcDomSettle?.waitForSettle) {
              await globalThis.CcDomSettle.waitForSettle();
            } else {
              await new Promise(r => setTimeout(r, 400));
            }
          },
        });
        const [rePercResult] = await chrome.scripting.executeScript({
          target: { tabId },
          func: async () => {
            if (!globalThis.CcPerception?.perceivePage) return { error: 'perception_not_loaded' };
            return await globalThis.CcPerception.perceivePage({ mode: 'snapshot', includeGeometry: true });
          },
        });
        lastPageSnapshot = rePercResult?.result;
        if (!lastPageSnapshot || lastPageSnapshot.kind !== 'page_snapshot') break;

        const demotionRePlanBody_payload = {
          snapshot: lastPageSnapshot,
          profileId: profile.id,
          operator_execution_preference: 'DYNAMIC',
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
        };

        let rePlanBody = null;
        if (usedTransport === 'wss' && wsClient && wsClient.state === 'connected') {
          rePlanBody = await _requestPlanViaWss(wsClient, demotionRePlanBody_payload);
        }
        if (!rePlanBody && transport !== 'wss') {
          const rePlanResponse = await fetch(backendUrl + '/fill-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
            body: JSON.stringify(demotionRePlanBody_payload),
          });
          if (!rePlanResponse.ok) break;
          rePlanBody = await rePlanResponse.json();
        }
        if (!rePlanBody) break;
        if (rePlanBody.fill_complete) break;
        const dynPlan = rePlanBody.plan || rePlanBody.action_plan || rePlanBody;
        if (!dynPlan || !dynPlan.steps || dynPlan.steps.length === 0) break;

        const [dynExecResult] = await chrome.scripting.executeScript({
          target: { tabId },
          func: async (actionPlan) => {
            if (!globalThis.CcActionPlanExecutor?.execute) throw new Error('executor not loaded');
            if (globalThis.CcDomEvidence?.startObserving) {
              const registry = globalThis.CcPerception?.getBindingRegistry?.();
              globalThis.CcDomEvidence.startObserving(actionPlan, registry);
            }
            let obs;
            try { obs = await globalThis.CcActionPlanExecutor.execute(actionPlan); }
            finally {
              if (globalThis.CcDomEvidence?.stopObserving) {
                globalThis.CcDomEvidence.stopObserving();
                const ev = globalThis.CcDomEvidence.getEvidence?.() || [];
                if (ev.length > 0 && obs) obs.dom_evidence = ev;
              }
            }
            return obs;
          },
          args: [dynPlan],
        });
        const dynObs = dynExecResult?.result;
        if (!dynObs || dynObs.kind !== 'execution_observation') break;

        try {
          const dynObsMeta = { sessionId: sessionId || '', planId: dynPlan.plan_id || '', correlationId: dynPlan.correlation_id || '', runtimeVersion: runtimeVersion || '' };
          let dynObsReported = false;
          if (usedTransport === 'wss' && wsClient && wsClient.state === 'connected') {
            dynObsReported = await _reportObservationViaWss(wsClient, dynObs, dynObsMeta);
          }
          if (!dynObsReported && transport !== 'wss') {
            const q = new URLSearchParams({ sessionId: sessionId || '', plan_id: dynPlan.plan_id || '', correlation_id: dynPlan.correlation_id || '', runtimeVersion: runtimeVersion || '' });
            await fetch(backendUrl + '/fill-observation?' + q.toString(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
              body: JSON.stringify(dynObs),
            });
          }
        } catch (e) { lastObservationError = e.message; }

        const dynSteps = dynObs.steps || [];
        totalFilled += dynSteps.filter(r => r.status === 'succeeded').length;
        totalFailed += dynSteps.filter(r => r.status === 'failed').length;
        totalSkipped += dynSteps.filter(r => r.status === 'skipped').length;
        const dynRecords = (dynPlan.steps || []).map(s => {
          const r = dynSteps.find(x => x.step_id === s.step_id);
          return { label: s.target?.node_id || s.step_id, result: r?.status === 'succeeded' ? 'filled' : (r?.status || 'skipped'), value: s.action?.value || '', source: 'server-plan' };
        });
        allRecords = allRecords.concat(dynRecords);
        lastPlan = dynPlan;
        if (dynSteps.some(r => r.status === 'failed') || dynObs.outcome === 'aborted') break;
      }
      break; // Exit the main loop — dynamic continuation handled above
    }

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

  // ── Phase 4.14: Workflow task completion ──────────────────────────────
  // Notify server that fill task completed (if workflow active).
  let nextTask = null;
  if (workflowId && totalFailed === 0 && totalFilled > 0) {
    try {
      const wfResponse = await fetch(backendUrl + '/workflow-complete-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({
          workflow_id: workflowId,
          result: { filled: totalFilled, skipped: totalSkipped },
        }),
      });
      if (wfResponse.ok) {
        const wfResult = await wfResponse.json();
        nextTask = wfResult.next_task || null;
      }
    } catch (e) {
      // Non-fatal: workflow advance failure doesn't invalidate fill
      console.warn('[CC] workflow task completion failed:', e.message);
    }
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
    nextTask,
    transport: usedTransport,
  };
}

const api = { PRODUCT_PATH_SCRIPTS, runProductFill, deriveWsUrl, _getOrCreateWsClient, _ensureWsConnected, _requestPlanViaWss, _reportObservationViaWss };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.CcFillOrchestrator = api;
})();
