// ── Fuzzy matching ────────────────────────────────────────────────────────────
const FIELD_ALIASES = {
  name:           ['candidate_name', 'candidates_name', 'applicant_name', 'applicants_name', 'student_name', 'full_name', 'fullname', 'naam', 'name', 'applicant_name_english', 'name_english', 'name_in_english', 'txt_candidate_name', 'txt_name', 'txtcandidatename', 'txtname', 'pratyashi_ka_naam', 'your_name', 'enter_name'],
  dob:            ['dob', 'date_of_birth', 'dateofbirth', 'birth_date', 'janm_tithi', 'janm', 'birthdate', 'date_of_birth_dd_mm_yyyy', 'janm_tithi_', 'txt_dob', 'txtdob', 'txt_date_of_birth'],
  father_name:    ['father_name', 'fathername', 'fathers_name', 'father_s_name', 'pita_ka_naam', 'pita_naam', 'father', 'father_husband_name', 'pita_pati_ka_naam', 'txt_father', 'txtfather', 'txt_father_name', 'fathers_name_and_verify', 'pitaji_ka_naam'],
  mother_name:    ['mother_name', 'mothername', 'mothers_name', 'mother_s_name', 'mata_ka_naam', 'mata_naam', 'mother', 'txt_mother', 'txtmother', 'txt_mother_name', 'mothers_name_and_verify', 'mata_ka_naam'],
  address:        ['address', 'adress', 'permanent_address', 'correspondence_address', 'residential_address', 'pata', 'niwas', 'full_address', 'addr', 'txt_adress', 'txt_address'],
  mobile:         ['mobile_no', 'mobile_number', 'phone_no', 'contact_no', 'mo_no', 'sampark', 'mobile', 'phone', 'mobile_no_', 'sampark_no', 'txt_mobile', 'txtmobile', 'txt_mobile_no', 'mobile_no_mobile_sankhya', 'registered_mobile'],
  email:          ['email_address', 'email_id', 'emailid', 'email_add', 'email', 'txt_email', 'txtemail', 'txt_email_id', 'email_id_e_mail_a_i_di', 'registered_email'],
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
  village:        ['village', 'village_name', 'gram', 'gaon', 'txt_village', 'ddl_village'],
  post_office:    ['post_office', 'post', 'po', 'txt_post', 'post_name'],
  police_station: ['police_station', 'thana', 'ps', 'txt_ps', 'ddl_ps'],
  sub_division:   ['sub_division', 'subdivision', 'sub_div', 'anumandal', 'anchal', 'circle', 'txt_subdiv', 'ddl_subdiv', 'sub-division', 'अनुमंडल'],
  block:          ['block', 'block_name', 'taluka', 'tehsil', 'prakhnd', 'txt_block', 'ddl_block', 'प्रखंड'],
  house_no:       ['house_no', 'house_number', 'house', 'flat_no', 'door_no', 'txt_house'],
  street:         ['street', 'street_name', 'road', 'lane', 'txt_street'],
  // roll_number intentionally excluded to avoid filling education table fields
};

function fuzzyMatch(formFields, profile) {
  const mapping = {};
  const nameParts = (profile.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || nameParts[0] || '';
  const middleName = nameParts.length >= 3 ? nameParts[1] : '';

  for (const field of formFields) {
    // Prioritize label text — for ServicePlus/dynamic forms, label is the only meaningful identifier
    // Repeat label twice to give it more weight over generic IDs like field_1_1
    // Strip Hindi/non-ASCII chars from label for matching, keep English part
    const labelEn = (field.label || '').replace(/[^\x00-\x7F]/g, ' ').trim();
    const ident = [labelEn, labelEn, field.placeholder, field.id, field.name]
      .filter(Boolean).join(' ').toLowerCase().replace(/[-\s:*()'./]/g, '_');
    // Re-type/confirm mirror fields — fill with same value as primary field
    const isRetype = /retype|re_type|reenter|re_enter|confirm|retypeFullName|retypefullname|re_type_|retype_/i.test(ident) ||
                     /^re_type|^retype|^re_enter|^reenter|^confirm/i.test(ident) ||
                     field.id?.toLowerCase().includes('retype') || field.name?.toLowerCase().includes('retype') || field.id?.toLowerCase().startsWith('c') && field.id?.length > 2;
    // Skip verify fields (SSC pattern) but NOT retype fields (RRB pattern)
    if (/^verify_|_and_verify/i.test(ident) && !ident.includes('id') && !isRetype) continue;
    if (isRetype) {
      // Find the primary field this mirrors by matching selector/id/label
      const baseIdent = ident.replace(/retype|re_type|reenter|re_enter|confirm/gi, '').replace(/^[_\s]+|[_\s]+$/g, '');
      const baseId = (field.id || '').replace(/^c(?=[a-z])/i, '').replace(/^confirm/i, '').replace(/^retype/i, '');
      // First: try to find already-mapped field with matching base id
      let matched = false;
      for (const [sel, val] of Object.entries(mapping)) {
        const selId = sel.replace('#', '').replace(/\[.*\]/, '');
        if (selId && baseId && selId.toLowerCase() === baseId.toLowerCase()) {
          mapping[field.selector] = { value: val.value, type: field.type };
          matched = true; break;
        }
      }
      // Fallback: match by label similarity against already-mapped fields
      if (!matched) {
        for (const f2 of formFields) {
          if (f2.selector === field.selector || !mapping[f2.selector]) continue;
          const f2Label = (f2.label || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
          if (baseIdent && f2Label && (baseIdent.includes(f2Label) || f2Label.includes(baseIdent.split(' ')[0]))) {
            mapping[field.selector] = { value: mapping[f2.selector].value, type: field.type };
            matched = true; break;
          }
        }
      }
      // Last fallback: profile key lookup
      if (!matched) {
        for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
          if (!profile[key]) continue;
          if (aliases.some(a => baseIdent.includes(a)) || baseIdent.includes(key)) {
            mapping[field.selector] = { value: profile[key], type: field.type };
            break;
          }
        }
      }
      continue;
    }

    const isFatherMother = ident.includes('father') || ident.includes('mother') || ident.includes('pita') || ident.includes('mata');
    const isStateDistrict = ident.includes('state') || ident.includes('district') || ident.includes('rajya') || ident.includes('jila');
    // Skip education table roll numbers (they appear in rows with exam context)
    // 'candidate name as per matriculation' is a name field, not education row
    const isCandidateNameField = ident.includes('candidate_name') || ident.includes('candidates_name') || (ident.includes('name') && ident.includes('candidate'));
    // 'highest level of educational qualification' contains 'graduation' but is NOT an education row
    const isHighestEduField = ident.includes('highest');
    const isEducationRow = !isCandidateNameField && !isHighestEduField && (ident.includes('matric') || ident.includes('10th') || ident.includes('12th') || ident.includes('graduation') || ident.includes('diploma') || ident.includes('board') || ident.includes('university') || ident.includes('certificate') || ident.includes('year_of') || ident.includes('percentage') || ident.includes('subject') || ident.includes('inter_roll'));
    if (isEducationRow) {
      // Don't skip — try to match education fields from profile
      const eduAliases = {
        board_10th:         ['board_10th','board_matric','board_class10','10th_board','matric_board','boardname_hs','ddl_boardname_hs'],
        board_12th:         ['board_12th','board_inter','board_class12','12th_board','inter_board'],
        roll_no_10th:       ['roll_no_10th','roll_10th','roll_matric','matric_roll','10th_roll'],
        roll_no_12th:       ['roll_no_12th','roll_12th','roll_inter','inter_roll','12th_roll'],
        passing_year_10th:  ['passing_year_10th','year_10th','year_matric','matric_year','10th_year','year_of_passing_10','yearofpassing_hs','ddl_yearofpassing_hs'],
        passing_year_12th:  ['passing_year_12th','year_12th','year_inter','inter_year','12th_year','year_of_passing_12'],
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
        if (aliases.some(a => ident.includes(a))) {
          mapping[field.selector] = { value: profile[key], type: field.type };
          eduMatched = true; break;
        }
      }
      if (!eduMatched) continue; // skip if no match
      continue;
    }
    // Skip Hindi name fields (auto-converted by ServicePlus on Tab press)
    const isHindiField = ident.includes('hindi') || ident.includes('_hindi') || field.label.includes('हिंदी') || field.label.includes('(Hindi)');
    if (isHindiField) continue;
    // Skip "changed name" / "new name" fields — only fill if profile has changed_name
    const isChangedName = ident.includes('new_name') || ident.includes('changed_name') || ident.includes('newname') || ident.includes('changedname') ||
      (field.label.toLowerCase().includes('new name') || field.label.toLowerCase().includes('changed name'));
    if (isChangedName && !profile.changed_name) continue;

    // Handle first/last/middle name fields
    if (!isFatherMother && profile.name) {
      if (ident.includes('first_name') || ident.includes('firstname') || ident === 'fname') {
        mapping[field.selector] = { value: firstName, type: field.type }; continue;
      }
      if (ident.includes('last_name') || ident.includes('lastname') || ident === 'lname' || ident.includes('surname')) {
        mapping[field.selector] = { value: lastName, type: field.type }; continue;
      }
      if (ident.includes('middle_name') || ident.includes('middlename')) {
        mapping[field.selector] = { value: middleName, type: field.type }; continue;
      }
    }

    // DOB split — handle separate day/month/year dropdowns
    if (profile.dob) {
      const dobParts = profile.dob.split('/'); // DD/MM/YYYY
      const [dobDay, dobMonth, dobYear] = dobParts;
      const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
      const monthShort = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const monthNum = parseInt(dobMonth);
      const selLower = (field.selector||'').toLowerCase();
      if (ident.includes('day') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || /^[_\s]*day[_\s]*$/.test(ident.replace(/day/g,'').trim()) || ident.replace(/[_\s]/g,'') === 'day' || selLower.includes('ddl_day') || selLower.includes('_day'))) {
        mapping[field.selector] = { value: parseInt(dobDay).toString(), type: field.type }; continue;
      }
      if (ident.includes('month') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || new Set(ident.split(/[_\s]+/).filter(Boolean)).size === 1 || selLower.includes('ddl_month') || selLower.includes('_month'))) {
        const monthVal = field.type === 'select' ? monthNames[monthNum] : dobMonth;
        mapping[field.selector] = { value: monthVal, type: field.type, monthNum, monthShort: monthShort[monthNum] }; continue;
      }
      if (ident.includes('year') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || new Set(ident.split(/[_\s]+/).filter(Boolean)).size === 1 || selLower.includes('ddl_year') || selLower.includes('_year'))) {
        mapping[field.selector] = { value: dobYear, type: field.type }; continue;
      }
      // Angular Material DOB: placeholder='dd-mm-yyyy' with no label
      if (!field.label && (field.placeholder === 'dd-mm-yyyy' || field.placeholder === 'DD-MM-YYYY')) {
        mapping[field.selector] = { value: profile.dob.split('/').join('-'), type: field.type }; continue;
      }
      // Full DOB field (single input) - detect separator from placeholder
      if (ident.includes('dob') || ident.includes('date_of_birth') || ident.includes('dateofbirth') || ident.includes('birth_date') || (ident.includes('date') && ident.includes('birth'))) {
        const sep = (field.placeholder || '').includes('-') ? '-' : '/';
        const dobVal = dobDay + sep + dobMonth + sep + dobYear;
        mapping[field.selector] = { value: dobVal, type: field.type }; continue;
      }
    }

    for (const [profileKey, aliases] of Object.entries(FIELD_ALIASES)) {
      if (!profile[profileKey]) continue;
      // Strict separation: name must not match father/mother/state/district fields
      if (profileKey === 'name' && (isFatherMother || isStateDistrict)) continue;
      // father_name only if field is clearly a father field; mother_name only if clearly mother
      if (profileKey === 'father_name' && !isFatherMother) continue;
      if (profileKey === 'mother_name' && !(ident.includes('mother') || ident.includes('mata'))) continue;
      // name must not fill husband/wife/spouse fields
      if (profileKey === 'name' && (ident.includes('husband') || ident.includes('wife') || ident.includes('spouse') || ident.includes('pati') || ident.includes('pita_pati'))) continue;
      // post_office/village must not fill 'purpose' or 'office' fields
      if ((profileKey === 'post_office' || profileKey === 'village') && (ident.includes('purpose') || ident.includes('uddeshya') || (ident.includes('apply') && ident.includes('office')))) continue;
      // degree_name/course_name must not match 'highest level of education' fields
      if (profileKey === 'degree_name' && ident.includes('highest')) continue;

      // For radio buttons: match by checking if this option's label contains the profile value
      if (field.type === 'radio') {
        const profileVal = profile[profileKey].toLowerCase().replace(/[^a-z0-9]/g, '');
        const optLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');
        // Check if this radio group name/ident matches the profileKey aliases
        const groupIdent = [field.name, field.id].filter(Boolean).join(' ').toLowerCase().replace(/[-_\s]/g, '');
        const groupMatches = aliases.some(a => groupIdent.includes(a.replace(/[^a-z0-9]/g, '')));
        // Also check if the option label directly contains the profile value
        const labelMatches = optLabel.includes(profileVal) || profileVal.includes(optLabel);
        if ((groupMatches || labelMatches) && optLabel.includes(profileVal)) {
          mapping[field.selector] = { value: 'true', type: 'radio-click' };
          break;
        }
        continue; // don't fall through to text matching for radio buttons
      }

      if (aliases.some(alias => ident.includes(alias))) {
        mapping[field.selector] = { value: profile[profileKey], type: field.type };
        break;
      }
    }
  }
  return mapping;
}

// ── AI matching via Groq ──────────────────────────────────────────────────────
async function aiMatch(formFields, profile, groqKey) {
  const fieldDescriptions = formFields.map((f, i) =>
    `${i}: label="${f.label || ''}" id="${f.id || ''}" name="${f.name || ''}" placeholder="${f.placeholder || ''}"`
  ).join('\n');

  const profileKeys = Object.entries(profile)
    .filter(([k, v]) => v && k !== 'phone' && k !== 'updatedAt')
    .map(([k, v]) => `${k}: "${v}"`).join('\n');

  const prompt = `You are a form field mapper for Indian government forms. Map each form field to the correct student profile key.

RULES:
- Map ONLY when you are very confident the field should contain that profile value
- "address" fields get the address value, NOT the name
- DOB HANDLING:
  - Single "date of birth" text field → use "dob" key (fills full date like "14/01/2000")
  - SEPARATE day/month/year dropdown/select fields → use "dob__day", "dob__month", "dob__year"
  - Only use split keys when the form has 3 separate fields for day, month, year
- NAME SPLITTING: if profile has "name" as full name (e.g. "SANDHYA KUMARI"):
  - "first name" field → use value "SANDHYA" (first word of name)
  - "last name" / "surname" field → use value "KUMARI" (last word of name)
  - "middle name" field → use value "" (empty if only 2 words) or middle word if 3+ words
  - "full name" field → use the complete name value
- ADDRESS FIELDS: use specific profile keys for address parts:
  - "post office" field → use "post_office" key
  - "village" / "gram" / "town" field → use "village" key
  - "police station" / "thana" field → use "police_station" key
  - "block" / "tehsil" / "taluka" field → use "block" key
  - "district" / "jila" field → use "district" key
  - "state" / "rajya" field → use "state" key
  - "pin code" / "pincode" / "zip" field → use "pincode" or "pin_code" key
  - "C/O" / "care of" / "S/O" / "D/O" / "guardian" field → use "father_name" key
  - "full address" / "permanent address" / "correspondence address" field → use "address" key
  - "house no" / "flat no" field → skip if not in profile
  - "landmark" field → skip if not in profile
- CONFIRM/RETYPE fields: map to the SAME key as their primary field
  - "confirm first name" → same as "first name"
  - "retype email" → same as "email"
  - "re-enter mobile" → same as "mobile"
- Skip fields like verification code, captcha, OTP, password, security code
- Skip fields with no matching profile data
- Use EXACT profile key names
- For split values, use format: "name__first", "name__last", "name__middle", "dob__day", "dob__month", "dob__year"

Form fields:
\${fieldDescriptions}

Student profile (key: value):
\${profileKeys}

Return ONLY a JSON object: {"fieldIndex": "profileKey"}
Examples: {"0": "name__first", "1": "name__last", "3": "dob", "5": "father_name", "7": "email", "8": "email"}`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'system', content: 'You are a JSON-only API. Return ONLY valid JSON objects. No explanations, no markdown, no text before or after the JSON.' }, { role: 'user', content: prompt }],
        max_tokens: 300,
      }),
    });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    const indexMap = JSON.parse(match[0]);
    const mapping = {};
    const nameParts = (profile.name || '').trim().split(/\s+/);
    const dobParts = (profile.dob || '').split('/'); // DD/MM/YYYY
    for (const [idx, profileKey] of Object.entries(indexMap)) {
      const field = formFields[parseInt(idx)];
      if (!field) continue;
      let value = null;
      // Handle split keys
      if (profileKey === 'name__first') value = nameParts[0] || '';
      else if (profileKey === 'name__last') value = nameParts[nameParts.length - 1] || '';
      else if (profileKey === 'name__middle') value = nameParts.length >= 3 ? nameParts.slice(1, -1).join(' ') : '';
      else if (profileKey === 'dob__day') value = dobParts[0] || '';
      else if (profileKey === 'dob__month') {
        const _m = parseInt(dobParts[1] || '0');
        const _months = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
        value = _months[_m] || dobParts[1] || '';
      }
      else if (profileKey === 'dob__year') value = dobParts[2] || '';
      else if (profile[profileKey]) value = profile[profileKey];
      if (value !== null && value !== undefined) {
        mapping[field.selector] = { value, type: field.type };
      }
    }
    return mapping;
  } catch { return {}; }
}

