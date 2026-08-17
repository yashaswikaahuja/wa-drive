/** Session report + timing (same ideas as extension-dev/cli). */

function durationMs(r) {
  const v = r?.durationMs ?? r?.duration_ms ?? null;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extensionVersionOf(session) {
  return (
    session.runtimeVersion ||
    session.runtime_version ||
    session.extensionVersion ||
    session.extension_version ||
    null
  );
}

function pathHint(records) {
  if (!records?.length) return 'unknown';
  const r0 = records[0] || {};
  if (r0.selector != null || r0.strategy != null) return 'legacy-style';
  if (r0.planId != null || r0.stepId != null || r0.nodeId != null) return 'ActionPlan/EO';
  return 'unknown';
}

function analyzeTiming(records) {
  const durs = [];
  let wall = null;
  const withTs = [];
  for (const r of records || []) {
    const ms = durationMs(r);
    if (ms != null) durs.push(ms);
    if (r.ts != null && Number.isFinite(Number(r.ts))) withTs.push(Number(r.ts));
  }
  const sum = durs.reduce((a, b) => a + b, 0);
  if (withTs.length >= 2) {
    withTs.sort((a, b) => a - b);
    wall = withTs[withTs.length - 1] - withTs[0];
  }
  const avg = durs.length ? Math.round(sum / durs.length) : null;
  const sorted = [...durs].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)] : null;
  return { sum, avg, p95, count: durs.length, wall, max: sorted.length ? sorted[sorted.length - 1] : null };
}

export function formatSessionListLine(session) {
  const records = Array.isArray(session.records) ? session.records : [];
  const ver = extensionVersionOf(session) || '?';
  const t = analyzeTiming(records);
  const timeBit = t.count
    ? ` step_sum=${t.sum}ms avg=${t.avg}ms` + (t.wall != null ? ` wall=${t.wall}ms` : '')
    : '';
  return (
    `${session.id}\n` +
    `  extension=${ver}  filled=${session.totalFilled ?? session.total_filled ?? '?'}  failed=${session.totalFailed ?? session.total_failed ?? '?'}\n` +
    `  host=${session.hostname || '(empty)'}  at=${session.receivedAt || session.created_at || session.submitted_at || '?'}\n` +
    `  path=${pathHint(records)}  records=${records.length}${timeBit}`
  );
}

export function reportFromSession(session) {
  const records = Array.isArray(session.records) ? session.records : [];
  const ver = extensionVersionOf(session) || '?';
  const t = analyzeTiming(records);
  const lines = [];
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('  CYB SESSION REPORT');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push(`Session            ${session.id}`);
  lines.push(`When               ${session.receivedAt || session.created_at || session.submitted_at || '?'}`);
  lines.push(`Extension version  ${ver}`);
  lines.push(`Path               ${pathHint(records)}`);
  lines.push(`Host               ${session.hostname || '(empty)'}`);
  lines.push(
    `Totals             filled=${session.totalFilled ?? session.total_filled ?? '?'}  failed=${session.totalFailed ?? session.total_failed ?? '?'}`
  );
  if (t.count) {
    lines.push(`Step time sum      ${t.sum} ms  avg=${t.avg}  p95=${t.p95}` + (t.wall != null ? `  wall=${t.wall}ms` : ''));
  }
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  #  result   ms     type           label');
  lines.push('───────────────────────────────────────────────────────────');
  let ok = 0;
  let fail = 0;
  records.forEach((r, i) => {
    const result = String(r.result || r.status || '?');
    if (result === 'filled' || result === 'succeeded') ok++;
    else if (result === 'failed' || result === 'error') fail++;
    const ms = durationMs(r);
    const msCol = ms != null ? String(ms).padStart(5) : '    ?';
    const op = r.type || r.op || '?';
    const label = r.label || r.nodeId || r.node_id || r.stepId || '?';
    lines.push(
      `  ${String(i + 1).padStart(2)}  ${result.padEnd(8)} ${msCol}  ${String(op).padEnd(14)} ${String(label).slice(0, 44)}`
    );
    if (r.failReason || r.failure_code) {
      lines.push(`      failReason=${r.failReason || r.failure_code}`);
    }
  });
  if (!records.length) lines.push('  (no records)');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push(`RESULT    ok=${ok}  fail=${fail}  rows=${records.length}`);
  lines.push('  Note: product posts /fill-observation once after all steps.');
  lines.push('═══════════════════════════════════════════════════════════');
  return { lines, summary: { id: session.id, extensionVersion: ver, ok, fail, timing: t } };
}
