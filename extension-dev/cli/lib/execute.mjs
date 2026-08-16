/**
 * Execute ActionPlan in-page via CcActionPlanExecutor.
 */

export async function executePlan(page, plan, { stepId = null } = {}) {
  let runPlan = plan;
  if (stepId) {
    const steps = (plan.steps || []).filter((s) => s.step_id === stepId);
    if (!steps.length) throw new Error(`No step with id ${stepId}`);
    runPlan = { ...plan, steps };
  }

  // Strip debug-only fields before executor
  const clean = JSON.parse(JSON.stringify(runPlan));
  delete clean._debug_expectations;

  const result = await page.evaluate(async (p) => {
    if (!globalThis.CcActionPlanExecutor?.execute) {
      return { error: 'CcActionPlanExecutor.execute unavailable' };
    }
    try {
      const obs = await globalThis.CcActionPlanExecutor.execute(p);
      return { obs };
    } catch (e) {
      return { error: String(e?.message || e), stack: String(e?.stack || '') };
    }
  }, clean);

  if (result.error) {
    throw new Error(`execute failed: ${result.error}`);
  }
  return result.obs;
}
