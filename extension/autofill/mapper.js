// ── Fuzzy matching ────────────────────────────────────────────────────────────
const FIELD_ALIASES = {
  name:           ['candidate_name', 'candidates_name', 'applicant_name', 'applicants_name', 'student_name', 'full_name', 'fullname', 'naam', 'name', 'applicant_name_english', 'name_english', 'name_in_english', 'txt_candidate_name', 'txt_name', 'txtcandidatename', 'txtname', 'pratyashi_ka_naam', 'your_name', 'enter_name'],
  dob:            ['dob', 'date_of_birth', 'dateofbirth', 'birth_date', 'janm_tithi', 'janm', 'birthdate', 'date_of_birth_dd_mm_yyyy', 'janm_tithi_', 'txt_dob', 'txtdob', 'txt_date_of_birth'],
  father_name:    ['father_name', 'fathername', 'fathers_name', 'father_s_name', 'pita_ka_naam', 'pita_naam', 'father', 'father_husband_name', 'pita_pati_ka_naam', 'txt_father', 'txtfather', 'txt_father_name', 'fathers_name_and_verify', 'pitaji_ka_naam'],
  mother_name:    ['mother_name', 'mothername', 'mothers_name', 'mother_s_name', 'mata_ka_naam', 'mata_naam', 'mother', 'txt_mother', 'txtmother', 'txt_mother_name', 'mothers_name_and_verify', 'mata_ka_naam'],
  address:        ['permanent_address', 'correspondence_address', 'residential_address', 'pata', 'niwas'],
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
  block:          ['block', 'block_name', 'taluka', 'tehsil', 'txt_block', 'ddl_block'],
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
    // Skip verify/confirm mirror fields (UPSC OTR has 'Verify Name', 'Verify DOB' etc)
    if (/^verify_|_and_verify|^confirm_|re_enter/i.test(ident) && !ident.includes('id')) continue;

    const isFatherMother = ident.includes('father') || ident.includes('mother') || ident.includes('pita') || ident.includes('mata');
    const isStateDistrict = ident.includes('state') || ident.includes('district') || ident.includes('rajya') || ident.includes('jila');
    // Skip education table roll numbers (they appear in rows with exam context)
    // 'candidate name as per matriculation' is a name field, not education row
    const isCandidateNameField = ident.includes('candidate_name') || ident.includes('candidates_name') || (ident.includes('name') && ident.includes('candidate'));
    const isEducationRow = !isCandidateNameField && (ident.includes('matric') || ident.includes('10th') || ident.includes('12th') || ident.includes('graduation') || ident.includes('diploma') || ident.includes('board') || ident.includes('university') || ident.includes('certificate') || ident.includes('year_of') || ident.includes('percentage') || ident.includes('subject') || ident.includes('inter_roll'));
    if (isEducationRow) {
      // Don't skip — try to match education fields from profile
      const eduAliases = {
        board_10th:         ['board_10th','board_matric','board_class10','10th_board','matric_board'],
        board_12th:         ['board_12th','board_inter','board_class12','12th_board','inter_board'],
        roll_no_10th:       ['roll_no_10th','roll_10th','roll_matric','matric_roll','10th_roll'],
        roll_no_12th:       ['roll_no_12th','roll_12th','roll_inter','inter_roll','12th_roll'],
        passing_year_10th:  ['passing_year_10th','year_10th','year_matric','matric_year','10th_year','year_of_passing_10'],
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
      if (ident.includes('day') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || /^[_\s]*day[_\s]*$/.test(ident.replace(/day/g,'').trim()) || ident.replace(/[_\s]/g,'') === 'day')) {
        mapping[field.selector] = { value: parseInt(dobDay).toString(), type: field.type }; continue;
      }
      if (ident.includes('month') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || new Set(ident.split(/[_\s]+/).filter(Boolean)).size === 1)) {
        const monthVal = field.type === 'select' ? monthNames[monthNum] : dobMonth;
        mapping[field.selector] = { value: monthVal, type: field.type, monthNum, monthShort: monthShort[monthNum] }; continue;
      }
      if (ident.includes('year') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || new Set(ident.split(/[_\s]+/).filter(Boolean)).size === 1)) {
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
      if ((profileKey === 'post_office' || profileKey === 'village') && (ident.includes('purpose') || ident.includes('office') || ident.includes('uddeshya'))) continue;
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

  const prompt = `You are a form field mapper. Given these HTML form fields and student profile data, return a JSON object mapping field index to profile key.

Form fields:
${fieldDescriptions}

Student profile:
${profileKeys}

Return ONLY a JSON object like: {"0": "name", "2": "dob", "5": "father_name"}
Only include fields you are confident about. Use exact profile keys.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
      }),
    });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    const indexMap = JSON.parse(match[0]);
    const mapping = {};
    for (const [idx, profileKey] of Object.entries(indexMap)) {
      const field = formFields[parseInt(idx)];
      if (field && profile[profileKey]) {
        mapping[field.selector] = { value: profile[profileKey], type: field.type };
      }
    }
    return mapping;
  } catch { return {}; }
}

