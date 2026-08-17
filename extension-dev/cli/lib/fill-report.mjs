/**
 * Human-readable fill report: what was planned, what ran, what stuck in the DOM.
 */
import { formatTimingLines, recordDurationMs } from './timing.mjs';

function stepClaim(eoStep) {
  if (!eoStep) return 'missing';
  const s = String(eoStep.status || eoStep.result || '').toLowerCase();
  if (s === 'succeeded' || s === 'filled' || s === 'success') return 'ok';
  if (s === 'failed' || s === 'error') return 'fail';
  if (s === 'skipped') return 'skip';
  return s || 'unknown';
}

function findDomForStep(domRows, stepId) {
  return (domRows || []).find((r) => r.step_id === stepId) || null;
}

/**
 * @returns {{ lines: string[], summary: object }}
 */
export function buildFillReport({
  url,
  mode,
  runtime,
  snapshot,
  plan,
  observation,
  domAfter,
  mainSummary,
  planMeta,
}) {
  const steps = plan?.steps || [];
  const eoSteps = observation?.steps || [];
  const byId = Object.fromEntries(eoSteps.map((s) => [s.step_id, s]));
  const rows = [];

  let ok = 0;
  let fail = 0;
  let skip = 0;
  let lies = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const eo = byId[step.step_id];
    const claim = stepClaim(eo);
    const dom = findDomForStep(domAfter, step.step_id);
    const op = step.action?.op || '?';
    const plannedValue =
      step.action?.value != null
        ? String(step.action.value)
        : step.action?.desired_state != null
          ? String(step.action.desired_state)
          : step.action?.option_target?.node_id || '';

    let domState = 'n/a';
    let stick = '—';

    if (op === 'type_text' || op === 'clear') {
      const actual = dom?.resolved ? String(dom.value ?? '') : '(unresolved)';
      domState = actual === '' ? '(empty)' : JSON.stringify(actual);
      if (claim === 'ok') {
        const want = op === 'clear' ? '' : plannedValue;
        const match =
          op === 'clear'
            ? actual === ''
            : actual === want || (want && actual.includes(want));
        if (match) {
          stick = 'DOM ok';
          ok++;
        } else {
          stick = 'LIE (claimed ok, DOM differs)';
          lies++;
          fail++;
        }
      } else if (claim === 'fail') {
        stick = 'honest fail';
        fail++;
      } else {
        stick = claim;
        skip++;
      }
    } else if (op === 'toggle') {
      domState = dom?.resolved ? `checked=${dom.checked}` : '(unresolved)';
      if (claim === 'ok') {
        ok++;
        stick = 'claimed ok';
      } else if (claim === 'fail') {
        fail++;
        stick = 'fail';
      } else {
        skip++;
        stick = claim;
      }
    } else if (op === 'select_option') {
      domState = dom?.resolved ? JSON.stringify(dom.value ?? '') : '(unresolved)';
      if (claim === 'ok') {
        // if still empty after select → lie for native select
        if (dom?.resolved && String(dom.value ?? '') === '') {
          stick = 'LIE (claimed ok, select empty)';
          lies++;
          fail++;
        } else {
          stick = 'claimed ok';
          ok++;
        }
      } else if (claim === 'fail') {
        fail++;
        stick = 'fail';
      } else {
        skip++;
        stick = claim;
      }
    } else {
      if (claim === 'ok') ok++;
      else if (claim === 'fail') fail++;
      else skip++;
      stick = claim;
    }

    const target = step.target?.node_id || '?';
    const label = step._label || target;
    const durationMs = recordDurationMs(eo);
    rows.push({
      n: i + 1,
      claim,
      op,
      target,
      label,
      plannedValue,
      domState,
      stick,
      failure_code: eo?.failure_code || null,
      durationMs,
    });
  }

  // Global page-empty lie: many EO ok but main world empty
  const eoOk = eoSteps.filter((s) => stepClaim(s) === 'ok').length;
  let pageEmptyLie = false;
  if (eoOk > 0 && mainSummary && mainSummary.nonempty === 0) {
    pageEmptyLie = true;
    lies++;
  }

  const timingRecords = eoSteps.map((s) => ({
    result: s.status,
    durationMs: s.duration_ms ?? s.durationMs,
    label: s.step_id,
    stepId: s.step_id,
  }));
  const { lines: timingLines, stats: timingStats } = formatTimingLines(timingRecords, {
    includeTimeline: false,
  });

  const wallMs = observation?._cli_wall_ms ?? null;
  const progressive = !!observation?._cli_progressive;

  const lines = [
    '═══════════════════════════════════════════════════════════',
    '  CC-DEBUG FILL REPORT  (real form / product path)',
    '═══════════════════════════════════════════════════════════',
    `URL       ${url}`,
    `Runtime   ${runtime || 'page-inject'}  mode=${mode || 'live'}`,
    `Perceive  nodes=${Object.keys(snapshot?.nodes || {}).length}  revision=${snapshot?.revision ?? '?'}`,
    `Plan      steps=${steps.length}  plan_id=${plan?.plan_id || '?'}`,
    planMeta?.classification
      ? `Server    classification=${planMeta.classification}`
      : null,
    planMeta?.diagnostics
      ? `Server    unmapped=${planMeta.diagnostics.unmapped_count ?? '?'}`
      : null,
    wallMs != null ? `Execute wall  ${wallMs} ms${progressive ? '  (progressive one-step-at-a-time)' : '  (batch APE)'}` : null,
    '───────────────────────────────────────────────────────────',
    '  #  claim  ms     op              target / value → DOM',
    '───────────────────────────────────────────────────────────',
  ].filter((x) => x != null);

  for (const r of rows) {
    const valBit = r.plannedValue ? ` "${String(r.plannedValue).slice(0, 40)}"` : '';
    const msCol = r.durationMs != null ? String(r.durationMs).padStart(5) : '    ?';
    lines.push(
      `  ${String(r.n).padStart(2)}  ${r.claim.padEnd(5)} ${msCol}  ${r.op.padEnd(14)} ${String(r.target).slice(0, 28)}`
    );
    lines.push(
      `      planned${valBit}  dom=${r.domState}  → ${r.stick}` +
        (r.failure_code ? `  [${r.failure_code}]` : '')
    );
  }

  lines.push(...timingLines);
  if (planMeta?.phaseClock?.length) {
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('  PHASE CLOCK (CLI wall)');
    for (const p of planMeta.phaseClock) {
      lines.push(`    ${String(p.name).padEnd(22)} +${String(p.deltaMs).padStart(6)}ms  total=${p.totalMs}ms`);
    }
  }

  lines.push('───────────────────────────────────────────────────────────');
  lines.push(
    `RESULT    ok=${ok}  fail=${fail}  skip=${skip}  lies=${lies}` +
      (pageEmptyLie ? '  PAGE_EMPTY_LIE' : '')
  );
  if (mainSummary) {
    lines.push(
      `PAGE DOM  nonempty_controls=${mainSummary.nonempty}/${mainSummary.total}` +
        (mainSummary.nonemptyIds?.length
          ? `  filled=[${mainSummary.nonemptyIds.slice(0, 8).join(', ')}]`
          : '')
    );
  }
  lines.push(
    `EO        outcome=${observation?.outcome || '?'}  steps=${eoSteps.length}`
  );
  lines.push('═══════════════════════════════════════════════════════════');

  return {
    lines,
    summary: {
      ok,
      fail,
      skip,
      lies,
      pageEmptyLie,
      eoOutcome: observation?.outcome || null,
      stepCount: steps.length,
      mainSummary: mainSummary || null,
      honest: lies === 0 && fail === 0,
      timing: timingStats,
      wallMs,
      progressive,
    },
    rows,
  };
}
