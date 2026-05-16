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

export const PROFILE_SCHEMA: Section[] = [
  {
    id: 'personal',
    title: 'Personal Details',
    icon: '👤',
    fields: [
      { key: 'name', label: 'Name (as per Matriculation)', required: true },
      { key: 'father_name', label: "Father's Name", required: true },
      { key: 'mother_name', label: "Mother's Name", required: true },
      { key: 'dob', label: 'Date of Birth', required: true },
      { key: 'gender', label: 'Gender', required: true },
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
      { key: 'mobile', label: 'Mobile Number' },
      { key: 'email', label: 'Email' },
      { key: 'address', label: 'Current Address', required: true },
      { key: 'permanent_address', label: 'Permanent Address' },
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
      { key: 'passing_year_10th', label: 'Year of Passing', required: true },
      { key: 'percentage_10th', label: 'Marks / Percentage' },
    ],
  },
  {
    id: 'education_12th',
    title: '12th (Intermediate)',
    icon: '🎓',
    fields: [
      { key: 'board_12th', label: 'Board' },
      { key: 'stream_12th', label: 'Stream / Subject' },
      { key: 'passing_year_12th', label: 'Year of Passing' },
      { key: 'percentage_12th', label: 'Marks / Percentage' },
    ],
  },
  {
    id: 'education_grad',
    title: 'Graduation',
    icon: '🎓',
    fields: [
      { key: 'university_grad', label: 'University' },
      { key: 'degree_grad', label: 'Degree' },
      { key: 'passing_year_grad', label: 'Year of Passing' },
      { key: 'percentage_grad', label: 'Marks / Percentage' },
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
