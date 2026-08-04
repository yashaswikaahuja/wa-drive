// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Knowledge Seed Migration (Phase 2.5, Issue #89)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Converts hardcoded extension knowledge into knowledge records.
// Run via: node extension-service/seed-knowledge.js
//
// This does NOT modify the extension code. It generates the seed data
// that the knowledge store should contain so that future phases can
// read from the store instead of hardcoded constants.
//
// Output: Prints JSON records to stdout (pipe to file or POST to API).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { randomUUID } from 'node:crypto';

const records = [];
const now = new Date().toISOString();

function makeRecord(kind, scope, payload, opts = {}) {
  return {
    id: randomUUID(),
    kind,
    version: 1,
    lineage_id: randomUUID(),
    status: 'active',
    scope,
    confidence: opts.confidence ?? 0.9,
    source: { origin: 'imported', actor: 'seed-migration', created_at: now, updated_at: now },
    tags: opts.tags || [],
    payload,
  };
}

const GLOBAL = { level: 'global' };
const INDIA = { level: 'country', country: 'IN' };

// ══════════════════════════════════════════════════════════════════════
// 1. FIELD MAPPINGS (from mapper.js FIELD_ALIASES)
// ══════════════════════════════════════════════════════════════════════

const FIELD_ALIASES = {
  name:           ['candidate_name', 'applicant_name', 'student_name', 'full_name', 'fullname', 'naam', 'applicant_name_english', 'name_english', 'name_in_english', 'your_name', 'enter_name'],
  first_name:     ['firstname', 'fname', 'given_name', 'givenname'],
  middle_name:    ['middlename', 'mname'],
  last_name:      ['lastname', 'lname', 'surname', 'family_name', 'familyname'],
  dob:            ['date_of_birth', 'dateofbirth', 'birth_date', 'janm_tithi', 'birthdate'],
  father_name:    ['fathername', 'fathers_name', 'father_s_name', 'pita_ka_naam', 'pita_naam', 'father', 'father_husband_name', 'pita_pati_ka_naam', 'pitaji_ka_naam'],
  mother_name:    ['mothername', 'mothers_name', 'mother_s_name', 'mata_ka_naam', 'mata_naam', 'mother'],
  address:        ['adress', 'permanent_address', 'correspondence_address', 'residential_address', 'pata', 'niwas', 'full_address'],
  mobile:         ['mobile_no', 'mobile_number', 'phone_no', 'contact_no', 'mo_no', 'sampark', 'phone', 'phone_number', 'sampark_no'],
  email:          ['email_address', 'email_id', 'emailid', 'email_add', 'registered_email'],
  aadhaar_number: ['aadhaar', 'aadhar', 'uid', 'aadhaar_no', 'aadhar_no', 'identity_card_no', 'aadhar_card', 'aadhar_sankhya', 'aadhaar_sankhya'],
  pan_number:     ['pan_no', 'pan_number', 'pancard', 'pan_card'],
  category:       ['caste_category', 'varg', 'social_category', 'reservation_category', 'caste'],
  gender:         ['sex', 'ling'],
  pincode:        ['pin_code', 'postal_code', 'zip_code', 'pin', 'zip'],
  state:          ['state_name', 'rajya', 'home_state', 'permanent_state', 'state_of_residence'],
  district:       ['district_name', 'jila', 'home_district', 'permanent_district'],
  nationality:    ['rashtriyata', 'citizenship', 'citizen'],
  marital_status: ['marital', 'vivah', 'married', 'marriage_status'],
  religion:       ['dharm', 'dharma'],
  village:        ['village_name', 'gram', 'gaon'],
  post_office:    ['post', 'po', 'post_name'],
  police_station: ['thana', 'ps'],
  sub_division:   ['subdivision', 'sub_div', 'anumandal', 'anchal', 'circle'],
  block:          ['block_name', 'taluka', 'tehsil', 'prakhnd'],
  house_no:       ['house_number', 'house', 'flat_no', 'door_no'],
  street:         ['street_name', 'road', 'lane'],
  highest_education_qualification: ['highest_education', 'highest_qualification', 'highest_level_of_education'],
  degree_name:    ['degree', 'qualification_name', 'course_name', 'programme'],
  university_name:['university', 'institution_name', 'college_name', 'college'],
  roll_number:    ['roll_no', 'rollno', 'rollnumber', 'roll'],
  board_10th:     ['matriculation', 'class_10', 'sslc_board', 'class_x', 'tenth_class'],
  board_12th:     ['intermediate', 'class_12', 'class_xii', 'twelfth_class', 'hsc_board'],
  registration_number: ['reg_number', 'reg_no', 'registration_no', 'enrollment_number'],
};

for (const [profileKey, aliases] of Object.entries(FIELD_ALIASES)) {
  records.push(makeRecord('field_mapping', GLOBAL, {
    field_label: profileKey,
    semantic_key: profileKey,
    profile_key: profileKey,
    match_patterns: aliases,
  }, { tags: ['seed', 'field_alias'] }));
}

// ══════════════════════════════════════════════════════════════════════
// 2. SYNONYMS (Hindi/regional equivalents)
// ══════════════════════════════════════════════════════════════════════

const HINDI_SYNONYMS = {
  name: ['नाम', 'naam', 'pratyashi_ka_naam'],
  father_name: ['पिता का नाम', 'pita_ka_naam', 'pitaji_ka_naam'],
  mother_name: ['माता का नाम', 'mata_ka_naam'],
  dob: ['जन्म तिथि', 'janm_tithi'],
  address: ['पता', 'pata', 'niwas'],
  mobile: ['संपर्क', 'sampark', 'sampark_no'],
  gender: ['लिंग', 'ling'],
  category: ['वर्ग', 'varg'],
  state: ['राज्य', 'rajya'],
  district: ['जिला', 'jila'],
  block: ['प्रखंड', 'prakhnd', 'prakhand'],
  sub_division: ['अनुमंडल', 'anumandal'],
  village: ['ग्राम', 'gram', 'gaon'],
  nationality: ['राष्ट्रीयता', 'rashtriyata'],
  marital_status: ['विवाह', 'vivah'],
  religion: ['धर्म', 'dharm', 'dharma'],
  pincode: ['पिन कोड'],
  aadhaar_number: ['आधार संख्या', 'aadhar_sankhya', 'aadhaar_sankhya'],
};

for (const [canonical, variants] of Object.entries(HINDI_SYNONYMS)) {
  records.push(makeRecord('synonym', INDIA, {
    canonical,
    variants,
    language: 'hi',
    domain: 'government_forms',
  }, { tags: ['seed', 'hindi', 'synonym'], confidence: 0.95 }));
}

// ══════════════════════════════════════════════════════════════════════
// 3. CASCADE DEPENDENCIES (from cascade-select.js)
// ══════════════════════════════════════════════════════════════════════

const CASCADE_DEPENDENCIES = {
  district: ['state'],
  sub_division: ['district'],
  subdivision: ['district'],
  block: ['district', 'sub_division'],
  panchayat: ['block'],
  village: ['block'],
  village_panchayat: ['block'],
  post_office: ['block', 'village'],
};

for (const [child, parents] of Object.entries(CASCADE_DEPENDENCIES)) {
  for (const parent of parents) {
    records.push(makeRecord('fill_rule', INDIA, {
      target_semantic_key: child,
      condition: { operator: 'exists', field: parent, value: null },
      action: { type: 'fill', value: null },
    }, { tags: ['seed', 'cascade', 'dependency'] }));
  }
}

// ══════════════════════════════════════════════════════════════════════
// 4. DERIVATION RULES (from derive.js)
// ══════════════════════════════════════════════════════════════════════

records.push(makeRecord('derivation_rule', GLOBAL, {
  output_key: 'highest_education_qualification',
  inputs: ['university_name', 'degree', 'board_12th', 'board_10th'],
  logic: 'highest_education',
  parameters: { levels: ['Graduation', 'Intermediate', 'Matriculation'] },
}, { tags: ['seed', 'derivation', 'education'] }));

records.push(makeRecord('derivation_rule', GLOBAL, {
  output_key: 'age',
  inputs: ['dob'],
  logic: 'age_from_dob',
  parameters: {},
}, { tags: ['seed', 'derivation'] }));

records.push(makeRecord('derivation_rule', GLOBAL, {
  output_key: 'first_name',
  inputs: ['name'],
  logic: 'name_split',
  parameters: { part: 'first' },
}, { tags: ['seed', 'derivation', 'name'] }));

records.push(makeRecord('derivation_rule', GLOBAL, {
  output_key: 'last_name',
  inputs: ['name'],
  logic: 'name_split',
  parameters: { part: 'last' },
}, { tags: ['seed', 'derivation', 'name'] }));

records.push(makeRecord('derivation_rule', GLOBAL, {
  output_key: 'middle_name',
  inputs: ['name'],
  logic: 'name_split',
  parameters: { part: 'middle' },
}, { tags: ['seed', 'derivation', 'name'] }));

records.push(makeRecord('derivation_rule', INDIA, {
  output_key: 'nationality',
  inputs: [],
  logic: 'lookup',
  parameters: { default_value: 'Indian' },
}, { tags: ['seed', 'derivation', 'default'] }));

records.push(makeRecord('derivation_rule', GLOBAL, {
  output_key: 'permanent_address',
  inputs: ['address'],
  logic: 'lookup',
  parameters: { source_key: 'address' },
}, { tags: ['seed', 'derivation', 'address'] }));

records.push(makeRecord('derivation_rule', GLOBAL, {
  output_key: 'domicile_state',
  inputs: ['state'],
  logic: 'lookup',
  parameters: { source_key: 'state' },
}, { tags: ['seed', 'derivation', 'address'] }));

records.push(makeRecord('derivation_rule', GLOBAL, {
  output_key: 'is_graduate',
  inputs: ['university_name', 'degree'],
  logic: 'conditional',
  parameters: { condition: 'has_graduation', true_value: 'Yes', false_value: 'No' },
}, { tags: ['seed', 'derivation', 'education'] }));

// ══════════════════════════════════════════════════════════════════════
// 5. PORTAL DEFINITION (ServicePlus Bihar)
// ══════════════════════════════════════════════════════════════════════

records.push(makeRecord('portal_definition',
  { level: 'portal', portal_id: 'serviceonline.bihar.gov.in' },
  {
    hostname: 'serviceonline.bihar.gov.in',
    display_name: 'ServicePlus Bihar',
    platform: 'serviceplus',
    behaviors: {
      uses_jquery: true,
      uses_dwr: true,
      requires_tab_events: true,
      transliterates_on_tab: true,
      multi_hierarchy: true,
      cascade_delay_ms: 3500,
    },
    forms: [],
  }, { tags: ['seed', 'portal', 'serviceplus'], confidence: 0.95 }
));

// ══════════════════════════════════════════════════════════════════════
// 6. CAPABILITY REFERENCES (15 capabilities from registry.js)
// ══════════════════════════════════════════════════════════════════════

const CAPABILITIES = [
  { name: 'fill_text', desc: 'Fill a text/email/tel/number input with a value' },
  { name: 'select_option', desc: 'Select an option in a native or custom dropdown' },
  { name: 'click', desc: 'Click an element' },
  { name: 'check', desc: 'Check or uncheck a checkbox/radio' },
  { name: 'wait_network', desc: 'Wait for network activity to settle' },
  { name: 'wait_element', desc: 'Wait for an element to appear in DOM' },
  { name: 'wait_time', desc: 'Wait a fixed duration' },
  { name: 'scroll_to', desc: 'Scroll an element into view' },
  { name: 'navigate', desc: 'Navigate to a URL' },
  { name: 'upload_file', desc: 'Upload a file to a file input' },
  { name: 'extract', desc: 'Extract form fields from the page' },
  { name: 'assert', desc: 'Assert a condition on the page state' },
  { name: 'request_human', desc: 'Request human intervention' },
  { name: 'confirm_submission', desc: 'Confirm form submission' },
  { name: 'wait_external', desc: 'Wait for an external event or signal' },
];

for (const cap of CAPABILITIES) {
  records.push(makeRecord('capability_reference', GLOBAL, {
    capability_name: cap.name,
    description: cap.desc,
    parameters: [],
    preconditions: [],
    postconditions: [],
    failure_modes: [],
  }, { tags: ['seed', 'capability'] }));
}

// ══════════════════════════════════════════════════════════════════════
// OUTPUT
// ══════════════════════════════════════════════════════════════════════

console.log(JSON.stringify({ records, count: records.length, generated_at: now }, null, 2));
