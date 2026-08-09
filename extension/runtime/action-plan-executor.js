(function () {
'use strict';

const SCHEMA_VERSION = '3.0.0';
const RISK_ORDER = Object.freeze({ safe: 0, reversible: 1, irreversible: 2 });
const FAILURE_CODES = new Set([
  'plan_expired', 'stale_target', 'stale_snapshot', 'adapter_mismatch',
  'affordance_mismatch', 'document_replaced', 'authorization_denied',
  'correlation_replayed', 'file_reference_invalid', 'action_unsupported',
  'postcondition_failed', 'gateway_error',
]);

function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.().replace(/-/g, '')
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${uuid.slice(0, 24)}`;
}

function diagnostic(code, severity, stepId, message) {
  return { code, severity, step_id: stepId || null, message: String(message).slice(0, 320) };
}

function normalizeFailureCode(code) {
  return FAILURE_CODES.has(code) ? code : 'gateway_error';
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
  const state = globalThis.CcPerception?.getPerceptionState?.() || {};
  const validation = validatePlan(plan, state);
  if (!validation.ok) return rejectedObservation(plan, state, validation);

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

    let postcondition = { met: false, valueState: null };
    if (!failureCode) {
      if (!globalThis.CcDomGateway?.performAction || !globalThis.CcDomGateway?.readAriaState) {
        failureCode = 'gateway_error';
      } else {
        const result = globalThis.CcDomGateway.performAction(target.element, step.action, {
          optionElement: optionTarget?.element || null,
        });
        if (!result.success) {
          failureCode = normalizeFailureCode(result.error);
        } else {
          const settleMs = step.action.op === 'select_option' ? 500 : (step.action.op === 'toggle' ? 160 : 120);
          await new Promise(resolve => setTimeout(resolve, settleMs));
          postcondition = verifyPostcondition(step.postcondition, target.element, step.action, optionTarget?.element || null);
          if (!postcondition.met) failureCode = 'postcondition_failed';
        }
      }
    }

    const duration = Math.max(0, Math.round(performance.now() - started));
    if (failureCode) {
      const code = normalizeFailureCode(failureCode);
      steps.push({ step_id: step.step_id, status: 'failed', failure_code: code, postcondition_met: false, observed_value_state: postcondition.valueState, duration_ms: duration });
      diagnostics.push(diagnostic(code, 'error', step.step_id, `Mechanical execution failed: ${code}`));
      stopped = true;
    } else {
      steps.push({ step_id: step.step_id, status: 'succeeded', failure_code: null, postcondition_met: true, observed_value_state: postcondition.valueState, duration_ms: duration });
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

const api = { execute, validatePlan, verifyPostcondition };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.CcActionPlanExecutor = api;
})();
