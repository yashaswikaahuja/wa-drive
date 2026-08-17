/**
 * Live fill recording WITHOUT modifying the product extension.
 * Uses what the real extension already posts to the live server:
 *   POST /api/fill-plan, POST /api/fill-observation → sessions API
 */
import { formatTimingLines, analyzeRecordTimings, recordDurationMs } from './timing.mjs';

export function apiBase(backendUrl) {
  const b = String(backendUrl || '').replace(/\/$/, '');
  if (!b) throw new Error('Need --backend-url or CC_BACKEND_URL');
  return b;
}

export async function apiGet(backendUrl, token, path) {
  const url = apiBase(backendUrl) + path;
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    const cause = e?.cause?.message || e?.message || String(e);
    throw new Error(
      `Network error calling ${url}\n` +
        `  ${cause}\n` +
        `  Check VPN/network, and that CC_BACKEND_URL is correct (default https://api.cybercontrol.fun/api).\n` +
        `  If token expired, re-mint JWT or log in again.`
    );
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GET ${path} non-JSON HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Auth failed HTTP ${res.status} for ${url}\n` +
          `  Token missing/expired/wrong. Re-set CC_ACCESS_TOKEN (JWT lasts ~24h).`
      );
    }
    throw new Error(`GET ${path} HTTP ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

export async function listSessions(backendUrl, token, { limit = 20, offset = 0 } = {}) {
  const data = await apiGet(backendUrl, token, `/sessions?limit=${limit}&offset=${offset}`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.sessions)) return data.sessions;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  throw new Error(
    `Unexpected sessions response shape (expected array). keys=${data && typeof data === 'object' ? Object.keys(data).join(',') : typeof data}`
  );
}

export async function getSession(backendUrl, token, id) {
  return apiGet(backendUrl, token, `/sessions/${id}`);
}

export async function authMe(backendUrl, token) {
  // backend path may be /api/auth/me on same host — try extension-service relative first
  try {
    return await apiGet(backendUrl, token, '/auth/me');
  } catch {
    // often auth is on main API which is same base
    const root = apiBase(backendUrl).replace(/\/api$/, '') + '/api';
    return apiGet(root, token, '/auth/me');
  }
}

/**
 * Build a fill-style report from a sessions row (live operator data).
 */
function extensionVersionOf(session) {
  // Stored by product as runtime_version / runtimeVersion (extension manifest version)
  return (
    session.runtimeVersion ||
    session.runtime_version ||
    session.extensionVersion ||
    session.extension_version ||
    null
  );
}

/** Heuristic path label from record shape (not a substitute for version). */
function pathHintFromRecords(records) {
  if (!records?.length) return 'unknown';
  const r0 = records[0] || {};
  if (r0.selector != null || r0.strategy != null || r0.actualValue != null) {
    return 'legacy-style records (selector/strategy)';
  }
  if (r0.planId != null || r0.stepId != null || r0.nodeId != null) {
    return 'ActionPlan/EO-style records (nodeId/stepId)';
  }
  return 'unknown-record-shape';
}

export function reportFromSession(session) {
  const records = Array.isArray(session.records) ? session.records : [];
  const extVer = extensionVersionOf(session) || '?';
  const pathHint = pathHintFromRecords(records);
  const timing = analyzeRecordTimings(records);
  const lines = [];
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('  LIVE SESSION REPORT  (real operator fill via server)');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push(`Session            ${session.id}`);
  lines.push(`When               ${session.receivedAt || session.created_at || session.submitted_at || '?'}`);
  lines.push(`Extension version  ${extVer}`);
  lines.push(`Path hint          ${pathHint}`);
  lines.push(`Host               ${session.hostname || session.hostname === '' ? (session.hostname || '(empty)') : '?'}`);
  lines.push(`FormKey            ${session.semanticFormKey || session.semantic_form_key || '?'}`);
  lines.push(
    `Totals             filled=${session.totalFilled ?? session.total_filled ?? '?'}  failed=${session.totalFailed ?? session.total_failed ?? '?'}`
  );
  if (timing.timedCount) {
    lines.push(
      `Step time sum      ${timing.sumMs} ms  avg=${timing.avgMs}  p95=${timing.p95Ms}` +
        (timing.wallFromTsMs != null ? `  wall(ts)=${timing.wallFromTsMs}ms` : '')
    );
  }
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  #  result   ms     op/type        label / node');
  lines.push('───────────────────────────────────────────────────────────');

  let ok = 0;
  let fail = 0;
  let other = 0;
  records.forEach((r, i) => {
    const result = String(r.result || r.status || '?');
    if (result === 'filled' || result === 'succeeded' || result === 'completed') ok++;
    else if (result === 'failed' || result === 'error') fail++;
    else other++;
    const op = r.type || r.op || r.action_op || '?';
    const label = r.label || r.nodeId || r.node_id || r.stepId || r.step_id || '?';
    const ms = recordDurationMs(r);
    const msCol = ms != null ? String(ms).padStart(5) : '    ?';
    lines.push(
      `  ${String(i + 1).padStart(2)}  ${result.padEnd(8)} ${msCol}  ${String(op).padEnd(14)} ${String(label).slice(0, 46)}`
    );
    if (r.failReason || r.failure_code) {
      lines.push(`      failReason=${r.failReason || r.failure_code}`);
    }
    if (r.observedValueState != null || r.observed_value_state != null) {
      lines.push(
        `      observed_value_state=${r.observedValueState ?? r.observed_value_state} postcondition=${r.postconditionMet ?? r.postcondition_met}`
      );
    }
    if (r.value) lines.push(`      value=${JSON.stringify(String(r.value).slice(0, 60))}`);
  });

  if (!records.length) {
    lines.push('  (no per-field records on this session — product may not have posted detailed records)');
  }

  const { lines: timingLines } = formatTimingLines(records);
  lines.push(...timingLines);

  lines.push('───────────────────────────────────────────────────────────');
  lines.push(`RESULT    ok-ish=${ok}  fail=${fail}  other=${other}  record_rows=${records.length}`);
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  NOTES / GAPS');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  • LIVE server data only (real operator extension posts). No product file patches.');
  lines.push('  • Observation is posted AFTER all fields run — CLI sees the session only then.');
  if (String(extVer).startsWith('5.91')) {
    lines.push('  • Engine: LEGACY-style session records (5.91). Not ActionPlan product path.');
    lines.push('  • Legacy records often include absolute ts → wall timeline below.');
  } else if (String(extVer).startsWith('5.92') || pathHint.includes('ActionPlan')) {
    lines.push('  • Engine: ActionPlan product path (orchestrator → APE → gateway).');
    lines.push('  • Fields still fill sequentially in-page; only the SERVER post is batched at end.');
  }
  const hasGatewayBlackHole = records.some(
    (r) => String(r.failReason || r.failure_code || '') === 'gateway_error'
  );
  if (hasGatewayBlackHole) {
    lines.push('  • GAP: failReason=gateway_error is a BLACK HOLE (unknown codes collapsed).');
    lines.push('    Layer may be inject/globals, resolve, or act — cannot tell from this field alone.');
  }
  if (records.some((r) => String(r.type || '') === 'unknown')) {
    lines.push('  • GAP: type=unknown means fill-session lost action_op — op not recorded.');
  }
  lines.push('  • MAIN-world DOM truth is NOT in sessions — cannot prove page-empty from this alone.');
  if ((session.totalFilled || session.total_filled || 0) > 0 && records.length === 0) {
    lines.push('  • GAP: totals > 0 but records empty — reporting incomplete.');
  }
  lines.push('═══════════════════════════════════════════════════════════');

  return {
    lines,
    summary: {
      id: session.id,
      extensionVersion: extVer,
      pathHint,
      filled: session.totalFilled ?? session.total_filled ?? ok,
      failed: session.totalFailed ?? session.total_failed ?? fail,
      recordCount: records.length,
      timing: {
        sumMs: timing.sumMs,
        avgMs: timing.avgMs,
        p50Ms: timing.p50Ms,
        p95Ms: timing.p95Ms,
        maxMs: timing.maxMs,
        wallFromTsMs: timing.wallFromTsMs,
        timedCount: timing.timedCount,
      },
    },
  };
}

export { extensionVersionOf, pathHintFromRecords, analyzeRecordTimings };
