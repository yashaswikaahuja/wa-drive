/* __CC_IIFE_WRAPPED__ — re-injectable / popup-loadable error catalog */
/**
 * Phase 3.7 Hardening — runtime error catalog (MIG-ERR-01 / #166).
 * Maps internal reasons → frozen FailureCodes + operator-safe messages.
 * Normative: architecture/hardening-repository.yml + ADR-0013.
 * MUST NOT invent new public FailureCodes without contract amendment.
 */
(function () {
'use strict';

/** Frozen ActionPlan / EO FailureCode set (phase_3_0 contracts). */
const FROZEN_FAILURE_CODES = Object.freeze([
  'plan_expired',
  'stale_target',
  'stale_snapshot',
  'adapter_mismatch',
  'affordance_mismatch',
  'document_replaced',
  'authorization_denied',
  'correlation_replayed',
  'file_reference_invalid',
  'action_unsupported',
  'postcondition_failed',
  'gateway_error',
]);

const FAILURE_CODE_SET = new Set(FROZEN_FAILURE_CODES);

/** Operator-safe messages — no selectors, HTML, values, or credentials. */
const OPERATOR_MESSAGES = Object.freeze({
  plan_expired: 'This fill plan expired. Try again.',
  stale_target: 'The page changed. CyberControl will re-read the form.',
  stale_snapshot: 'The page was updated. Please run Fill again.',
  adapter_mismatch: 'This control type is not supported for automatic fill.',
  affordance_mismatch: 'This action is not available on that control.',
  document_replaced: 'The page navigated. Please run Fill again.',
  authorization_denied: 'This action is not allowed for the current plan.',
  correlation_replayed: 'This plan was already executed.',
  file_reference_invalid: 'The file for upload is missing or invalid.',
  action_unsupported: 'This action is not supported.',
  postcondition_failed: 'This control could not be safely operated.',
  gateway_error: 'Something went wrong while operating the page.',
});

const FORBIDDEN_LEAK = [
  'css_selector', 'xpath', 'outer_html', 'inner_html', 'selector',
  'binding_id', 'dom_handle', 'password', 'otp', 'credentials',
];

/**
 * Normalize any reason string to a frozen FailureCode.
 * @param {string|null|undefined} code
 * @returns {string}
 */
function normalizeFailureCode(code) {
  if (code == null || code === '') return 'gateway_error';
  const c = String(code);
  return FAILURE_CODE_SET.has(c) ? c : 'gateway_error';
}

/**
 * Operator-facing message for a failure code (never technical page secrets).
 * @param {string|null|undefined} code
 * @param {string|null|undefined} [fallbackDetail] optional non-leaking detail
 * @returns {string}
 */
function operatorMessageFor(code, fallbackDetail) {
  const normalized = normalizeFailureCode(code);
  const base = OPERATOR_MESSAGES[normalized] || OPERATOR_MESSAGES.gateway_error;
  if (fallbackDetail == null || fallbackDetail === '') return base;
  const safe = sanitizeOperatorDetail(String(fallbackDetail));
  if (!safe) return base;
  // Keep short; do not append raw technical dumps
  if (safe.length > 80) return base;
  // Avoid appending if it looks like a leak
  if (/[#.\[\]<>]|https?:|password|selector/i.test(safe)) return base;
  return `${base} (${safe})`;
}

/**
 * Strip characters/patterns that often carry selectors or markup.
 * @param {string} detail
 * @returns {string}
 */
function sanitizeOperatorDetail(detail) {
  let s = String(detail || '').replace(/\s+/g, ' ').trim();
  // Drop HTML-ish and selector-ish fragments
  s = s.replace(/<[^>]*>/g, '');
  s = s.replace(/[#.][A-Za-z0-9_-]{2,}/g, '');
  s = s.replace(/\/\/[^\s]+/g, '');
  for (const k of FORBIDDEN_LEAK) {
    if (s.toLowerCase().includes(k)) return '';
  }
  return s.slice(0, 120);
}

/**
 * Build a structured error envelope (public-safe fields only).
 * @param {object} opts
 * @param {string} [opts.category]
 * @param {string} opts.failureCode
 * @param {string} [opts.developerCode]
 * @param {string} [opts.detail]
 */
function makeErrorEnvelope(opts) {
  const failure_code = normalizeFailureCode(opts.failureCode || opts.code);
  return {
    category: opts.category || 'execution',
    failure_code,
    operator_message: operatorMessageFor(failure_code, opts.detail),
    developer_code: opts.developerCode ? String(opts.developerCode).slice(0, 80) : failure_code,
  };
}

function isFrozenFailureCode(code) {
  return FAILURE_CODE_SET.has(String(code || ''));
}

const api = {
  FROZEN_FAILURE_CODES,
  OPERATOR_MESSAGES,
  FORBIDDEN_LEAK,
  normalizeFailureCode,
  operatorMessageFor,
  sanitizeOperatorDetail,
  makeErrorEnvelope,
  isFrozenFailureCode,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.CcRuntimeErrors = api;
})();
