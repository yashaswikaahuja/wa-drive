// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Derivation Engine — extension-service/derivation-engine.js
// Phase 4.2 — Server-Side Derived Values
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Computes derived values from a user profile using derivation_rule
// knowledge records. Called by fill-planner.js to enrich the profile
// with computed fields before the mapping engine resolves fill values.
//
// Supported transformations:
//   - concatenate_name: joins first/middle/last name parts with space
//   - extract_day, extract_month, extract_year: from ISO date string
//   - format_date: converts ISO date to target format
//   - calculate_age: from DOB to current age (integer)
//   - uppercase, lowercase, title_case: string transforms
//   - extract_phone_country, extract_phone_number: split phone
//   - format_currency: number to locale currency string
//   - name_split: extract name part (first/middle/last)
//   - age_from_dob: alias for calculate_age
//   - lookup: passthrough/default value
//   - highest_education: derive highest qualification
//   - concatenate: generic multi-source join
//   - gender_from_name / salutation_from_gender / skip_if_unmarried / changed_name_only_if_set (T8)
//
// Architecture:
//   All planning, AI, knowledge interpretation, and learning happen
//   server-side. The extension only observes and executes.
//
// Does NOT own: DOM interaction, execution, perception, AI reasoning.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * @typedef {object} DerivationRule
 * @property {string} id — Knowledge record ID
 * @property {string} kind — Always 'derivation_rule'
 * @property {object} payload
 * @property {string} payload.output_key — Derived field key
 * @property {string[]} payload.inputs — Source profile keys
 * @property {string} payload.logic — Transformation identifier
 * @property {object} [payload.parameters] — Additional transform config
 */

/**
 * @typedef {object} DerivationResult
 * @property {Map<string, string|null>} values — derived_key → computed_value
 * @property {string[]} applied — Rule IDs that produced non-null values
 * @property {string[]} skipped — Rule IDs where source data was missing
 * @property {string[]} errors — Rule IDs that threw during computation
 */

// ── Date Parsing ────────────────────────────────────────────────────

/**
 * Parse a date string in multiple common formats.
 * Supports ISO (YYYY-MM-DD), DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY.
 *
 * @param {string} dateStr — Raw date string
 * @returns {{ day: number, month: number, year: number }|null}
 */
function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();

  // ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return {
      year: parseInt(isoMatch[1], 10),
      month: parseInt(isoMatch[2], 10),
      day: parseInt(isoMatch[3], 10),
    };
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (Indian format — assumed default)
  const ddmmyyyy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (ddmmyyyy) {
    return {
      day: parseInt(ddmmyyyy[1], 10),
      month: parseInt(ddmmyyyy[2], 10),
      year: parseInt(ddmmyyyy[3], 10),
    };
  }

  // Try native Date parsing as last resort
  const native = new Date(dateStr);
  if (!isNaN(native.getTime())) {
    return {
      year: native.getFullYear(),
      month: native.getMonth() + 1,
      day: native.getDate(),
    };
  }

  return null;
}

// ── Value Extraction Helpers ────────────────────────────────────────

/**
 * Safely extract the string value from a profile entry.
 * Profile entries can be { value, confidence, ... } or plain strings.
 *
 * @param {object|string|null|undefined} entry
 * @returns {string|null}
 */
function extractValue(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') return entry.trim() || null;
  if (typeof entry === 'number') return String(entry);
  const val = String(entry.value ?? '').trim();
  return val || null;
}

/**
 * Resolve a source key from the profile, returning the string value or null.
 *
 * @param {object} profile — Profile data map
 * @param {string} key — Profile key to look up
 * @returns {string|null}
 */
function getProfileValue(profile, key) {
  if (!profile || !key) return null;
  const entry = profile[key];
  return extractValue(entry);
}

// ── Transformation Functions ────────────────────────────────────────

/**
 * concatenate_name: Joins first/middle/last name parts with a separator.
 * Falls back to generic concatenation of input keys.
 *
 * @param {string[]} inputs — Source profile keys (first_name, middle_name, last_name)
 * @param {object} profile
 * @param {object} parameters — { separator?: string }
 * @returns {string|null}
 */
function concatenateName(inputs, profile, parameters = {}) {
  const separator = parameters.separator ?? ' ';
  const parts = inputs.map(key => getProfileValue(profile, key)).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(separator).trim() || null;
}

/**
 * concatenate: Generic multi-source concatenation.
 *
 * @param {string[]} inputs
 * @param {object} profile
 * @param {object} parameters — { separator?: string, skip_empty?: boolean }
 * @returns {string|null}
 */
function concatenate(inputs, profile, parameters = {}) {
  const separator = parameters.separator ?? ' ';
  const skipEmpty = parameters.skip_empty !== false;

  const parts = inputs.map(key => getProfileValue(profile, key) || '');
  const filtered = skipEmpty ? parts.filter(p => p.length > 0) : parts;
  const result = filtered.join(separator).trim();
  return result || null;
}

/**
 * extract_day: Extract day component from a date string.
 *
 * @param {string[]} inputs — [date_source_key]
 * @param {object} profile
 * @param {object} parameters — { zero_pad?: boolean }
 * @returns {string|null}
 */
function extractDay(inputs, profile, parameters = {}) {
  const sourceKey = inputs[0];
  const rawValue = getProfileValue(profile, sourceKey);
  if (!rawValue) return null;

  const date = parseDate(rawValue);
  if (!date) return null;

  const zeroPad = parameters.zero_pad !== false;
  return zeroPad ? String(date.day).padStart(2, '0') : String(date.day);
}

/**
 * extract_month: Extract month component from a date string.
 *
 * @param {string[]} inputs — [date_source_key]
 * @param {object} profile
 * @param {object} parameters — { zero_pad?: boolean }
 * @returns {string|null}
 */
function extractMonth(inputs, profile, parameters = {}) {
  const sourceKey = inputs[0];
  const rawValue = getProfileValue(profile, sourceKey);
  if (!rawValue) return null;

  const date = parseDate(rawValue);
  if (!date) return null;

  const zeroPad = parameters.zero_pad !== false;
  return zeroPad ? String(date.month).padStart(2, '0') : String(date.month);
}

/**
 * extract_year: Extract year component from a date string.
 *
 * @param {string[]} inputs — [date_source_key]
 * @param {object} profile
 * @returns {string|null}
 */
function extractYear(inputs, profile) {
  const sourceKey = inputs[0];
  const rawValue = getProfileValue(profile, sourceKey);
  if (!rawValue) return null;

  const date = parseDate(rawValue);
  if (!date) return null;

  return String(date.year);
}

/**
 * format_date: Convert a date to a target format string.
 * Supported formats: dd/mm/yyyy, mm/dd/yyyy, yyyy-mm-dd, dd-mm-yyyy, mm-dd-yyyy, dd.mm.yyyy
 *
 * @param {string[]} inputs — [date_source_key]
 * @param {object} profile
 * @param {object} parameters — { format?: string }
 * @returns {string|null}
 */
function formatDate(inputs, profile, parameters = {}) {
  const sourceKey = inputs[0];
  const rawValue = getProfileValue(profile, sourceKey);
  if (!rawValue) return null;

  const date = parseDate(rawValue);
  if (!date) return null;

  const format = (parameters.format || 'dd/mm/yyyy').toLowerCase();
  const dd = String(date.day).padStart(2, '0');
  const mm = String(date.month).padStart(2, '0');
  const yyyy = String(date.year);

  return format
    .replace('dd', dd)
    .replace('mm', mm)
    .replace('yyyy', yyyy);
}

/**
 * calculate_age / age_from_dob: Compute current age from date of birth.
 *
 * @param {string[]} inputs — [dob_source_key]
 * @param {object} profile
 * @param {object} parameters — { reference_date?: string } for testing
 * @returns {string|null}
 */
function calculateAge(inputs, profile, parameters = {}) {
  const sourceKey = inputs[0];
  const rawValue = getProfileValue(profile, sourceKey);
  if (!rawValue) return null;

  const dob = parseDate(rawValue);
  if (!dob) return null;

  // Allow injecting reference date for deterministic testing
  const today = parameters.reference_date
    ? parseDate(parameters.reference_date) || _today()
    : _today();

  let age = today.year - dob.year;
  const monthDiff = today.month - dob.month;
  if (monthDiff < 0 || (monthDiff === 0 && today.day < dob.day)) {
    age--;
  }

  if (age < 0) return null;
  return String(age);
}

/** @returns {{ day: number, month: number, year: number }} */
function _today() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/**
 * uppercase: Convert string value to uppercase.
 *
 * @param {string[]} inputs — [source_key]
 * @param {object} profile
 * @returns {string|null}
 */
function uppercase(inputs, profile) {
  const sourceKey = inputs[0];
  const rawValue = getProfileValue(profile, sourceKey);
  if (!rawValue) return null;
  return rawValue.toUpperCase();
}

/**
 * lowercase: Convert string value to lowercase.
 *
 * @param {string[]} inputs — [source_key]
 * @param {object} profile
 * @returns {string|null}
 */
function lowercase(inputs, profile) {
  const sourceKey = inputs[0];
  const rawValue = getProfileValue(profile, sourceKey);
  if (!rawValue) return null;
  return rawValue.toLowerCase();
}

/**
 * title_case: Convert string to Title Case (capitalize first letter of each word).
 *
 * @param {string[]} inputs — [source_key]
 * @param {object} profile
 * @returns {string|null}
 */
function titleCase(inputs, profile) {
  const sourceKey = inputs[0];
  const rawValue = getProfileValue(profile, sourceKey);
  if (!rawValue) return null;
  return rawValue
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, char => char.toUpperCase());
}

/**
 * extract_phone_country: Extract country code from a phone number.
 * Assumes format like +91-9876543210, +91 9876543210, or 919876543210.
 *
 * @param {string[]} inputs — [phone_source_key]
 * @param {object} profile
 * @param {object} parameters — { default_country_code?: string }
 * @returns {string|null}
 */
function extractPhoneCountry(inputs, profile, parameters = {}) {
  const sourceKey = inputs[0];
  const rawValue = getProfileValue(profile, sourceKey);
  if (!rawValue) return parameters.default_country_code || null;

  const cleaned = rawValue.replace(/[\s\-().]/g, '');

  // Strip + prefix for digit analysis
  const digits = cleaned.replace(/^\+/, '');
  const hadPlus = cleaned.startsWith('+');
  const totalDigits = digits.length;

  // Known country code patterns by total length
  // India: +91 + 10 digits = 12
  if ((hadPlus || totalDigits === 12) && digits.startsWith('91') && totalDigits === 12) return '+91';

  // US/Canada: +1 + 10 digits = 11
  if ((hadPlus || totalDigits === 11) && digits.startsWith('1') && totalDigits === 11) return '+1';

  // UK: +44 + 10-11 digits = 12-13
  if ((hadPlus || totalDigits >= 12) && digits.startsWith('44') && (totalDigits === 12 || totalDigits === 13)) return '+44';

  // Bangladesh: +880 + 10 digits = 13
  if (digits.startsWith('880') && totalDigits === 13) return '+880';

  // Nepal: +977 + 10 digits = 13
  if (digits.startsWith('977') && totalDigits === 13) return '+977';

  // Generic: if had + prefix, try to infer code length from total digits
  // Assume local number is 10 digits, code is remainder
  if (hadPlus && totalDigits > 10) {
    const codeLen = totalDigits - 10;
    if (codeLen >= 1 && codeLen <= 4) {
      return '+' + digits.slice(0, codeLen);
    }
  }

  return parameters.default_country_code || null;
}

/**
 * extract_phone_number: Extract the local phone number (without country code).
 *
 * @param {string[]} inputs — [phone_source_key]
 * @param {object} profile
 * @param {object} parameters — { expected_length?: number }
 * @returns {string|null}
 */
function extractPhoneNumber(inputs, profile, parameters = {}) {
  const sourceKey = inputs[0];
  const rawValue = getProfileValue(profile, sourceKey);
  if (!rawValue) return null;

  const cleaned = rawValue.replace(/[\s\-().]/g, '');
  const expectedLength = parameters.expected_length || 10;

  // Already the right length — return as-is
  if (/^\d+$/.test(cleaned) && cleaned.length === expectedLength) {
    return cleaned;
  }

  // Strip + prefix and known country codes
  let digits = cleaned.replace(/^\+/, '');

  // Strip leading 91 for India (if 12 digits)
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }

  // Strip leading 1 for US/Canada (if 11 digits)
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }

  // Strip leading 44 for UK (if 12-13 digits)
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('44')) {
    return digits.slice(2);
  }

  // Take last N digits as fallback
  if (digits.length > expectedLength) {
    return digits.slice(-expectedLength);
  }

  return digits || null;
}

/**
 * format_currency: Format a number as a locale-aware currency string.
 *
 * @param {string[]} inputs — [amount_source_key]
 * @param {object} profile
 * @param {object} parameters — { locale?: string, currency?: string, style?: string }
 * @returns {string|null}
 */
function formatCurrency(inputs, profile, parameters = {}) {
  const sourceKey = inputs[0];
  const rawValue = getProfileValue(profile, sourceKey);
  if (!rawValue) return null;

  // Parse numeric value (strip commas, currency symbols)
  const cleaned = rawValue.replace(/[₹$€£¥,\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  const locale = parameters.locale || 'en-IN';
  const currency = parameters.currency || 'INR';
  const style = parameters.style || 'currency';

  try {
    if (style === 'plain') {
      // Return formatted number without currency symbol
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: parameters.decimals ?? 2,
        maximumFractionDigits: parameters.decimals ?? 2,
      }).format(num);
    }
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(num);
  } catch {
    // Fallback for environments without full Intl support
    return num.toFixed(parameters.decimals ?? 2);
  }
}

/**
 * name_split: Extract a specific part of a full name.
 *
 * @param {string[]} inputs — [full_name_key]
 * @param {object} profile
 * @param {object} parameters — { part: 'first'|'middle'|'last', target?: string }
 * @returns {string|null}
 */
function nameSplit(inputs, profile, parameters = {}) {
  const sourceKey = inputs[0];
  const rawValue = getProfileValue(profile, sourceKey);
  if (!rawValue) return null;

  const parts = rawValue.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const target = parameters.part || parameters.target || 'first';

  switch (target) {
    case 'first':
      return parts[0] || null;
    case 'middle':
      return parts.length > 2 ? parts.slice(1, -1).join(' ') : null;
    case 'last':
      return parts.length > 1 ? parts[parts.length - 1] : null;
    default:
      return null;
  }
}

/**
 * lookup: Passthrough or default value derivation.
 * Copies a value from one profile key to another, or provides a default.
 *
 * @param {string[]} inputs — Source keys (optional)
 * @param {object} profile
 * @param {object} parameters — { source_key?: string, default_value?: string }
 * @returns {string|null}
 */
function lookup(inputs, profile, parameters = {}) {
  // If source_key is specified, use that
  const sourceKey = parameters.source_key || inputs[0];
  if (sourceKey) {
    const val = getProfileValue(profile, sourceKey);
    if (val) return val;
  }

  // Fall back to iterating inputs
  for (const key of inputs) {
    const val = getProfileValue(profile, key);
    if (val) return val;
  }

  // Last resort: default_value
  return parameters.default_value || null;
}

/**
 * highest_education: Derive highest education level from available qualifications.
 *
 * @param {string[]} inputs — Profile keys to check (university_name, degree, board_12th, etc.)
 * @param {object} profile
 * @param {object} parameters — { levels?: string[] }
 * @returns {string|null}
 */
function highestEducation(inputs, profile, parameters = {}) {
  const levels = parameters.levels || [
    'Post-Graduation', 'Graduation', 'Intermediate', 'Matriculation',
  ];

  // Check inputs in order — the first one with a value indicates the highest level
  for (let i = 0; i < inputs.length; i++) {
    const val = getProfileValue(profile, inputs[i]);
    if (val) {
      // Map input index to level
      return levels[i] || val;
    }
  }

  return null;
}

/**
 * T8 — gender_from_name: Indian first-name heuristic when gender missing.
 * Conservative: only high-confidence common endings; else null (no guessing).
 */
function genderFromName(inputs, profile, parameters = {}) {
  // Prefer explicit gender if present
  const existing = getProfileValue(profile, 'gender') || getProfileValue(profile, 'sex');
  if (existing) return existing;

  const nameKey = inputs[0] || 'first_name';
  let name = getProfileValue(profile, nameKey)
    || getProfileValue(profile, 'first_name')
    || getProfileValue(profile, 'name')
    || getProfileValue(profile, 'full_name');
  if (!name) return null;
  // Use first token
  const first = name.trim().split(/\s+/)[0].toLowerCase();
  if (first.length < 3) return null;

  // Common feminine endings (conservative list)
  const femaleEnds = ['a', 'i', 'ee', 'ya', 'ika', 'ita', 'sha', 'si', 'ti', 'ni', 'li', 'ri'];
  const femaleExact = new Set([
    'priya', 'pooja', 'puja', 'neha', 'anjali', 'kavita', 'sunita', 'anita', 'meena',
    'rekha', 'geeta', 'gita', 'sita', 'radha', 'usha', 'asha', 'nisha', 'divya',
    'shweta', 'swati', 'ritu', 'richa', 'komal', 'jyoti', 'deepa', 'seema', 'reena',
    'fatima', 'aisha', 'zara', 'mary', 'grace',
  ]);
  const maleExact = new Set([
    'raj', 'ram', 'amit', 'rahul', 'rohit', 'vikas', 'suresh', 'ramesh', 'mahesh',
    'dinesh', 'naresh', 'hitesh', 'vijay', 'ajay', 'sanjay', 'manoj', 'pankaj',
    'ankit', 'nitin', 'deepak', 'vivek', 'pradeep', 'sandeep', 'kuldeep',
    'mohammed', 'mohammad', 'ahmed', 'ali', 'john', 'james', 'david',
  ]);

  if (femaleExact.has(first)) return parameters.female_label || 'Female';
  if (maleExact.has(first)) return parameters.male_label || 'Male';

  // Ending heuristics (weak) — only if very common
  if (first.endsWith('wati') || first.endsWith('preet') && first.includes('kaur')) {
    return parameters.female_label || 'Female';
  }
  if (first.endsWith('jeet') || first.endsWith('pal') || first.endsWith('dev')) {
    return parameters.male_label || 'Male';
  }

  // Feminine 'a' ending is common but also exists for males (e.g. Krishna) — skip unless exact
  void femaleEnds;
  return null;
}

/**
 * T8 — salutation_from_gender: Mr/Mrs/Ms from gender + marital when present.
 */
function salutationFromGender(inputs, profile, parameters = {}) {
  const gender = (
    getProfileValue(profile, 'gender')
    || getProfileValue(profile, 'sex')
    || genderFromName(inputs, profile, parameters)
    || ''
  ).toLowerCase();
  const marital = (
    getProfileValue(profile, 'marital_status')
    || getProfileValue(profile, 'marital')
    || ''
  ).toLowerCase();

  if (/female|f\b|woman|महिला/.test(gender)) {
    if (/married|widow|widow/.test(marital)) return parameters.mrs || 'Mrs';
    return parameters.ms || 'Ms';
  }
  if (/male|m\b|man|पुरुष/.test(gender)) {
    return parameters.mr || 'Mr';
  }
  return null;
}

/**
 * T8 — skip_if_unmarried: return null when marital is unmarried (husband field).
 * When married, pass through spouse/husband source.
 */
function skipIfUnmarried(inputs, profile, parameters = {}) {
  const marital = (
    getProfileValue(profile, 'marital_status')
    || getProfileValue(profile, 'marital')
    || getProfileValue(profile, 'married')
    || ''
  ).toLowerCase();
  if (/unmarried|single|never\s*married|कुंवार/.test(marital)) {
    return null;
  }
  const sourceKey = parameters.source_key || inputs[0] || 'husband_name';
  return getProfileValue(profile, sourceKey)
    || getProfileValue(profile, 'spouse_name')
    || getProfileValue(profile, 'husband_name')
    || null;
}

/**
 * T8 — changed_name_only_if_set: do not fill "changed name" with full name unless profile has it.
 */
function changedNameOnlyIfSet(inputs, profile) {
  const key = inputs[0] || 'changed_name';
  const v = getProfileValue(profile, key)
    || getProfileValue(profile, 'name_change')
    || getProfileValue(profile, 'previous_name');
  return v || null;
}

// ── Transformation Registry ─────────────────────────────────────────

/**
 * Registry mapping logic identifiers to transformation functions.
 * Each function signature: (inputs, profile, parameters) → string|null
 */
const TRANSFORMATIONS = {
  // Name transforms
  concatenate_name: concatenateName,
  concatenate: concatenate,
  name_split: nameSplit,

  // Date extraction
  extract_day: extractDay,
  extract_month: extractMonth,
  extract_year: extractYear,

  // Date formatting
  format_date: formatDate,
  date_format: formatDate, // alias used in existing seed data

  // Age calculation
  calculate_age: calculateAge,
  age_from_dob: calculateAge, // alias used in existing seed data

  // String transforms
  uppercase,
  lowercase,
  title_case: titleCase,

  // Phone extraction
  extract_phone_country: extractPhoneCountry,
  extract_phone_number: extractPhoneNumber,

  // Currency formatting
  format_currency: formatCurrency,

  // Passthrough / defaults
  lookup,

  // Education
  highest_education: highestEducation,

  // T8 common-sense pack
  gender_from_name: genderFromName,
  salutation_from_gender: salutationFromGender,
  skip_if_unmarried: skipIfUnmarried,
  changed_name_only_if_set: changedNameOnlyIfSet,
};

// ── Main Engine ─────────────────────────────────────────────────────

/**
 * Compute all derived values for a profile given a set of derivation rules.
 * This is the main entry point — called by fill-planner.js to enrich the
 * profile before the mapping engine resolves fill values.
 *
 * @param {object} profile — User's profile data (key → { value, confidence, ... } or string)
 * @param {DerivationRule[]} rules — Array of derivation_rule knowledge records
 * @returns {DerivationResult}
 *
 * @example
 * ```js
 * import { computeDerivedValues } from './derivation-engine.js';
 *
 * const profile = {
 *   first_name: { value: 'Rajesh', confidence: 0.95 },
 *   middle_name: { value: 'Kumar', confidence: 0.90 },
 *   last_name: { value: 'Singh', confidence: 0.95 },
 *   dob: { value: '1995-03-15', confidence: 0.98 },
 * };
 *
 * const rules = [
 *   { id: 'r1', kind: 'derivation_rule', payload: {
 *     output_key: 'full_name', inputs: ['first_name', 'middle_name', 'last_name'],
 *     logic: 'concatenate_name', parameters: {} }},
 *   { id: 'r2', kind: 'derivation_rule', payload: {
 *     output_key: 'birth_day', inputs: ['dob'],
 *     logic: 'extract_day', parameters: {} }},
 * ];
 *
 * const result = computeDerivedValues(profile, rules);
 * // result.values → Map { 'full_name' => 'Rajesh Kumar Singh', 'birth_day' => '15' }
 * ```
 */
export function computeDerivedValues(profile, rules) {
  /** @type {Map<string, string|null>} */
  const values = new Map();
  /** @type {string[]} */
  const applied = [];
  /** @type {string[]} */
  const skipped = [];
  /** @type {string[]} */
  const errors = [];

  if (!profile || !Array.isArray(rules)) {
    return { values, applied, skipped, errors };
  }

  for (const rule of rules) {
    const ruleId = rule.id || rule.lineage_id || 'unknown';

    try {
      const payload = rule.payload;
      if (!payload || !payload.output_key || !payload.logic) {
        errors.push(ruleId);
        continue;
      }

      const logic = payload.logic;
      const inputs = payload.inputs || [];
      const parameters = payload.parameters || {};
      const outputKey = payload.output_key;

      // Look up the transformation function
      const transformFn = TRANSFORMATIONS[logic];
      if (!transformFn) {
        // Unknown logic — skip gracefully
        errors.push(ruleId);
        continue;
      }

      // Check if at least one input has a value (for non-lookup rules).
      // T8 common-sense rules may scan multiple profile keys internally.
      const softInputLogics = new Set([
        'lookup',
        'gender_from_name',
        'salutation_from_gender',
        'skip_if_unmarried',
        'changed_name_only_if_set',
        'highest_education',
      ]);
      if (!softInputLogics.has(logic) && inputs.length > 0) {
        const hasAnyInput = inputs.some(key => getProfileValue(profile, key) !== null);
        if (!hasAnyInput) {
          skipped.push(ruleId);
          values.set(outputKey, null);
          continue;
        }
      }

      // Execute the transformation
      const result = transformFn(inputs, profile, parameters);
      values.set(outputKey, result);

      if (result !== null) {
        applied.push(ruleId);
      } else {
        skipped.push(ruleId);
      }
    } catch (err) {
      errors.push(ruleId);
      values.set(rule.payload?.output_key || `__error_${ruleId}`, null);
    }
  }

  return { values, applied, skipped, errors };
}

/**
 * Enrich a profile object with derived values.
 * Merges computed derivations back into the profile structure,
 * using a standard format compatible with the rest of the pipeline.
 *
 * Derived values are added with source='derived' and high confidence.
 * Existing profile keys are NOT overwritten (profile data takes precedence).
 *
 * @param {object} profile — Original profile data
 * @param {DerivationRule[]} rules — Derivation rule records
 * @returns {{ enrichedProfile: object, derivationResult: DerivationResult }}
 *
 * @example
 * ```js
 * import { enrichProfile } from './derivation-engine.js';
 *
 * const { enrichedProfile, derivationResult } = enrichProfile(profile, rules);
 * // enrichedProfile now has derived fields merged in
 * ```
 */
export function enrichProfile(profile, rules) {
  const derivationResult = computeDerivedValues(profile, rules);
  const enrichedProfile = { ...profile };

  for (const [key, value] of derivationResult.values) {
    if (value === null) continue;

    // Do not overwrite existing profile data — existing values have higher authority
    if (enrichedProfile[key]) {
      const existingVal = extractValue(enrichedProfile[key]);
      if (existingVal) continue;
    }

    // Add derived value in standard profile entry format
    enrichedProfile[key] = {
      value,
      source: 'derived',
      confidence: 0.85,
      needsReview: false,
      derivedBy: 'derivation-engine',
    };
  }

  return { enrichedProfile, derivationResult };
}

/**
 * Compute a single derived value for a specific rule.
 * Useful when the mapping engine needs to compute one derivation on-the-fly.
 *
 * @param {DerivationRule} rule — Single derivation_rule record
 * @param {object} profile — User's profile data
 * @returns {string|null}
 */
export function computeSingleDerivation(rule, profile) {
  if (!rule?.payload?.logic || !profile) return null;

  const { logic, inputs = [], parameters = {} } = rule.payload;
  const transformFn = TRANSFORMATIONS[logic];
  if (!transformFn) return null;

  try {
    return transformFn(inputs, profile, parameters);
  } catch {
    return null;
  }
}

/**
 * List all supported transformation logic identifiers.
 * Useful for validation and documentation.
 *
 * @returns {string[]}
 */
export function getSupportedTransformations() {
  return Object.keys(TRANSFORMATIONS);
}

// ── Exports ─────────────────────────────────────────────────────────

export {
  parseDate as _parseDate,
  getProfileValue as _getProfileValue,
  TRANSFORMATIONS,
};
