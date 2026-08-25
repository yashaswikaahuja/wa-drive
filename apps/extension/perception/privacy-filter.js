/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
(function () {
'use strict';
/**
 * CyberControl Privacy Filter — enforces perception-privacy.yml.
 *
 * Rules:
 *  - raw_value: prohibited by default — no actual field content in IR
 *  - secret nodes: redacted=true, sanitized_text=null, value_state∈{masked,unavailable,not_applicable}
 *  - text lengths: accessible_name ≤160, sanitized_text ≤320, description ≤320
 *  - unknown classification → treated as sensitive
 *  - screenshots: disabled by default (not relevant to this module)
 *  - Fail closed: unclassifiable content gets the most restrictive treatment
 */

const MAX_ACCESSIBLE_NAME = 160;
const MAX_SANITIZED_TEXT = 320;
const MAX_DESCRIPTION = 320;
const SECRET_VALUE_STATES = new Set(['masked', 'unavailable', 'not_applicable']);

/**
 * Classify a node's privacy level based on observed facts and kind.
 * @param {{role: string|null, accessible_name: string|null}} observedFacts
 * @param {string} nodeKind — IR Node.kind
 * @param {{type: string|null, autocomplete: string|null}} [inputMeta] — extra input metadata
 * @returns {'public'|'ordinary'|'personal'|'sensitive'|'secret'|'unknown'}
 */
function classifyNode(observedFacts, nodeKind, inputMeta) {
  const meta = inputMeta || {};
  const type = (meta.type || '').toLowerCase();
  const autocomplete = (meta.autocomplete || '').toLowerCase();
  const role = (observedFacts.role || '').toLowerCase();
  const name = (observedFacts.accessible_name || '').toLowerCase();

  // Secret: password, OTP, CAPTCHA, credit card
  if (type === 'password') return 'secret';
  if (/otp|one.time|verification.code|token/i.test(name)) return 'secret';
  if (autocomplete === 'one-time-code' || autocomplete === 'cc-number' || autocomplete === 'cc-csc') return 'secret';
  if (role === 'captcha' || /captcha/i.test(name)) return 'secret';

  // Sensitive: personal identifiers
  if (/aadhaar|pan\s*(?:no|number|card)|passport|ssn|social\s*security/i.test(name)) return 'sensitive';
  if (autocomplete === 'cc-name' || autocomplete === 'cc-exp') return 'sensitive';

  // Personal: PII fields
  if (/name|email|phone|mobile|dob|date.of.birth|address|father|mother/i.test(name)) return 'personal';
  if (['email', 'tel'].includes(type)) return 'personal';

  // Content/navigation nodes are typically public
  if (['page', 'region', 'navigation', 'content'].includes(nodeKind)) return 'public';

  // Controls default to ordinary
  if (['control', 'widget', 'option', 'form', 'section'].includes(nodeKind)) return 'ordinary';

  return 'unknown';
}

/**
 * Apply privacy rules to a node's observed facts and privacy field.
 * Mutates the node in place and returns it. Throws on irrecoverable error.
 *
 * @param {object} node — a draft IR Node (must have .observed, .privacy)
 * @param {{type: string|null, autocomplete: string|null}} [inputMeta]
 * @returns {object} The same node, sanitized.
 */
function applyPrivacyRules(node, inputMeta) {
  // Classify
  const classification = classifyNode(node.observed, node.kind, inputMeta);
  node.privacy = node.privacy || {};
  node.privacy.classification = classification;

  // Unknown → treat as sensitive
  const effective = classification === 'unknown' ? 'sensitive' : classification;

  // Secret and sensitive enforcement (fail-closed: unknown → sensitive → redacted)
  if (effective === 'secret' || effective === 'sensitive') {
    node.privacy.redacted = true;
    if (effective === 'secret') {
      node.observed.sanitized_text = null;
      if (!SECRET_VALUE_STATES.has(node.observed.value_state)) {
        node.observed.value_state = 'masked';
      }
    }
  } else {
    node.privacy.redacted = false;
  }

  // Truncate long text with reason
  const obs = node.observed;
  if (obs.accessible_name && obs.accessible_name.length > MAX_ACCESSIBLE_NAME) {
    obs.accessible_name = obs.accessible_name.slice(0, MAX_ACCESSIBLE_NAME);
    node.privacy.reason = (node.privacy.reason || '') + ' truncated:accessible_name';
  }
  if (obs.sanitized_text && obs.sanitized_text.length > MAX_SANITIZED_TEXT) {
    obs.sanitized_text = obs.sanitized_text.slice(0, MAX_SANITIZED_TEXT);
    node.privacy.reason = (node.privacy.reason || '') + ' truncated:sanitized_text';
  }
  if (obs.description && obs.description.length > MAX_DESCRIPTION) {
    obs.description = obs.description.slice(0, MAX_DESCRIPTION);
    node.privacy.reason = (node.privacy.reason || '') + ' truncated:description';
  }

  // Null-out privacy.reason if empty
  node.privacy.reason = node.privacy.reason?.trim() || null;

  return node;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { classifyNode, applyPrivacyRules, MAX_ACCESSIBLE_NAME, MAX_SANITIZED_TEXT, MAX_DESCRIPTION };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcPrivacyFilter = { classifyNode, applyPrivacyRules };
}
})();
