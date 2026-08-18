/** Session report + timing + planned/actual value audit. */

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

function plannedOf(r) {
  if (r.value != null && r.value !== '') return String(r.value);
  if (r.plannedValue != null) return String(r.plannedValue);
  if (r.expected != null) return String(r.expected);
  return null;
}

function actualOf(r) {
  if (r.actualValue != null && r.actualValue !== '') return String(r.actualValue);
  if (r.actual_value != null && r.actual_value !== '') return String(r.actual_value);
  if (r.observedValue != null && r.observedValue !== '') return String(r.observedValue);
  return r.actualValue === '' || r.actual_value === '' ? '' : null;
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Portal-masked display (e.g. Aadhaar ********8335) after a successful fill. */
export function isMaskedActual(actual) {
  const a = String(actual || '');
  if (!a) return false;
  // Mostly bullets/asterisks/X with a short visible tail (common UIDAI / portal mask)
  const maskChars = (a.match(/[•*xX#]/g) || []).length;
  return maskChars >= 4 && maskChars >= a.length * 0.4;
}

/**
 * Planned vs actual equality that tolerates portal masking and formatting.
 * Extension verified=true + masked actual is SUCCESS, not VERIFIED_LIE.
 * T17: exported for unit tests.
 */
export function valuesAgree(planned, actual) {
  if (planned == null || actual == null || actual === '') return false;
  const p = String(planned);
  const a = String(actual);
  const np = norm(p);
  const na = norm(a);
  if (np && na && np === na) return true;

  // Masked portal value: last 4 digits of planned match end of actual
  if (isMaskedActual(a) && np.length >= 4) {
    const tail = np.slice(-4);
    const aDigits = a.replace(/\D/g, '');
    const aAlnum = na;
    if (tail && (aDigits.endsWith(tail) || aAlnum.endsWith(tail) || a.endsWith(p.slice(-4)))) {
      return true;
    }
  }

  // Soft contains only when both sides are long enough (avoid BC vs OBC)
  if (np.length >= 6 && na.length >= 6) {
    if (na.includes(np) || np.includes(na)) return true;
  }

  // Date format variants DD/MM/YYYY vs YYYY-MM-DD
  const d1 = p.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  const d2 = a.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (d1 && d2) {
    const isoFromP = `${d1[3]}-${d1[2].padStart(2, '0')}-${d1[1].padStart(2, '0')}`;
    const isoFromA = `${d2[1]}-${d2[2].padStart(2, '0')}-${d2[3].padStart(2, '0')}`;
    if (isoFromP === isoFromA) return true;
  }
  const d3 = a.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  const d4 = p.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (d3 && d4) {
    const isoA = `${d3[3]}-${d3[2].padStart(2, '0')}-${d3[1].padStart(2, '0')}`;
    const isoP = `${d4[1]}-${d4[2].padStart(2, '0')}-${d4[3].padStart(2, '0')}`;
    if (isoA === isoP) return true;
  }

  return false;
}

/**
 * Audit one record for value truth.
 * Critical: verified=true can still hide wrong mapping when planned was already wrong.
 * Do NOT flag portal-masked actuals (********8335) as VERIFIED_LIE.
 */
export function auditValue(r) {
  const result = String(r.result || r.status || '?');
  const label = String(r.label || r.nodeId || '');
  const planned = plannedOf(r);
  const actual = actualOf(r);
  const flags = [];

  if (result === 'filled' || result === 'succeeded') {
    if (actual == null) flags.push('MISSING_ACTUAL');
    else if (actual === '') flags.push('EMPTY_ACTUAL');
    if (planned != null && actual != null && actual !== '') {
      if (!valuesAgree(planned, actual)) {
        flags.push('VALUE_MISMATCH');
      } else if (isMaskedActual(actual)) {
        flags.push('PORTAL_MASKED'); // informational — fill OK, portal hides value
      }
    }
    // Only VERIFIED_LIE when real mismatch (not mask / date format)
    if (r.verified === true && flags.includes('VALUE_MISMATCH')) {
      flags.push('VERIFIED_LIE');
    }
    // Semantic smell tests (mapping bugs where planned==actual but wrong field)
    if (planned != null) {
      if (/email|ईमेल|e-?mail/i.test(label) && planned && !String(planned).includes('@')) {
        flags.push('SUSPECT_EMAIL');
      }
      if (/mobile|phone|मोबाइल|tel/i.test(label) && planned && !/^\+?[\d\s-]{8,}$/.test(String(planned).trim())) {
        flags.push('SUSPECT_PHONE');
      }
      if (/pin|pincode|zip/i.test(label) && planned && !/^\d{5,6}$/.test(String(planned).replace(/\s/g, ''))) {
        flags.push('SUSPECT_PIN');
      }
      if (/husband|पति/i.test(label) && /father|पिता|jairam/i.test(planned)) {
        flags.push('SUSPECT_HUSBAND_EQ_FATHER');
      }
    }
  }

  if (result === 'unmapped' || r.failReason === 'no-mapping') {
    flags.push('NO_MAPPING');
  }

  return { planned, actual, flags };
}

function analyzeValues(records) {
  let missingActual = 0;
  let mismatch = 0;
  let suspect = 0;
  let withPlanned = 0;
  let withActual = 0;
  const issues = [];
  for (let i = 0; i < (records || []).length; i++) {
    const r = records[i];
    const a = auditValue(r);
    if (a.planned != null) withPlanned++;
    if (a.actual != null && a.actual !== '') withActual++;
    if (a.flags.includes('MISSING_ACTUAL') || a.flags.includes('EMPTY_ACTUAL')) missingActual++;
    if (a.flags.includes('VALUE_MISMATCH') || a.flags.includes('VERIFIED_LIE')) mismatch++;
    if (a.flags.some((f) => f.startsWith('SUSPECT_'))) suspect++;
    if (a.flags.length && (r.result === 'filled' || a.flags.includes('VALUE_MISMATCH'))) {
      issues.push({
        n: i + 1,
        label: String(r.label || r.nodeId || '?').slice(0, 48),
        result: r.result,
        planned: a.planned,
        actual: a.actual,
        flags: a.flags,
        verified: r.verified,
      });
    }
  }
  return { missingActual, mismatch, suspect, withPlanned, withActual, issues };
}

/**
 * Infer static vs AJAX dropdown class from session records.
 * Extension does not post an explicit ajax:true flag — we reconstruct from strategy + failReason.
 */
function classifyDropdownRecords(records) {
  const rows = [];
  const counts = {};
  const ajaxFails = [];
  const neverTried = [];
  for (const r of records || []) {
    const type = String(r.type || '');
    const strategy = String(r.strategy || '');
    const fr = String(r.failReason || '');
    const label = String(r.label || r.selector || '?');
    const looksSelect =
      /dropdown|select|cascade|option/i.test(type + strategy) ||
      strategy.includes('cascade') ||
      strategy.includes('wait-engine') ||
      strategy.includes('native-select') ||
      fr.includes('option') ||
      fr.includes('wait-timeout') ||
      /state|district|block|division|circle|जिला|प्रखंड|राज्य|अनुमंडल|office|panchayat/i.test(label);
    if (!looksSelect && type !== 'dropdown' && type !== 'select') continue;

    let kind = 'OTHER';
    let bucket = 'OTHER';
    if (
      strategy === 'planner' ||
      r.result === 'unmapped' ||
      fr.startsWith('no-mapping') ||
      fr === 'selector_not_bound' ||
      fr === 'duplicate_hierarchy' ||
      fr === 'no_profile_value_for_selector' ||
      fr.startsWith('selector_not_bound')
    ) {
      kind = fr === 'duplicate_hierarchy' ? 'DUP-HIERARCHY' : 'NEVER-TRIED';
      bucket = 'NEVER_TRIED';
      neverTried.push(label);
    } else if (
      strategy.includes('cascade') ||
      strategy.includes('wait-engine') ||
      fr === 'wait-timeout' ||
      fr === 'ajax_options_not_loaded' ||
      fr === 'ajax_option_mismatch' ||
      r.loadMode === 'ajax'
    ) {
      kind =
        fr === 'ajax_option_mismatch' || fr === 'no-matching-option'
          ? 'AJAX/MISMATCH'
          : strategy.includes('cascade')
            ? 'AJAX/CASCADE'
            : 'AJAX-WAIT';
      bucket = r.result === 'filled' ? 'AJAX_TRY' : 'AJAX_FAIL';
      if (r.result !== 'filled') ajaxFails.push(label);
    } else if (strategy.includes('native-select') || strategy.includes('mat-select') || type === 'dropdown') {
      kind = 'STATIC-SELECT';
      bucket = r.result === 'filled' ? 'STATIC_OK' : 'STATIC_FAIL';
    } else if (fr === 'no-matching-option' || fr === 'no-options-loaded') {
      kind = 'AJAX/OPTIONS';
      bucket = 'AJAX_FAIL';
      ajaxFails.push(label);
    }

    counts[bucket] = (counts[bucket] || 0) + 1;
    rows.push({
      kind,
      result: r.result,
      reason: fr || (r.result === 'filled' ? 'ok' : '-'),
      strategy: strategy || '-',
      label: label.slice(0, 52),
      planned: r.value ?? null,
      actual: r.actualValue ?? r.actual_value ?? null,
    });
  }
  return { rows, counts, ajaxFails, neverTried };
}

export function formatSessionListLine(session) {
  const records = Array.isArray(session.records) ? session.records : [];
  const ver = extensionVersionOf(session) || '?';
  const t = analyzeTiming(records);
  const v = analyzeValues(records);
  const timeBit = t.count
    ? ` step_sum=${t.sum}ms avg=${t.avg}ms` + (t.wall != null ? ` wall=${t.wall}ms` : '')
    : '';
  const valBit =
    v.mismatch || v.missingActual || v.suspect
      ? `  values: mismatch=${v.mismatch} missing_actual=${v.missingActual} suspect=${v.suspect}`
      : `  values: planned=${v.withPlanned} actual=${v.withActual}`;
  return (
    `${session.id}\n` +
    `  extension=${ver}  filled=${session.totalFilled ?? session.total_filled ?? '?'}  failed=${session.totalFailed ?? session.total_failed ?? '?'}\n` +
    `  host=${session.hostname || '(empty)'}  at=${session.receivedAt || session.created_at || session.submitted_at || '?'}\n` +
    `  path=${pathHint(records)}  records=${records.length}${timeBit}\n` +
    `  ${valBit}`
  );
}

/** Normalize session.records (array or T16 { _metrics, records } envelope). */
export function normalizeSessionRecords(session) {
  const raw = session?.records;
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.records)) return raw.records;
  return [];
}

export function reportFromSession(session) {
  const records = normalizeSessionRecords(session);
  const ver = extensionVersionOf(session) || '?';
  const t = analyzeTiming(records);
  const valStats = analyzeValues(records);
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
    lines.push(
      `Step time sum      ${t.sum} ms  avg=${t.avg}  p95=${t.p95}` +
        (t.wall != null ? `  wall=${t.wall}ms` : '')
    );
  }
  lines.push(
    `Values             planned_on=${valStats.withPlanned}/${records.length}  actual_on=${valStats.withActual}/${records.length}  mismatch=${valStats.mismatch}  missing_actual=${valStats.missingActual}  suspect=${valStats.suspect}`
  );
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  #  result   type       label');
  lines.push('     PLANNED (meant to fill)     ACTUAL (on page after fill)');
  lines.push('───────────────────────────────────────────────────────────');
  let ok = 0;
  let fail = 0;
  records.forEach((r, i) => {
    const result = String(r.result || r.status || '?');
    if (result === 'filled' || result === 'succeeded') ok++;
    else if (result === 'failed' || result === 'error') fail++;
    const op = r.type || r.op || r.strategy || '?';
    const label = r.label || r.nodeId || r.node_id || r.stepId || r.selector || '?';
    const { planned, actual, flags } = auditValue(r);
    const ms = durationMs(r);
    lines.push(
      `  ${String(i + 1).padStart(2)}  ${result.padEnd(8)} ${String(op).padEnd(10)} ${String(label).slice(0, 48)}`
    );
    const pShow = planned != null && planned !== '' ? planned : '(none)';
    let aShow = '(not recorded)';
    if (actual === '') aShow = '(empty on page)';
    else if (actual != null) aShow = actual;
    lines.push(`     planned: ${String(pShow).slice(0, 70)}`);
    lines.push(`     actual:  ${String(aShow).slice(0, 70)}`);
    const bits = [];
    if (ms != null) bits.push(`${ms}ms`);
    if (r.strategy && r.strategy !== op) bits.push(`strategy=${r.strategy}`);
    if (r.verified === true) bits.push('verified=true');
    if (r.verified === false) bits.push('verified=false');
    if (r.failReason || r.failure_code) bits.push(`fail=${r.failReason || r.failure_code}`);
    if (flags.length) bits.push(`⚠ ${flags.join(',')}`);
    if (bits.length) lines.push(`     ${bits.join('  ')}`);
  });
  if (!records.length) lines.push('  (no records)');

  if (valStats.issues.length) {
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('  VALUE AUDIT (wrong / missing / suspicious fills)');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('  If planned was already wrong (bad mapping), verified=true hides the bug.');
    lines.push('  MISSING_ACTUAL on filled rows = cannot prove what the page shows.');
    for (const iss of valStats.issues.slice(0, 40)) {
      lines.push(
        `  #${iss.n} ${iss.result}  ${iss.label}\n` +
          `      planned=${JSON.stringify(iss.planned)}\n` +
          `      actual =${JSON.stringify(iss.actual)}\n` +
          `      flags  =${iss.flags.join(', ')}  verified=${iss.verified}`
      );
    }
    if (valStats.issues.length > 40) lines.push(`  … ${valStats.issues.length - 40} more`);
  }

  // Dropdown / cascade taxonomy (static vs AJAX) — do NOT trust no-mapping alone
  const dd = classifyDropdownRecords(records);
  if (dd.rows.length) {
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('  DROPDOWNS: STATIC vs AJAX (CLI inference from strategy/failReason)');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('  IMPORTANT: no-mapping is often MISLEADING for cascades (use codes below).');
    lines.push('  • NEVER-TRIED / selector_not_bound / duplicate_hierarchy = this SELECTOR not in map');
    lines.push('    (profile may still HAVE the value — twin control used it, or label mismatch).');
    lines.push('  • ajax_options_not_loaded / wait-timeout = mapping existed; AJAX options never ready.');
    lines.push('  • ajax_option_mismatch / no-matching-option = options present; text/value did not match.');
    lines.push('  • STATIC-SELECT = native select path with actualValue when recorded.');
    lines.push(
      `  counts  static_ok=${dd.counts.STATIC_OK||0}  static_fail=${dd.counts.STATIC_FAIL||0}` +
        `  ajax_try=${dd.counts.AJAX_TRY||0}  ajax_fail=${dd.counts.AJAX_FAIL||0}` +
        `  never_tried=${dd.counts.NEVER_TRIED||0}`
    );
    for (const row of dd.rows.slice(0, 35)) {
      lines.push(
        `  ${row.kind.padEnd(12)} ${String(row.result).padEnd(8)} ${row.label}\n` +
          `      reason=${row.reason}  strat=${row.strategy}  planned=${JSON.stringify(row.planned)}  actual=${JSON.stringify(row.actual)}`
      );
    }
    if (dd.rows.length > 35) lines.push(`  … ${dd.rows.length - 35} more dropdown rows`);
    if (dd.ajaxFails.length && dd.neverTried.length) {
      lines.push('  HINT: If District appears both as AJAX_FAIL (English STATE/DISTRICT) and');
      lines.push('        NEVER_TRIED (Hindi जिला), the form has TWO hierarchies — map/fill one,');
      lines.push('        the other is leftover detection, not “profile missing district”.');
    }
  }

  lines.push('───────────────────────────────────────────────────────────');
  lines.push(`RESULT    ok=${ok}  fail=${fail}  rows=${records.length}`);
  lines.push('  Note: product posts observation after all steps (legacy too).');
  lines.push('═══════════════════════════════════════════════════════════');
  return {
    lines,
    summary: {
      id: session.id,
      extensionVersion: ver,
      ok,
      fail,
      timing: t,
      values: valStats,
    },
  };
}
