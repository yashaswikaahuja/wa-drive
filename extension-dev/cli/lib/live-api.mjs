/**
 * Live fill recording WITHOUT modifying the product extension.
 * Uses what the real extension already posts to the live server:
 *   POST /api/fill-plan, POST /api/fill-observation → sessions API
 */

export function apiBase(backendUrl) {
  const b = String(backendUrl || '').replace(/\/$/, '');
  if (!b) throw new Error('Need --backend-url or CC_BACKEND_URL');
  return b;
}

export async function apiGet(backendUrl, token, path) {
  const url = apiBase(backendUrl) + path;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GET ${path} non-JSON HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`GET ${path} HTTP ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

export async function listSessions(backendUrl, token, { limit = 20, offset = 0 } = {}) {
  return apiGet(backendUrl, token, `/sessions?limit=${limit}&offset=${offset}`);
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
export function reportFromSession(session) {
  const records = Array.isArray(session.records) ? session.records : [];
  const lines = [];
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('  LIVE SESSION REPORT  (real operator fill via server)');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push(`Session   ${session.id}`);
  lines.push(`When      ${session.receivedAt || session.created_at || session.submitted_at || '?'}`);
  lines.push(`Host      ${session.hostname || '?'}`);
  lines.push(`FormKey   ${session.semanticFormKey || '?'}`);
  lines.push(`Runtime   ${session.runtimeVersion || '?'}`);
  lines.push(
    `Totals    filled=${session.totalFilled ?? session.total_filled ?? '?'}  failed=${session.totalFailed ?? session.total_failed ?? '?'}`
  );
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  #  result   op/type        label / node');
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
    lines.push(
      `  ${String(i + 1).padStart(2)}  ${result.padEnd(8)} ${String(op).padEnd(14)} ${String(label).slice(0, 50)}`
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

  lines.push('───────────────────────────────────────────────────────────');
  lines.push(`RESULT    ok-ish=${ok}  fail=${fail}  other=${other}  record_rows=${records.length}`);
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  NOTES');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  • This report is from the LIVE server (what the real extension posted).');
  lines.push('  • It does NOT modify the product extension.');
  lines.push('  • MAIN-world DOM truth is NOT in sessions today — if totals say filled');
  lines.push('    but the page was empty, that is the P0 lie gap (need product DOM check).');
  if ((session.totalFilled || session.total_filled || 0) > 0 && records.length === 0) {
    lines.push('  • GAP: totals > 0 but records empty — reporting incomplete.');
  }
  if ((session.totalFilled || 0) > 0 && fail === 0 && records.every((r) => (r.observedValueState || r.observed_value_state) === 'nonempty')) {
    lines.push('  • EO-side values look nonempty; if operator saw empty page, DOM was wiped or wrong tab.');
  }
  lines.push('═══════════════════════════════════════════════════════════');

  return {
    lines,
    summary: {
      id: session.id,
      filled: session.totalFilled ?? session.total_filled ?? ok,
      failed: session.totalFailed ?? session.total_failed ?? fail,
      recordCount: records.length,
    },
  };
}
