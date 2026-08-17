/**
 * Timing helpers for live session reports and lab fill clocks.
 * Product path fills ALL steps, then POSTs /fill-observation once at the end.
 * Per-step durationMs is still stored on each record when the server receives that batch.
 */

export function recordDurationMs(r) {
  if (r == null) return null;
  const v = r.durationMs ?? r.duration_ms ?? r.duration ?? null;
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function recordTs(r) {
  const v = r?.ts ?? r?.timestamp ?? r?.at ?? null;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/**
 * Aggregate per-record step timings + optional wall timeline from absolute ts.
 */
export function analyzeRecordTimings(records) {
  const rows = Array.isArray(records) ? records : [];
  const durations = [];
  const withDur = [];
  const withTs = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const ms = recordDurationMs(r);
    const ts = recordTs(r);
    if (ms != null) {
      durations.push(ms);
      withDur.push({ i, ms, r });
    }
    if (ts != null) withTs.push({ i, ts, r, ms });
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const sumMs = durations.reduce((a, b) => a + b, 0);
  const max = withDur.length
    ? withDur.reduce((best, x) => (x.ms > best.ms ? x : best), withDur[0])
    : null;

  let wallMs = null;
  let timeline = [];
  if (withTs.length >= 1) {
    const ordered = [...withTs].sort((a, b) => a.ts - b.ts);
    const t0 = ordered[0].ts;
    const tLast = ordered[ordered.length - 1].ts;
    wallMs = Math.max(0, tLast - t0);
    timeline = ordered.map((x) => ({
      index: x.i + 1,
      offsetMs: x.ts - t0,
      stepMs: x.ms,
      result: String(x.r.result || x.r.status || '?'),
      label: String(x.r.label || x.r.nodeId || x.r.node_id || x.r.stepId || x.r.step_id || '?').slice(0, 48),
    }));
  }

  return {
    count: rows.length,
    timedCount: durations.length,
    sumMs,
    avgMs: durations.length ? Math.round(sumMs / durations.length) : null,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs: max?.ms ?? null,
    maxIndex: max != null ? max.i + 1 : null,
    maxLabel: max
      ? String(max.r.label || max.r.nodeId || max.r.node_id || max.r.stepId || '?').slice(0, 48)
      : null,
    wallFromTsMs: wallMs,
    timeline,
  };
}

/**
 * Format timing block for console/report text.
 * @param {object[]} records
 * @param {{ includeTimeline?: boolean, timelineLimit?: number }} [opts]
 */
export function formatTimingLines(records, opts = {}) {
  const includeTimeline = opts.includeTimeline !== false;
  const timelineLimit = opts.timelineLimit ?? 40;
  const t = analyzeRecordTimings(records);
  const lines = [];
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  TIMING (per field from session records)');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push(
    '  Product flow: perceive → /fill-plan → execute ALL steps → POST /fill-observation ONCE'
  );
  lines.push('  (Server session appears only after the final post — not mid-fill.)');
  if (!t.timedCount) {
    lines.push('  (no durationMs on records — cannot compute step timings)');
    return { lines, stats: t };
  }
  lines.push(
    `  Steps timed       ${t.timedCount}/${t.count}`
  );
  lines.push(
    `  Sum step duration ${t.sumMs} ms  (~${(t.sumMs / 1000).toFixed(2)}s of act work)`
  );
  lines.push(
    `  Avg / p50 / p95   ${t.avgMs} / ${t.p50Ms} / ${t.p95Ms} ms`
  );
  if (t.maxMs != null) {
    lines.push(`  Slowest step      #${t.maxIndex}  ${t.maxMs} ms  ${t.maxLabel}`);
  }
  if (t.wallFromTsMs != null) {
    lines.push(
      `  Wall (first→last ts) ${t.wallFromTsMs} ms  (~${(t.wallFromTsMs / 1000).toFixed(2)}s)`
    );
    if (t.wallFromTsMs > t.sumMs + 50) {
      lines.push(
        `  Gap wall−sum       ${t.wallFromTsMs - t.sumMs} ms  (waits / network idle / cascades between steps)`
      );
    }
  } else {
    lines.push(
      '  Wall timeline      n/a (no absolute ts on records — ActionPlan path only has durationMs)'
    );
  }

  if (includeTimeline && t.timeline.length) {
    lines.push('  Timeline (offset from first field ts):');
    const show = t.timeline.slice(0, timelineLimit);
    for (const row of show) {
      const step = row.stepMs != null ? `${String(row.stepMs).padStart(5)}ms` : '   ?ms';
      lines.push(
        `    +${String(row.offsetMs).padStart(6)}ms  step=${step}  ${row.result.padEnd(8)} ${row.label}`
      );
    }
    if (t.timeline.length > timelineLimit) {
      lines.push(`    … ${t.timeline.length - timelineLimit} more steps`);
    }
  }
  return { lines, stats: t };
}

/** Simple wall-clock phase timer for lab CLI. */
export function createPhaseClock(label = 'fill') {
  const t0 = Date.now();
  const phases = [];
  let last = t0;
  const mark = (name) => {
    const now = Date.now();
    const delta = now - last;
    const total = now - t0;
    phases.push({ name, deltaMs: delta, totalMs: total, at: new Date(now).toISOString() });
    last = now;
    console.log(`  ⏱  [${label}] ${name}  +${delta}ms  (total ${total}ms)`);
    return { deltaMs: delta, totalMs: total };
  };
  const summaryLines = () => {
    const lines = ['  PHASE CLOCK'];
    for (const p of phases) {
      lines.push(`    ${p.name.padEnd(22)} +${String(p.deltaMs).padStart(6)}ms  total=${p.totalMs}ms`);
    }
    const total = Date.now() - t0;
    lines.push(`    ${'TOTAL'.padEnd(22)} ${String(total).padStart(7)}ms`);
    return lines;
  };
  return { mark, phases, summaryLines, startedAt: t0, elapsed: () => Date.now() - t0 };
}
