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
