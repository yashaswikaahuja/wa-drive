const CURRENT_VERSION = '3.26';
let selectedProfile = null;

// Check for updates on every popup open
chrome.storage.local.get(['backendUrl'], async (result) => {
  if (!result.backendUrl) return;
  try {
    const res = await fetch(`${result.backendUrl}/extension/version`);
    const { version, download_url } = await res.json();
    if (version && version !== CURRENT_VERSION) {
      const banner = document.getElementById('update-banner');
      const link = document.getElementById('update-link');
      if (banner && link) {
        link.href = download_url;
        banner.style.display = 'block';
      }
    }
  } catch { /* ignore */ }
});

// Load saved settings
chrome.storage.local.get(['backendUrl', 'groqKey'], (result) => {
  if (result.backendUrl) document.getElementById('backend-url').value = result.backendUrl;
  if (result.groqKey) document.getElementById('groq-key').value = result.groqKey;
  if (result.backendUrl) loadProfiles(result.backendUrl);
});

document.getElementById('save-settings').addEventListener('click', () => {
  const url = document.getElementById('backend-url').value.trim().replace(/\/$/, '');
  const key = document.getElementById('groq-key').value.trim();
  chrome.storage.local.set({ backendUrl: url, groqKey: key }, () => {
    showStatus('Settings saved!', 'success');
    loadProfiles(url);
  });
});

document.getElementById('refresh-btn').addEventListener('click', () => {
  const url = document.getElementById('backend-url').value.trim();
  if (url) loadProfiles(url);
});

// ── Semantic aliases — normalize label variants to canonical keys ─────────────
const SEMANTIC_ALIASES = {
  'full name': 'name', 'candidate name': 'name', 'applicant name': 'name',
  'student name': 'name', 'name of candidate': 'name', 'name of applicant': 'name',
  'candidates name': 'name', 'applicants name': 'name',
  'date of birth': 'dob', 'birth date': 'dob', 'dob': 'dob', 'date of birth ddmmyyyy': 'dob',
  "fathers name": 'father_name', 'father name': 'father_name', "fathers husbands name": 'father_name',
  "mothers name": 'mother_name', 'mother name': 'mother_name',
  'aadhaar no': 'aadhaar_number', 'aadhaar number': 'aadhaar_number', 'aadhar no': 'aadhaar_number',
  'pan no': 'pan_number', 'pan number': 'pan_number', 'pan card': 'pan_number',
  'mobile no': 'mobile', 'mobile number': 'mobile', 'phone no': 'mobile', 'contact no': 'mobile',
  'email id': 'email', 'email address': 'email',
  'permanent address': 'address', 'residential address': 'address', 'correspondence address': 'address',
  'pin code': 'pincode', 'postal code': 'pincode', 'pincode': 'pincode',
  'state name': 'state', 'district name': 'district',
};

function normalizeLabel(label) {
  return label.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function getSemanticKey(label) {
  const n = normalizeLabel(label);
  return SEMANTIC_ALIASES[n] || n;
}

function calcConfidence(fills, corrections) {
  if (fills + corrections === 0) return 0.5;
  return fills / (fills + corrections * 3);
}

document.getElementById('autofill-btn').addEventListener('click', async () => {
  if (!selectedProfile) return;
  const { groqKey, backendUrl } = await chrome.storage.local.get(['groqKey', 'backendUrl']);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  showStatus('Analyzing form...', 'info');

  // Step 1: Get all form fields + generate form fingerprint
  const fieldsResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractFormFieldsWithFingerprint,
  });

  const { formFields, formKey } = fieldsResult?.[0]?.result ?? { formFields: [], formKey: '' };
  if (!formFields.length) { showStatus('No form fields found on this page.', 'error'); return; }

  let mapping = {};
  let filledBySource = {}; // track {selector: {label, profileKey, source}}

  // Debug: send form fields + unfilled dropdown HTML to backend for analysis
  if (backendUrl) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const dropdowns = [];
        // Cast wide net - find anything that could be a dropdown
        const selectors = [
          'select', 'mat-select', 'ng-select', 'p-dropdown',
          '[role="combobox"]', '[role="listbox"]', '[role="option"]',
          '[class*="dropdown"]', '[class*="select"]', '[class*="Select"]',
          'mat-form-field', '.mat-select', '.ng-select',
          '[formcontrolname]', '[ng-reflect-name]',
        ];
        selectors.forEach(sel => {
          try {
            document.querySelectorAll(sel).forEach(el => {
              if (dropdowns.length >= 30) return;
              dropdowns.push({
                sel,
                tag: el.tagName,
                id: el.id,
                class: el.className.toString().slice(0,80),
                role: el.getAttribute('role'),
                formcontrolname: el.getAttribute('formcontrolname') || el.getAttribute('ng-reflect-name'),
                outerHTML: el.outerHTML.slice(0,1500),
              });
            });
          } catch {}
        });
        // Also capture full body structure summary
        const allTags = {};
        document.querySelectorAll('*').forEach(el => {
          const t = el.tagName.toLowerCase();
          if (!['div','span','p','br','script','style','path','svg','g'].includes(t)) {
            allTags[t] = (allTags[t]||0)+1;
          }
        });
        return { url: location.href, dropdowns, allTags };
      }
    }).then(r => {
      const data = r?.[0]?.result;
      if (data) fetch(backendUrl + '/debug/form', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formFields: formFields.slice(0,30), ...data }),
      }).catch(() => {});
    });
  }

  // Step 2: Load saved mapping with confidence scores
  let savedMapping = null;
  if (backendUrl && formKey) {
    try {
      const res = await fetch(`${backendUrl}/mappings/${formKey}`);
      const data = await res.json();
      if (data && typeof data === 'object') savedMapping = data;
    } catch { /* ignore */ }
  }

  // Step 3: Apply saved mappings (confidence > 0.4)
  if (savedMapping) {
    for (const field of formFields) {
      const semanticKey = getSemanticKey(field.label);
      const saved = savedMapping[semanticKey];
      if (!saved) continue;
      const conf = calcConfidence(saved.fills || 0, saved.corrections || 0);
      if (conf >= 0.4 && saved.profileKey && selectedProfile[saved.profileKey]) {
        mapping[field.selector] = { value: selectedProfile[saved.profileKey], type: field.type };
        filledBySource[field.selector] = { label: field.label, semanticKey, profileKey: saved.profileKey, source: 'saved', confidence: conf };
      }
    }
  }

  // Step 4: Fuzzy match for unmapped fields
  const unmapped1 = formFields.filter(f => !mapping[f.selector]);
  const fuzzyResult = fuzzyMatch(unmapped1, selectedProfile);
  for (const [sel, val] of Object.entries(fuzzyResult)) {
    mapping[sel] = val;
    const field = formFields.find(f => f.selector === sel);
    if (field) {
      const profileKey = Object.entries(selectedProfile).find(([, v]) => v === val.value)?.[0];
      filledBySource[sel] = { label: field.label, semanticKey: getSemanticKey(field.label), profileKey, source: 'fuzzy', confidence: 0.6 };
    }
  }

  // Step 5: Groq AI for still-unmapped fields
  const unmapped2 = formFields.filter(f => !mapping[f.selector]);
  if (unmapped2.length > 0 && groqKey) {
    showStatus(`AI mapping ${unmapped2.length} fields...`, 'info');
    const aiMapping = await aiMatch(unmapped2, selectedProfile, groqKey);
    for (const [sel, val] of Object.entries(aiMapping)) {
      mapping[sel] = val;
      const field = formFields.find(f => f.selector === sel);
      if (field) {
        const profileKey = Object.entries(selectedProfile).find(([, v]) => v === val.value)?.[0];
        filledBySource[sel] = { label: field.label, semanticKey: getSemanticKey(field.label), profileKey, source: 'ai', confidence: 0.5 };
      }
    }
  }

  // Step 6: Fill the form (sequential for dependent dropdowns)
  // Type-safety: remove mappings that are incompatible with field type
  const BOOLEAN_LIKE = new Set(['yes','true','1','checked','on','no','false','0','off','unchecked']);
  for (const field of formFields) {
    const m = mapping[field.selector];
    if (!m) continue;
    if (field.type === 'checkbox' && !BOOLEAN_LIKE.has(m.value.toLowerCase())) {
      console.debug('[CC] type-safe: removed checkbox mapping with non-boolean value', field.selector, m.value);
      delete mapping[field.selector];
      delete filledBySource[field.selector];
    }
  }
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: fillFormFieldsSequential,
    args: [mapping, filledBySource],
  });

  const count = result?.[0]?.result ?? 0;
  if (count > 0) {
    document.getElementById('filled-count').textContent = `✓ Filled ${count} field(s)`;
    document.getElementById('filled-count').style.display = 'block';
    showStatus(`Filled ${count} fields successfully!`, 'success');

    // Step 7: Inject correction observer
    if (backendUrl && formKey) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: injectCorrectionObserver,
        args: [mapping, filledBySource, selectedProfile, backendUrl, formKey],
      });
    }

    // Show Save Learning button
    document.getElementById('save-learning-btn').style.display = 'block';
    document.getElementById('save-learning-btn').onclick = async () => {
      // Get enrichments from page
      const enrichResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          const e = sessionStorage.getItem('_cc_enrichments');
          return e ? JSON.parse(e) : [];
        }
      });
      const enrichments = enrichResult?.[0]?.result ?? [];

      // Show enrichment confirmation if any
      if (enrichments.length > 0) {
        const msg = enrichments.map(e => `${e.label}: "${e.value}"`).join('\n');
        if (confirm(`Add to profile?\n\n${msg}`)) {
          // Save enrichments to profile
          const updatedProfile = { ...selectedProfile };
          enrichments.forEach(e => { updatedProfile[e.semanticKey] = e.value; });
          await fetch(`${backendUrl}/profiles`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedProfile),
          });
          showStatus(`Profile enriched with ${enrichments.length} new field(s)!`, 'success');
        }
      }

      await saveLearning(backendUrl, formKey, filledBySource, selectedProfile, false);
      showStatus('Learning saved!', 'success');
      document.getElementById('save-learning-btn').style.display = 'none';
    };
  } else {
    const hasGroq = !!groqKey;
    const hasProfile = selectedProfile && Object.keys(selectedProfile).length > 2;
    const fieldCount = formFields.length;
    showStatus(`No fields filled. Fields detected: ${fieldCount}. Profile: ${hasProfile?'✓':'✗'}. Groq: ${hasGroq?'✓':'✗ (add key in settings)'}`, 'error');
  }
});

// ── Fuzzy matching ────────────────────────────────────────────────────────────
const FIELD_ALIASES = {
  name:           ['candidate_name', 'applicant_name', 'student_name', 'full_name', 'fullname', 'naam', 'name', 'applicant_name_english', 'name_english', 'name_in_english', 'txt_candidate_name', 'txt_name', 'txtcandidatename', 'txtname', 'name_of_applicant', 'name_of_candidate', 'applicants_name', 'candidates_name'],
  dob:            ['dob', 'date_of_birth', 'dateofbirth', 'birth_date', 'janm_tithi', 'janm', 'birthdate', 'date_of_birth_dd_mm_yyyy', 'janm_tithi_', 'txt_dob', 'txtdob', 'txt_date_of_birth'],
  father_name:    ['father_name', 'fathername', 'fathers_name', 'father_s_name', 'pita_ka_naam', 'pita_naam', 'father', 'father_husband_name', 'pita_pati_ka_naam', 'txt_father', 'txtfather', 'txt_father_name', 'name_of_father'],
  mother_name:    ['mother_name', 'mothername', 'mothers_name', 'mother_s_name', 'mata_ka_naam', 'mata_naam', 'mother', 'txt_mother', 'txtmother', 'txt_mother_name', 'name_of_mother'],
  address:        ['permanent_address', 'correspondence_address', 'residential_address', 'pata', 'niwas'],
  mobile:         ['mobile_no', 'mobile_number', 'phone_no', 'contact_no', 'mo_no', 'sampark', 'mobile', 'phone', 'mobile_no_', 'sampark_no', 'txt_mobile', 'txtmobile', 'txt_mobile_no', 'mobile_no_of_applicant', 'applicant_mobile'],
  email:          ['email_address', 'email_id', 'emailid', 'email_add', 'email', 'txt_email', 'txtemail', 'txt_email_id', 'email_of_applicant', 'applicant_email'],
  aadhaar_number: ['aadhaar', 'aadhar', 'uid', 'aadhaar_no', 'aadhar_no', 'identity_card_no', 'enter_identity', 'aadhaar_number_', 'aadhar_card', 'txt_aadhaar', 'txtaadhaar', 'txt_aadhar', 'aadhaar_number'],
  pan_number:     ['pan_no', 'pan_number', 'pancard', 'pan_card'],
  epic_number:    ['epic_no', 'voter_id', 'epic_number'],
  category:       ['category', 'caste_category', 'varg', 'txt_category', 'ddl_category', 'ddlcategory'],
  gender:         ['gender', 'sex', 'ling', 'txt_gender', 'ddl_gender', 'rbl_gender'],
  pincode:        ['pincode', 'pin_code', 'postal_code', 'zip_code'],
  state:          ['state_name', 'state_of', 'rajya'],
  district:       ['district_name', 'jila'],
  nationality:    ['nationality', 'rashtriyata', 'citizenship', 'citizen'],
  marital_status: ['marital_status', 'marital', 'vivah', 'married', 'marriage_status', 'ddl_marital'],
  religion:       ['religion', 'dharm', 'dharma', 'ddl_religion', 'txt_religion'],
  domicile_state:      ['domicile', 'domicile_state', 'home_state', 'state_of_domicile'],
  qualification_status:['essential_qualification','have_qualification','possess_qualification','affirmation','qualified'],
  year_of_passing:     ['year_of_passing','passing_year','year_pass','year_graduation'],
  grade:               ['grade','division','class_obtained','cgpa','gpa'],
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
    const ident = [field.label, field.label, field.placeholder, field.id, field.name]
      .filter(Boolean).join(' ').toLowerCase().replace(/[-\s:*()'./$]/g, '_');

    const isFatherMother = ident.includes('father') || ident.includes('mother') || ident.includes('pita') || ident.includes('mata');
    const isStateDistrict = ident.includes('state') || ident.includes('district') || ident.includes('rajya') || ident.includes('jila');
    // Skip education table roll numbers (they appear in rows with exam context)
    const isEducationRow = ident.includes('matric') || ident.includes('10th') || ident.includes('12th') || ident.includes('graduation') || ident.includes('diploma') || ident.includes('board') || ident.includes('university') || ident.includes('certificate') || ident.includes('year_of') || ident.includes('percentage') || ident.includes('subject') || ident.includes('inter_roll');
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
      if (ident.includes('day') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born'))) {
        mapping[field.selector] = { value: parseInt(dobDay).toString(), type: field.type }; continue;
      }
      if (ident.includes('month') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born'))) {
        const monthVal = field.type === 'select' ? monthNames[monthNum] : dobMonth;
        mapping[field.selector] = { value: monthVal, type: field.type, monthNum, monthShort: monthShort[monthNum] }; continue;
      }
      if (ident.includes('year') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born'))) {
        mapping[field.selector] = { value: dobYear, type: field.type }; continue;
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

// ── Profile loader ────────────────────────────────────────────────────────────
async function loadProfiles(backendUrl) {
  const list = document.getElementById('profiles-list');
  list.innerHTML = '<div class="empty">Loading...</div>';
  try {
    const res = await fetch(`${backendUrl}/profiles`);
    const profiles = await res.json();
    if (!Array.isArray(profiles) || !profiles.length) {
      list.innerHTML = '<div class="empty">No profiles saved yet.<br>Use CyberControl to save student profiles.</div>';
      return;
    }
    list.innerHTML = '';
    profiles.forEach(profile => {
      const card = document.createElement('div');
      card.className = 'profile-card';
      const name = profile.name || profile.full_name || 'Unknown';
      const phone = profile.phone || '';
      const count = Object.keys(profile).filter(k => profile[k] && !['phone','updatedAt'].includes(k)).length;
      card.innerHTML = `<div class="profile-name">${name}</div><div class="profile-phone">📱 ${phone}</div><div class="profile-fields">${count} fields</div>`;
      card.addEventListener('click', () => {
        document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedProfile = profile;
        document.getElementById('autofill-btn').disabled = false;
        document.getElementById('filled-count').style.display = 'none';
      });
      list.appendChild(card);
    });
  } catch {
    list.innerHTML = '<div class="empty">Failed to load. Check backend URL.</div>';
  }
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `status ${type}`;
  el.style.display = 'block';
  if (type !== 'info') setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ── Save Learning ─────────────────────────────────────────────────────────────
async function saveLearning(backendUrl, formKey, filledBySource, profile, fromCorrection) {
  if (!backendUrl || !formKey) return;
  const updates = {};
  for (const [, info] of Object.entries(filledBySource)) {
    if (!info.profileKey || !info.semanticKey) continue;
    updates[info.semanticKey] = {
      profileKey: info.profileKey,
      // fromCorrection = strong signal, Save Learning = weak signal
      delta: fromCorrection ? { corrections: 0, fills: 1 } : { corrections: 0, fills: 0.3 },
    };
  }
  if (Object.keys(updates).length > 0) {
    fetch(`${backendUrl}/mappings/${formKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates, formKey }),
    }).catch(() => {});
  }
}

// ── Content script functions (run in page context) ────────────────────────────
function extractFormFieldsWithFingerprint() {
  // Generate stable form fingerprint
  const hostname = location.hostname;
  const title = (document.querySelector('h1,h2,legend,.form-title,.page-title')?.textContent || document.title || '').trim().slice(0, 50);
  const inputs = document.querySelectorAll(
    'input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],' +
    'input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select'
  );
  const labelList = [];
  const formFields = [];

  function getLabel(el) {
    if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return l.textContent.trim(); }
    const td = el.closest('td');
    if (td) { const prev = td.previousElementSibling; if (prev) return prev.textContent.trim().slice(0, 40); }
    const parent = el.closest('div,td,tr,li,span,p,mat-form-field');
    if (parent) { const l = parent.querySelector('label,mat-label'); if (l) return l.textContent.trim(); }
    if (el.placeholder) return el.placeholder;
    if (el.getAttribute && el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.nextSibling?.textContent) return el.nextSibling.textContent.trim();
    return '';
  }

  inputs.forEach((el, i) => {
    if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
    const label = getLabel(el);
    let selector;
    if (el.id) {
      selector = `#${el.id}`;
    } else if (el.name && !(el.type === 'radio' && (el.value === 'on' || el.value === ''))) {
      selector = `[name="${el.name}"][value="${el.value || ''}"]`;
    } else {
      el.setAttribute('data-cc-idx', i);
      selector = `[data-cc-idx="${i}"]`;
    }
    const type = el.tagName === 'SELECT' ? 'select' : el.type || 'text';
    if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
    formFields.push({ selector, id: el.id, name: el.name, value: el.value, placeholder: el.placeholder || '', label, type, index: i });
  });

  // Angular Material: mat-select, mat-checkbox, mat-radio-button
  let matIdx = 10000;
  // Find ALL mat-select elements including those with dynamic attributes
  document.querySelectorAll('mat-select, [mat-select], [_nghost] select, mat-form-field select').forEach(el => {
    // Skip if already captured as native select
    if (el.tagName === 'SELECT' && Array.from(formFields).some(f => f.selector === (el.id ? '#'+el.id : '[name="'+el.name+'"]'))) return;
    const label = getLabel(el) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
    const id = el.id || `mat-select-${matIdx}`;
    if (!el.id) el.setAttribute('data-cc-id', id);
    const type = el.tagName === 'SELECT' ? 'select' : 'mat-select';
    if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
    formFields.push({ selector: el.id ? `#${el.id}` : `[data-cc-id="${id}"]`, id, name: el.getAttribute('formcontrolname') || el.name || '', value: '', placeholder: '', label, type, index: matIdx++ });
  });
  document.querySelectorAll('mat-checkbox').forEach(el => {
    const label = getLabel(el) || el.textContent.trim().slice(0, 40);
    const id = el.id || `mat-cb-${matIdx}`;
    if (!el.id) el.setAttribute('data-cc-id', id);
    formFields.push({ selector: el.id ? `#${el.id}` : `[data-cc-id="${id}"]`, id, name: '', value: '', placeholder: '', label, type: 'mat-checkbox', index: matIdx++ });
  });
  document.querySelectorAll('mat-radio-button').forEach(el => {
    const label = el.textContent.trim().slice(0, 40);
    const name = el.getAttribute('name') || el.closest('mat-radio-group')?.getAttribute('formcontrolname') || '';
    const id = el.id || `mat-rb-${matIdx}`;
    if (!el.id) el.setAttribute('data-cc-id', id);
    formFields.push({ selector: el.id ? `#${el.id}` : `[data-cc-id="${id}"]`, id, name, value: label, placeholder: '', label, type: 'mat-radio', index: matIdx++ });
  });

  // SSC custom ng-dropdown (div.ng-dropdown with div.label + div.value-area)
  document.querySelectorAll('div.ng-dropdown').forEach(el => {
    const labelEl = el.querySelector('.label');
    const label = labelEl ? labelEl.textContent.trim() : '';
    if (!label) return;
    const trigger = el.querySelector('.value-area');
    if (!trigger) return;
    const id = `ng-drop-${matIdx}`;
    el.setAttribute('data-cc-id', id);
    if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
    formFields.push({ selector: `[data-cc-id="${id}"]`, id, name: '', value: '', placeholder: '', label, type: 'ng-dropdown', index: matIdx++ });
  });

  // role=combobox / ng-select / custom dropdowns not using mat-select
  document.querySelectorAll('[role="combobox"],[role="listbox"]').forEach(el => {
    if (el.tagName.toLowerCase() === 'input') return; // skip autocomplete inputs
    const label = getLabel(el) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
    if (!label) return;
    const id = el.id || `combobox-${matIdx}`;
    if (!el.id) el.setAttribute('data-cc-id', id);
    if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
    formFields.push({ selector: el.id ? `#${el.id}` : `[data-cc-id="${id}"]`, id, name: el.getAttribute('formcontrolname') || '', value: '', placeholder: '', label, type: 'mat-select', index: matIdx++ });
  });

  // Fingerprint: hostname + title + sorted top-10 labels
  const labelSig = labelList.sort().slice(0, 10).join('|');
  const raw = `${hostname}::${title}::${labelSig}`;
  // Simple hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) { hash = ((hash << 5) - hash) + raw.charCodeAt(i); hash |= 0; }
  const formKey = Math.abs(hash).toString(36);

  return { formFields, formKey };
}

// ── Correction observer (injected after autofill) ─────────────────────────────
function injectCorrectionObserver(mapping, filledBySource, profile, backendUrl, formKey) {
  const corrections = [];
  const enrichments = [];

  // Watch autofilled fields for corrections
  for (const [selector, { value }] of Object.entries(mapping)) {
    try {
      const el = selector.startsWith('form-field-') || selector.startsWith('[data-cc-idx')
        ? document.querySelectorAll('input,select,textarea')[parseInt(selector.split('-')[2])]
        : document.querySelector(selector);
      if (!el) continue;
      const originalValue = value;
      const info = filledBySource[selector];
      if (!info) continue;

      el.addEventListener('change', () => {
        const newVal = el.value;
        if (newVal === originalValue) return;
        const correctedKey = Object.entries(profile).find(([, v]) => v === newVal)?.[0];
        if (!correctedKey) { console.debug('[CC] correction: no profileKey for value', newVal); return; }
        if (corrections.some(c => c.semanticKey === info.semanticKey && c.newKey === correctedKey)) return;
        corrections.push({ semanticKey: info.semanticKey, oldKey: info.profileKey, newKey: correctedKey });
        sessionStorage.setItem('_cc_corrections', JSON.stringify(corrections));
        if (!backendUrl || !formKey) return;
        // Debounce: batch corrections within 1.5s window
        clearTimeout(el._ccTimer);
        el._ccTimer = setTimeout(() => {
          const pending = JSON.parse(sessionStorage.getItem('_cc_corrections') || '[]');
          const updates = {};
          for (const c of pending) {
            if (c.newKey) updates[c.semanticKey] = { profileKey: c.newKey, delta: { fills: 0, corrections: 1 } };
          }
          if (!Object.keys(updates).length) return;
          console.debug('[CC] saving corrections (batched):', updates);
          fetch(backendUrl + '/mappings/' + formKey, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates, formKey }),
          }).then(() => {
            console.debug('[CC] corrections saved ok');
            sessionStorage.removeItem('_cc_corrections');
          }).catch(e => console.warn('[CC] correction save failed', e));
        }, 1500);
      });
    } catch { /* skip */ }
  }

  // Watch UNFILLED fields for profile enrichment
  const skipLabels = /captcha|otp|token|verification|code|password|confirm|repeat|retype/i;
  const skipTypes = ['select', 'checkbox', 'radio', 'hidden', 'submit', 'button'];
  const allInputs = document.querySelectorAll('input,textarea');

  allInputs.forEach(el => {
    if (skipTypes.includes(el.type)) return;
    // Skip if already autofilled
    const selector = el.id ? `#${el.id}` : `[name="${el.name}"]`;
    if (mapping[selector]) return;

    // Get label
    const label = (() => {
      if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return l.textContent.trim(); }
      const td = el.closest('td'); if (td?.previousElementSibling) return td.previousElementSibling.textContent.trim();
      return el.placeholder || '';
    })();
    if (!label || skipLabels.test(label)) return;

    // Normalize label to semantic key
    const normalized = label.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const semanticAliases = {
      'full name': 'name', 'candidate name': 'name', 'applicant name': 'name',
      'date of birth': 'dob', 'fathers name': 'father_name', 'mothers name': 'mother_name',
      'aadhaar no': 'aadhaar_number', 'mobile no': 'mobile', 'email id': 'email',
      'pin code': 'pincode', 'permanent address': 'address',
    };
    const semanticKey = semanticAliases[normalized] || normalized;

    el.addEventListener('blur', () => {
      const val = el.value.trim();
      if (!val || val.length < 2) return;

      // Type validation
      const isValid = (() => {
        if (semanticKey === 'dob') return /^\d{2}\/\d{2}\/\d{4}$/.test(val);
        if (semanticKey === 'pincode') return /^\d{6}$/.test(val);
        if (semanticKey === 'mobile') return /^\d{10}$/.test(val);
        if (semanticKey === 'aadhaar_number') return /^\d{12}$/.test(val);
        if (['name','father_name','mother_name'].includes(semanticKey)) return /^[a-zA-Z\s\.]{2,60}$/.test(val);
        return val.length >= 2 && val.length <= 200; // generic
      })();

      if (!isValid) return;

      // Don't enrich if profile already has this key
      if (profile[semanticKey]) return;

      enrichments.push({ semanticKey, value: val, label });
      sessionStorage.setItem('_cc_enrichments', JSON.stringify(enrichments));
    });
  });
}

function extractFormFields() {
  return extractFormFieldsWithFingerprint().formFields;
}
function fillFormFieldsSequential(mapping, filledBySource) {
  console.log('[CC] v3.26 fillFormFieldsSequential started, fields:', Object.keys(mapping).length);
  // Sort: fill state before district before block (dependent dropdowns)
  const PRIORITY_KEYS = ['state', 'district', 'block', 'panchayat'];
  const entries = Object.entries(mapping);
  entries.sort(([sa], [sb]) => {
    // Use label from filledBySource for priority matching (handles numeric IDs like #17391)
    const labelA = (filledBySource[sa]?.label || sa).toLowerCase();
    const labelB = (filledBySource[sb]?.label || sb).toLowerCase();
    const pa = PRIORITY_KEYS.findIndex(k => labelA.includes(k) || sa.toLowerCase().includes(k));
    const pb = PRIORITY_KEYS.findIndex(k => labelB.includes(k) || sb.toLowerCase().includes(k));
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  });

  let filled = 0;
  let delay = 0;

  function fillOne(selector, value, type) {
    try {
      let el;
      if (selector.startsWith('form-field-') || selector.startsWith('[data-cc-idx')) {
        // legacy fallback
        const all = document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select');
        el = all[parseInt(selector.split('-')[2])];
      } else {
        el = document.querySelector(selector);
      }
      if (!el) return 0;
      // Detect type from DOM directly (more reliable than passed type)
      const tagName = el.tagName.toLowerCase();
      const elType = type === 'ng-dropdown' ? 'ng-dropdown'
        : tagName === 'select' ? 'select'
        : tagName === 'mat-select' ? 'mat-select'
        : tagName === 'mat-checkbox' ? 'mat-checkbox'
        : tagName === 'mat-radio-button' ? 'mat-radio'
        : el.type || 'text';

      // Angular Material mat-select: click trigger, wait for panel, click matching option
      if (elType === 'mat-select') {
        const trigger = el.querySelector('.mat-select-trigger,.mat-mdc-select-trigger') || el;
        trigger.click();
        setTimeout(() => {
          const v = value.toLowerCase().trim();
          const opts = Array.from(document.querySelectorAll('mat-option,.mat-option,.mat-mdc-option'));
          const opt = opts.find(o => o.textContent.trim().toLowerCase() === v) ||
                      opts.find(o => o.textContent.trim().toLowerCase().startsWith(v)) ||
                      opts.find(o => v.startsWith(o.textContent.trim().toLowerCase()) && o.textContent.trim().length > 2) ||
                      opts.find(o => o.textContent.trim().toLowerCase().includes(v));
          if (opt) opt.click(); else document.body.click();
        }, 400);
        return 1; // fire-and-forget, count as filled
      }

      // Angular Material mat-checkbox
      if (elType === 'mat-checkbox') {
        const shouldCheck = /yes|true|1|on|checked/i.test(value);
        const input = el.querySelector('input[type="checkbox"]');
        const isChecked = input ? input.checked : el.classList.contains('mat-checkbox-checked');
        if (shouldCheck !== isChecked) { (input || el).click(); }
        return 1;
      }

      // Angular Material mat-radio-button
      if (elType === 'mat-radio') {
        const v = value.toLowerCase().trim();
        const label = el.textContent.trim().toLowerCase();
        if (label === v || label.includes(v) || v.includes(label)) {
          const input = el.querySelector('input[type="radio"]') || el;
          input.click();
          return 1;
        }
        return 0;
      }

      console.log('[CC] fillOne:', selector, 'elType:', elType, 'value:', value);
      // ng-dropdown: SSC custom dropdown - click value-area, wait for options, click match
      if (elType === 'ng-dropdown' || el.classList.contains('ng-dropdown')) {
        const trigger = el.querySelector('.value-area') || el;
        trigger.click();
        setTimeout(() => {
          const v = value.toLowerCase().trim();
          // After click, find visible option elements - try multiple selectors
          const optSelectors = [
            '.ng-dropdown .option', '.ng-dropdown li',
            '.dropdown-list li', '.dropdown-list .item',
            '.options-container li', '.options-container .option',
            '.custom-dropdown li', '.custom-dropdown .option',
          ];
          // Also look inside the same ng-dropdown element
          const localOpts = Array.from(el.querySelectorAll('li, .option, .item, [class*="option"]'));
          const globalOpts = Array.from(document.querySelectorAll(optSelectors.join(',')));
          const opts = localOpts.length > 1 ? localOpts : globalOpts;
          const opt = opts.find(o => o.textContent.trim().toLowerCase() === v) ||
                      opts.find(o => o.textContent.trim().toLowerCase().includes(v)) ||
                      opts.find(o => v.includes(o.textContent.trim().toLowerCase()) && o.textContent.trim().length > 1);
          if (opt) { opt.click(); return; }
          document.body.click();
        }, 500);
        return 1;
      }

      // radio-click: directly click this specific radio option (matched by label in fuzzyMatch)
      if (type === 'radio-click') {
        el.focus();
        el.checked = true;
        ['click','change'].forEach(ev => el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
        return 1;
      }
      if (elType === 'select') {
        const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const v = norm(value);
        const vWords = v.split(' ').filter(w => w.length > 1);
        const extraValues = [];
        if (mapping[selector]?.monthNum) { extraValues.push(mapping[selector].monthNum.toString()); if (mapping[selector].monthShort) extraValues.push(mapping[selector].monthShort.toLowerCase()); }
        const overlapScore = o => { const ot = norm(o.text); return vWords.filter(w => ot.includes(w)).length; };

        function findOpt(options) {
          const opts = options.filter(o => {
            if (!o.value || o.value === '0' || o.value === '-1' || o.value === '') return false;
            const txt = o.text.toLowerCase();
            // Exclude placeholder/loading options
            if (txt.includes('select') || txt.includes('choose') || txt.includes('loading') || txt === '--') return false;
            return true;
          });
          return opts.find(o => o.value.toLowerCase() === value.toLowerCase().trim()) ||
                 opts.find(o => norm(o.text) === v) ||
                 opts.find(o => norm(o.value) === v) ||
                 (extraValues.length && opts.find(o => extraValues.includes(o.value.toLowerCase()) || extraValues.includes(norm(o.text)))) ||
                 opts.find(o => norm(o.text).startsWith(v) && v.length > 2) ||
                 opts.find(o => v.startsWith(norm(o.text)) && norm(o.text).length > 2) ||
                 opts.find(o => norm(o.text).includes(v) && v.length > 3) ||
                 opts.find(o => v.includes(norm(o.text)) && norm(o.text).length > 3) ||
                 (() => { const best = opts.filter(o => overlapScore(o) === vWords.length && vWords.length > 0); return best.length === 1 ? best[0] : null; })();
        }

        function applySelect(el, opt) {
          el.focus();
          el.dispatchEvent(new Event('focus', { bubbles: true }));

          // Step 1: Mark the option directly (most reliable for ASP.NET/NIC)
          Array.from(el.options).forEach(o => { o.selected = false; });
          opt.selected = true;
          el.selectedIndex = opt.index;

          // Step 2: Sync el.value via native setter
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
          if (nativeSetter) nativeSetter.set.call(el, opt.value);
          else el.value = opt.value;

          // Step 3: Fire full event sequence
          ['mousedown','mouseup','click','input','change'].forEach(ev =>
            el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }))
          );
          // Trigger ASP.NET onchange handler directly if present
          if (typeof el.onchange === 'function') { try { el.onchange.call(el, new Event('change')); } catch(e) { console.debug('[CC] onchange handler error:', e.message); } }
          // propertychange for old ASP.NET/IE compat (optional)
          try { el.dispatchEvent(new Event('propertychange', { bubbles: true })); } catch {}
          el.dispatchEvent(new Event('blur', { bubbles: true }));

          // Step 4: Verify persistence after events (framework may reset)
          setTimeout(() => {
            if (el.value !== opt.value || el.selectedIndex !== opt.index) {
              console.debug('[CC] select reset by framework, re-applying:', selector, opt.value);
              opt.selected = true;
              el.selectedIndex = opt.index;
              if (nativeSetter) nativeSetter.set.call(el, opt.value);
              else el.value = opt.value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            console.debug('[CC] select verify:', selector, 'value:', el.value, 'selectedIndex:', el.selectedIndex, 'expected:', opt.value, opt.index);
          }, 300);

          // Step 5: One more delayed change (no duplicate guard needed — only fires once)
          setTimeout(() => el.dispatchEvent(new Event('change', { bubbles: true })), 700);

          console.debug('[CC] select applied:', selector, '->', opt.text.trim(), '(value:', opt.value, 'index:', opt.index, ')');
          return 1;
        }

        const allOptions = Array.from(el.options);
        const opt = findOpt(allOptions);
        console.debug('[CC] select attempt:', selector, 'value:', value, 'total opts:', allOptions.length, 'matched:', opt ? opt.text.trim() : 'NONE', 'sample:', allOptions.slice(0,3).map(o=>o.value+'='+o.text.trim()));
        if (opt) return applySelect(el, opt);

        // Options not ready yet (dependent dropdown) — schedule retry, count as pending
        // Return 1 optimistically so the filled count isn't 0; retry will apply the value
        let attempts = 0;
        const interval = setInterval(() => {
          const allOpts = Array.from(el.options);
          const realOpts = allOpts.filter(o => {
            if (!o.value || o.value === '0' || o.value === '-1' || o.value === '') return false;
            const txt = o.text.toLowerCase();
            return !txt.includes('select') && !txt.includes('choose') && !txt.includes('loading') && txt !== '--';
          });
          if (realOpts.length === 0 && attempts < 10) { attempts++; return; }
          const opt2 = findOpt(allOpts);
          if (opt2) { clearInterval(interval); applySelect(el, opt2); return; }
          if (++attempts >= 15) {
            clearInterval(interval);
            console.debug('[CC] select no match after wait:', selector, 'value:', value, 'opts:', realOpts.slice(0,5).map(o=>o.text.trim()));
          }
        }, 200);
        return 1; // counted as filled; actual value applied async

      } else if (elType === 'radio') {
        const normR = s => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        const vR = normR(value);
        const radios = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
        const match = Array.from(radios).find(r => {
          if (normR(r.value) === vR) return true;
          const lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
          const lblText = lbl ? normR(lbl.textContent) : '';
          return lblText === vR || lblText.startsWith(vR) || vR.startsWith(lblText);
        });
        if (match) {
          match.focus();
          match.checked = true;
          ['click','change'].forEach(ev => match.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
          match.dispatchEvent(new Event('blur', { bubbles: true }));
          return 1;
        }
      } else if (elType === 'checkbox') {
        // Only fill checkboxes with boolean-like values — never with names/numbers/IDs
        const booleanLike = ['yes','true','1','checked','on','no','false','0','off','unchecked'];
        if (!booleanLike.includes(value.toLowerCase())) { console.debug('[CC] skipped checkbox with non-boolean value:', value); return 0; }
        const truthy = ['yes','true','1','checked','on'].includes(value.toLowerCase());
        if (truthy !== el.checked) { el.checked = truthy; el.dispatchEvent(new Event('change', { bubbles: true })); return 1; }
      } else {
        // ServicePlus/NIC compatible input filling
        // Must: focus → set value via native setter → fire keydown+keypress+keyup+input+change+blur
        el.focus();
        el.dispatchEvent(new Event('focus', { bubbles: true }));
        const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') ||
                    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        if (niv) niv.set.call(el, value);
        else el.value = value;
        // Fire full event sequence that ServicePlus onkeyup handlers expect
        const lastChar = value.slice(-1);
        const lastCode = lastChar.charCodeAt(0) || 0;
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: lastChar, keyCode: lastCode, which: lastCode }));
        el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: lastChar, keyCode: lastCode, which: lastCode }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: lastChar, keyCode: lastCode, which: lastCode }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return 1;
      }
    } catch { /* skip */ }
    return 0;
  }

  for (const [selector, fieldData] of entries) {
    const { value, type } = fieldData;
    const isMatSelect = type === 'mat-select' || type === 'mat-radio';
    const fieldLabel = (filledBySource[selector]?.label || selector).toLowerCase();
    const isDependent = PRIORITY_KEYS.some(k => fieldLabel.includes(k) || selector.toLowerCase().includes(k));
    if (isMatSelect) {
      // mat-select needs real click simulation with delay between each
      setTimeout(() => fillOne(selector, value, type), delay);
      delay += 800;
    } else if (isDependent && filled > 0) {
      setTimeout(() => fillOne(selector, value, type), delay);
      delay += 600;
    } else {
      try { filled += fillOne(selector, value, type) || 0; }
      catch(e) { console.debug('[CC] fillOne error on', selector, ':', e.message); }
      // Fix #2: fill verify/confirm fields by label similarity (re-enter, confirm, verify)
      if (!selector.startsWith('form-field-') || selector.startsWith('[data-cc-idx') && !['select','radio','checkbox','mat-select','mat-radio','mat-checkbox'].includes(type)) {
        const SENSITIVE = ['aadhaar_number','mobile','email','pan_number'];
        const info2 = filledBySource[selector];
        const isSensitive = info2 && SENSITIVE.includes(info2.profileKey);
        // Same-selector duplicates
        const extras = Array.from(document.querySelectorAll(selector)).slice(1);
        // Label-similarity: find inputs whose label contains re/confirm/verify + base label word
        const baseLabel = (info2 && info2.label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (baseLabel.length > 2) {
          document.querySelectorAll('input[type=text],input[type=tel],input[type=email],input[type=number]').forEach(inp => {
            if (extras.includes(inp)) return;
            const lbl = (() => {
              if (inp.id) { const l = document.querySelector('label[for="' + inp.id + '"]'); if (l) return l.textContent.toLowerCase(); }
              const td = inp.closest('td'); if (td && td.previousElementSibling) return td.previousElementSibling.textContent.toLowerCase();
              return inp.placeholder.toLowerCase();
            })();
            const isVerify = /re.?enter|re.?type|confirm|verify/.test(lbl);
            const hasBase = lbl.replace(/[^a-z0-9]/g, '').includes(baseLabel.slice(0, 6));
            if (isVerify && hasBase) extras.push(inp);
          });
        }
        for (const ex of extras) {
          // Strict validation for sensitive fields before filling verify
          if (isSensitive) {
            const pk = info2.profileKey;
            const valid = (pk === 'aadhaar_number' && /^\d{12}$/.test(value)) ||
                          (pk === 'mobile' && /^\d{10}$/.test(value)) ||
                          (pk === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) ||
                          (pk === 'pan_number' && /^[A-Z]{5}\d{4}[A-Z]$/.test(value));
            if (!valid) { console.debug('[CC] skipped verify fill: sensitive field failed validation', pk, value); continue; }
          }
          const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') ||
                      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
          if (niv) niv.set.call(ex, value); else ex.value = value;
          ['input','change'].forEach(ev => ex.dispatchEvent(new Event(ev, { bubbles: true })));
          console.debug('[CC] filled verify field:', selector, '->', ex.id || ex.name, value.slice(0,4) + '***');
          filled++;
        }
      }
    }
  }
  return filled;
}
function fillFormFields(mapping) {
  let filled = 0;
  for (const [selector, { value, type }] of Object.entries(mapping)) {
    try {
      let el;
      if (selector.startsWith('form-field-') || selector.startsWith('[data-cc-idx')) {
        const all = document.querySelectorAll(
          'input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],' +
          'input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select'
        );
        el = all[parseInt(selector.split('-')[2])];
      } else {
        el = document.querySelector(selector);
      }
      if (!el) continue;

      if (type === 'select') {
        const opts = Array.from(el.options).filter(o => o.value && o.value !== '0' && o.value !== '-1');
        const v = value.toLowerCase().trim();
        // For month fields, also try numeric and short name
        const extraValues = [];
        if (mapping[selector]?.monthNum) {
          extraValues.push(mapping[selector].monthNum.toString());
          extraValues.push(mapping[selector].monthShort?.toLowerCase());
        }
        // 1. Exact value match
        let opt = opts.find(o => o.value.toLowerCase() === v);
        // 2. Exact text match
        if (!opt) opt = opts.find(o => o.text.toLowerCase().trim() === v);
        // 3. Extra values (month number/short)
        if (!opt && extraValues.length) opt = opts.find(o => extraValues.includes(o.value.toLowerCase()) || extraValues.includes(o.text.toLowerCase().trim()));
        // 4. Text starts with value
        if (!opt) opt = opts.find(o => o.text.toLowerCase().trim().startsWith(v));
        // 5. Value starts with text
        if (!opt) opt = opts.find(o => v.startsWith(o.text.toLowerCase().trim()) && o.text.length > 2);
        // 6. Text contains value
        if (!opt) opt = opts.find(o => o.text.toLowerCase().includes(v));
        // 7. Value contains text
        if (!opt) opt = opts.find(o => v.includes(o.text.toLowerCase().trim()) && o.text.length > 2);
        // 8. First word match
        if (!opt) {
          const firstWord = v.split(/\s+/)[0];
          opt = opts.find(o => o.text.toLowerCase().startsWith(firstWord) && firstWord.length > 2);
        }
        if (opt) {
          el.value = opt.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          setTimeout(() => el.dispatchEvent(new Event('change', { bubbles: true })), 300);
          filled++;
        }

      } else if (elType === 'radio') {
        // Find radio with matching value or label
        const radios = document.querySelectorAll(`input[type="radio"][name="${el.name}"]`);
        const match = Array.from(radios).find(r =>
          r.value.toLowerCase() === value.toLowerCase() ||
          r.value.toLowerCase().startsWith(value.toLowerCase()[0])
        );
        if (match) { match.checked = true; match.dispatchEvent(new Event('change', { bubbles: true })); filled++; }

      } else if (elType === 'checkbox') {
        const truthy = ['yes', 'true', '1', 'checked'].includes(value.toLowerCase());
        if (truthy !== el.checked) { el.checked = truthy; el.dispatchEvent(new Event('change', { bubbles: true })); filled++; }

      } else {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // React/Vue compatibility
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (nativeInputValueSetter) { nativeInputValueSetter.set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }
        filled++;
      }
    } catch { /* skip */ }
  }
  return filled;
}
