/**
 * Read live DOM for plan targets via binding registry; compare to claimed results.
 */

export async function observeDomForPlan(page, plan) {
  const steps = plan.steps || [];
  return page.evaluate((stepList) => {
    const reg = globalThis.CcPerception?.getBindingRegistry?.();
    const out = [];
    for (const step of stepList) {
      const nodeId = step.target?.node_id;
      let el = null;
      if (reg?.getByNodeId) {
        const entry = reg.getByNodeId(nodeId);
        el = entry?.liveNodeReference || null;
      }
      if (!el && reg?.entries) {
        for (const e of reg.entries()) {
          if (e.nodeId === nodeId) {
            el = e.liveNodeReference;
            break;
          }
        }
      }
      const row = {
        step_id: step.step_id,
        node_id: nodeId,
        context_id: step.target?.context_id,
        action_op: step.action?.op,
        resolved: !!el,
        tag: el?.tagName || null,
        id: el?.id || null,
        name: el?.name || null,
        type: el?.type || null,
        value: el && 'value' in el ? el.value : null,
        checked: el && 'checked' in el ? !!el.checked : null,
        textContent: el?.textContent?.slice?.(0, 80) || null,
      };
      out.push(row);
    }
    return out;
  }, steps);
}

/**
 * Build truth report: claimed vs DOM.
 * @param {object} plan
 * @param {object} observation - ExecutionObservation
 * @param {object[]} domRows - from observeDomForPlan
 * @param {object} [expectations] - step_id → expected value string
 */
export function buildTruthReport(plan, observation, domRows, expectations = {}) {
  const stepsById = Object.fromEntries((observation?.steps || []).map((s) => [s.step_id, s]));
  const domByStep = Object.fromEntries((domRows || []).map((r) => [r.step_id, r]));
  const checks = [];
  let violations = 0;
  let honestFailures = 0;
  let skipped = 0;

  for (const step of plan.steps || []) {
    const eo = stepsById[step.step_id] || {};
    const dom = domByStep[step.step_id] || {};
    const op = step.action?.op;
    // Executor EO uses status: succeeded|failed|skipped (see action-plan-executor.js)
    const claimed =
      eo.status ||
      eo.result ||
      eo.outcome ||
      null;

    // Normalize claim
    let claim = String(claimed || 'unknown').toLowerCase();
    if (
      claim === 'success' ||
      claim === 'ok' ||
      claim === 'completed' ||
      claim === 'succeeded' ||
      claim === 'filled'
    ) {
      claim = 'filled';
    }
    if (claim === 'failed' || claim === 'error' || claim === 'aborted') claim = 'failed';

    const expected =
      expectations[step.step_id] ||
      plan._debug_expectations?.[step.step_id] ||
      step.action?.value;

    let truth = 'skip';
    let detail = '';

    if (op === 'focus' || op === 'scroll' || op === 'expand' || op === 'collapse') {
      truth = 'skip';
      skipped++;
      detail = 'no DOM value check for this op';
    } else if (!dom.resolved) {
      if (claim === 'filled') {
        truth = 'violation';
        violations++;
        detail = 'claimed filled but target not resolved in binding registry';
      } else {
        truth = 'honest_unresolved';
        detail = 'target not resolved';
      }
    } else if (op === 'type_text' || op === 'clear') {
      const actual = dom.value == null ? '' : String(dom.value);
      const want = op === 'clear' ? '' : String(expected ?? '');
      const match =
        op === 'clear'
          ? actual === ''
          : actual === want || actual.includes(want);

      if (claim === 'filled' || claim === 'success') {
        if (match) {
          truth = 'pass';
          detail = `DOM value matches (${JSON.stringify(actual)})`;
        } else {
          truth = 'violation';
          violations++;
          detail = `claimed filled but DOM value=${JSON.stringify(actual)} expected=${JSON.stringify(want)}`;
        }
      } else if (claim === 'failed' || claim === 'error' || claim === 'skipped') {
        truth = 'honest_failure';
        honestFailures++;
        detail = `claimed ${claim}; DOM value=${JSON.stringify(actual)}`;
      } else {
        // Unknown claim: still check stickiness if value present
        if (want && match) {
          truth = 'pass_unknown_claim';
          detail = `claim=${claim}; DOM ok`;
        } else if (want && !match) {
          truth = 'warn';
          detail = `claim=${claim}; DOM value=${JSON.stringify(actual)} expected=${JSON.stringify(want)}`;
        } else {
          truth = 'skip';
          skipped++;
        }
      }
    } else if (op === 'toggle') {
      const want = step.action?.desired_state;
      if (claim === 'filled' || claim === 'success') {
        if (want == null || dom.checked === !!want) {
          truth = 'pass';
          detail = `checked=${dom.checked}`;
        } else {
          truth = 'violation';
          violations++;
          detail = `claimed filled; checked=${dom.checked} want=${want}`;
        }
      } else {
        truth = 'honest_or_skip';
        detail = `claim=${claim}; checked=${dom.checked}`;
      }
    } else {
      truth = 'skip';
      skipped++;
      detail = `no truth rule for op ${op}`;
    }

    checks.push({
      step_id: step.step_id,
      op,
      claim,
      truth,
      detail,
      dom,
      expected: expected ?? null,
    });
  }

  const ok = violations === 0;
  return {
    ok,
    violations,
    honestFailures,
    skipped,
    observation_outcome: observation?.outcome ?? null,
    checks,
  };
}
