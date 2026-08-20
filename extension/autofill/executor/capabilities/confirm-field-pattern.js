/**
 * confirm-field-pattern — Confirm/Retype Field Identifier
 *
 * Identifies whether an input field is a confirm/retype field, and derives
 * the base field ID that it confirms.
 *
 * Used by post-fill-confirm.js (static propagation) and post-fill-mirror.js
 * (live mirror). Previously duplicated identically in both files.
 *
 * No DOM, no kernel, no Chrome APIs. Pure string/pattern matching.
 *
 * Public API (on globalThis.CcConfirmFieldPattern):
 *   isConfirmField(id, label?) => boolean
 *   getBaseId(id) => string
 *
 * See confirm-field-pattern.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Matches confirm/retype field ID prefixes (case-insensitive):
   *   c{letter}  — e.g. cPassword, cEmail
   *   confirm    — e.g. confirmPassword, confirm_email
   *   retype     — e.g. retypePassword
   *   re_type    — e.g. re_type_password
   *   re_enter   — e.g. re_enter_mobile
   *   verify     — e.g. verifyEmail
   */
  var CONFIRM_PREFIX_PATTERN = /^c(?=[a-z])|^confirm|^retype|^re_?type|^re_?enter|^verify/i;

  /**
   * Matches confirm/retype keywords in label text (case-insensitive).
   */
  var CONFIRM_LABEL_PATTERN = /confirm|retype|re.type|re.enter|verify/i;

  /**
   * Returns true if the field appears to be a confirm/retype field.
   *
   * @param {string} id     The element's id or name attribute
   * @param {string} [label]  Optional label text
   * @returns {boolean}
   */
  function isConfirmField(id, label) {
    var idStr = String(id || '').toLowerCase();
    if (!idStr) return false;
    if (CONFIRM_PREFIX_PATTERN.test(idStr)) return true;
    if (label && CONFIRM_LABEL_PATTERN.test(String(label))) return true;
    return false;
  }

  /**
   * Derives the base field ID by stripping the confirm prefix.
   * Returns the original string if no prefix matched.
   *
   * NOTE — legacy behavior: the ^c(?=[a-z]) rule fires first. This means
   * 'confirmPassword' → 'onfirmPassword' (the 'c' followed by lowercase 'o'
   * is stripped, not the full 'confirm'). This is the original behavior and
   * is preserved exactly. Use IDs like 'cPassword' (with uppercase base) if
   * you want the c-prefix stripping to work as intended.
   *
   * @param {string} id
   * @returns {string}
   */
  function getBaseId(id) {
    return String(id || '')
      .replace(/^c(?=[a-z])/, '')
      .replace(/^confirm_?/i, '')
      .replace(/^retype_?/i, '')
      .replace(/^re_?type_?/i, '')
      .replace(/^re_?enter_?/i, '')
      .replace(/^verify_?/i, '');
  }

  root.CcConfirmFieldPattern = {
    isConfirmField: isConfirmField,
    getBaseId: getBaseId,
    CONFIRM_PREFIX_PATTERN: CONFIRM_PREFIX_PATTERN,
    CONFIRM_LABEL_PATTERN: CONFIRM_LABEL_PATTERN,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
