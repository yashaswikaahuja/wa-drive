// ── Fuzzy matching ────────────────────────────────────────────────────────────
// Server-resolved field mappings (injected by background.js/popup.js from cache)
// take precedence over hardcoded FIELD_ALIASES. Merge server mappings on top.
function _getFieldAliases() {
  var merged = Object.assign({}, FIELD_ALIASES);
  var server = (typeof window !== 'undefined' && window._ccServerFieldMappings) || null;
  if (server && Array.isArray(server)) {
    for (var i = 0; i < server.length; i++) {
      var m = server[i];
      if (m.semantic_key && m.match_patterns) {
        // Server patterns augment (or create) the alias entry
        if (!merged[m.semantic_key]) {
          merged[m.semantic_key] = m.match_patterns.slice();
        } else {
          // Merge: add patterns not already present
          var existing = new Set(merged[m.semantic_key]);
          for (var j = 0; j < m.match_patterns.length; j++) {
            if (!existing.has(m.match_patterns[j])) {
              merged[m.semantic_key].push(m.match_patterns[j]);
            }
          }
        }
      }
    }
  }
  return merged;
}

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
  // Generic roll number — Sandhya's profile.roll_number is from 10th cert.
  // Earlier this was excluded to avoid education-table fields, but in practice
  // most "Roll Number" labels are top-level identity fields. We restore it.
  roll_number:         ['roll_number','roll_no','rollno','rollnumber','roll'],
  // 10th/12th board fields — atomic terms that match labels like "8. Matriculation (10th class) Education Board"
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
  // roll_number intentionally excluded to avoid filling education table fields
};

/**
 * LABEL-PRIMARY identity for matching.
 * DOM id/name ("78171", "field_1_1", "txt1") are unstable and often wrong vs the
 * printed label ("District", "Email of Applicant"). Selector is only used later
 * as the fill *target*, never as the semantic key when a real label exists.
 */
function _normalizeIdent(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[-\s:*()'./\\]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function _labelPrimaryIdent(field) {
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
  // Placeholder only as soft hint (never stronger than label)
  if (field.placeholder && String(field.placeholder).trim().length > 2) {
    parts.push(String(field.placeholder).trim());
  }
  // Always include name/id lightly so groups labeled only "Yes" still see "changed"/"isAddressSame"
  if (field.name) parts.push(String(field.name));
  if (field.id) parts.push(String(field.id));
  var ident = _normalizeIdent(parts.join(' '));
  if (!labelStrong) {
    // Weak/missing label — last resort: DOM keys (logged as dom-fallback)
    matchBy = 'dom-fallback';
    var domBits = [field.placeholder, field.id, field.name].filter(Boolean).join(' ');
    ident = _normalizeIdent((ident ? ident + ' ' : '') + domBits);
  }
  return { ident: ident, matchBy: matchBy, labelEn: en, labelRaw: raw, labelStrong: labelStrong };
}

/** Normalize for option compare. */
function _normChoice(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve a planned value onto a specific radio/checkbox option.
 * ALWAYS returns type radio-click / checkbox (never leave type=radio-group for executor).
 * Returns null if no option matches (do not dump free-text onto the group).
 */
function resolveChoiceToOption(field, plannedValue, profileKey) {
  if (!field || plannedValue == null || String(plannedValue).trim() === '') return null;
  var planned = String(plannedValue).trim();
  var plannedNorm = _normChoice(planned);
  var type = field.type || '';

  // Reject free-text dumps on Yes/No style groups (address/aadhaar onto radio)
  var opts = field.options || [];
  var looksYesNo = opts.length > 0 && opts.every(function (o) {
    var n = _normChoice(o);
    return !n || n === 'yes' || n === 'no' || n === 'y' || n === 'n' || n === 'haan' || n === 'nahi'
      || n === 'true' || n === 'false' || n === '1' || n === '0';
  });
  if (looksYesNo && plannedNorm.length > 8 && !/^(yes|no|true|false|y|n)$/.test(plannedNorm)) {
    return null;
  }
  if (looksYesNo && /^\d{8,}$/.test(plannedNorm)) return null; // aadhaar etc.

  if (type === 'radio-group' && field.options && field.optionSelectors) {
    var matchedIdx = -1;
    for (var oi = 0; oi < field.options.length; oi++) {
      if (_normChoice(field.options[oi]) === plannedNorm) { matchedIdx = oi; break; }
    }
    if (matchedIdx < 0) {
      for (var oi2 = 0; oi2 < field.options.length; oi2++) {
        var optText2 = _normChoice(field.options[oi2]);
        var shorter = optText2.length < plannedNorm.length ? optText2 : plannedNorm;
        var longer = optText2.length < plannedNorm.length ? plannedNorm : optText2;
        if (shorter.length >= 2 && longer.includes(shorter) && shorter.length >= longer.length * 0.7) {
          matchedIdx = oi2; break;
        }
      }
    }
    // Gender synonyms
    if (matchedIdx < 0 && /male|female|other|third|पुरुष|महिला|स्त्री|तृतीय/i.test(planned + opts.join(' '))) {
      var wantFemale = /female|f\b|woman|महिला|स्त्री/.test(planned.toLowerCase());
      var wantMale = /male|m\b|man|पुरुष/.test(planned.toLowerCase()) && !wantFemale;
      var wantOther = /other|third|trans|तृतीय/.test(planned.toLowerCase());
      for (var gi = 0; gi < opts.length; gi++) {
        var ol = opts[gi].toLowerCase();
        if (wantFemale && /female|महिला|स्त्री|f\b/.test(ol)) { matchedIdx = gi; break; }
        if (wantMale && /male|पुरुष|m\b/.test(ol) && !/female|third/.test(ol)) { matchedIdx = gi; break; }
        if (wantOther && /other|third|trans|तृतीय/.test(ol)) { matchedIdx = gi; break; }
      }
    }
    // Yes/No synonyms
    if (matchedIdx < 0 && looksYesNo) {
      var wantYes = /^(yes|y|true|1|haan|हां)$/i.test(planned);
      var wantNo = /^(no|n|false|0|nahi|नहीं)$/i.test(planned);
      for (var yi = 0; yi < opts.length; yi++) {
        var yn = _normChoice(opts[yi]);
        if (wantYes && (yn === 'yes' || yn === 'y' || yn === 'true' || yn === '1' || yn === 'haan')) { matchedIdx = yi; break; }
        if (wantNo && (yn === 'no' || yn === 'n' || yn === 'false' || yn === '0' || yn === 'nahi')) { matchedIdx = yi; break; }
      }
    }
    if (matchedIdx < 0 || !field.optionSelectors[matchedIdx]) return null;
    return {
      selector: field.optionSelectors[matchedIdx],
      entry: {
        value: field.options[matchedIdx],
        type: 'radio-click',
        profileKey: profileKey || null,
        label: field.label,
        matchBy: 'choice-resolve',
      },
    };
  }

  if (type === 'radio') {
    return {
      selector: field.selector,
      entry: {
        value: 'true',
        type: 'radio-click',
        profileKey: profileKey || null,
        label: field.label,
        matchBy: 'choice-resolve',
      },
    };
  }

  if (type === 'checkbox' || type === 'mat-checkbox' || type === 'checkbox-agreement') {
    var truthy = /^(yes|y|true|1|checked|on|haan|हां)$/i.test(planned);
    var falsy = /^(no|n|false|0|off|unchecked|nahi|नहीं)$/i.test(planned);
    if (!truthy && !falsy) return null;
    return {
      selector: field.selector,
      entry: {
        value: truthy ? 'yes' : 'no',
        type: type === 'mat-checkbox' ? 'mat-checkbox' : 'checkbox',
        profileKey: profileKey || null,
        label: field.label,
        matchBy: 'choice-resolve',
      },
    };
  }

  if (type === 'checkbox-group' && field.options && field.optionSelectors) {
    // Reject free-text dumps (aadhaar/address) onto checkbox groups
    if (!/^(yes|no|y|n|true|false|1|0|on|off|checked)$/i.test(planned) && plannedNorm.length > 6) {
      return null;
    }
    var wantCheck = /^(yes|y|true|1|on|checked|haan|हां)$/i.test(planned);
    var wantUncheck = /^(no|n|false|0|off|unchecked|nahi|नहीं)$/i.test(planned);
    var cIdx = -1;
    for (var ci = 0; ci < field.options.length; ci++) {
      if (_normChoice(field.options[ci]) === plannedNorm) { cIdx = ci; break; }
    }
    // Declaration groups often have a single option labeled "on" / empty — check first on Yes
    if (cIdx < 0 && wantCheck && field.optionSelectors.length >= 1) cIdx = 0;
    if (cIdx < 0 || !wantCheck) return null;
    if (wantUncheck) return null; // leave unchecked
    return {
      selector: field.optionSelectors[cIdx],
      entry: {
        value: 'yes',
        type: 'checkbox',
        profileKey: profileKey || null,
        label: field.label,
        matchBy: 'choice-resolve',
      },
    };
  }

  return null;
}

/**
 * Decide Yes/No (or option) for conditional radio/checkbox groups from profile flags.
 */
function decideConditionalChoice(field, profile) {
  var ident = _labelPrimaryIdent(field).ident;
  var label = String(field.label || '').toLowerCase();
  var nameId = ((field.name || '') + ' ' + (field.id || '')).toLowerCase();
  var blob = ident + ' ' + label + ' ' + nameId;

  // Changed name? → No unless profile.changed_name set
  if (/changed|new_name|name_change|whether.*name/.test(blob)) {
    return profile.changed_name ? 'Yes' : 'No';
  }
  // Same address?
  if (/address.?same|same.?address|isaddresssame|correspondence.?same/.test(blob)) {
    if (profile.same_address != null) return /^(yes|true|1)$/i.test(String(profile.same_address)) ? 'Yes' : 'No';
    return 'Yes'; // default: same as permanent
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
  // Aadhaar declaration / consent checkboxes
  if (/aadhar.?declar|aadhaar.?declar|declaration|consent|i_agree|i agree|confirm.*information/.test(blob)) {
    return 'Yes';
  }
  // Gender — use profile
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

/** Expose for fill-orchestrator saved-map path */
if (typeof window !== 'undefined') {
  window.ccResolveChoiceToOption = resolveChoiceToOption;
  window.ccDecideConditionalChoice = decideConditionalChoice;
}

function fuzzyMatch(formFields, profile) {
  var mapping = {};
  // Resolve field aliases (server-synced + local hardcoded, merged)
  var fieldAliases = _getFieldAliases();
  // Use granular name fields if available, else split full name
  var firstName = profile.first_name || '';
  var middleName = profile.middle_name || '';
  var lastName = profile.last_name || '';
  if (!firstName && profile.name) {
    var nameParts = (profile.name || '').trim().split(/\s+/);
    firstName = nameParts[0] || '';
    lastName = nameParts.length >= 2 ? nameParts[nameParts.length - 1] : '';
    middleName = nameParts.length >= 3 ? nameParts.slice(1, -1).join(' ') : '';
  }

  for (const field of formFields) {
    // LABEL PRIMARY — do not let DOM id/name decide semantic match when label exists
    var _li = _labelPrimaryIdent(field);
    var ident = _li.ident;
    var matchBy = _li.matchBy;
    var labelEn = _li.labelEn;
    // Skip ALL retype/verify/confirm twin fields in the MAIN loop.
    // Post-pass at the end of fuzzyMatch mirrors the primary's already-mapped
    // value. The legacy isRetype handler below was buggy: when it failed to
    // find a primary by id/label match, it fell through to alias-matching
    // which substring-matched 'name' against 'father_s_name', making
    // 'Re-type Father's Name' get filled with profile.name (Sandhya Kumari)
    // instead of profile.father_name (Sudhir Prasad). [seen on RRB 2026-05-23]
    var rawLbl = (field.label || '').trim();
    var isTwin = /^(?:[a-z]\.|\d+\.|\(\w\)|[ixv]+\.)?\s*(?:verify|re[\s_-]*type|re[\s_-]*enter|confirm|repeat)\b/i.test(rawLbl)
              || /retype|re_type|reenter|re_enter|^confirm/i.test(ident)
              || (field.id && /^(conf|c_|re_|retype|verify|confirm)/i.test(field.id))
              || (field.name && /^(re_|retype|verify|confirm)/i.test(field.name));
    if (isTwin) continue;

    // Conditional Yes/No radios (have you / changed name / same address / disability…)
    // — do NOT skip; decide from profile flags and resolve to radio-click option.
    if (field.type === 'radio' || field.type === 'radio-group') {
      var condDecision = decideConditionalChoice(field, profile);
      if (condDecision) {
        var resolvedCond = resolveChoiceToOption(field, condDecision, null);
        if (resolvedCond) {
          mapping[resolvedCond.selector] = resolvedCond.entry;
          continue;
        }
      }
      // Gender / marital / category still fall through to alias matching below
    }

    // Auto-check agreement / declaration / consent checkboxes (also mat-checkbox)
    if (field.type === 'checkbox' || field.type === 'mat-checkbox') {
      // Test against the RAW label text (preserves spaces) — ident has spaces collapsed to underscores
      var labelText = (field.label || '').toLowerCase();
      var isAgreement = /\bi\s+(confirm|agree|accept|declare|certify|acknowledge|consent|understand)|i_(confirm|agree|accept|declare|certify|acknowledge|consent|understand)|consent|terms\s+and\s+conditions|self[\s_-]?declaration|^agree$|^accept$|^confirm$/i.test(labelText)
        || /i_(confirm|agree|accept|declare|certify|acknowledge|consent|understand)|^agree$|^accept$|^confirm$|consent|self_declaration/i.test(ident);
      // Also: match if the checkbox's name/id literally says "agree", "accept", "confirm", "consent"
      var fieldNameId = (field.name || '') + ' ' + (field.id || '');
      var isAgreeByName = /\b(agree|accept|consent|confirm|declar|tnc|terms)\b/i.test(fieldNameId);
      if (isAgreement || isAgreeByName) {
        mapping[field.selector] = { value: 'yes', type: field.type, matchBy: matchBy, profileKey: null };
        continue;
      }
      // Skip OTHER checkboxes — non-agreement boxes need explicit profile data which we don't have
      continue;
    }

    // ── File input matching ──────────────────────────────────────────────
    if (field.type === 'file') {
      // Match file inputs to profile file keys by label
      var fileAliases = {
        photo: ['photo','photograph','passport photo','applicant photo','image','profile photo','customer photograph'],
        signature: ['signature','sign','applicant signature','digital signature'],
        aadhaar_doc: ['aadhaar','aadhar','aadhaar document','aadhaar card','uid'],
        pan_doc: ['pan','pan card','pan document'],
        certificate: ['certificate','marksheet','mark sheet','passing certificate','degree certificate'],
        resume: ['resume','cv','curriculum vitae','bio data'],
        passport_doc: ['passport','passport document'],
        license_doc: ['driving license','licence','dl'],
        utility_bill: ['utility bill','electricity bill','address proof'],
      };
      var fileLabelLower = (field.label || '').toLowerCase();
      var fileIdentLower = ident.toLowerCase();
      for (var [fileKey, fileLabels] of Object.entries(fileAliases)) {
        if (!profile[fileKey]) continue;
        // File match: label only when label is strong
        var fileHit = fileLabels.some(function (a) {
          return fileLabelLower.includes(a) || (matchBy !== 'label' && fileIdentLower.includes(a.replace(/\s+/g, '_')));
        });
        if (fileHit) {
          mapping[field.selector] = { value: profile[fileKey], type: 'file', matchBy: matchBy, profileKey: fileKey };
          break;
        }
      }
      continue; // Don't fall through to text matching for file inputs
    }

    var isFatherMother = ident.includes('father') || ident.includes('mother') || ident.includes('pita') || ident.includes('mata');
    var isStateDistrict = ident.includes('state') || ident.includes('district') || ident.includes('rajya') || ident.includes('jila');
    // Skip education table roll numbers (they appear in rows with exam context)
    // 'candidate name as per matriculation' is a name field, not education row.
    // A person-name field (full/candidate/applicant/student name) must never be
    // mis-detected as an education row just because the label says "certificate".
    var _hasName = ident.includes('name');
    var _isRelativeName = ident.includes('father') || ident.includes('mother') || ident.includes('husband') || ident.includes('spouse') || ident.includes('guardian');
    var isCandidateNameField = _hasName && !_isRelativeName && (
      ident.includes('candidate') || ident.includes('applicant') || ident.includes('student') ||
      ident.includes('full_name') || ident.includes('your_name') || /^name/.test(ident) || ident.includes('_name_as_per')
    );
    // 'highest level of educational qualification' contains 'graduation' but is NOT an education row
    var isHighestEduField = ident.includes('highest');
    var isEducationRow = !isCandidateNameField && !isHighestEduField && (ident.includes('matric') || ident.includes('10th') || ident.includes('12th') || ident.includes('graduation') || ident.includes('diploma') || ident.includes('board') || ident.includes('university') || ident.includes('certificate') || ident.includes('year_of') || ident.includes('percentage') || ident.includes('subject') || ident.includes('inter_roll'));
    if (isEducationRow) {
      // Don't skip — try to match education fields from profile
      var eduAliases = {
        board_10th:         ['board_10th','board_matric','board_class10','10th_board','matric_board','boardname_hs','ddl_boardname_hs','matriculation_10th_class_education_board','matriculation_class_education_board','class_10th_education_board','10th_class_education_board','matriculation_education_board','tenth_class_education_board','class_x_education_board','sslc_education_board'],
        board_12th:         ['board_12th','board_inter','board_class12','12th_board','inter_board','intermediate_education_board','class_12th_education_board','12th_class_education_board','twelfth_education_board','class_xii_education_board','plus_two_education_board','hsc_education_board'],
        roll_number_10th:   ['roll_number_10th','roll_no_10th','roll_10th','roll_matric','matric_roll','10th_roll','matriculation_roll_number','matriculation_10th_class_roll_number','class_10_roll_number','tenth_roll_number','sslc_roll_number'],
        roll_number_12th:   ['roll_number_12th','roll_no_12th','roll_12th','roll_inter','inter_roll','12th_roll','intermediate_roll_number','class_12_roll_number','twelfth_roll_number','hsc_roll_number','plus_two_roll_number'],
        passing_year_10th:  ['passing_year_10th','year_10th','year_matric','matric_year','10th_year','year_of_passing_10','yearofpassing_hs','ddl_yearofpassing_hs','matriculation_year_of_passing','matriculation_10th_class_year_of_passing','class_10_year_of_passing','tenth_year_of_passing'],
        passing_year_12th:  ['passing_year_12th','year_12th','year_inter','inter_year','12th_year','year_of_passing_12','intermediate_year_of_passing','class_12_year_of_passing','twelfth_year_of_passing'],
        marks_10th:         ['marks_10th','percentage_10th','10th_marks','matric_marks','10th_percentage'],
        marks_12th:         ['marks_12th','percentage_12th','12th_marks','inter_marks','12th_percentage'],
        school_name:        ['school_name','school','institution_10','matric_school'],
        college_name:       ['college_name','college','institution_12','inter_college'],
        university_name:    ['university_name','university','institution_grad','college_grad','institution_name'],
        roll_no_graduation: ['roll_no_graduation','roll_grad','graduation_roll','degree_roll'],
        passing_year_12th:  ['passing_year_12th','year_12th','year_inter','inter_year','12th_year'],
        year_of_passing:    ['year_of_passing','passing_year','year_pass','year_graduation','grad_year'],
        grade:              ['grade','grade_system','grading','cgpa','gpa','division','class_obtained'],
        degree_name:        ['degree_name','degree','qualification','course_name','programme'],
        marks_graduation:   ['marks_graduation','percentage_grad','grad_marks','grad_percentage'],
      };
      let eduMatched = false;
      for (const [key, aliases] of Object.entries(eduAliases)) {
        if (!profile[key]) continue;
        if (aliases.some(function (a) { return ident.includes(a); })) {
          mapping[field.selector] = { value: profile[key], type: field.type, matchBy: matchBy, profileKey: key };
          eduMatched = true; break;
        }
      }
      if (!eduMatched) continue; // skip if no match
      continue;
    }
    // Skip Hindi name fields (auto-converted by ServicePlus on Tab press)
    var isHindiField = ident.includes('hindi') || ident.includes('_hindi') || field.label.includes('हिंदी') || field.label.includes('(Hindi)');
    if (isHindiField) continue;
    // Skip "changed name" / "new name" fields — only fill if profile has changed_name
    var isChangedName = ident.includes('new_name') || ident.includes('changed_name') || ident.includes('newname') || ident.includes('changedname') ||
      (field.label.toLowerCase().includes('new name') || field.label.toLowerCase().includes('changed name'));
    if (isChangedName && !profile.changed_name) continue;

    // Handle first/last/middle name fields — use granular profile fields when available
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

    // DOB split — label/placeholder first; DOM id only if matchBy is dom-fallback
    if (profile.dob) {
      var dobParts = profile.dob.split('/'); // DD/MM/YYYY
      var [dobDay, dobMonth, dobYear] = dobParts;
      var monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
      var monthShort = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var monthNum = parseInt(dobMonth);
      var selLower = matchBy === 'dom-fallback' ? (field.selector || '').toLowerCase() : '';
      if (ident.includes('day') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || /^[_\s]*day[_\s]*$/.test(ident.replace(/day/g,'').trim()) || ident.replace(/[_\s]/g,'') === 'day' || selLower.includes('ddl_day') || selLower.includes('_day'))) {
        mapping[field.selector] = { value: parseInt(dobDay).toString(), type: field.type, matchBy: matchBy, profileKey: 'dob' }; continue;
      }
      if (ident.includes('month') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || new Set(ident.split(/[_\s]+/).filter(Boolean)).size === 1 || selLower.includes('ddl_month') || selLower.includes('_month'))) {
        var monthVal = field.type === 'select' ? monthNames[monthNum] : dobMonth;
        mapping[field.selector] = { value: monthVal, type: field.type, monthNum, monthShort: monthShort[monthNum], matchBy: matchBy, profileKey: 'dob' }; continue;
      }
      if (ident.includes('year') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || new Set(ident.split(/[_\s]+/).filter(Boolean)).size === 1 || selLower.includes('ddl_year') || selLower.includes('_year'))) {
        mapping[field.selector] = { value: dobYear, type: field.type, matchBy: matchBy, profileKey: 'dob' }; continue;
      }
      // Angular Material DOB: placeholder='dd-mm-yyyy' (label may equal placeholder)
      if ((field.placeholder === 'dd-mm-yyyy' || field.placeholder === 'DD-MM-YYYY' || field.label === 'dd-mm-yyyy' || field.label === 'DD-MM-YYYY' || /^dd[-/]mm[-/]yyyy$/i.test(field.label||''))) {
        mapping[field.selector] = { value: profile.dob.split('/').join('-'), type: field.type, matchBy: 'label', profileKey: 'dob' }; continue;
      }
      // Full DOB field (single input) - detect separator from placeholder
      if (ident.includes('dob') || ident.includes('date_of_birth') || ident.includes('dateofbirth') || ident.includes('birth_date') || (ident.includes('date') && ident.includes('birth'))) {
        var sep = (field.placeholder || '').includes('-') ? '-' : '/';
        var dobVal = dobDay + sep + dobMonth + sep + dobYear;
        mapping[field.selector] = { value: dobVal, type: field.type, matchBy: matchBy, profileKey: 'dob' }; continue;
      }
    }

    // Alias match: require hit on LABEL identity. Prefer longest alias (more specific).
    var bestKey = null;
    var bestAliasLen = -1;
    for (const [profileKey, aliases] of Object.entries(fieldAliases)) {
      if (!profile[profileKey]) continue;
      // Strict separation: name must not match father/mother/state/district fields
      if (profileKey === 'name' && (isFatherMother || isStateDistrict)) continue;
      // name must not fill first/last/middle name specific fields when granular fields exist
      if (profileKey === 'name' && (ident.includes('first_name') || ident.includes('firstname') || ident.includes('last_name') || ident.includes('lastname') || ident.includes('surname') || ident.includes('middle_name') || ident.includes('middlename'))) continue;
      // father_name only if field is clearly a father field; mother_name only if clearly mother
      if (profileKey === 'father_name' && !isFatherMother) continue;
      if (profileKey === 'mother_name' && !(ident.includes('mother') || ident.includes('mata'))) continue;
      // name must not fill husband/wife/spouse/guardian fields
      if (profileKey === 'name' && (ident.includes('husband') || ident.includes('wife') || ident.includes('spouse') || ident.includes('guardian') || ident.includes('pati') || ident.includes('pita_pati'))) continue;
      // post_office/village must not fill 'purpose' or 'office' fields
      if ((profileKey === 'post_office' || profileKey === 'village') && (ident.includes('purpose') || ident.includes('uddeshya') || (ident.includes('apply') && ident.includes('office')))) continue;
      // degree_name/course_name must not match 'highest level of education' fields
      if (profileKey === 'degree_name' && ident.includes('highest')) continue;

      // For radio buttons: match GROUP by LABEL (+ name), then pick option → radio-click
      if (field.type === 'radio' || field.type === 'radio-group') {
        // Include name/id so label-only "Yes" groups still match "changed"/"gender"
        var groupIdent = _normalizeIdent([field.label, field.name, field.id].filter(Boolean).join(' '));
        var groupMatches = aliases.some(function (a) {
          return groupIdent.includes(a.replace(/[^a-z0-9]/g, ''));
        });
        // Also match gender aliases against bilingual Male/Female option text
        if (!groupMatches && profileKey === 'gender' && field.options) {
          groupMatches = /gender|sex|ling|male|female|पुरुष|महिला|स्त्री|तृतीय/.test(groupIdent + ' ' + field.options.join(' ').toLowerCase());
        }
        if (!groupMatches) { continue; }

        var resolved = resolveChoiceToOption(field, profile[profileKey], profileKey);
        if (resolved) {
          resolved.entry.matchBy = matchBy;
          mapping[resolved.selector] = resolved.entry;
        }
        continue; // never fall through to text matching for radios
      }

      // Never map free-text profile values onto checkbox-groups via aliases
      if (field.type === 'checkbox-group') {
        continue;
      }

      // Text/select: longest alias win on LABEL identity (more specific e.g. father_name > name)
      for (var ai = 0; ai < aliases.length; ai++) {
        var alias = aliases[ai];
        if (!alias || alias.length < 2) continue;
        if (ident.includes(alias) && alias.length > bestAliasLen) {
          bestAliasLen = alias.length;
          bestKey = profileKey;
        }
      }
    }
    if (bestKey) {
      // Never attach free-text to choice widgets via bestKey
      if (field.type === 'radio' || field.type === 'radio-group' || field.type === 'checkbox-group') {
        var bestResolved = resolveChoiceToOption(field, profile[bestKey], bestKey);
        if (bestResolved) {
          bestResolved.entry.matchBy = matchBy;
          mapping[bestResolved.selector] = bestResolved.entry;
        }
      } else {
        mapping[field.selector] = {
          value: profile[bestKey],
          type: field.type,
          matchBy: matchBy,
          profileKey: bestKey,
          label: field.label || null,
        };
      }
    }
  }

  // ── Post-pass: any still-unmapped choice groups get a conditional decision ──
  function choiceAlreadyMapped(field) {
    if (mapping[field.selector]) return true;
    if (field.optionSelectors) {
      for (var si = 0; si < field.optionSelectors.length; si++) {
        if (mapping[field.optionSelectors[si]]) return true;
      }
    }
    return false;
  }
  for (const field of formFields) {
    if (!(field.type === 'radio' || field.type === 'radio-group' || field.type === 'checkbox-group'
      || field.type === 'checkbox' || field.type === 'mat-checkbox' || field.type === 'checkbox-agreement')) {
      continue;
    }
    if (choiceAlreadyMapped(field)) continue;
    var decision = decideConditionalChoice(field, profile);
    if (!decision) continue;
    var resolvedPost = resolveChoiceToOption(field, decision, null);
    if (resolvedPost) {
      resolvedPost.entry.matchBy = 'conditional-post';
      mapping[resolvedPost.selector] = resolvedPost.entry;
    }
  }

  // ── Post-pass: verify/confirm/re-type twin fields mirror their primary ──
  // Catches "a. Verify Roll Number*" → "9. Roll Number*", "Confirm Email" → "Email", etc.
  // Runs after main mapping so primaries are already mapped.
  var TWIN_PREFIX_RE = /^(?:[a-z]\.|\d+\.|\(\w\)|[i-x]+\.)?\s*(?:verify|re[\s_-]*type|re[\s_-]*enter|confirm|repeat)\b[\s:_-]*/i;
  function normLabel(s) {
    // Strip leading numbering ("1.", "a.", "(i)", "iv.") then non-alphanumerics
    return (s || '').toLowerCase()
      .replace(/^\s*(?:\d+\.|[a-z]\.|\([a-z0-9]+\)|[ixv]+\.)\s*/i, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  for (const field of formFields) {
    if (mapping[field.selector]) continue; // already mapped
    var rawLabel = (field.label || '').trim();
    if (!rawLabel || !TWIN_PREFIX_RE.test(rawLabel)) continue;
    // Strip the verify/confirm prefix to get the underlying field name
    var primaryLabel = rawLabel.replace(TWIN_PREFIX_RE, '').trim();
    var primaryNorm = normLabel(primaryLabel);
    if (!primaryNorm) continue;
    // Find a mapped field whose normalised label matches
    var primaryField = formFields.find(f =>
      mapping[f.selector] &&
      f.selector !== field.selector &&
      normLabel(f.label || '') === primaryNorm
    );
    // Fuzzy fallback: contains relationship
    if (!primaryField) {
      primaryField = formFields.find(f => {
        if (!mapping[f.selector] || f.selector === field.selector) return false;
        var fNorm = normLabel(f.label || '');
        return fNorm && primaryNorm && (fNorm.includes(primaryNorm) || primaryNorm.includes(fNorm));
      });
    }
    if (primaryField) {
      mapping[field.selector] = { value: mapping[primaryField.selector].value, type: field.type };
    }
  }

  // ── Post-pass: split date fields (DD / MM / YYYY) ──
  // Many bank/insurance forms split DOB into 3 small inputs labeled "DD" "MM" "YYYY"
  // (or "Day"/"Month"/"Year"). We pull from profile.dob to fill them.
  if (profile.dob) {
    // Parse DOB - try common formats
    var dobStr = String(profile.dob).trim();
    var dobParts = null;
    // dd/mm/yyyy or dd-mm-yyyy
    var m1 = dobStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    // yyyy-mm-dd
    var m2 = dobStr.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m1) dobParts = { day: m1[1].padStart(2, '0'), month: m1[2].padStart(2, '0'), year: m1[3] };
    else if (m2) dobParts = { day: m2[3].padStart(2, '0'), month: m2[2].padStart(2, '0'), year: m2[1] };
    if (dobParts) {
      for (const field of formFields) {
        if (mapping[field.selector]) continue; // already mapped
        var lbl = (field.label || '').trim();
        var idn = (field.id || field.name || '').toLowerCase();
        var ph = (field.placeholder || '').trim();
        // Match short canonical day/month/year labels (case-insensitive, trimmed)
        // Could be "DD", "MM", "YYYY", "Day", "Month", "Year", "Date", or placeholders
        var combined = (lbl + ' ' + ph + ' ' + idn).toLowerCase();
        var isDay = /^dd$|^day$|day_of_birth|dob_day|birth_day|birthday_dd|^(\(?day\)?)$/i.test(lbl) || /^dd$|^day$/i.test(ph) || /(?:^|[^a-z])(dob_?day|birth_?day|day_of_birth)(?:[^a-z]|$)/.test(idn);
        var isMonth = /^mm$|^month$|month_of_birth|dob_month|birth_month|^(\(?month\)?)$/i.test(lbl) || /^mm$|^month$/i.test(ph) || /(?:^|[^a-z])(dob_?month|birth_?month|month_of_birth)(?:[^a-z]|$)/.test(idn);
        var isYear = /^yyyy$|^yyy$|^year$|year_of_birth|dob_year|birth_year|^(\(?year\)?)$/i.test(lbl) || /^yyyy$|^year$/i.test(ph) || /(?:^|[^a-z])(dob_?year|birth_?year|year_of_birth)(?:[^a-z]|$)/.test(idn);
        if (isDay) mapping[field.selector] = { value: dobParts.day, type: field.type, profileKey: 'dob' };
        else if (isMonth) mapping[field.selector] = { value: dobParts.month, type: field.type, profileKey: 'dob' };
        else if (isYear) mapping[field.selector] = { value: dobParts.year, type: field.type, profileKey: 'dob' };
      }
    }
  }

  return mapping;
}

// ── AI matching via LLM (OpenRouter / Groq) ──────────────────────────────────
async function aiMatch(formFields, profile, groqKey, llmBaseUrl, llmModel) {
  var fieldDescriptions = formFields.map((f, i) =>
    `${i}: label="${f.label || ''}" id="${f.id || ''}" name="${f.name || ''}" placeholder="${f.placeholder || ''}"`
  ).join('\n');

  var profileKeys = Object.entries(profile)
    .filter(([k, v]) => v && k !== 'phone' && k !== 'updatedAt')
    .map(([k, v]) => `${k}: "${v}"`).join('\n');

  var prompt = `You are a form field mapper. Given form fields and a student profile, return a JSON object mapping field index to profile key.

RULES:
- Return ONLY a valid JSON object, nothing else
- Map each field to the profile key whose VALUE should fill that field
- "first name" fields → use "first_name" profile key
- "last name" / "surname" fields → use "last_name" profile key
- "middle name" fields → use "middle_name" profile key
- "full name" / "candidate name" fields → use "name" profile key
- Separate day/month/year dropdowns → use "dob__day", "dob__month", "dob__year"
- Single "date of birth" text field → use "dob"
- For address parts: use "village", "post_office", "police_station", "block", "sub_division", "district", "state", "pincode" as available
- Only use "address" for full address text fields
- Confirm/retype fields → same key as primary field
- Skip: captcha, OTP, verification code, password
- Use EXACT profile key names from the list below

Form fields:
${fieldDescriptions}

Available profile keys and values:
${profileKeys}

Return JSON only: {"0": "name", "2": "dob", "5": "first_name", "7": "district"}`;

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
    var dobParts = (profile.dob || '').split('/'); // DD/MM/YYYY
    for (const [idx, profileKey] of Object.entries(indexMap)) {
      var field = formFields[parseInt(idx)];
      if (!field) continue;
      let value = null;
      // Handle split keys (backward compat + DOB splits)
      if (profileKey === 'name__first') value = profile.first_name || nameParts[0] || '';
      else if (profileKey === 'name__last') value = profile.last_name || nameParts[nameParts.length - 1] || '';
      else if (profileKey === 'name__middle') value = profile.middle_name || (nameParts.length >= 3 ? nameParts.slice(1, -1).join(' ') : '');
      else if (profileKey === 'dob__day') value = dobParts[0] || '';
      else if (profileKey === 'dob__month') {
        var _m = parseInt(dobParts[1] || '0');
        var _months = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
        value = _months[_m] || dobParts[1] || '';
      }
      else if (profileKey === 'dob__year') value = dobParts[2] || '';
      else if (profile[profileKey]) value = profile[profileKey];
      if (value !== null && value !== undefined) {
        // ── Guard: apply the same semantic constraints as fuzzyMatch ──
        // Prevents LLM from assigning profile.name to relative/spouse fields,
        // or profile.father_name to non-father fields, etc.
        var fieldIdent = [field.label, field.id, field.name, field.placeholder]
          .filter(Boolean).join(' ').toLowerCase().replace(/[-\s:*()'./]/g, '_');
        var isRelativeField = /husband|wife|spouse|guardian|pati(?!_pati_ka_naam)/i.test(fieldIdent);
        var isFatherField = /father|pita/i.test(fieldIdent);
        var isMotherField = /mother|mata/i.test(fieldIdent);

        // name must not fill relative/father/mother fields
        if (profileKey === 'name' && (isRelativeField || isFatherField || isMotherField)) continue;
        if ((profileKey === 'name' || profileKey === 'first_name' || profileKey === 'last_name' || profileKey === 'middle_name')
            && isRelativeField) continue;
        // father_name must only fill father-related fields
        if (profileKey === 'father_name' && !isFatherField) continue;
        // mother_name must only fill mother-related fields
        if (profileKey === 'mother_name' && !isMotherField) continue;

        mapping[field.selector] = { value, type: field.type };
      }
    }
    return mapping;
  } catch { return {}; }
}

