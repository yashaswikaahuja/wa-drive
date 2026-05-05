const CURRENT_VERSION = '2.0';
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

document.getElementById('autofill-btn').addEventListener('click', async () => {
  if (!selectedProfile) return;
  const { groqKey, backendUrl } = await chrome.storage.local.get(['groqKey', 'backendUrl']);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Generate form key from URL (domain + path)
  const url = new URL(tab.url);
  const formKey = (url.hostname + url.pathname).replace(/[^a-z0-9]/gi, '_').toLowerCase();

  showStatus('Analyzing form...', 'info');

  // Step 1: Get all form fields from the page
  const fields = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractFormFields,
  });

  const formFields = fields?.[0]?.result ?? [];
  if (!formFields.length) { showStatus('No form fields found on this page.', 'error'); return; }

  let mapping = {};

  // Step 2: Check saved mapping for this form
  let savedMapping = null;
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/mappings/${formKey}`);
      savedMapping = await res.json();
    } catch { /* ignore */ }
  }

  if (savedMapping && Object.keys(savedMapping).length > 1) {
    // Use saved mapping — map field selectors to profile values
    showStatus('Using saved form mapping...', 'info');
    for (const [fieldLabel, profileKey] of Object.entries(savedMapping)) {
      if (fieldLabel === 'savedAt') continue;
      const field = formFields.find(f => f.label === fieldLabel || f.id === fieldLabel);
      if (field && selectedProfile[profileKey]) {
        mapping[field.selector] = { value: selectedProfile[profileKey], type: field.type };
      }
    }
  }

  // Step 3: Fuzzy match for unmapped fields
  const unmappedAfterSaved = formFields.filter(f => !mapping[f.selector]);
  const fuzzyResult = fuzzyMatch(unmappedAfterSaved, selectedProfile);
  mapping = { ...mapping, ...fuzzyResult };

  // Step 4: Groq AI for still-unmapped fields (PRIMARY for unknown forms)
  const stillUnmapped = formFields.filter(f => !mapping[f.selector]);
  if (stillUnmapped.length > 0 && groqKey) {
    showStatus(`AI mapping ${stillUnmapped.length} fields...`, 'info');
    const aiMapping = await aiMatch(stillUnmapped, selectedProfile, groqKey);
    mapping = { ...mapping, ...aiMapping };

    // Step 5: Save the AI mapping for next time (self-learning)
    if (backendUrl && Object.keys(aiMapping).length > 0) {
      const toSave = {};
      for (const [selector, { value }] of Object.entries(aiMapping)) {
        const field = formFields.find(f => f.selector === selector);
        if (field?.label) {
          // Find which profile key this value came from
          const profileKey = Object.entries(selectedProfile).find(([, v]) => v === value)?.[0];
          if (profileKey) toSave[field.label] = profileKey;
        }
      }
      if (Object.keys(toSave).length > 0) {
        fetch(`${backendUrl}/mappings/${formKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toSave),
        }).catch(() => {});
      }
    }
  }

  // Step 6: Fill the form
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: fillFormFields,
    args: [mapping],
  });

  const count = result?.[0]?.result ?? 0;
  if (count > 0) {
    document.getElementById('filled-count').textContent = `✓ Filled ${count} field(s)`;
    document.getElementById('filled-count').style.display = 'block';
    showStatus(`Filled ${count} fields successfully!`, 'success');
  } else {
    // Show debug info - what fields were detected
    const debugFields = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const inputs = document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select');
        return Array.from(inputs).slice(0,5).map(el => {
          const label = (() => {
            if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return l.textContent.trim(); }
            const td = el.closest('td'); if (td) { const prev = td.previousElementSibling; if (prev) return prev.textContent.trim().slice(0,30); }
            return el.placeholder || el.name || el.id || '?';
          })();
          return `${el.id||el.name}: "${label}"`;
        }).join('\n');
      }
    });
    const debug = debugFields?.[0]?.result || 'No fields found';
    showStatus(`No fields filled. Detected:\n${debug}`, 'error');
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
  domicile_state: ['domicile', 'domicile_state', 'home_state', 'state_of_domicile'],
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
    if (isEducationRow) continue;
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
      const months = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
      if (ident.includes('day') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born'))) {
        mapping[field.selector] = { value: dobDay, type: field.type }; continue;
      }
      if (ident.includes('month') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born'))) {
        // Try numeric month first, then month name
        const monthVal = field.type === 'select' ? (parseInt(dobMonth)).toString() : dobMonth;
        mapping[field.selector] = { value: monthVal, type: field.type }; continue;
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

// ── Content script functions (run in page context) ────────────────────────────
function extractFormFields() {
  const inputs = document.querySelectorAll(
    'input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],' +
    'input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select'
  );
  const fields = [];
  inputs.forEach((el, i) => {
    if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
    const label = (() => {
      // Standard label[for] association
      if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return l.textContent.trim(); }
      // ServicePlus uses td > label pattern in tables
      const td = el.closest('td');
      if (td) {
        const prevTd = td.previousElementSibling;
        if (prevTd) return prevTd.textContent.trim();
      }
      // Generic parent search
      const parent = el.closest('div,td,tr,li,span,p');
      if (parent) {
        const l = parent.querySelector('label');
        if (l) return l.textContent.trim();
        // Text node before input
        const prev = el.previousSibling;
        if (prev && prev.nodeType === 3 && prev.textContent.trim()) return prev.textContent.trim();
      }
      // Placeholder as fallback
      if (el.placeholder) return el.placeholder;
      // Radio/checkbox: text after element
      if (el.nextSibling && el.nextSibling.textContent) return el.nextSibling.textContent.trim();
      return '';
    })();
    const selector = el.id ? `#${el.id}` : el.name ? `[name="${el.name}"][value="${el.value || ''}"]` : `form-field-${i}`;
    const type = el.tagName === 'SELECT' ? 'select' : el.type || 'text';
    fields.push({ selector, id: el.id, name: el.name, value: el.value, placeholder: el.placeholder || '', label, type, index: i });
  });
  return fields;
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
        // Try exact match first, then partial
        const opts = Array.from(el.options);
        const opt = opts.find(o => o.value.toLowerCase() === value.toLowerCase()) ||
                    opts.find(o => o.text.toLowerCase() === value.toLowerCase()) ||
                    opts.find(o => o.text.toLowerCase().includes(value.toLowerCase())) ||
                    opts.find(o => value.toLowerCase().includes(o.text.toLowerCase()) && o.text.length > 2);
        if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); filled++; }

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
