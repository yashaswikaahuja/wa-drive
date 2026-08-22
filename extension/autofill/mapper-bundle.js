/**
 * AUTO-GENERATED — do not edit.
 * Source: autofill/mapper/capabilities/*.js + mapper.js (facade)
 * Rebuild: node extension/autofill/build-mapper-bundle.mjs
 */

/* ==== field-aliases.js ==== */
/**
 * field-aliases — FIELD_ALIASES dict + server merge
 *
 * Provides the canonical alias map for profile key → label patterns,
 * merged with server-synced field mappings from window._ccServerFieldMappings.
 *
 * Public API (on globalThis.CcFieldAliases):
 *   getFieldAliases(serverMappings?) => merged aliases object
 *   FIELD_ALIASES                    => base hardcoded aliases
 *
 * See docs/field-aliases.md for full documentation.
 */
(function (root) {
  'use strict';

  var FIELD_ALIASES = {
    name:           ['candidate_name', 'candidates_name', 'applicant_name', 'applicants_name', 'student_name', 'full_name', 'fullname', 'naam', 'name', 'applicant_name_english', 'name_english', 'name_in_english', 'txt_candidate_name', 'txt_name', 'txtcandidatename', 'txtname', 'pratyashi_ka_naam', 'your_name', 'enter_name'],
    first_name:     ['first_name', 'firstname', 'fname', 'given_name', 'givenname', 'txt_firstname', 'txt_first_name'],
    middle_name:    ['middle_name', 'middlename', 'mname', 'txt_middlename', 'txt_middle_name'],
    last_name:      ['last_name', 'lastname', 'lname', 'surname', 'family_name', 'familyname', 'txt_lastname', 'txt_last_name', 'txt_surname'],
    dob:            ['dob', 'date_of_birth', 'dateofbirth', 'birth_date', 'janm_tithi', 'janm', 'birthdate', 'date_of_birth_dd_mm_yyyy', 'janm_tithi_', 'txt_dob', 'txtdob', 'txt_date_of_birth'],
    father_name:    ['father_name', 'fathername', 'fathers_name', 'father_s_name', 'pita_ka_naam', 'pita_naam', 'father', 'father_husband_name', 'pita_pati_ka_naam', 'txt_father', 'txtfather', 'txt_father_name', 'fathers_name_and_verify', 'pitaji_ka_naam'],
    mother_name:    ['mother_name', 'mothername', 'mothers_name', 'mother_s_name', 'mata_ka_naam', 'mata_naam', 'mother', 'txt_mother', 'txtmother', 'txt_mother_name', 'mothers_name_and_verify', 'mata_ka_naam'],
    address:        ['address', 'adress', 'permanent_address', 'correspondence_address', 'residential_address', 'pata', 'niwas', 'full_address', 'addr', 'txt_adress', 'txt_address'],
    mobile:         ['mobile_no', 'mobile_number', 'phone_no', 'contact_no', 'mo_no', 'sampark', 'mobile', 'phone', 'mobile_no_', 'sampark_no', 'txt_mobile', 'txtmobile', 'txt_mobile_no', 'mobile_no_mobile_sankhya', 'registered_mobile'],
    phone:          ['mobile_no', 'mobile_number', 'phone_no', 'contact_no', 'mo_no', 'sampark', 'mobile', 'phone', 'phone_number', 'mobile_no_', 'sampark_no', 'txt_mobile', 'txtmobile', 'txt_mobile_no', 'mobile_no_mobile_sankhya', 'registered_mobile', 'enter_your_mobile_number', 'enter_mobile_number'],
    email:          ['email_address', 'email_id', 'emailid', 'email_add', 'email', 'txt_email', 'txtemail', 'txt_email_id', 'email_id_e_mail_a_i_di', 'registered_email', 'enter_your_email_id', 'enter_email_id'],
    email_id:       ['email_address', 'email_id', 'emailid', 'email_add', 'email', 'txt_email', 'txtemail', 'txt_email_id', 'email_id_e_mail_a_i_di', 'registered_email', 'enter_your_email_id', 'enter_email_id', 'confirm_your_email_id'],
    aadhaar_number: ['aadhaar', 'aadhar', 'uid', 'aadhaar_no', 'aadhar_no', 'identity_card_no', 'enter_identity', 'aadhaar_number_', 'aadhar_card', 'txt_aadhaar', 'txtaadhaar', 'txt_aadhar', 'aadhaar_card_no', 'aadhar_number', 'uid_no', 'aadhar_sankhya', 'aadhaar_sankhya'],
    pan_number:     ['pan_no', 'pan_number', 'pancard', 'pan_card'],
    epic_number:    ['epic_no', 'voter_id', 'epic_number'],
    category:       ['category', 'caste_category', 'varg', 'txt_category', 'ddl_category', 'ddlcategory', 'social_category', 'reservation_category', 'caste'],
    gender:         ['gender', 'sex', 'ling', 'txt_gender', 'ddl_gender', 'rbl_gender'],
    pincode:        ['pincode', 'pin_code', 'postal_code', 'zip_code', 'pin', 'zip', 'pincode_pin_code'],
    state:          ['state_name', 'state_of', 'rajya', 'state', 'home_state', 'permanent_state', 'state_of_residence'],
    district:       ['district_name', 'jila', 'district', 'home_district', 'permanent_district'],
    nationality:    ['nationality', 'rashtriyata', 'citizenship', 'citizen'],
    marital_status: ['marital_status', 'marital', 'vivah', 'married', 'marriage_status', 'ddl_marital'],
    religion:       ['religion', 'dharm', 'dharma', 'ddl_religion', 'txt_religion'],
    domicile_state:      ['domicile', 'domicile_state', 'home_state', 'state_of_domicile'],
    qualification_status:['essential_qualification','have_qualification','possess_qualification','affirmation','qualified'],
    year_of_passing:     ['year_of_passing','passing_year','year_pass','year_graduation'],
    grade:               ['grade','division','class_obtained','cgpa','gpa'],
    highest_education_qualification: ['highest_education','highest_qualification','highest_level_of_education','highest_level_of_educational'],
    degree_name:         ['degree_name','degree','qualification_name','course_name','programme'],
    university_name:     ['university_name','university','institution_name','college_name','college'],
    roll_number:         ['roll_number','roll_no','rollno','rollnumber','roll'],
    board_10th:          ['10th_class','matriculation','class_10','sslc_board','class_x','tenth_class','board_10th','board_10','10th_education','matric_board','matriculation_board'],
    board_12th:          ['12th_class','intermediate','class_12','class_xii','twelfth_class','board_12th','board_12','12th_education','plus_two','plustwo','hsc_board','intermediate_board','inter_board'],
    board_name:          ['education_board','exam_board','university_board'],
    passing_year_10th:   ['10th_passing_year','matriculation_year_of_passing','matric_year','class_10_year','tenth_year_of_passing','sslc_year','year_of_passing_10th','passing_year_10th'],
    passing_year_12th:   ['12th_passing_year','intermediate_year_of_passing','inter_year','class_12_year','twelfth_year_of_passing','hsc_year','year_of_passing_12th','passing_year_12th','plus_two_year'],
    marks_10th:          ['10th_marks','10th_percentage','matriculation_marks','matric_percentage','class_10_marks','tenth_marks','sslc_marks','marks_10th'],
    marks_12th:          ['12th_marks','12th_percentage','intermediate_marks','inter_percentage','class_12_marks','twelfth_marks','hsc_marks','marks_12th','plus_two_marks'],
    school_name:         ['school_name','school','last_school_attended','name_of_school','institute_name','last_institution'],
    registration_number: ['registration_number','reg_number','reg_no','registration_no','enrollment_number','enrolment_number'],
    village:        ['village', 'village_name', 'gram', 'gaon', 'txt_village', 'ddl_village'],
    post_office:    ['post_office', 'post', 'po', 'txt_post', 'post_name'],
    police_station: ['police_station', 'thana', 'ps', 'txt_ps', 'ddl_ps'],
    sub_division:   ['sub_division', 'subdivision', 'sub_div', 'anumandal', 'anchal', 'circle', 'txt_subdiv', 'ddl_subdiv', 'sub-division', 'अनुमंडल'],
    block:          ['block', 'block_name', 'taluka', 'tehsil', 'prakhnd', 'txt_block', 'ddl_block', 'प्रखंड'],
    house_no:       ['house_no', 'house_number', 'house', 'flat_no', 'door_no', 'txt_house'],
    street:         ['street', 'street_name', 'road', 'lane', 'txt_street'],
  };

  /**
   * Returns FIELD_ALIASES merged with server-synced mappings.
   * Server patterns augment (or create) the alias entry — never replace entirely.
   *
   * @param {Array} [serverMappings] — array of { semantic_key, match_patterns }
   * @returns {object} merged aliases
   */
  function getFieldAliases(serverMappings) {
    var merged = Object.assign({}, FIELD_ALIASES);
    var server = serverMappings || (typeof window !== 'undefined' && window._ccServerFieldMappings) || null;
    if (server && Array.isArray(server)) {
      for (var i = 0; i < server.length; i++) {
        var m = server[i];
        if (!m.semantic_key || !m.match_patterns) continue;
        if (!merged[m.semantic_key]) {
          merged[m.semantic_key] = m.match_patterns.slice();
        } else {
          var existing = new Set(merged[m.semantic_key]);
          for (var j = 0; j < m.match_patterns.length; j++) {
            if (!existing.has(m.match_patterns[j])) merged[m.semantic_key].push(m.match_patterns[j]);
          }
        }
      }
    }
    return merged;
  }

  root.CcFieldAliases = { getFieldAliases: getFieldAliases, FIELD_ALIASES: FIELD_ALIASES };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcFieldAliases;

/* ==== field-ident.js ==== */
/**
 * field-ident — Field identity normalisation helpers
 *
 * Three helpers for converting raw DOM field data into a stable
 * normalised identity string used for alias matching:
 *
 *   normalizeIdent(s)         — lowercases and collapses separators to _
 *   labelPrimaryIdent(field)  — label-primary identity (prefers label over id/name)
 *   normChoice(s)             — strips non-alphanumerics for option comparison
 *
 * Public API (on globalThis.CcFieldIdent):
 *   normalizeIdent(s)
 *   labelPrimaryIdent(field)
 *   normChoice(s)
 *
 * See docs/field-ident.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Lowercase and collapse separators (spaces, hyphens, colons, etc.) to _.
   * @param {string} s
   * @returns {string}
   */
  function normalizeIdent(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[-\s:*()'./\\]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Produce a label-primary identity for a form field.
   * Label text is the primary signal; DOM id/name are included only as soft hints.
   *
   * @param {object} field — { label, id, name, placeholder }
   * @returns {{ ident, matchBy, labelEn, labelRaw, labelStrong }}
   */
  function labelPrimaryIdent(field) {
    var raw = String(field.label || '').trim();
    var en = raw.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
    var enCore = en.replace(/[^a-z0-9]/gi, '');
    // Good label: bilingual English part ≥3 alnum OR raw unicode label ≥4 chars
    var labelStrong = enCore.length >= 3 || raw.replace(/\s/g, '').length >= 4;
    var matchBy = 'label';
    var parts = [];
    if (en) {
      parts.push(en, en); // double-weight English tokens from label
    }
    if (raw && raw !== en) {
      parts.push(raw); // keep full bilingual string for Hindi keyword hooks
    }
    // Placeholder only as soft hint
    if (field.placeholder && String(field.placeholder).trim().length > 2) {
      parts.push(String(field.placeholder).trim());
    }
    // Always include name/id lightly so groups labeled only "Yes" still see "changed"/"isAddressSame"
    if (field.name) parts.push(String(field.name));
    if (field.id) parts.push(String(field.id));
    var ident = normalizeIdent(parts.join(' '));
    if (!labelStrong) {
      // Weak/missing label — last resort: DOM keys
      matchBy = 'dom-fallback';
      var domBits = [field.placeholder, field.id, field.name].filter(Boolean).join(' ');
      ident = normalizeIdent((ident ? ident + ' ' : '') + domBits);
    }
    return { ident: ident, matchBy: matchBy, labelEn: en, labelRaw: raw, labelStrong: labelStrong };
  }

  /**
   * Normalise for option comparison — strips non-alphanumerics, lowercase.
   * @param {string} s
   * @returns {string}
   */
  function normChoice(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  root.CcFieldIdent = {
    normalizeIdent: normalizeIdent,
    labelPrimaryIdent: labelPrimaryIdent,
    normChoice: normChoice,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcFieldIdent;

/* ==== resolve-choice.js ==== */
/**
 * resolve-choice — Map planned value onto radio/checkbox option selector
 *
 * Given a field descriptor and a planned value string, finds the matching
 * option selector (radio-click, checkbox, mat-checkbox). Returns null if
 * no safe match found — never dumps free-text onto choice widgets.
 *
 * Public API (on globalThis.CcResolveChoice):
 *   resolveChoiceToOption(field, plannedValue, profileKey) => { selector, entry } | null
 *
 * See docs/resolve-choice.md for full documentation.
 */
(function (root) {
  'use strict';

  function normChoice(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function looksLikeYesNo(opts) {
    return opts.length > 0 && opts.every(function (o) {
      var n = normChoice(o);
      return !n || n === 'yes' || n === 'no' || n === 'y' || n === 'n'
        || n === 'haan' || n === 'nahi' || n === 'true' || n === 'false'
        || n === '1' || n === '0';
    });
  }

  /**
   * @param {object} field         — form field descriptor
   * @param {string} plannedValue  — value from profile
   * @param {string} profileKey    — profile key (for record keeping)
   * @returns {{ selector, entry } | null}
   */
  function resolveChoiceToOption(field, plannedValue, profileKey) {
    if (!field || plannedValue == null || String(plannedValue).trim() === '') return null;
    var planned = String(plannedValue).trim();
    var plannedNorm = normChoice(planned);
    var type = field.type || '';
    var opts = field.options || [];
    var isYesNo = looksLikeYesNo(opts);

    // Reject free-text dumps on Yes/No style groups
    if (isYesNo && plannedNorm.length > 8 && !/^(yes|no|true|false|y|n)$/.test(plannedNorm)) return null;
    if (isYesNo && /^\d{8,}$/.test(plannedNorm)) return null;

    // ── radio-group ──
    if (type === 'radio-group' && field.options && field.optionSelectors) {
      var matchedIdx = -1;
      // Exact match
      for (var oi = 0; oi < opts.length; oi++) {
        if (normChoice(opts[oi]) === plannedNorm) { matchedIdx = oi; break; }
      }
      // Partial match (≥70% overlap)
      if (matchedIdx < 0) {
        for (var oi2 = 0; oi2 < opts.length; oi2++) {
          var optN = normChoice(opts[oi2]);
          var shorter = optN.length < plannedNorm.length ? optN : plannedNorm;
          var longer  = optN.length < plannedNorm.length ? plannedNorm : optN;
          if (shorter.length >= 2 && longer.includes(shorter) && shorter.length >= longer.length * 0.7) {
            matchedIdx = oi2; break;
          }
        }
      }
      // Gender synonyms
      if (matchedIdx < 0 && /male|female|other|third|पुरुष|महिला|स्त्री|तृतीय/i.test(planned + opts.join(' '))) {
        var wantFemale = /female|f\b|woman|महिला|स्त्री/.test(planned.toLowerCase());
        var wantMale   = /male|m\b|man|पुरुष/.test(planned.toLowerCase()) && !wantFemale;
        var wantOther  = /other|third|trans|तृतीय/.test(planned.toLowerCase());
        for (var gi = 0; gi < opts.length; gi++) {
          var ol = opts[gi].toLowerCase();
          if (wantFemale && /female|महिला|स्त्री|f\b/.test(ol))              { matchedIdx = gi; break; }
          if (wantMale   && /male|पुरुष|m\b/.test(ol) && !/female|third/.test(ol)) { matchedIdx = gi; break; }
          if (wantOther  && /other|third|trans|तृतीय/.test(ol))               { matchedIdx = gi; break; }
        }
      }
      // Yes/No synonyms
      if (matchedIdx < 0 && isYesNo) {
        var wantYes = /^(yes|y|true|1|haan|हां)$/i.test(planned);
        var wantNo  = /^(no|n|false|0|nahi|नहीं)$/i.test(planned);
        for (var yi = 0; yi < opts.length; yi++) {
          var yn = normChoice(opts[yi]);
          if (wantYes && (yn === 'yes' || yn === 'y' || yn === 'true' || yn === '1' || yn === 'haan')) { matchedIdx = yi; break; }
          if (wantNo  && (yn === 'no'  || yn === 'n' || yn === 'false' || yn === '0' || yn === 'nahi')) { matchedIdx = yi; break; }
        }
      }
      if (matchedIdx < 0 || !field.optionSelectors[matchedIdx]) return null;
      return {
        selector: field.optionSelectors[matchedIdx],
        entry: { value: opts[matchedIdx], type: 'radio-click', profileKey: profileKey || null, label: field.label, matchBy: 'choice-resolve' },
      };
    }

    // ── radio (single) ──
    if (type === 'radio') {
      return {
        selector: field.selector,
        entry: { value: 'true', type: 'radio-click', profileKey: profileKey || null, label: field.label, matchBy: 'choice-resolve' },
      };
    }

    // ── checkbox / mat-checkbox / checkbox-agreement ──
    if (type === 'checkbox' || type === 'mat-checkbox' || type === 'checkbox-agreement') {
      var truthy = /^(yes|y|true|1|checked|on|haan|हां)$/i.test(planned);
      var falsy  = /^(no|n|false|0|off|unchecked|nahi|नहीं)$/i.test(planned);
      if (!truthy && !falsy) return null;
      return {
        selector: field.selector,
        entry: { value: truthy ? 'yes' : 'no', type: type === 'mat-checkbox' ? 'mat-checkbox' : 'checkbox', profileKey: profileKey || null, label: field.label, matchBy: 'choice-resolve' },
      };
    }

    // ── checkbox-group ──
    if (type === 'checkbox-group' && field.options && field.optionSelectors) {
      if (!/^(yes|no|y|n|true|false|1|0|on|off|checked)$/i.test(planned) && plannedNorm.length > 6) return null;
      var wantCheck = /^(yes|y|true|1|on|checked|haan|हां)$/i.test(planned);
      if (!wantCheck) return null;
      var cIdx = -1;
      for (var ci = 0; ci < opts.length; ci++) {
        if (normChoice(opts[ci]) === plannedNorm) { cIdx = ci; break; }
      }
      if (cIdx < 0 && field.optionSelectors.length >= 1) cIdx = 0;
      if (cIdx < 0) return null;
      return {
        selector: field.optionSelectors[cIdx],
        entry: { value: 'yes', type: 'checkbox', profileKey: profileKey || null, label: field.label, matchBy: 'choice-resolve' },
      };
    }

    return null;
  }

  root.CcResolveChoice = { resolveChoiceToOption: resolveChoiceToOption };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcResolveChoice;

/* ==== decide-conditional.js ==== */
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

if (typeof module !== 'undefined') module.exports = root.CcDecideConditional;

/* ==== fuzzy-match.js ==== */
/**
 * fuzzy-match — Label-primary alias matching loop
 *
 * Main mapper engine. Iterates formFields, computes label-primary identity,
 * matches against field aliases, and produces a selector→entry mapping.
 * Includes three post-passes:
 *   1. Unmapped conditional choice groups
 *   2. Verify/confirm/re-type twin fields mirror their primary
 *   3. Split DOB fields (DD / MM / YYYY)
 *
 * Depends on: CcFieldAliases, CcFieldIdent, CcResolveChoice, CcDecideConditional
 *
 * Public API (on globalThis.CcFuzzyMatch):
 *   fuzzyMatch(formFields, profile) => mapping
 *
 * See docs/fuzzy-match.md for full documentation.
 */
(function (root) {
  'use strict';

  function fuzzyMatch(formFields, profile) {
    var _fa  = root.CcFieldAliases       || {};
    var _fi  = root.CcFieldIdent         || {};
    var _rc  = root.CcResolveChoice      || {};
    var _dc  = root.CcDecideConditional  || {};

    var fieldAliases           = _fa.getFieldAliases ? _fa.getFieldAliases() : {};
    var labelPrimaryIdent      = _fi.labelPrimaryIdent  || function (f) { return { ident: (f.label||'').toLowerCase(), matchBy: 'label', labelEn: '', labelRaw: '', labelStrong: true }; };
    var normalizeIdent         = _fi.normalizeIdent     || function (s) { return String(s||'').toLowerCase().replace(/\W+/g,'_'); };
    var normChoice             = _fi.normChoice         || function (s) { return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); };
    var resolveChoiceToOption  = _rc.resolveChoiceToOption  || function () { return null; };
    var decideConditionalChoice = _dc.decideConditionalChoice || function () { return null; };

    var mapping = {};

    // Name parts
    var firstName  = profile.first_name  || '';
    var middleName = profile.middle_name || '';
    var lastName   = profile.last_name   || '';
    if (!firstName && profile.name) {
      var nameParts = (profile.name || '').trim().split(/\s+/);
      firstName  = nameParts[0] || '';
      lastName   = nameParts.length >= 2 ? nameParts[nameParts.length - 1] : '';
      middleName = nameParts.length >= 3 ? nameParts.slice(1, -1).join(' ') : '';
    }

    for (var fi = 0; fi < formFields.length; fi++) {
      var field = formFields[fi];
      var _li = labelPrimaryIdent(field);
      var ident   = _li.ident;
      var matchBy = _li.matchBy;

      // Skip twin (verify/retype/confirm) fields — mirrored in post-pass
      var rawLbl = (field.label || '').trim();
      var isTwin = /^(?:[a-z]\.|\d+\.|\(\w\)|[ixv]+\.)?\s*(?:verify|re[\s_-]*type|re[\s_-]*enter|confirm|repeat)\b/i.test(rawLbl)
                || /retype|re_type|reenter|re_enter|^confirm/i.test(ident)
                || (field.id   && /^(conf|c_|re_|retype|verify|confirm)/i.test(field.id))
                || (field.name && /^(re_|retype|verify|confirm)/i.test(field.name));
      if (isTwin) continue;

      // Conditional radios
      if (field.type === 'radio' || field.type === 'radio-group') {
        var condDecision = decideConditionalChoice(field, profile);
        if (condDecision) {
          var resolvedCond = resolveChoiceToOption(field, condDecision, null);
          if (resolvedCond) { mapping[resolvedCond.selector] = resolvedCond.entry; continue; }
        }
      }

      // Auto-check agreement checkboxes
      if (field.type === 'checkbox' || field.type === 'mat-checkbox') {
        var labelText  = (field.label || '').toLowerCase();
        var isAgreement = /\bi\s+(confirm|agree|accept|declare|certify|acknowledge|consent|understand)|consent|terms\s+and\s+conditions|self[\s_-]?declaration|^agree$|^accept$|^confirm$/i.test(labelText)
          || /i_(confirm|agree|accept|declare|certify|acknowledge|consent|understand)|^agree$|^accept$|^confirm$|consent|self_declaration/i.test(ident);
        var fieldNameId = (field.name || '') + ' ' + (field.id || '');
        var isAgreeByName = /\b(agree|accept|consent|confirm|declar|tnc|terms)\b/i.test(fieldNameId);
        if (isAgreement || isAgreeByName) { mapping[field.selector] = { value: 'yes', type: field.type, matchBy: matchBy, profileKey: null }; continue; }
        continue;
      }

      // File inputs
      if (field.type === 'file') {
        var fileAliases = {
          photo:        ['photo','photograph','passport photo','applicant photo','image','profile photo','customer photograph'],
          signature:    ['signature','sign','applicant signature','digital signature'],
          aadhaar_doc:  ['aadhaar','aadhar','aadhaar document','aadhaar card','uid'],
          pan_doc:      ['pan','pan card','pan document'],
          certificate:  ['certificate','marksheet','mark sheet','passing certificate','degree certificate'],
          resume:       ['resume','cv','curriculum vitae','bio data'],
          passport_doc: ['passport','passport document'],
          license_doc:  ['driving license','licence','dl'],
          utility_bill: ['utility bill','electricity bill','address proof'],
        };
        var fileLabelLower = (field.label || '').toLowerCase();
        var fileIdentLower = ident.toLowerCase();
        for (var fk in fileAliases) {
          if (!profile[fk]) continue;
          var fileHit = fileAliases[fk].some(function (a) {
            return fileLabelLower.includes(a) || (matchBy !== 'label' && fileIdentLower.includes(a.replace(/\s+/g, '_')));
          });
          if (fileHit) { mapping[field.selector] = { value: profile[fk], type: 'file', matchBy: matchBy, profileKey: fk }; break; }
        }
        continue;
      }

      var isFatherMother = ident.includes('father') || ident.includes('mother') || ident.includes('pita') || ident.includes('mata');
      var isStateDistrict = ident.includes('state') || ident.includes('district') || ident.includes('rajya') || ident.includes('jila');

      // Education row detection
      var _hasName = ident.includes('name');
      var _isRelativeName = ident.includes('father') || ident.includes('mother') || ident.includes('husband') || ident.includes('spouse') || ident.includes('guardian');
      var isCandidateNameField = _hasName && !_isRelativeName && (ident.includes('candidate') || ident.includes('applicant') || ident.includes('student') || ident.includes('full_name') || ident.includes('your_name') || /^name/.test(ident) || ident.includes('_name_as_per'));
      var isHighestEduField = ident.includes('highest');
      var isEducationRow = !isCandidateNameField && !isHighestEduField && (ident.includes('matric') || ident.includes('10th') || ident.includes('12th') || ident.includes('graduation') || ident.includes('diploma') || ident.includes('board') || ident.includes('university') || ident.includes('certificate') || ident.includes('year_of') || ident.includes('percentage') || ident.includes('subject') || ident.includes('inter_roll'));

      if (isEducationRow) {
        var eduAliases = {
          board_10th:        ['board_10th','board_matric','board_class10','10th_board','matric_board','boardname_hs','ddl_boardname_hs','matriculation_10th_class_education_board','matriculation_class_education_board','class_10th_education_board','10th_class_education_board','matriculation_education_board','tenth_class_education_board','class_x_education_board','sslc_education_board'],
          board_12th:        ['board_12th','board_inter','board_class12','12th_board','inter_board','intermediate_education_board','class_12th_education_board','12th_class_education_board','twelfth_education_board','class_xii_education_board','plus_two_education_board','hsc_education_board'],
          roll_number_10th:  ['roll_number_10th','roll_no_10th','roll_10th','roll_matric','matric_roll','10th_roll','matriculation_roll_number','matriculation_10th_class_roll_number','class_10_roll_number','tenth_roll_number','sslc_roll_number'],
          roll_number_12th:  ['roll_number_12th','roll_no_12th','roll_12th','roll_inter','inter_roll','12th_roll','intermediate_roll_number','class_12_roll_number','twelfth_roll_number','hsc_roll_number','plus_two_roll_number'],
          passing_year_10th: ['passing_year_10th','year_10th','year_matric','matric_year','10th_year','year_of_passing_10','yearofpassing_hs','ddl_yearofpassing_hs','matriculation_year_of_passing','matriculation_10th_class_year_of_passing','class_10_year_of_passing','tenth_year_of_passing'],
          passing_year_12th: ['passing_year_12th','year_12th','year_inter','inter_year','12th_year','year_of_passing_12','intermediate_year_of_passing','class_12_year_of_passing','twelfth_year_of_passing'],
          marks_10th:        ['marks_10th','percentage_10th','10th_marks','matric_marks','10th_percentage'],
          marks_12th:        ['marks_12th','percentage_12th','12th_marks','inter_marks','12th_percentage'],
          school_name:       ['school_name','school','institution_10','matric_school'],
          college_name:      ['college_name','college','institution_12','inter_college'],
          university_name:   ['university_name','university','institution_grad','college_grad','institution_name'],
          roll_no_graduation:['roll_no_graduation','roll_grad','graduation_roll','degree_roll'],
          year_of_passing:   ['year_of_passing','passing_year','year_pass','year_graduation','grad_year'],
          grade:             ['grade','grade_system','grading','cgpa','gpa','division','class_obtained'],
          degree_name:       ['degree_name','degree','qualification','course_name','programme'],
          marks_graduation:  ['marks_graduation','percentage_grad','grad_marks','grad_percentage'],
        };
        var eduMatched = false;
        for (var ek in eduAliases) {
          if (!profile[ek]) continue;
          if (eduAliases[ek].some(function (a) { return ident.includes(a); })) {
            mapping[field.selector] = { value: profile[ek], type: field.type, matchBy: matchBy, profileKey: ek };
            eduMatched = true; break;
          }
        }
        continue;
      }

      // Skip Hindi / changed name / retype
      if (ident.includes('hindi') || ident.includes('_hindi') || (field.label||'').includes('हिंदी') || (field.label||'').includes('(Hindi)')) continue;
      var isChangedName = ident.includes('new_name') || ident.includes('changed_name') || ident.includes('newname') || ident.includes('changedname') || (field.label||'').toLowerCase().includes('new name') || (field.label||'').toLowerCase().includes('changed name');
      if (isChangedName && !profile.changed_name) continue;

      // Granular name fields
      if (!isFatherMother) {
        if (ident.includes('first_name') || ident.includes('firstname') || ident === 'fname') {
          if (firstName) { mapping[field.selector] = { value: firstName, type: field.type, matchBy: matchBy, profileKey: 'first_name' }; continue; }
        }
        if (ident.includes('last_name') || ident.includes('lastname') || ident === 'lname' || ident.includes('surname')) {
          if (lastName) { mapping[field.selector] = { value: lastName, type: field.type, matchBy: matchBy, profileKey: 'last_name' }; continue; }
        }
        if (ident.includes('middle_name') || ident.includes('middlename')) {
          mapping[field.selector] = { value: middleName, type: field.type, matchBy: matchBy, profileKey: 'middle_name' }; continue;
        }
      }

      // DOB split fields
      if (profile.dob) {
        var dobParts = profile.dob.split('/');
        var dobDay = dobParts[0], dobMonth = dobParts[1], dobYear = dobParts[2];
        var monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
        var monthShort = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var monthNum = parseInt(dobMonth);
        var selLower = matchBy === 'dom-fallback' ? (field.selector || '').toLowerCase() : '';
        if (ident.includes('day') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || ident.replace(/[_\s]/g,'') === 'day' || selLower.includes('ddl_day') || selLower.includes('_day'))) {
          mapping[field.selector] = { value: parseInt(dobDay).toString(), type: field.type, matchBy: matchBy, profileKey: 'dob' }; continue;
        }
        if (ident.includes('month') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || new Set(ident.split(/[_\s]+/).filter(Boolean)).size === 1 || selLower.includes('ddl_month') || selLower.includes('_month'))) {
          var monthVal = field.type === 'select' ? monthNames[monthNum] : dobMonth;
          mapping[field.selector] = { value: monthVal, type: field.type, monthNum: monthNum, monthShort: monthShort[monthNum], matchBy: matchBy, profileKey: 'dob' }; continue;
        }
        if (ident.includes('year') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || new Set(ident.split(/[_\s]+/).filter(Boolean)).size === 1 || selLower.includes('ddl_year') || selLower.includes('_year'))) {
          mapping[field.selector] = { value: dobYear, type: field.type, matchBy: matchBy, profileKey: 'dob' }; continue;
        }
        if ((field.placeholder === 'dd-mm-yyyy' || field.placeholder === 'DD-MM-YYYY' || /^dd[-/]mm[-/]yyyy$/i.test(field.label||''))) {
          mapping[field.selector] = { value: profile.dob.split('/').join('-'), type: field.type, matchBy: 'label', profileKey: 'dob' }; continue;
        }
        if (ident.includes('dob') || ident.includes('date_of_birth') || ident.includes('dateofbirth') || ident.includes('birth_date') || (ident.includes('date') && ident.includes('birth'))) {
          var sep = (field.placeholder || '').includes('-') ? '-' : '/';
          mapping[field.selector] = { value: dobDay + sep + dobMonth + sep + dobYear, type: field.type, matchBy: matchBy, profileKey: 'dob' }; continue;
        }
      }

      // Alias match — longest alias wins
      var bestKey = null, bestAliasLen = -1;
      for (var profileKey in fieldAliases) {
        if (!profile[profileKey]) continue;
        if (profileKey === 'name' && (isFatherMother || isStateDistrict)) continue;
        if (profileKey === 'name' && (ident.includes('first_name') || ident.includes('firstname') || ident.includes('last_name') || ident.includes('lastname') || ident.includes('surname') || ident.includes('middle_name') || ident.includes('middlename'))) continue;
        if (profileKey === 'father_name' && !isFatherMother) continue;
        if (profileKey === 'mother_name' && !(ident.includes('mother') || ident.includes('mata'))) continue;
        if (profileKey === 'name' && (ident.includes('husband') || ident.includes('wife') || ident.includes('spouse') || ident.includes('guardian') || ident.includes('pati') || ident.includes('pita_pati'))) continue;
        if ((profileKey === 'post_office' || profileKey === 'village') && (ident.includes('purpose') || ident.includes('uddeshya') || (ident.includes('apply') && ident.includes('office')))) continue;
        if (profileKey === 'degree_name' && ident.includes('highest')) continue;

        if (field.type === 'radio' || field.type === 'radio-group') {
          var groupIdent = normalizeIdent([field.label, field.name, field.id].filter(Boolean).join(' '));
          var groupMatches = fieldAliases[profileKey].some(function (a) { return groupIdent.includes(a.replace(/[^a-z0-9]/g, '')); });
          if (!groupMatches && profileKey === 'gender' && field.options) {
            groupMatches = /gender|sex|ling|male|female|पुरुष|महिला|स्त्री|तृतीय/.test(groupIdent + ' ' + field.options.join(' ').toLowerCase());
          }
          if (!groupMatches) continue;
          var resolved = resolveChoiceToOption(field, profile[profileKey], profileKey);
          if (resolved) { resolved.entry.matchBy = matchBy; mapping[resolved.selector] = resolved.entry; }
          continue;
        }
        if (field.type === 'checkbox-group') continue;

        var aliases = fieldAliases[profileKey];
        for (var ai = 0; ai < aliases.length; ai++) {
          var alias = aliases[ai];
          if (!alias || alias.length < 2) continue;
          if (ident.includes(alias) && alias.length > bestAliasLen) { bestAliasLen = alias.length; bestKey = profileKey; }
        }
      }
      if (bestKey) {
        if (field.type === 'radio' || field.type === 'radio-group' || field.type === 'checkbox-group') {
          var bestResolved = resolveChoiceToOption(field, profile[bestKey], bestKey);
          if (bestResolved) { bestResolved.entry.matchBy = matchBy; mapping[bestResolved.selector] = bestResolved.entry; }
        } else {
          mapping[field.selector] = { value: profile[bestKey], type: field.type, matchBy: matchBy, profileKey: bestKey, label: field.label || null };
        }
      }
    }

    // ── Post-pass 1: unmapped conditional choice groups ──
    function choiceAlreadyMapped(f) {
      if (mapping[f.selector]) return true;
      if (f.optionSelectors) { for (var si = 0; si < f.optionSelectors.length; si++) { if (mapping[f.optionSelectors[si]]) return true; } }
      return false;
    }
    for (var pi = 0; pi < formFields.length; pi++) {
      var pf = formFields[pi];
      if (!(pf.type === 'radio' || pf.type === 'radio-group' || pf.type === 'checkbox-group' || pf.type === 'checkbox' || pf.type === 'mat-checkbox' || pf.type === 'checkbox-agreement')) continue;
      if (choiceAlreadyMapped(pf)) continue;
      var decision = decideConditionalChoice(pf, profile);
      if (!decision) continue;
      var resolvedPost = resolveChoiceToOption(pf, decision, null);
      if (resolvedPost) { resolvedPost.entry.matchBy = 'conditional-post'; mapping[resolvedPost.selector] = resolvedPost.entry; }
    }

    // ── Post-pass 2: verify/confirm/re-type twin fields mirror their primary ──
    var TWIN_PREFIX_RE = /^(?:[a-z]\.|\d+\.|\(\w\)|[i-x]+\.)?\s*(?:verify|re[\s_-]*type|re[\s_-]*enter|confirm|repeat)\b[\s:_-]*/i;
    function normLabel(s) {
      return (s || '').toLowerCase().replace(/^\s*(?:\d+\.|[a-z]\.|\([a-z0-9]+\)|[ixv]+\.)\s*/i, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    for (var ti = 0; ti < formFields.length; ti++) {
      var tf = formFields[ti];
      if (mapping[tf.selector]) continue;
      var rawLabel = (tf.label || '').trim();
      if (!rawLabel || !TWIN_PREFIX_RE.test(rawLabel)) continue;
      var primaryLabel = rawLabel.replace(TWIN_PREFIX_RE, '').trim();
      var primaryNorm = normLabel(primaryLabel);
      if (!primaryNorm) continue;
      var primaryField = formFields.find(function (f) { return mapping[f.selector] && f.selector !== tf.selector && normLabel(f.label || '') === primaryNorm; });
      if (!primaryField) {
        primaryField = formFields.find(function (f) {
          if (!mapping[f.selector] || f.selector === tf.selector) return false;
          var fNorm = normLabel(f.label || '');
          return fNorm && primaryNorm && (fNorm.includes(primaryNorm) || primaryNorm.includes(fNorm));
        });
      }
      if (primaryField) mapping[tf.selector] = { value: mapping[primaryField.selector].value, type: tf.type };
    }

    // ── Post-pass 3: split DOB fields (DD / MM / YYYY) ──
    if (profile.dob) {
      var dobStr = String(profile.dob).trim();
      var m1 = dobStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      var m2 = dobStr.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
      var dp = null;
      if (m1) dp = { day: m1[1].padStart(2,'0'), month: m1[2].padStart(2,'0'), year: m1[3] };
      else if (m2) dp = { day: m2[3].padStart(2,'0'), month: m2[2].padStart(2,'0'), year: m2[1] };
      if (dp) {
        for (var di = 0; di < formFields.length; di++) {
          var df = formFields[di];
          if (mapping[df.selector]) continue;
          var lbl = (df.label||'').trim(), idn = (df.id||df.name||'').toLowerCase(), ph = (df.placeholder||'').trim();
          var isDay   = /^dd$|^day$|day_of_birth|dob_day|birth_day/i.test(lbl) || /^dd$|^day$/i.test(ph) || /(?:^|[^a-z])(dob_?day|birth_?day|day_of_birth)(?:[^a-z]|$)/.test(idn);
          var isMonth = /^mm$|^month$|month_of_birth|dob_month|birth_month/i.test(lbl) || /^mm$|^month$/i.test(ph) || /(?:^|[^a-z])(dob_?month|birth_?month|month_of_birth)(?:[^a-z]|$)/.test(idn);
          var isYear  = /^yyyy$|^year$|year_of_birth|dob_year|birth_year/i.test(lbl) || /^yyyy$|^year$/i.test(ph) || /(?:^|[^a-z])(dob_?year|birth_?year|year_of_birth)(?:[^a-z]|$)/.test(idn);
          if (isDay)   mapping[df.selector] = { value: dp.day,   type: df.type, profileKey: 'dob' };
          else if (isMonth) mapping[df.selector] = { value: dp.month, type: df.type, profileKey: 'dob' };
          else if (isYear)  mapping[df.selector] = { value: dp.year,  type: df.type, profileKey: 'dob' };
        }
      }
    }

    return mapping;
  }

  root.CcFuzzyMatch = { fuzzyMatch: fuzzyMatch };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcFuzzyMatch;

/* ==== ai-match.js ==== */
/**
 * ai-match — LLM-based fallback field mapper
 *
 * Sends form fields and profile to an LLM (via window.ccLLM) and parses
 * the returned JSON index map into a selector→entry mapping. Applies the
 * same semantic guards as fuzzyMatch (father/mother/relative constraints).
 *
 * Public API (on globalThis.CcAiMatch):
 *   aiMatch(formFields, profile, groqKey, llmBaseUrl, llmModel) => Promise<mapping>
 *
 * See docs/ai-match.md for full documentation.
 */
(function (root) {
  'use strict';

  async function aiMatch(formFields, profile, groqKey, llmBaseUrl, llmModel) {
    var fieldDescriptions = formFields.map(function (f, i) {
      return i + ': label="' + (f.label||'') + '" id="' + (f.id||'') + '" name="' + (f.name||'') + '" placeholder="' + (f.placeholder||'') + '"';
    }).join('\n');

    var profileKeys = Object.entries(profile)
      .filter(function (kv) { return kv[1] && kv[0] !== 'phone' && kv[0] !== 'updatedAt'; })
      .map(function (kv) { return kv[0] + ': "' + kv[1] + '"'; }).join('\n');

    var prompt = 'You are a form field mapper. Given form fields and a student profile, return a JSON object mapping field index to profile key.\n\nRULES:\n- Return ONLY a valid JSON object, nothing else\n- Map each field to the profile key whose VALUE should fill that field\n- "first name" fields \u2192 use "first_name" profile key\n- "last name" / "surname" fields \u2192 use "last_name" profile key\n- "middle name" fields \u2192 use "middle_name" profile key\n- "full name" / "candidate name" fields \u2192 use "name" profile key\n- Separate day/month/year dropdowns \u2192 use "dob__day", "dob__month", "dob__year"\n- Single "date of birth" text field \u2192 use "dob"\n- For address parts: use "village", "post_office", "police_station", "block", "sub_division", "district", "state", "pincode" as available\n- Only use "address" for full address text fields\n- Confirm/retype fields \u2192 same key as primary field\n- Skip: captcha, OTP, verification code, password\n- Use EXACT profile key names from the list below\n\nForm fields:\n' + fieldDescriptions + '\n\nAvailable profile keys and values:\n' + profileKeys + '\n\nReturn JSON only: {"0": "name", "2": "dob", "5": "first_name", "7": "district"}';

    try {
      var result = await window.ccLLM.call({
        apiKey: groqKey,
        baseUrl: llmBaseUrl,
        model: llmModel,
        systemPrompt: 'You are a JSON-only API. Return ONLY valid JSON objects. No explanations, no markdown, no text before or after the JSON.',
        userPrompt: prompt,
        maxTokens: 300,
      });
      if (result.error) return {};
      var indexMap = window.ccLLM.parseJSON(result.text);
      if (!indexMap) return {};

      var mapping = {};
      var nameParts = (profile.name || '').trim().split(/\s+/);
      var dobParts  = (profile.dob  || '').split('/');
      var months = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

      for (var idx in indexMap) {
        var field      = formFields[parseInt(idx)];
        var profileKey = indexMap[idx];
        if (!field) continue;

        var value = null;
        if      (profileKey === 'name__first')  value = profile.first_name  || nameParts[0] || '';
        else if (profileKey === 'name__last')   value = profile.last_name   || nameParts[nameParts.length-1] || '';
        else if (profileKey === 'name__middle') value = profile.middle_name || (nameParts.length >= 3 ? nameParts.slice(1,-1).join(' ') : '');
        else if (profileKey === 'dob__day')     value = dobParts[0] || '';
        else if (profileKey === 'dob__month') {
          var mn = parseInt(dobParts[1] || '0');
          value = months[mn] || dobParts[1] || '';
        }
        else if (profileKey === 'dob__year')    value = dobParts[2] || '';
        else if (profile[profileKey])           value = profile[profileKey];

        if (value === null || value === undefined) continue;

        // Semantic guards — same constraints as fuzzyMatch
        var fieldIdent = [field.label, field.id, field.name, field.placeholder]
          .filter(Boolean).join(' ').toLowerCase().replace(/[-\s:*()'./]/g, '_');
        var isRelativeField = /husband|wife|spouse|guardian|pati(?!_pati_ka_naam)/i.test(fieldIdent);
        var isFatherField   = /father|pita/i.test(fieldIdent);
        var isMotherField   = /mother|mata/i.test(fieldIdent);

        if (profileKey === 'name' && (isRelativeField || isFatherField || isMotherField)) continue;
        if ((profileKey === 'name' || profileKey === 'first_name' || profileKey === 'last_name' || profileKey === 'middle_name') && isRelativeField) continue;
        if (profileKey === 'father_name' && !isFatherField) continue;
        if (profileKey === 'mother_name' && !isMotherField) continue;

        mapping[field.selector] = { value: value, type: field.type };
      }
      return mapping;
    } catch (e) { return {}; }
  }

  root.CcAiMatch = { aiMatch: aiMatch };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcAiMatch;

/* ==== mapper-api.js ==== */
/**
 * Mapper facade — thin wrapper over CcMapper* capabilities.
 *
 * Parts under autofill/mapper/capabilities/ are injected before this file.
 * Public API unchanged:
 *   fuzzyMatch(formFields, profile) => mapping
 *   aiMatch(formFields, profile, groqKey, llmBaseUrl, llmModel) => Promise<mapping>
 *   resolveChoiceToOption(field, plannedValue, profileKey) => {selector,entry}|null
 *   decideConditionalChoice(field, profile) => string|null
 */

function fuzzyMatch(formFields, profile) {
  var _fm = globalThis.CcFuzzyMatch || {};
  if (_fm.fuzzyMatch) return _fm.fuzzyMatch(formFields, profile);
  return {};
}

async function aiMatch(formFields, profile, groqKey, llmBaseUrl, llmModel) {
  var _am = globalThis.CcAiMatch || {};
  if (_am.aiMatch) return _am.aiMatch(formFields, profile, groqKey, llmBaseUrl, llmModel);
  return {};
}

function resolveChoiceToOption(field, plannedValue, profileKey) {
  var _rc = globalThis.CcResolveChoice || {};
  if (_rc.resolveChoiceToOption) return _rc.resolveChoiceToOption(field, plannedValue, profileKey);
  return null;
}

function decideConditionalChoice(field, profile) {
  var _dc = globalThis.CcDecideConditional || {};
  if (_dc.decideConditionalChoice) return _dc.decideConditionalChoice(field, profile);
  return null;
}

// Expose for fill-orchestrator saved-map path
if (typeof window !== 'undefined') {
  window.ccResolveChoiceToOption = resolveChoiceToOption;
  window.ccDecideConditionalChoice = decideConditionalChoice;
}

/* ==== mapper.js (facade) ==== */
