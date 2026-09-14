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

/** Kept for readiness % / form required fields — NOT the primary profile UI layout. */
export const SECTION_FOR_DOCTYPE: Record<string, string> = {
  aadhaar: 'identity', pan: 'identity', passport: 'identity', voter_id: 'identity',
  driving_license: 'identity', ration_card: 'identity', ayushman: 'identity',
  marksheet_10th: 'education_10th',
  marksheet_12th: 'education_12th',
  marksheet_graduation: 'education_grad', marksheet_postgrad: 'education_grad',
  admit_card: 'education_grad', result: 'education_grad', certificate: 'education_grad',
  bank_passbook: 'bank',
};

const DOC_CARD_ICONS: Record<string, string> = {
  aadhaar: '🪪', pan: '🪪', passport: '🛂', voter_id: '🪪', driving_license: '🚗',
  ration_card: '🪪', ayushman: '🏥',
  marksheet_10th: '🎓', marksheet_12th: '🎓', marksheet_graduation: '🎓', marksheet_postgrad: '🎓',
  admit_card: '🎫', result: '📊', certificate: '📜',
  bank_passbook: '🏦', form: '📝', photo: '📷', signature: '✍️', other: '📄',
};

const DOC_CARD_TITLES: Record<string, string> = {
  aadhaar: 'Aadhaar', pan: 'PAN', passport: 'Passport', voter_id: 'Voter ID',
  driving_license: 'Driving License', ration_card: 'Ration Card', ayushman: 'Ayushman',
  marksheet_10th: '10th Marksheet', marksheet_12th: '12th Marksheet',
  marksheet_graduation: 'Graduation', marksheet_postgrad: 'Post-Grad',
  admit_card: 'Admit Card', result: 'Result', certificate: 'Certificate',
  bank_passbook: 'Bank Details', form: 'Form', photo: 'Photo', signature: 'Signature',
};

function humanizeDocType(dt: string): string {
  if (DOC_CARD_TITLES[dt]) return DOC_CARD_TITLES[dt];
  if (dt === 'other') return 'Other Details';
  return dt.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeFieldKey(key: string): string {
  return key
    .replace(/_(10th|12th|grad)$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Nice label from PROFILE_SCHEMA when available. */
export function labelForProfileKey(key: string): string {
  for (const s of PROFILE_SCHEMA) {
    const f = s.fields.find((x) => x.key === key);
    if (f) return f.label;
  }
  return humanizeFieldKey(key);
}

export type VisibleSection = {
  id: string;
  title: string;
  icon: string;
  fields: FieldDef[];
  extraKeys: string[];
  dynamic: boolean;
  /** Document type this card came from (when auto-built from provenance). */
  documentType?: string | null;
};

/**
 * Profile UI = one card per source document (zero operator organisation work).
 *
 * Grouping priority (no hardcoded section list to maintain):
 * 1. documentType on the field → card titled Aadhaar / Bank / 10th / …
 * 2. else documentId → card per file; title from matching document_label if any
 * 3. else → "Manually added"
 *
 * Café flow never asks the operator to name sections. New doc types appear as
 * new cards when extract maps + provenance exist.
 */
export function buildVisibleSections(raw: Record<string, any> | null | undefined): VisibleSection[] {
  const data = raw || {};
  const flat = flattenProfileData(data);
  const NOISE = new Set(['document_label', 'document_type', 'needs_type']);

  type Group = { title: string; icon: string; keys: string[]; documentType: string | null };
  const byDoc: Record<string, Group> = {};
  const manualKeys: string[] = [];

  // documentId → best human title from any document_label row sharing that id
  const labelByDocId: Record<string, string> = {};
  for (const [kk, vv] of Object.entries(data)) {
    if (kk !== 'document_label' && !kk.startsWith('document_label')) continue;
    if (!vv || typeof vv !== 'object') continue;
    const id = String((vv as any).documentId || '');
    const label = String((vv as any).value || '').trim();
    if (id && label) labelByDocId[id] = label;
  }

  for (const [k, val] of Object.entries(flat)) {
    if (!val || NOISE.has(k)) continue;
    const rv = data[k];
    const dtRaw = rv && typeof rv === 'object' ? ((rv as any).documentType as string | null | undefined) : null;
    const dt = dtRaw && String(dtRaw).trim() && String(dtRaw) !== 'other' ? String(dtRaw).trim() : null;
    const docId = rv && typeof rv === 'object' ? String((rv as any).documentId || '') : '';

    // 1) Known document type → one card per type
    if (dt) {
      const id = `type_${dt}`;
      const titleFromLabel = Object.entries(data).find(
        ([kk, vv]: any) => kk === 'document_label' && vv?.documentType === dt && vv?.value,
      );
      const title = (titleFromLabel && (titleFromLabel[1] as any).value) || humanizeDocType(dt);
      (byDoc[id] ||= {
        title,
        icon: DOC_CARD_ICONS[dt] || '📄',
        keys: [],
        documentType: dt,
      }).keys.push(k);
      continue;
    }

    // 2) Has documentId but type missing (common after manual Confirm & Save) → card per file
    if (docId) {
      const id = `file_${docId}`;
      const title = labelByDocId[docId] || 'From document';
      (byDoc[id] ||= {
        title,
        icon: '📄',
        keys: [],
        documentType: null,
      }).keys.push(k);
      continue;
    }

    // 3) Pure manual / unknown
    manualKeys.push(k);
  }

  const out: VisibleSection[] = [];

  const orderRank = (dt: string | null, title: string) => {
    if (dt && ['aadhaar', 'pan', 'passport', 'voter_id', 'driving_license', 'ration_card', 'ayushman'].includes(dt)) return 10;
    if (dt && (dt.startsWith('marksheet') || ['admit_card', 'result', 'certificate'].includes(dt))) return 20;
    if (dt === 'bank_passbook' || /bank/i.test(title)) return 30;
    if (dt === 'photo' || dt === 'signature') return 80;
    if (!dt && title === 'From document') return 40;
    return 50;
  };

  const docCards = Object.entries(byDoc).sort((a, b) => {
    const ra = orderRank(a[1].documentType, a[1].title);
    const rb = orderRank(b[1].documentType, b[1].title);
    if (ra !== rb) return ra - rb;
    return a[1].title.localeCompare(b[1].title);
  });

  for (const [id, g] of docCards) {
    const uniq = [...new Set(g.keys)];
    out.push({
      id,
      title: g.title,
      icon: g.icon,
      fields: uniq.map((key) => ({ key, label: labelForProfileKey(key) })),
      extraKeys: [],
      dynamic: true,
      documentType: g.documentType,
    });
  }

  if (manualKeys.length) {
    const uniq = [...new Set(manualKeys)];
    out.push({
      id: 'manual',
      title: 'Manually added',
      icon: '✏️',
      fields: uniq.map((key) => ({ key, label: labelForProfileKey(key) })),
      extraKeys: [],
      dynamic: true,
      documentType: null,
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

/** Always return plain strings — nested objects (e.g. subject→marks maps) must not reach JSX. */
export function flattenProfileData(data: Record<string, any>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(data || {})) {
    let raw: unknown = (v && typeof v === 'object' && v !== null && 'value' in v) ? (v as any).value : v;
    if (raw == null) {
      flat[k] = '';
    } else if (typeof raw === 'object') {
      // Marksheet subject bags etc. — never pass objects to React text nodes (error #31).
      try {
        flat[k] = Object.entries(raw as Record<string, unknown>)
          .map(([sk, sv]) => `${sk}: ${sv == null ? '' : String(sv)}`)
          .join(', ');
      } catch {
        flat[k] = JSON.stringify(raw);
      }
    } else {
      flat[k] = String(raw);
    }
  }
  return flat;
}
