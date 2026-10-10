/**
 * Build human gap report from a real operator fill trace (cc-fill-trace/v1).
 */

export function reportFromTrace(trace) {
  const lines = [];
  const t = trace || {};
  const counts = t.counts || {};
  const gaps = t.gaps || [];
  const steps = t.step_truth || [];

  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('  CC FILL TRACE REPORT  (real operator fill)');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push(`Captured  ${t.captured_at || '?'}`);
  lines.push(`Page      ${t.page?.url || '?'}`);
  lines.push(`Title     ${t.page?.title || '?'}`);
  lines.push(`Profile   ${t.profile?.name || '?'}  id=${t.profile?.id || '?'}`);
  lines.push(`Runtime   ${t.runtimeVersion || '?'}  pref=${t.executionPreference || '?'}`);
  lines.push(`Perceive  nodes=${t.perception?.node_count ?? '?'}  rev=${t.perception?.revision ?? '?'}`);
  lines.push(`Plan      steps=${t.plan?.step_count ?? t.plan?.steps?.length ?? '?'}  id=${t.plan?.plan_id || '?'}`);
  if (t.plan_response_meta?.classification) {
    const c = t.plan_response_meta.classification;
    lines.push(
      `Class     ${c.system_classification || '?'} → mode=${c.effective_execution_mode || '?'}` +
        (c.mode_reason ? ` (${c.mode_reason})` : '')
    );
  }
  if (t.plan_response_meta?.diagnostics) {
    const d = t.plan_response_meta.diagnostics;
    lines.push(
      `Map       mapped=${d.mapped_count ?? '?'} unmapped=${d.unmapped_count ?? '?'} excluded=${d.excluded_count ?? '?'}`
    );
  }
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  STEP TRUTH (claim vs binding DOM)');
  lines.push('───────────────────────────────────────────────────────────');

  if (!steps.length) {
    lines.push('  (no steps)');
  }
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const flag = s.lie ? 'LIE ' : (s.claim === 'ok' ? 'ok  ' : (s.claim === 'fail' ? 'FAIL' : s.claim.padEnd(4)));
    lines.push(
      `  ${String(i + 1).padStart(2)} ${flag} ${String(s.op || '?').padEnd(14)} ${String(s.node_id || s.step_id).slice(0, 36)}`
    );
    lines.push(
      `      planned=${JSON.stringify(s.planned_value)}  binding=${JSON.stringify(s.binding_value)}  → ${s.stick}` +
        (s.failure_code ? ` [${s.failure_code}]` : '')
    );
  }

  lines.push('───────────────────────────────────────────────────────────');
  lines.push(
    `COUNTS    filled=${counts.filled ?? '?'} failed=${counts.failed ?? '?'} skipped=${counts.skipped ?? '?'} lies=${counts.lies ?? 0}` +
      (counts.page_empty_lie ? ' PAGE_EMPTY_LIE' : '')
  );
  lines.push(
    `PAGE DOM  nonempty=${(t.main_world_nonempty || []).length}  ` +
      `ids=[${(t.main_world_nonempty || []).slice(0, 12).join(', ')}]`
  );
  lines.push(`EO        outcome=${t.execution?.outcome || '?'}`);

  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  GAPS (fix these)');
  lines.push('───────────────────────────────────────────────────────────');
  if (!gaps.length) {
    lines.push('  (none detected — claims match binding DOM)');
  } else {
    for (const g of gaps) {
      lines.push(`  • [${g.code}] ${g.detail || g.step_id || ''}`);
    }
  }

  // Suggested fix categories
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  SUGGESTED FIX LANE');
  lines.push('───────────────────────────────────────────────────────────');
  const codes = new Set(gaps.map((g) => g.code));
  if (codes.has('PAGE_EMPTY_LIE') || codes.has('STEP_LIE')) {
    lines.push('  → EXECUTION: claimed success but DOM empty/mismatch (gateway type_text/select, wrong binding, wipe).');
  }
  if (codes.has('STEP_FAIL')) {
    lines.push('  → EXECUTION/STALE: mechanical fail codes (stale_target, postcondition, affordance).');
  }
  if (codes.has('UNMAPPED_FIELDS')) {
    lines.push('  → MAPPING/KNOWLEDGE: server did not map fields — knowledge / AI cold-start / scope.');
  }
  if (!gaps.length && (counts.filled || 0) === 0) {
    lines.push('  → PLANNING: zero filled steps — empty plan or all skipped; check mapping + form URL.');
  }
  if (!gaps.length && (counts.filled || 0) > 0) {
    lines.push('  → No automatic gap; if operator still sees empty fields, compare MAIN-world list vs visible form (iframe/SPA).');
  }
  lines.push('═══════════════════════════════════════════════════════════');

  return {
    lines,
    summary: {
      lies: counts.lies || 0,
      pageEmptyLie: !!counts.page_empty_lie,
      filled: counts.filled || 0,
      failed: counts.failed || 0,
      gapCodes: [...codes],
      honest: (counts.lies || 0) === 0 && !counts.page_empty_lie && (counts.failed || 0) === 0,
    },
  };
}
