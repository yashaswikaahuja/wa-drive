const CURRENT_VERSION = '3.3';
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
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: fillFormFieldsSequential,
    args: [mapping],
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
        args: [mapping, filledBySource, selectedProfile],
      });
    }

    // Show Save Learning button
    document.getElementById('save-learning-btn').style.display = 'block';
    document.getElementById('save-learning-btn').onclick = async () => {
      // Get enrichments from page
      const enrichResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
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
    showStatus('No fields filled. Check profile data or try with Groq key set.', 'error');
  }
});

// ── Fuzzy matching ────────────────────────────────────────────────────────────
const FIELD_ALIASES = {
  name:           ['candidate_name', 'applicant_name', 'student_name', 'full_name', 'fullname', 'naam', 'name', 'applicant_name_english', 'name_english', 'name_in_english', 'txt_candidate_name', 'txt_name', 'txtcandidatename', 'txtname'],
  dob:            ['dob', 'date_of_birth', 'dateofbirth', 'birth_date', 'janm_tithi', 'janm', 'birthdate', 'date_of_birth_dd_mm_yyyy', 'janm_tithi_', 'txt_dob', 'txtdob', 'txt_date_of_birth'],
  father_name:    ['father_name', 'fathername', 'fathers_name', 'father_s_name', 'pita_ka_naam', 'pita_naam', 'father', 'father_husband_name', 'pita_pati_ka_naam', 'txt_father', 'txtfather', 'txt_father_name'],
  mother_name:    ['mother_name', 'mothername', 'mothers_name', 'mother_s_name', 'mata_ka_naam', 'mata_naam', 'mother', 'txt_mother', 'txtmother', 'txt_mother_name'],
  address:        ['permanent_address', 'correspondence_address', 'residential_address', 'pata', 'niwas'],
  mobile:         ['mobile_no', 'mobile_number', 'phone_no', 'contact_no', 'mo_no', 'sampark', 'mobile', 'phone', 'mobile_no_', 'sampark_no', 'txt_mobile', 'txtmobile', 'txt_mobile_no'],
  email:          ['email_address', 'email_id', 'emailid', 'email_add', 'email', 'txt_email', 'txtemail', 'txt_email_id'],
  aadhaar_number: ['aadhaar', 'aadhar', 'uid', 'aadhaar_no', 'aadhar_no', 'identity_card_no', 'enter_identity', 'aadhaar_number_', 'aadhar_card', 'txt_aadhaar', 'txtaadhaar', 'txt_aadhar'],
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
        // For select: try month name, short name, and number
        const monthVal = field.type === 'select' ? monthNames[monthNum] : dobMonth;
        mapping[field.selector] = { value: monthVal, type: field.type, monthNum, monthShort: monthShort[monthNum] }; continue;
      }
      if (ident.includes('year') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born'))) {
        mapping[field.selector] = { value: dobYear, type: field.type }; continue;
      }
    }

    for (const [profileKey, aliases] of Object.entries(FIELD_ALIASES)) {
      if (!profile[profileKey]) continue;
      if (profileKey === 'name' && (isFatherMother || isStateDistrict)) continue;
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

  inputs.forEach((el, i) => {
    if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
    const label = (() => {
      if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return l.textContent.trim(); }
      const td = el.closest('td');
      if (td) { const prev = td.previousElementSibling; if (prev) return prev.textContent.trim().slice(0, 40); }
      const parent = el.closest('div,td,tr,li,span,p');
      if (parent) { const l = parent.querySelector('label'); if (l) return l.textContent.trim(); }
      if (el.placeholder) return el.placeholder;
      if (el.nextSibling?.textContent) return el.nextSibling.textContent.trim();
      return '';
    })();
    const selector = el.id ? `#${el.id}` : el.name ? `[name="${el.name}"][value="${el.value || ''}"]` : `form-field-${i}`;
    const type = el.tagName === 'SELECT' ? 'select' : el.type || 'text';
    if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
    formFields.push({ selector, id: el.id, name: el.name, value: el.value, placeholder: el.placeholder || '', label, type, index: i });
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
function injectCorrectionObserver(mapping, filledBySource, profile) {
  const corrections = [];
  const enrichments = [];

  // Watch autofilled fields for corrections
  for (const [selector, { value }] of Object.entries(mapping)) {
    try {
      const el = selector.startsWith('form-field-')
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
        corrections.push({ semanticKey: info.semanticKey, oldKey: info.profileKey, newKey: correctedKey || null, corrected: true });
        sessionStorage.setItem('_cc_corrections', JSON.stringify(corrections));
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
function fillFormFieldsSequential(mapping) {
  // Sort: fill state before district before block
  const PRIORITY_KEYS = ['state', 'district', 'block', 'panchayat'];
  const entries = Object.entries(mapping);
  entries.sort(([sa], [sb]) => {
    const pa = PRIORITY_KEYS.findIndex(k => sa.toLowerCase().includes(k));
    const pb = PRIORITY_KEYS.findIndex(k => sb.toLowerCase().includes(k));
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  });

  let filled = 0;
  let delay = 0;
  for (const [selector, fieldData] of entries) {
    const isDependent = PRIORITY_KEYS.some(k => selector.toLowerCase().includes(k));
    if (isDependent && filled > 0) {
      // Schedule dependent fields with delay
      setTimeout(() => fillFormFields({ [selector]: fieldData }), delay);
      delay += 600;
    } else {
      filled += fillFormFields({ [selector]: fieldData });
    }
  }
  return filled;
}
function fillFormFields(mapping) {
  let filled = 0;
  for (const [selector, { value, type }] of Object.entries(mapping)) {
    try {
      let el;
      if (selector.startsWith('form-field-')) {
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

      } else if (type === 'radio') {
        // Find radio with matching value or label
        const radios = document.querySelectorAll(`input[type="radio"][name="${el.name}"]`);
        const match = Array.from(radios).find(r =>
          r.value.toLowerCase() === value.toLowerCase() ||
          r.value.toLowerCase().startsWith(value.toLowerCase()[0])
        );
        if (match) { match.checked = true; match.dispatchEvent(new Event('change', { bubbles: true })); filled++; }

      } else if (type === 'checkbox') {
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
