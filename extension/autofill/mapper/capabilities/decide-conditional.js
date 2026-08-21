/**
 * decide-conditional — Decide Yes/No for conditional radio/checkbox fields
 *
 * Inspects field label + identity against known conditional patterns
 * (changed name, same address, disability, ex-serviceman, gender,
 * marital, reserved category, aadhaar declaration) and returns a
 * decision string ('Yes', 'No', or a profile value) based on profile flags.
 *
 * Public API (on globalThis.CcDecideConditional):
 *   decideConditionalChoice(field, profile) => string | null
 *
 * See docs/decide-conditional.md for full documentation.
 */
(function (root) {
  'use strict';

  function normalizeIdent(s) {
    return String(s || '').toLowerCase().replace(/[-\s:*()'./\\]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  }

  /**
   * @param {object} field   — { label, name, id, type, options }
   * @param {object} profile — user profile
   * @returns {string|null}  — 'Yes', 'No', a profile value, or null (no decision)
   */
  function decideConditionalChoice(field, profile) {
    var ident  = normalizeIdent([field.label, field.name, field.id].filter(Boolean).join(' '));
    var label  = String(field.label || '').toLowerCase();
    var nameId = ((field.name || '') + ' ' + (field.id || '')).toLowerCase();
    var blob   = ident + ' ' + label + ' ' + nameId;

    // Changed name?
    if (/changed|new_name|name_change|whether.*name/.test(blob)) {
      return profile.changed_name ? 'Yes' : 'No';
    }
    // Same address?
    if (/address.?same|same.?address|isaddresssame|correspondence.?same/.test(blob)) {
      if (profile.same_address != null) return /^(yes|true|1)$/i.test(String(profile.same_address)) ? 'Yes' : 'No';
      return 'Yes'; // default: same
    }
    // Disability / PwD
    if (/disabilit|pwd|divyang|handicapped|is_pwd/.test(blob)) {
      var d = profile.is_pwd || profile.disability || profile.pwd;
      if (d != null) return /^(yes|y|true|1)$/i.test(String(d)) ? 'Yes' : 'No';
      return 'No';
    }
    // Ex-serviceman
    if (/ex.?serviceman|ex.?service/.test(blob)) {
      var e = profile.ex_serviceman;
      if (e != null) return /^(yes|y|true|1)$/i.test(String(e)) ? 'Yes' : 'No';
      return 'No';
    }
    // Aadhaar declaration / consent
    if (/aadhar.?declar|aadhaar.?declar|declaration|consent|i_agree|i agree|confirm.*information/.test(blob)) {
      return 'Yes';
    }
    // Gender
    if (/gender|sex|ling|पुरुष|महिला|male|female|तृतीय/.test(blob)) {
      return profile.gender || profile.sex || null;
    }
    // Marital
    if (/marital|married|unmarried|विवाह/.test(blob)) {
      return profile.marital_status || profile.marital || null;
    }
    // Reserved category
    if (/reserv|category.?belong|is_reserved/.test(blob)) {
      var r = profile.is_reserved_category;
      if (r != null) return /^(yes|y|true|1)$/i.test(String(r)) ? 'Yes' : 'No';
    }
    return null;
  }

  root.CcDecideConditional = { decideConditionalChoice: decideConditionalChoice };

})(typeof globalThis !== 'undefined' ? globalThis : this);
