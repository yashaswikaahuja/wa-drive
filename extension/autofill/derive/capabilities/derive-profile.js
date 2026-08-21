/**
 * derive-profile — Deterministic profile enrichment
 *
 * Computes profile values implied by existing data (common-sense pass).
 * Runs before AI so the LLM only handles genuinely ambiguous fields.
 * Derived values NEVER overwrite real profile data.
 *
 * Public API (on globalThis.CcDeriveProfile):
 *   deriveProfile(profile) => enriched profile copy
 *
 * See docs/derive-profile.md for full documentation.
 */
(function (root) {
  'use strict';

  function hasVal(v) { return v != null && String(v).trim() !== ''; }

  function educationLevels(p) {
    var grad = hasVal(p.university_name) || hasVal(p.degree) || hasVal(p.passing_year_grad) ||
               hasVal(p.roll_number_grad) || hasVal(p.percentage_grad) || hasVal(p.registration_number_grad) ||
               hasVal(p.marks_obtained_grad) || hasVal(p.division_grad);
    var twelfth = hasVal(p.board_12th) || hasVal(p.passing_year_12th) || hasVal(p.roll_number_12th) ||
                  hasVal(p.percentage_12th) || hasVal(p.stream_12th) || hasVal(p.marks_obtained_12th) ||
                  hasVal(p.school_name_12th) || hasVal(p.certificate_number_12th);
    var tenth = hasVal(p.board_10th) || hasVal(p.passing_year_10th) || hasVal(p.roll_number_10th) ||
                hasVal(p.percentage_10th) || hasVal(p.marks_obtained_10th) || hasVal(p.certificate_number_10th);
    return { grad: grad, twelfth: twelfth, tenth: tenth };
  }

  function ageFromDob(dob) {
    if (!hasVal(dob)) return null;
    var m = String(dob).match(/(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})/);
    if (!m) return null;
    var y, mo, d;
    if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else { d = +m[1]; mo = +m[2]; y = +m[3]; }
    if (!y || y < 1900 || y > 2100) return null;
    var today = new Date();
    var age = today.getFullYear() - y;
    var mDiff = (today.getMonth() + 1) - mo;
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < d)) age--;
    return age >= 0 && age < 120 ? String(age) : null;
  }

  /**
   * Returns a new profile object with derived keys added.
   * Existing (real) values always win.
   *
   * @param {object} profile
   * @param {Array}  [serverRules] — optional server-defined derivation rules
   * @returns {object} enriched profile with _derived array
   */
  function deriveProfile(profile, serverRules) {
    var p = Object.assign({}, profile || {});
    var derived = [];
    function set(key, val) {
      if (!hasVal(val)) return;
      if (hasVal(p[key])) return; // never overwrite real data
      p[key] = String(val);
      derived.push(key);
    }

    // Server-defined rules (lookup/default only)
    var rules = serverRules || (typeof window !== 'undefined' && window._ccServerDerivationRules) || [];
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!rule || !rule.output_key) continue;
      var params = rule.parameters || {};
      if (rule.logic === 'lookup') {
        if (params.source_key && hasVal(p[params.source_key])) set(rule.output_key, p[params.source_key]);
        else if (params.default_value) set(rule.output_key, params.default_value);
      }
    }

    var edu = educationLevels(p);

    // Highest qualification
    if (edu.grad)         set('highest_education_qualification', 'Graduation');
    else if (edu.twelfth) set('highest_education_qualification', 'Intermediate');
    else if (edu.tenth)   set('highest_education_qualification', 'Matriculation');

    set('is_graduate', edu.grad ? 'Yes' : 'No');
    if (edu.twelfth && !edu.grad) set('qualification_status', 'Passed');

    // Education aliases
    set('roll_number',     p.roll_number_10th || p.roll_number_12th || p.roll_number_grad);
    set('board_name',      p.board_10th || p.board_12th);
    set('year_of_passing', p.passing_year_10th || p.passing_year_12th || p.passing_year_grad);
    set('percentage',      p.percentage_10th || p.percentage_12th || p.percentage_grad);
    set('division',        p.division_10th || p.division_12th || p.division_grad);
    set('school_name',     p.school_name || p.school_name_12th);

    // Age
    set('age', ageFromDob(p.dob));

    // Eligibility flags
    set('is_pwd', hasVal(p.disability_certificate) ? 'Yes' : 'No');
    if (hasVal(p.occupation)) set('ex_serviceman', /ex.?serv/i.test(p.occupation) ? 'Yes' : 'No');
    if (hasVal(p.category)) {
      var gen = /^gen(eral)?$/i.test(String(p.category).trim());
      set('is_reserved_category', gen ? 'No' : 'Yes');
    }

    // Name parts
    if (hasVal(p.name)) {
      var parts = String(p.name).trim().split(/\s+/);
      set('first_name', parts[0]);
      if (parts.length >= 2) set('last_name', parts[parts.length - 1]);
      if (parts.length >= 3) set('middle_name', parts.slice(1, -1).join(' '));
    }

    // Address aliases
    set('permanent_address', p.address);
    set('domicile_state', p.state);
    set('city', p.city || p.village || p.district);

    // Safe defaults
    set('nationality', 'Indian');

    p._derived = derived;
    return p;
  }

  root.CcDeriveProfile = {
    deriveProfile: deriveProfile,
    _hasVal: hasVal,
    _ageFromDob: ageFromDob,
    _educationLevels: educationLevels,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
