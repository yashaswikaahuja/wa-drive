(function () {
'use strict';

const SCHEMA_VERSION = '3.0.0';
const RISK_ORDER = Object.freeze({ safe: 0, reversible: 1, irreversible: 2 });

/** Prefer shared runtime/errors catalog (MIG-ERR-01); fallback frozen set. */
function runtimeErrors() {
  if (typeof globalThis !== 'undefined' && globalThis.CcRuntimeErrors) {
    return globalThis.CcRuntimeErrors;
  }
  if (typeof require === 'function') {
    try { return require('./errors.js'); } catch { /* browser inject */ }
  }
  return null;
}

const _err = runtimeErrors();
const FAILURE_CODES = new Set(
  _err?.FROZEN_FAILURE_CODES || [
    'plan_expired', 'stale_target', 'stale_snapshot', 'adapter_mismatch',
    'affordance_mismatch', 'document_replaced', 'authorization_denied',
    'correlation_replayed', 'file_reference_invalid', 'action_unsupported',
    'postcondition_failed', 'gateway_error',
  ]
);

function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.().replace(/-/g, '')
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${uuid.slice(0, 24)}`;
}

function diagnostic(code, severity, stepId, message) {
  return { code, severity, step_id: stepId || null, message: String(message).slice(0, 320) };
}

function normalizeFailureCode(code) {
  if (_err?.normalizeFailureCode) return _err.normalizeFailureCode(code);
  return FAILURE_CODES.has(code) ? code : 'gateway_error';
}

/** APE-P1-06: correlation replay cache (memory-only, tab-session scope). */
const REPLAY_TTL_MS = 30 * 60 * 1000;
const _replayCache = new Map(); // correlation_id -> { planId, ts }

function pruneReplayCache(now = Date.now()) {
  for (const [key, entry] of _replayCache) {
    if (now - entry.ts > REPLAY_TTL_MS) _replayCache.delete(key);
  }
}

function checkAndRecordReplay(plan) {
  pruneReplayCache();
  const key = plan.correlation_id;
  if (_replayCache.has(key)) {
    return { ok: false, code: 'correlation_replayed', message: 'ActionPlan correlation_id already executed' };
  }
  _replayCache.set(key, { planId: plan.plan_id, ts: Date.now() });
  return { ok: true };
}

/** Test helper: clear replay cache. */
function clearReplayCache() {
  _replayCache.clear();
}

/**
 * Mechanical classification: does activation of this element submit a form?
 * APE-IMPL-P1-02 / gateway-security compromised_service (allow_submit).
 */
function elementImpliesSubmit(el) {
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  const type = String(el.type || el.getAttribute?.('type') || '').toLowerCase();
  if (tag === 'INPUT' && (type === 'submit' || type === 'image')) return true;
  if (tag === 'BUTTON') {
    // HTML: button inside a form defaults to type=submit
    const effective = type || 'submit';
    if (effective === 'submit') return true;
  }
  if (el.getAttribute?.('formaction')) return true;
  return false;
}

/**
 * Mechanical classification: would activation navigate away?
 * Phase 3.5: delegates to architecture-owned CcNavigationContract classifier.
 */
function elementImpliesNavigation(el) {
  const nav = globalThis.CcNavigationContract;
  if (nav?.classifyNavigationImplication) {
    return !!nav.classifyNavigationImplication(el).implies;
  }
  if (nav?.elementImpliesNavigation) return !!nav.elementImpliesNavigation(el);
  // Minimal fallback if contract module not loaded (tests / legacy inject)
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'A' && el.hasAttribute('href')) {
    const href = String(el.getAttribute('href') || '').trim();
    if (!href || href === '#' || href.startsWith('#')) return false;
    if (/^javascript:/i.test(href)) return false;
    return true;
  }
  if (String(el.getAttribute?.('role') || '').toLowerCase() === 'link') return true;
  return false;
}

/**
 * Hard-enforce allow_submit / allow_navigation / origin policy against the resolved element.
 * Returns { code, message, diagnostic? } or null when authorized.
 */
function checkStepAuthorization(plan, step, element) {
  if (step.action?.op !== 'activate') return null;
  const nav = globalThis.CcNavigationContract;
  if (nav?.checkNavigationAuthorization) {
    const r = nav.checkNavigationAuthorization(plan, step, element, {
      elementImpliesSubmit,
      currentOrigin: typeof location !== 'undefined' ? location.origin : null,
      originAllowlist: nav.getOriginAllowlist?.() || [],
    });
    if (r) return r;
  }
  const auth = plan.authorization || {};
  if (auth.allow_submit === false && elementImpliesSubmit(element)) {
    return {
      code: 'authorization_denied',
      message: 'Submission action denied: allow_submit is false',
    };
  }
  if (auth.allow_navigation === false && elementImpliesNavigation(element)) {
    return {
      code: 'authorization_denied',
      diagnostic: 'navigation_allow_navigation_false',
      message: 'Navigation action denied: allow_navigation is false',
    };
  }
  return null;
}

function readNavigationIdentity() {
  const perc = globalThis.CcPerception?.getPerceptionState?.() || {};
  const nav = globalThis.CcNavigationContract;
  let path = null;
  let origin = typeof location !== 'undefined' ? location.origin : null;
  if (typeof location !== 'undefined') {
    if (nav?.sanitizePagePath) {
      path = nav.sanitizePagePath(location.pathname || location.href).path;
    } else {
      path = location.pathname || null;
    }
  }
  // NAV-RR2-P2-03: prefer IR PageState signals, then ARIA, then heuristic
  let blockingOverlay = false;
  if (nav?.detectBlockingOverlay) {
    const det = nav.detectBlockingOverlay({
      stateSignals: perc.stateSignals || [],
      doc: typeof document !== 'undefined' ? document : null,
    });
    blockingOverlay = !!det.blocking;
  } else {
    blockingOverlay = !!(
      typeof document !== 'undefined'
      && document.querySelector?.('[aria-modal="true"], .modal.show, [data-cc-blocking-overlay]')
    );
  }
  const identity = {
    documentId: perc.documentId || null,
    revision: perc.revision ?? -1,
    path,
    origin,
    blockingOverlay,
  };
  // Live browse key for SPA/full-nav settle (does not wait for re-perceive)
  identity.browseKey = nav?.browseKeyFromIdentity
    ? nav.browseKeyFromIdentity(identity)
    : `${origin || ''}${path || ''}`;
  return identity;
}

function validatePlan(plan, state) {
  if (!plan || plan.kind !== 'action_plan' || plan.schema_version !== SCHEMA_VERSION) {
    return { ok: false, code: 'authorization_denied', message: 'Unsupported or malformed ActionPlan' };
  }
  if (!plan.plan_id || !plan.correlation_id || !plan.target_binding || !Array.isArray(plan.steps) || !plan.authorization) {
    return { ok: false, code: 'authorization_denied', message: 'ActionPlan is missing required envelope fields' };
  }
  if (Date.parse(plan.expires_at) <= Date.now()) {
    return { ok: false, code: 'plan_expired', message: 'ActionPlan expired before execution' };
  }
  const binding = plan.target_binding;
  if (state.documentId !== binding.document_id) {
    return { ok: false, code: 'document_replaced', message: 'Active document does not match the plan' };
  }
  if (state.snapshotId !== binding.snapshot_id || state.revision !== binding.expected_revision) {
    return { ok: false, code: 'stale_snapshot', message: 'Active snapshot or revision does not match the plan' };
  }
  const maxRisk = RISK_ORDER[plan.authorization.max_risk];
  if (maxRisk == null) {
    return { ok: false, code: 'authorization_denied', message: 'ActionPlan has an invalid risk authorization' };
  }
  // Authorization flags must be explicit booleans (fail closed on missing).
  if (typeof plan.authorization.allow_submit !== 'boolean' || typeof plan.authorization.allow_navigation !== 'boolean') {
    return { ok: false, code: 'authorization_denied', message: 'ActionPlan authorization flags must be boolean' };
  }
  for (const step of plan.steps) {
    if (!step?.step_id || !step.target?.context_id || !step.target?.node_id || !step.action?.op || !step.postcondition) {
      return { ok: false, code: 'authorization_denied', message: 'ActionPlan contains a malformed step' };
    }
    if (RISK_ORDER[step.risk] == null || RISK_ORDER[step.risk] > maxRisk) {
      return { ok: false, code: 'authorization_denied', message: 'A step exceeds the plan risk authorization' };
    }
    if (step.risk === 'irreversible' && !plan.authorization.operator_confirmed) {
      return { ok: false, code: 'authorization_denied', message: 'Irreversible action lacks operator confirmation' };
    }
    // Element-level allow_submit / allow_navigation enforcement happens at
    // execute time once the live target is resolved (checkStepAuthorization).
  }
  return { ok: true };
}

function observedValueState(action, targetState, optionState) {
  if (action.op === 'select_option') {
    if (optionState?.selected === true || optionState?.checked === true || targetState?.valueState === 'nonempty') return 'selected';
    return targetState?.valueState === 'empty' ? 'empty' : 'unavailable';
  }
  const state = targetState?.valueState;
  return ['empty', 'nonempty', 'masked', 'not_applicable'].includes(state) ? state : 'unavailable';
}

function verifyPostcondition(postcondition, element, action, optionElement) {
  if (!postcondition || postcondition.type === 'none') {
    return { met: true, valueState: 'not_applicable' };
  }
  if (!element?.isConnected) return { met: false, valueState: 'unavailable' };

  const targetState = globalThis.CcDomGateway.readAriaState(element);
  const optionState = optionElement ? globalThis.CcDomGateway.readAriaState(optionElement) : null;
  const valueState = observedValueState(action, targetState, optionState);
  let met = false;

  switch (postcondition.type) {
    case 'value_state':
      met = valueState === postcondition.expected_value_state;
      break;
    case 'checked':
      met = targetState.checked === postcondition.expected_boolean;
      break;
    case 'selected':
      met = optionState?.selected === postcondition.expected_boolean;
      break;
    case 'expanded':
      met = targetState.expanded === postcondition.expected_boolean;
      break;
    case 'focused':
      met = targetState.focused === (postcondition.expected_boolean ?? true);
      break;
    case 'node_present':
      met = element.isConnected;
      break;
    default:
      met = false;
  }
  return { met, valueState };
}

function rejectedObservation(plan, state, failure) {
  return {
    kind: 'execution_observation',
    schema_version: SCHEMA_VERSION,
    observation_id: makeId('obs'),
    plan_id: plan?.plan_id || 'plan:invalid',
    correlation_id: plan?.correlation_id || 'corr:invalid',
    document_id: state.documentId || plan?.target_binding?.document_id || 'doc:unknown',
    observed_at: new Date().toISOString(),
    outcome: 'rejected',
    rejection_reason: failure.code,
    resulting_revision: Math.max(0, state.revision ?? 0),
    resulting_snapshot_id: state.snapshotId || null,
    steps: [],
    diagnostics: [diagnostic(failure.code, 'error', null, failure.message)],
  };
}

async function execute(plan) {
  // APE-P1-09: product path must not depend on legacy autofill modules
  if (typeof globalThis !== 'undefined' && globalThis.__ccForceLegacyFill === true) {
    return rejectedObservation(plan, {}, {
      code: 'authorization_denied',
      message: 'Legacy fill path is not permitted for ActionPlan v3',
    });
  }

  const state = globalThis.CcPerception?.getPerceptionState?.() || {};
  const validation = validatePlan(plan, state);
  if (!validation.ok) return rejectedObservation(plan, state, validation);

  const replay = checkAndRecordReplay(plan);
  if (!replay.ok) return rejectedObservation(plan, state, replay);

  if (!globalThis.CcPerception?.resolveExecutionTarget) {
    return rejectedObservation(plan, state, {
      code: 'gateway_error',
      message: 'Perception resolveExecutionTarget unavailable',
    });
  }

  const steps = [];
  const diagnostics = [];
  let stopped = false;

  for (const step of plan.steps) {
    if (stopped) {
      steps.push({ step_id: step.step_id, status: 'skipped', failure_code: null, postcondition_met: null, observed_value_state: null, duration_ms: 0 });
      continue;
    }

    const started = performance.now();
    let target = null;
    let optionTarget = null;
    let failureCode = null;

    if (Date.parse(plan.expires_at) <= Date.now()) {
      failureCode = 'plan_expired';
    } else {
      target = globalThis.CcPerception.resolveExecutionTarget(
        plan.target_binding,
        step.target,
        { requiredAffordance: step.required_affordance, requiredAdapterId: step.required_adapter_id }
      );
      failureCode = target.error;
    }

    if (!failureCode && step.action.op === 'select_option') {
      optionTarget = globalThis.CcPerception.resolveExecutionTarget(
        plan.target_binding,
        step.action.option_target,
        {}
      );
      failureCode = optionTarget.error;
    }

    // Hard authorization against resolved element (submit / nav / origin)
    let authDiagnostic = null;
    if (!failureCode && target?.element) {
      const authz = checkStepAuthorization(plan, step, target.element);
      if (authz) {
        failureCode = authz.code;
        authDiagnostic = authz.diagnostic || null;
      }
    }

    let postcondition = { met: false, valueState: null };
    let navMapped = null;
    if (!failureCode) {
      if (!globalThis.CcDomGateway?.performAction || !globalThis.CcDomGateway?.readAriaState) {
        failureCode = 'gateway_error';
      } else {
        // APE-IMPL-P1-01: revalidate generation-aware binding immediately before
        // mutation (gateway-security toctou_revalidation). Never act on a stale gen.
        const toctou = globalThis.CcPerception.resolveExecutionTarget(
          plan.target_binding,
          step.target,
          { requiredAffordance: step.required_affordance, requiredAdapterId: step.required_adapter_id }
        );
        if (toctou.error) {
          failureCode = toctou.error;
        } else if (
          typeof toctou.expectedGeneration === 'number' &&
          globalThis.CcDomGateway.resolveBinding &&
          globalThis.CcPerception.getBindingRegistry
        ) {
          const registry = globalThis.CcPerception.getBindingRegistry();
          const genCheck = globalThis.CcDomGateway.resolveBinding(
            step.target.context_id,
            step.target.node_id,
            registry,
            toctou.expectedGeneration
          );
          if (genCheck.error || !genCheck.element) {
            failureCode = genCheck.error || 'stale_target';
          } else {
            target = { ...toctou, element: genCheck.element };
          }
        } else {
          target = toctou;
        }

        if (!failureCode && step.action.op === 'select_option' && step.action.option_target) {
          const optToctou = globalThis.CcPerception.resolveExecutionTarget(
            plan.target_binding,
            step.action.option_target,
            {}
          );
          if (optToctou.error) failureCode = optToctou.error;
          else optionTarget = optToctou;
        }

        if (!failureCode) {
          const authz2 = checkStepAuthorization(plan, step, target.element);
          if (authz2) {
            failureCode = authz2.code;
            authDiagnostic = authz2.diagnostic || null;
          }
        }

        // Mid-plan document check before mutate
        if (!failureCode) {
          const live = globalThis.CcPerception.getPerceptionState?.() || {};
          if (live.documentId && live.documentId !== plan.target_binding.document_id) {
            failureCode = 'document_replaced';
            authDiagnostic = 'navigation_document_replaced';
          }
        }

        if (!failureCode) {
          const nav = globalThis.CcNavigationContract;
          const classification = nav?.classifyNavigationImplication?.(target.element)
            || { implies: elementImpliesNavigation(target.element), isBlankTarget: false, destinationHref: null };
          const beforeIdentity = readNavigationIdentity();
          // NAV-RR2-P2-01: known destination origin for unload recheck when context dies
          let expectedDestinationOrigin = null;
          if (classification.destinationHref && nav?.resolveDestinationOrigin) {
            const baseHref = typeof location !== 'undefined' ? location.href : beforeIdentity.origin;
            expectedDestinationOrigin = nav.resolveDestinationOrigin(
              classification.destinationHref,
              beforeIdentity.origin,
              baseHref
            );
          }

          const result = globalThis.CcDomGateway.performAction(target.element, step.action, {
            optionElement: optionTarget?.element || null,
          });
          if (!result.success) {
            failureCode = normalizeFailureCode(result.error);
          } else if (step.action.op === 'activate' && (classification.implies || classification.isBlankTarget) && nav?.observeNavigationAfterActivate) {
            const observed = await nav.observeNavigationAfterActivate({
              beforeDocumentId: beforeIdentity.documentId,
              beforeRevision: beforeIdentity.revision,
              beforePath: beforeIdentity.path,
              beforeOrigin: beforeIdentity.origin,
              expectedDestinationOrigin,
              impliesNavigation: !!classification.implies,
              isBlankTarget: !!classification.isBlankTarget,
              readIdentity: readNavigationIdentity,
              originAllowlist: nav.getOriginAllowlist?.() || [],
            });
            if (observed.mapped) {
              navMapped = observed.mapped;
              if (observed.mapped.primary_failure_code) {
                failureCode = observed.mapped.primary_failure_code;
                authDiagnostic = observed.mapped.primary_diagnostic;
              } else {
                // Success navigation outcomes satisfy mechanical postcondition
                postcondition = { met: true, valueState: 'not_applicable' };
                // NAV-IMPL-P1-03: post-settle origin already applied inside observe via recheck
                if (observed.outcome === 'new_document_completed') {
                  stopped = true;
                }
              }
            } else {
              // Non-nav path after activate: still recheck origin if location moved
              const after = readNavigationIdentity();
              if (nav.recheckOriginAfterSettle && beforeIdentity.origin && after.origin) {
                const deny = nav.recheckOriginAfterSettle(
                  beforeIdentity.origin,
                  after.origin,
                  nav.getOriginAllowlist?.() || []
                );
                if (deny) {
                  failureCode = deny.mapped.primary_failure_code;
                  authDiagnostic = deny.mapped.primary_diagnostic;
                  navMapped = deny.mapped;
                }
              }
              if (!failureCode) {
                const settleMs = 120;
                await new Promise(resolve => setTimeout(resolve, settleMs));
                postcondition = verifyPostcondition(step.postcondition, target.element, step.action, optionTarget?.element || null);
                if (!postcondition.met) failureCode = 'postcondition_failed';
              }
            }
          } else {
            const settleMs = step.action.op === 'select_option' ? 500 : (step.action.op === 'toggle' ? 160 : 120);
            await new Promise(resolve => setTimeout(resolve, settleMs));
            postcondition = verifyPostcondition(step.postcondition, target.element, step.action, optionTarget?.element || null);
            if (!postcondition.met) failureCode = 'postcondition_failed';
          }
        }
      }
    }

    const duration = Math.max(0, Math.round(performance.now() - started));
    if (failureCode) {
      const code = normalizeFailureCode(failureCode);
      steps.push({ step_id: step.step_id, status: 'failed', failure_code: code, postcondition_met: false, observed_value_state: postcondition.valueState, duration_ms: duration });
      const diagCode = authDiagnostic || code;
      diagnostics.push(diagnostic(diagCode, 'error', step.step_id, `Mechanical execution failed: ${diagCode}`));
      stopped = true;
    } else {
      steps.push({ step_id: step.step_id, status: 'succeeded', failure_code: null, postcondition_met: true, observed_value_state: postcondition.valueState, duration_ms: duration });
      // Phase 4.2: notify evidence emitter that this step completed (advances planned targets)
      if (globalThis.CcDomEvidence?.notifyStepExecuted) {
        globalThis.CcDomEvidence.notifyStepExecuted(step.step_id, step.target.context_id, step.target.node_id);
      }
      // Phase 4.7: Safety demotion — check if hard DOM evidence invalidates remaining steps.
      // If so, stop the batch immediately. The orchestrator switches to dynamic continuation.
      if (!stopped && globalThis.CcDomEvidence?.getEvidence) {
        const evidence = globalThis.CcDomEvidence.getEvidence();
        const HARD_TYPES = ['control_removed', 'subtree_replaced', 'option_set_changed', 'cascade_triggered', 'widget_recreated'];
        const hardEvidence = evidence.filter(e => HARD_TYPES.includes(e.type));
        if (hardEvidence.length > 0) {
          // Check if any hard evidence affects remaining (not-yet-executed) step targets
          const remainingSteps = plan.steps.filter(s => !steps.find(r => r.step_id === s.step_id));
          const remainingNodeIds = new Set(remainingSteps.map(s => s.target?.node_id));
          if (remainingNodeIds.size > 0) {
            const invalidatesRemaining = hardEvidence.some(e => {
              if (e.affected_node_id && remainingNodeIds.has(e.affected_node_id)) return true;
              if (e.type === 'subtree_replaced' || e.type === 'cascade_triggered') return true;
              return false;
            });
            if (invalidatesRemaining) {
              stopped = true;
              diagnostics.push(diagnostic('safety_demotion', 'warning', step.step_id, 'Hard DOM evidence invalidates remaining steps; batch stopped for safety'));
            }
          }
        }
      }
      if (navMapped?.primary_diagnostic) {
        diagnostics.push(diagnostic(navMapped.primary_diagnostic, 'info', step.step_id, `Navigation outcome: ${navMapped.primary_diagnostic}`));
      }
    }
  }

  const succeeded = steps.filter(step => step.status === 'succeeded').length;
  const failed = steps.filter(step => step.status === 'failed').length;
  const finalState = globalThis.CcPerception.getPerceptionState();
  return {
    kind: 'execution_observation',
    schema_version: SCHEMA_VERSION,
    observation_id: makeId('obs'),
    plan_id: plan.plan_id,
    correlation_id: plan.correlation_id,
    document_id: plan.target_binding.document_id,
    observed_at: new Date().toISOString(),
    outcome: failed === 0 ? 'completed' : (succeeded > 0 ? 'partial' : 'aborted'),
    rejection_reason: failed > 0 && succeeded === 0 ? steps.find(step => step.status === 'failed')?.failure_code || null : null,
    resulting_revision: Math.max(0, finalState.revision),
    resulting_snapshot_id: finalState.snapshotId || null,
    steps,
    diagnostics,
  };
}

const api = {
  execute,
  validatePlan,
  verifyPostcondition,
  checkStepAuthorization,
  elementImpliesSubmit,
  elementImpliesNavigation,
  clearReplayCache,
  REPLAY_TTL_MS,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.CcActionPlanExecutor = api;
})();
