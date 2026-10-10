/**
 * Build a minimal offline ActionPlan from a snapshot for debug fill.
 * Uses known DEBUG_VALUE_* strings so truth gate can assert stickiness.
 */

export function buildOfflinePlan(snapshot, { maxSteps = 5, stepId = null } = {}) {
  const nodes = snapshot.nodes || {};
  const steps = [];
  let i = 0;

  for (const [id, n] of Object.entries(nodes)) {
    if (i >= maxSteps) break;
    if (!(n.affordances || []).includes('type_text')) continue;
    if (n.widget?.status === 'unsupported') continue;
    // Skip password-ish for quieter dumps
    if (n.input_type === 'password' || /password/i.test(n.name || n.label || '')) continue;

    const value = `DEBUG_VALUE_${i + 1}`;
    const sid = `step:debug-text-${i + 1}`;
    if (stepId && stepId !== sid) continue;

    steps.push({
      step_id: sid,
      target: { context_id: n.context_id, node_id: id },
      action: { op: 'type_text', value, clear_first: true },
      risk: 'safe',
      required_affordance: 'type_text',
      required_adapter_id: n.widget?.adapter_id || null,
      postcondition: {
        type: 'value_state',
        expected_value_state: 'nonempty',
        expected_boolean: null,
        expected_signal: null,
      },
      on_failure: 'stop_and_report',
      _debug_expected_value: value,
    });
    i++;
  }

  if (!steps.length) {
    throw new Error('Offline plan: no type_text nodes found in snapshot');
  }

  return {
    kind: 'action_plan',
    schema_version: '3.0.0',
    plan_id: `plan:cc-debug-${Date.now().toString(36)}`,
    correlation_id: `corr:cc-debug-${Math.random().toString(36).slice(2, 10)}`,
    supersedes_plan_id: null,
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 120_000).toISOString(),
    target_binding: {
      document_id: snapshot.document_id,
      snapshot_id: snapshot.snapshot_id,
      expected_revision: snapshot.revision,
    },
    steps: steps.map(({ _debug_expected_value, ...s }) => s),
    authorization: {
      max_risk: 'safe',
      operator_confirmed: false,
      allow_navigation: false,
      allow_submit: false,
    },
    // retained for truth helper (stripped from wire-like dump if needed)
    _debug_expectations: Object.fromEntries(
      steps.map((s) => [s.step_id, s._debug_expected_value || s.action?.value])
    ),
  };
}

export function loadPlanFile(planPath, readFileSync) {
  const raw = JSON.parse(readFileSync(planPath, 'utf8'));
  if (raw.kind !== 'action_plan' || raw.schema_version !== '3.0.0') {
    throw new Error('Plan file must be action_plan schema_version 3.0.0');
  }
  return raw;
}
