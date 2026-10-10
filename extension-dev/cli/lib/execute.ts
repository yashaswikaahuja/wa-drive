/**
 * Execute ActionPlan in-page via CcActionPlanExecutor.
 *
 * Default: one shot (product-like — all steps then return).
 * progressive: true runs one step at a time and logs live duration so you
 * can watch the page fill field-by-field with per-step ms.
 */

function cleanPlan(plan) {
  const clean = JSON.parse(JSON.stringify(plan));
  delete clean._debug_expectations;
  return clean;
}

export async function executePlan(page, plan, { stepId = null, progressive = false, onStep = null } = {}) {
  let runPlan = plan;
  if (stepId) {
    const steps = (plan.steps || []).filter((s) => s.step_id === stepId);
    if (!steps.length) throw new Error(`No step with id ${stepId}`);
    runPlan = { ...plan, steps };
  }

  if (progressive && (runPlan.steps || []).length > 1) {
    return executePlanProgressive(page, runPlan, { onStep });
  }

  const clean = cleanPlan(runPlan);
  const t0 = Date.now();
  const result = await page.evaluate(async (p) => {
    if (!globalThis.CcActionPlanExecutor?.execute) {
      return { error: 'CcActionPlanExecutor.execute unavailable' };
    }
    try {
      const wall0 = performance.now();
      const obs = await globalThis.CcActionPlanExecutor.execute(p);
      return { obs, wallMs: Math.round(performance.now() - wall0) };
    } catch (e) {
      return { error: String(e?.message || e), stack: String(e?.stack || '') };
    }
  }, clean);

  if (result.error) {
    throw new Error(`execute failed: ${result.error}`);
  }
  const obs = result.obs;
  if (obs && typeof obs === 'object') {
    obs._cli_wall_ms = result.wallMs ?? Date.now() - t0;
  }
  return obs;
}

/**
 * Run each step as its own mini-plan so the CLI can print timing live.
 * Observation is stitched to look like a single product observation.
 */
export async function executePlanProgressive(page, plan, { onStep = null } = {}) {
  const steps = plan.steps || [];
  const stepResults = [];
  const diagnostics = [];
  let outcome = 'completed';
  let rejection_reason = null;
  const wall0 = Date.now();

  console.log(`  Progressive execute: ${steps.length} steps (live per-step clock)…`);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const mini = cleanPlan({ ...plan, steps: [step] });
    // Avoid replay rejection on plan_id reuse across mini runs if executor checks once
    if (mini.plan_id) mini.plan_id = `${mini.plan_id}__cli_step_${i}`;
    if (mini.correlation_id) mini.correlation_id = `${mini.correlation_id}__cli_step_${i}`;

    const tStep = Date.now();
    const result = await page.evaluate(async (p) => {
      if (!globalThis.CcActionPlanExecutor?.execute) {
        return { error: 'CcActionPlanExecutor.execute unavailable' };
      }
      try {
        const wall0 = performance.now();
        const obs = await globalThis.CcActionPlanExecutor.execute(p);
        return { obs, wallMs: Math.round(performance.now() - wall0) };
      } catch (e) {
        return { error: String(e?.message || e), stack: String(e?.stack || '') };
      }
    }, mini);
    const cliMs = Date.now() - tStep;

    if (result.error) {
      const row = {
        step_id: step.step_id,
        status: 'failed',
        failure_code: 'cli_execute_error',
        duration_ms: cliMs,
        postcondition_met: false,
        observed_value_state: null,
      };
      stepResults.push(row);
      outcome = 'aborted';
      console.log(
        `  [${String(i + 1).padStart(2)}/${steps.length}] FAIL  ${cliMs}ms  ${step.step_id}  ${result.error.slice(0, 80)}`
      );
      if (onStep) onStep({ index: i, step, row, cliMs, error: result.error });
      // mark rest skipped
      for (let j = i + 1; j < steps.length; j++) {
        stepResults.push({
          step_id: steps[j].step_id,
          status: 'skipped',
          failure_code: null,
          duration_ms: 0,
          postcondition_met: null,
          observed_value_state: null,
        });
      }
      break;
    }

    const obs = result.obs;
    if (obs?.diagnostics) diagnostics.push(...obs.diagnostics);
    if (obs?.outcome === 'rejected') {
      outcome = 'rejected';
      rejection_reason = obs.rejection_reason || 'rejected';
    } else if (obs?.outcome === 'aborted') {
      outcome = 'aborted';
    }

    const eo = (obs?.steps || [])[0] || {
      step_id: step.step_id,
      status: 'failed',
      failure_code: 'missing_step_result',
      duration_ms: result.wallMs ?? cliMs,
    };
    // Prefer executor duration; fall back to CLI wall
    if (eo.duration_ms == null && eo.durationMs == null) {
      eo.duration_ms = result.wallMs ?? cliMs;
    }
    stepResults.push(eo);

    const status = String(eo.status || '?');
    const ms = eo.duration_ms ?? eo.durationMs ?? result.wallMs ?? cliMs;
    const op = step.action?.op || '?';
    const target = step.target?.node_id || step.step_id;
    const fail = eo.failure_code || eo.failReason || '';
    console.log(
      `  [${String(i + 1).padStart(2)}/${steps.length}] ${status.padEnd(9)} ${String(ms).padStart(5)}ms  ${op.padEnd(14)} ${String(target).slice(0, 40)}${fail ? '  ' + fail : ''}`
    );
    if (onStep) onStep({ index: i, step, row: eo, cliMs, obs });

    if (status === 'failed' || outcome === 'rejected' || outcome === 'aborted') {
      // Match product: stop and skip remainder when hard fail? APE continues unless stopped.
      // Keep going for timing visibility unless rejected.
      if (outcome === 'rejected') break;
    }
  }

  return {
    kind: 'execution_observation',
    schema_version: 'cli-progressive/v1',
    observation_id: `obs:cli-progressive-${Date.now()}`,
    plan_id: plan.plan_id || null,
    correlation_id: plan.correlation_id || null,
    document_id: plan.target_binding?.document_id || null,
    observed_at: new Date().toISOString(),
    outcome,
    rejection_reason,
    steps: stepResults,
    diagnostics,
    _cli_progressive: true,
    _cli_wall_ms: Date.now() - wall0,
  };
}
