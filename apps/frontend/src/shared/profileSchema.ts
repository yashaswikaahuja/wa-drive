export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
}

export interface Section {
  id: string;
  title: string;
  icon: string;
  fields: FieldDef[];
}

// Which document types feed which section (used to place extra/non-schema fields in the right section)
export const SECTION_FOR_DOCTYPE: Record<string, string> = {
  aadhaar: 'identity', pan: 'identity', passport: 'identity', voter_id: 'identity',
  driving_license: 'identity', ration_card: 'identity', ayushman: 'identity',
  marksheet_10th: 'education_10th',
  marksheet_12th: 'education_12th',
  marksheet_graduation: 'education_grad', marksheet_postgrad: 'education_grad',
  admit_card: 'education_grad', result: 'education_grad', certificate: 'education_grad',
  bank_passbook: 'bank',
};

/** Nice titles for dynamic / doc-type sections (fallback when not in PROFILE_SCHEMA). */
export const SECTION_TITLES: Record<string, { title: string; icon: string }> = {
  bank: { title: 'Bank Details', icon: '🏦' },
  personal: { title: 'Personal Details', icon: '👤' },
  identity: { title: 'Identity Documents', icon: '🪪' },
  contact: { title: 'Contact & Address', icon: '📍' },
  education_10th: { title: '10th (Matriculation)', icon: '🎓' },
  education_12th: { title: '12th (Intermediate)', icon: '🎓' },
  education_grad: { title: 'Graduation', icon: '🎓' },
  travel: { title: 'Travel', icon: '🚂' },
};

/**
 * Infer a section id from a field key when documentType is missing.
 * Keeps bank / travel / etc. out of "Other Details".
 */
export function sectionIdForFieldKey(key: string): string | null {
  const k = String(key || '').toLowerCase();
  if (!k || k === 'document_type' || k === 'document_label' || k === 'needs_type') return null;
  if (/_10th$/.test(k)) return 'education_10th';
  if (/_12th$/.test(k)) return 'education_12th';
  if (/_grad$/.test(k)) return 'education_grad';
  if (/^(bank_|ifsc|cif|account_holder|account_number|branch_name)/.test(k) || k === 'ifsc_code' || k === 'cif_number') {
    return 'bank';
  }
  if (/^(ayushman|abha|pmjay)/.test(k)) return 'identity';
  if (/^(departure|arrival|from_station|to_station|journey_date|return_date|travel_class|quota|passenger_count)$/.test(k)) {
    return 'travel';
  }
  return null;
}

function humanizeDocType(dt: string): string {
  if (dt === 'bank_passbook') return 'Bank Details';
  if (dt === 'ayushman') return 'Ayushman Card';
  if (dt === 'other') return 'Other Details';
  return dt.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeFieldKey(key: string): string {
  return key
    .replace(/_(10th|12th|grad)$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export type VisibleSection = {
  id: string;
  title: string;
  icon: string;
  /** Schema fields that belong to this section (may be empty for pure dynamic groups). */
  fields: FieldDef[];
  /** Extra keys present in profile data that aren't in `fields` but belong here. */
  extraKeys: string[];
  dynamic: boolean;
};

/**
 * Build the list of profile sections to render for this person's data.
 * - Known PROFILE_SCHEMA sections appear when they have any data
 * - Remaining keys are grouped by documentType / key pattern into typed sections
 *   (e.g. Bank Details) instead of a single "Other Details" dump
 */
export function buildVisibleSections(raw: Record<string, any> | null | undefined): VisibleSection[] {
  const data = raw || {};
  const flat = flattenProfileData(data);
  const schemaKeys = new Set(PROFILE_SCHEMA.flatMap((s) => s.fields.map((f) => f.key)));
  const NOISE = new Set([
    'stream', 'subject', 'course', 'division', 'percentage', 'marks_obtained', 'total_marks',
    'marks', 'marks_10th', 'marks_graduation', 'percentage_graduation', 'passing_year_graduation',
    'roll_number', 'registration_number', 'enrollment_number', 'exam_date', 'exam_name',
    'graduation_subject', 'board_name', 'document_label', 'document_type', 'needs_type',
  ]);

  const out: VisibleSection[] = [];
  const claimed = new Set<string>();

  for (const section of PROFILE_SCHEMA) {
    const extras: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (schemaKeys.has(k) || NOISE.has(k) || claimed.has(k)) continue;
      const val = v && typeof v === 'object' && 'value' in v ? (v as any).value : v;
      if (!val) continue;
      if (/_10th$/.test(k) && section.id === 'education_10th') { extras.push(k); continue; }
      if (/_12th$/.test(k) && section.id === 'education_12th') { extras.push(k); continue; }
      if (/_grad$/.test(k) && section.id === 'education_grad') { extras.push(k); continue; }
      const dt = v && typeof v === 'object' ? (v as any).documentType : null;
      if (dt && SECTION_FOR_DOCTYPE[dt] === section.id) extras.push(k);
      else if (!dt && sectionIdForFieldKey(k) === section.id) extras.push(k);
    }
    const hasSchemaVal = section.fields.some((f) => !!flat[f.key]);
    if (!hasSchemaVal && extras.length === 0) continue;
    for (const k of extras) claimed.add(k);
    for (const f of section.fields) if (flat[f.key]) claimed.add(f.key);
    out.push({
      id: section.id,
      title: section.title,
      icon: section.icon,
      fields: section.fields,
      extraKeys: extras,
      dynamic: false,
    });
  }

  // Remaining keys → group by resolved section id / title
  const groups: Record<string, { title: string; icon: string; keys: string[] }> = {};
  for (const [k, val] of Object.entries(flat)) {
    if (schemaKeys.has(k) || claimed.has(k) || NOISE.has(k) || !val) continue;
    const rv = data[k];
    const dt = (rv && typeof rv === 'object' && (rv as any).documentType) || null;
    let sectionId = (dt && SECTION_FOR_DOCTYPE[dt]) || sectionIdForFieldKey(k) || null;

    let title: string;
    let icon = '📄';
    if (sectionId && SECTION_TITLES[sectionId]) {
      title = SECTION_TITLES[sectionId].title;
      icon = SECTION_TITLES[sectionId].icon;
    } else if (sectionId) {
      title = humanizeDocType(sectionId);
    } else if (dt) {
      sectionId = `doc_${dt}`;
      const labelEntry = Object.entries(data).find(
        ([kk, vv]: any) => kk === 'document_label' && vv?.documentType === dt,
      );
      title = (labelEntry && (labelEntry[1] as any).value) || humanizeDocType(String(dt));
      if (dt === 'bank_passbook') { title = 'Bank Details'; icon = '🏦'; }
    } else {
      sectionId = 'other';
      title = 'Other Details';
    }

    // Prefer merging into an already-emitted schema section of the same id
    const existing = out.find((s) => s.id === sectionId);
    if (existing) {
      if (!existing.extraKeys.includes(k) && !existing.fields.some((f) => f.key === k)) {
        existing.extraKeys.push(k);
      }
      claimed.add(k);
      continue;
    }

    (groups[sectionId!] ||= { title, icon, keys: [] }).keys.push(k);
    claimed.add(k);
  }

  for (const [id, g] of Object.entries(groups)) {
    out.push({
      id,
      title: g.title,
      icon: g.icon,
      fields: g.keys.map((key) => ({ key, label: humanizeFieldKey(key) })),
      extraKeys: [],
      dynamic: true,
    });
  }

  return out;
}

export const PROFILE_SCHEMA: Section[] = [
  {
    id: 'personal',
    title: 'Personal Details',
    icon: '👤',
    fields: [
      { key: 'name', label: 'Full Name (as per Matriculation)', required: true },
      { key: 'first_name', label: 'First Name' },
      { key: 'middle_name', label: 'Middle Name' },
      { key: 'last_name', label: 'Last Name / Surname' },
      { key: 'father_name', label: "Father's Name", required: true },
      { key: 'mother_name', label: "Mother's Name", required: true },
      { key: 'husband_name', label: "Husband's Name" },
      { key: 'dob', label: 'Date of Birth', required: true },
      { key: 'gender', label: 'Gender', required: true },
      { key: 'marital_status', label: 'Marital Status' },
      { key: 'nationality', label: 'Nationality' },
      { key: 'category', label: 'Category (Gen/OBC/SC/ST)' },
      { key: 'religion', label: 'Religion' },
    ],
  },
  {
    id: 'identity',
    title: 'Identity Documents',
    icon: '🪪',
    fields: [
      { key: 'aadhaar_number', label: 'Aadhaar Number', required: true },
      { key: 'ayushman_id', label: 'Ayushman / ABHA ID' },
      { key: 'name_devanagari', label: 'Name (Hindi)' },
      { key: 'pan_number', label: 'PAN Number' },
      { key: 'voter_id', label: 'Voter ID' },
      { key: 'driving_license', label: 'Driving License' },
    ],
  },
  {
    id: 'contact',
    title: 'Contact & Address',
    icon: '📍',
    fields: [
      { key: 'phone', label: 'Mobile Number' },
      { key: 'email', label: 'Email' },
      { key: 'address', label: 'Current Address', required: true },
      { key: 'permanent_address', label: 'Permanent Address' },
      { key: 'village', label: 'Village' },
      { key: 'block', label: 'Block' },
      { key: 'sub_division', label: 'Sub-Division' },
      { key: 'post_office', label: 'Post Office' },
      { key: 'police_station', label: 'Police Station' },
      { key: 'ward_no', label: 'Ward No.' },
      { key: 'city', label: 'City' },
      { key: 'district', label: 'District' },
      { key: 'state', label: 'State', required: true },
      { key: 'pincode', label: 'PIN Code', required: true },
    ],
  },
  {
    id: 'education_10th',
    title: '10th (Matriculation)',
    icon: '🎓',
    fields: [
      { key: 'board_10th', label: 'Board', required: true },
      { key: 'roll_number_10th', label: 'Roll Number', required: true },
      { key: 'registration_number_10th', label: 'Registration Number' },
      { key: 'certificate_number_10th', label: 'Certificate Number' },
      { key: 'passing_year_10th', label: 'Year of Passing', required: true },
      { key: 'marks_obtained_10th', label: 'Marks Obtained' },
      { key: 'total_marks_10th', label: 'Total Marks' },
      { key: 'percentage_10th', label: 'Percentage' },
      { key: 'division_10th', label: 'Division / Grade' },
      { key: 'school_name', label: 'School Name' },
    ],
  },
  {
    id: 'education_12th',
    title: '12th (Intermediate)',
    icon: '🎓',
    fields: [
      { key: 'board_12th', label: 'Board' },
      { key: 'roll_number_12th', label: 'Roll Number' },
      { key: 'registration_number_12th', label: 'Registration Number' },
      { key: 'certificate_number_12th', label: 'Certificate Number' },
      { key: 'stream_12th', label: 'Stream / Subject' },
      { key: 'passing_year_12th', label: 'Year of Passing' },
      { key: 'marks_obtained_12th', label: 'Marks Obtained' },
      { key: 'total_marks_12th', label: 'Total Marks' },
      { key: 'percentage_12th', label: 'Percentage' },
      { key: 'division_12th', label: 'Division / Grade' },
      { key: 'school_name_12th', label: 'School Name' },
    ],
  },
  {
    id: 'education_grad',
    title: 'Graduation',
    icon: '🎓',
    fields: [
      { key: 'university_name', label: 'University' },
      { key: 'degree', label: 'Degree' },
      { key: 'roll_number_grad', label: 'Roll Number' },
      { key: 'registration_number_grad', label: 'Registration Number' },
      { key: 'passing_year_grad', label: 'Year of Passing' },
      { key: 'marks_obtained_grad', label: 'Marks Obtained' },
      { key: 'total_marks_grad', label: 'Total Marks' },
      { key: 'percentage_grad', label: 'Percentage' },
      { key: 'division_grad', label: 'Division / Grade' },
    ],
  },
  {
    id: 'bank',
    title: 'Bank Details',
    icon: '🏦',
    fields: [
      { key: 'account_holder_name', label: 'Account Holder Name' },
      { key: 'bank_account_number', label: 'Account Number' },
      { key: 'ifsc_code', label: 'IFSC Code' },
      { key: 'cif_number', label: 'CIF Number' },
      { key: 'bank_name', label: 'Bank Name' },
      { key: 'branch_name', label: 'Branch' },
    ],
  },
  // Travel / journey preferences for IRCTC, redBus, Cleartrip, etc. (#312)
  {
    id: 'travel',
    title: 'Travel',
    icon: '🚂',
    fields: [
      { key: 'departure', label: 'Departure / From (city or station)' },
      { key: 'arrival', label: 'Arrival / To (city or station)' },
      { key: 'from_station', label: 'From Station Code / Name' },
      { key: 'to_station', label: 'To Station Code / Name' },
      { key: 'journey_date', label: 'Journey / Travel Date' },
      { key: 'return_date', label: 'Return Date' },
      { key: 'travel_class', label: 'Class (SL/3A/2A/CC/…)' },
      { key: 'quota', label: 'Quota' },
      { key: 'passenger_count', label: 'Number of Passengers' },
    ],
  },
];

export function getCompleteness(data: Record<string, any>): { filled: number; total: number; percent: number; missing: string[] } {
  const required = PROFILE_SCHEMA.flatMap(s => s.fields.filter(f => f.required));
  const missing = required.filter(f => !data[f.key] && !(data[f.key] && typeof data[f.key] === 'object' && data[f.key].value));
  const filled = required.length - missing.length;
  return { filled, total: required.length, percent: Math.round((filled / required.length) * 100), missing: missing.map(f => f.label) };
}

export function flattenProfileData(data: Record<string, any>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(data || {})) {
    flat[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : String(v || '');
  }
  return flat;
}
