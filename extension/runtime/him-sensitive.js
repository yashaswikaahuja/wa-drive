/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
(function () {
'use strict';

/**
 * CyberControl HIM Sensitive Field Enforcement — extension/runtime/him-sensitive.js
 * Phase 4.0 — Sensitive value protection at the DOM boundary
 *
 * Enforces that the extension NEVER reads, stores, or transmits the actual
 * value of sensitive fields (OTP, password, payment credentials, CAPTCHA).
 *
 * INVARIANTS (architecture/him-protocol.yml §sensitive_fields):
 *  - Extension content script MUST NOT read .value from a secret-classified field
 *  - If auto_detect watches a secret field, only empty/nonempty transitions observed
 *  - Bridge MUST NOT carry secret field values
 *  - If classification is uncertain → treat as secret (fail-closed)
 *
 * OBSERVATION CONTRACT:
 *  - observeCompletion returns boolean signals only (empty→nonempty)
 *  - NEVER stores the actual entered value
 *  - NEVER reads .textContent of secret fields
 */

/**
 * Interaction types that ALWAYS involve sensitive values.
 * These inherit secret sensitivity regardless of server classification.
 */
const SENSITIVE_INTERACTION_TYPES = Object.freeze(new Set([
  'otp_entry',
  'captcha_solve',
  'payment_authorization',
  'signature',
]));

/**
 * Input types that are inherently sensitive (password, etc.).
 */
const SENSITIVE_INPUT_TYPES = Object.freeze(new Set([
  'password',
]));

/**
 * Attributes/patterns that suggest a field is sensitive when classification
 * is not explicitly provided by the server.
 */
const SENSITIVE_NAME_PATTERNS = Object.freeze([
  /otp/i,
  /password/i,
  /passwd/i,
  /pin/i,
  /cvv/i,
  /cvc/i,
  /captcha/i,
  /secret/i,
  /mpin/i,
  /token/i,
  /verification.?code/i,
]);

/**
 * Autocomplete values that indicate sensitive fields.
 */
const SENSITIVE_AUTOCOMPLETE = Object.freeze(new Set([
  'one-time-code',
  'current-password',
  'new-password',
  'cc-csc',
  'cc-number',
  'cc-exp',
]));

/**
 * Determine if a DOM node is a sensitive field.
 *
 * Classification source (priority order):
 *  1. Server-provided sensitive_field=true in plan step → always sensitive
 *  2. Interaction type in SENSITIVE_INTERACTION_TYPES → always sensitive
 *  3. Input type=password → always sensitive
 *  4. Heuristic detection (name, autocomplete, aria attributes)
 *  5. If uncertain → treat as secret (fail-closed)
 *
 * @param {Element} node — DOM element to classify
 * @param {object} [stepContext] — optional plan step context
 * @param {boolean} [stepContext.sensitive_field] — server classification
 * @param {string} [stepContext.interaction_type] — HIM interaction type
 * @returns {boolean} true if the field should be treated as sensitive
 */
function isSensitiveField(node, stepContext) {
  // Server classification takes absolute priority
  if (stepContext?.sensitive_field === true) return true;

  // Interaction type implies sensitivity
  if (stepContext?.interaction_type && SENSITIVE_INTERACTION_TYPES.has(stepContext.interaction_type)) {
    return true;
  }

  // No DOM node → fail closed
  if (!node || typeof node.tagName !== 'string') return true;

  const tag = node.tagName.toUpperCase();
  const type = String(node.type || node.getAttribute?.('type') || '').toLowerCase();
  const name = String(node.name || node.getAttribute?.('name') || '').toLowerCase();
  const id = String(node.id || '').toLowerCase();
  const autocomplete = String(node.autocomplete || node.getAttribute?.('autocomplete') || '').toLowerCase();
  const ariaLabel = String(node.getAttribute?.('aria-label') || '').toLowerCase();
  const placeholder = String(node.placeholder || node.getAttribute?.('placeholder') || '').toLowerCase();

  // Input type=password is always sensitive
  if (tag === 'INPUT' && SENSITIVE_INPUT_TYPES.has(type)) return true;

  // Autocomplete hints
  if (SENSITIVE_AUTOCOMPLETE.has(autocomplete)) return true;

  // Name/id/aria-label/placeholder pattern matching
  const testValues = [name, id, ariaLabel, placeholder];
  for (const value of testValues) {
    if (!value) continue;
    for (const pattern of SENSITIVE_NAME_PATTERNS) {
      if (pattern.test(value)) return true;
    }
  }

  // If the element has aria-hidden or is in a password manager region, be cautious
  // but don't over-classify normal text inputs.

  // Non-input elements with contenteditable in a sensitive context → fail closed
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
    if (node.getAttribute?.('contenteditable') === 'true') {
      // contenteditable in a HIM context without explicit classification → fail closed
      if (stepContext) return true;
    }
  }

  // Explicit server classification as NOT sensitive
  if (stepContext?.sensitive_field === false) return false;

  // If we have a step context but no explicit classification → fail closed
  if (stepContext && stepContext.sensitive_field === undefined) return true;

  // No step context and no heuristic match → not sensitive
  return false;
}

/**
 * Observe a field for empty→nonempty state transition WITHOUT reading the value.
 *
 * Uses ONLY boolean checks:
 *  - element.value === '' (is it empty? yes/no — never stores what the value IS)
 *  - element.validity (validity state as proxy)
 *  - selectionStart as proxy for content presence
 *
 * @param {Element} element — the field to observe
 * @param {object} [options]
 * @param {number} [options.pollIntervalMs=500] — polling interval
 * @param {number} [options.timeoutMs=300000] — max observation duration
 * @param {function} [options.onTransition] — called when empty→nonempty detected
 * @returns {{ stop: function, promise: Promise<{completed: boolean}> }}
 */
function observeCompletion(element, options = {}) {
  const pollInterval = options.pollIntervalMs || 500;
  const timeoutMs = options.timeoutMs || 300000;
  const onTransition = options.onTransition || null;

  let stopped = false;
  let intervalId = null;
  let timeoutId = null;
  let resolve = null;

  const promise = new Promise((res) => { resolve = res; });

  function isNonempty() {
    // SAFE CHECK: only tests emptiness, never reads or stores the actual value
    try {
      // Primary: direct empty check (boolean result only)
      if (typeof element.value === 'string') {
        return element.value !== '';
      }
      // Fallback for contenteditable: selectionStart > 0 implies content
      if (typeof element.selectionStart === 'number') {
        return element.selectionStart > 0;
      }
      // Fallback: validity — valueMissing=false means there's content
      if (element.validity && typeof element.validity.valueMissing === 'boolean') {
        return !element.validity.valueMissing;
      }
      // Cannot determine → do not signal completion (fail-closed)
      return false;
    } catch (e) {
      // Cross-origin or disconnected element
      return false;
    }
  }

  // Record initial state
  const wasInitiallyEmpty = !isNonempty();

  function check() {
    if (stopped) return;

    // Element disconnected — stop observing
    if (!element.isConnected) {
      stop();
      resolve({ completed: false, reason: 'element_disconnected' });
      return;
    }

    const nowNonempty = isNonempty();

    // Detect empty → nonempty transition
    if (wasInitiallyEmpty && nowNonempty) {
      stop();
      if (onTransition) {
        try { onTransition(); } catch (e) { /* swallow listener errors */ }
      }
      resolve({ completed: true });
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (intervalId) clearInterval(intervalId);
    if (timeoutId) clearTimeout(timeoutId);
    intervalId = null;
    timeoutId = null;
  }

  // Start polling
  intervalId = setInterval(check, pollInterval);

  // Timeout — visual timer is separate, this is just cleanup
  timeoutId = setTimeout(() => {
    if (!stopped) {
      stop();
      resolve({ completed: false, reason: 'timeout' });
    }
  }, timeoutMs);

  // Also listen for input event as a faster signal (but still only check emptiness)
  function onInput() {
    check();
  }
  element.addEventListener('input', onInput);

  // Augment stop to remove event listener
  const originalStop = stop;
  function stopFull() {
    originalStop();
    try { element.removeEventListener('input', onInput); } catch (e) { /* swallow */ }
  }

  return {
    stop: stopFull,
    promise,
  };
}

// ─── Export ──────────────────────────────────────────────────────────────

const api = {
  isSensitiveField,
  observeCompletion,
  SENSITIVE_INTERACTION_TYPES,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcHimSensitive = api;
}
})();
