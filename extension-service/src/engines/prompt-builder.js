// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Prompt Builder — extension-service/prompt-builder.js
// Phase 4.3 — Cold-Start Semantic Mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Constructs structured AI prompts for field→profileKey mapping.
// NEVER includes actual profile values in prompts (privacy by design).
//
// Responsibilities:
//   - Accept field labels, types, page context, and profile schema keys
//   - Produce a structured prompt for GPT/Claude with JSON output spec
//   - Include few-shot examples for consistent structured output
//   - Control prompt length to stay within token budgets
//
// Does NOT own: AI calling, confidence evaluation, mapping persistence.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * @typedef {object} FieldDescriptor
 * @property {string} node_id — Node identifier in the PageSnapshot
 * @property {string} label — Visible label/placeholder text
 * @property {string} field_type — Widget type: text, select, radio, checkbox, date, file, textarea
 * @property {string[]} [options] — Available options for select/radio fields
 * @property {string|null} [hint] — Helper text / aria-description
 * @property {string|null} [group] — Logical group name (e.g. "Personal Details")
 */

/**
 * @typedef {object} PageContext
 * @property {string} page_title — Document title
 * @property {string} page_url — Page URL (domain only for privacy)
 * @property {string|null} form_heading — Detected form heading
 * @property {string|null} portal_id — Portal identifier if known
 * @property {string|null} form_key — Form key if known
 * @property {string} [language] — Page language (ISO code)
 */

/**
 * @typedef {object} MappingPromptOutput
 * @property {string} systemPrompt — System-level instruction
 * @property {string} userPrompt — User-level content with fields to map
 * @property {number} estimatedTokens — Rough token estimate
 */

// ── Profile Schema Keys ─────────────────────────────────────────────
// Only the KEY NAMES are sent to AI — never actual values.

const PROFILE_SCHEMA_KEYS = [
  // Identity
  'name', 'first_name', 'middle_name', 'last_name', 'father_name', 'mother_name',
  'husband_name', 'spouse_name',
  // Demographics
  'dob', 'age', 'gender', 'nationality', 'category', 'religion', 'marital_status',
  'blood_group',
  // Contact
  'phone', 'mobile', 'email', 'alternate_email', 'alternate_phone',
  // Address
  'address', 'permanent_address', 'current_address', 'city', 'district', 'state',
  'pincode', 'country', 'landmark',
  // Identity Documents
  'aadhaar_number', 'pan_number', 'voter_id_number', 'passport_number',
  'driving_license_number',
  // Education
  'qualification', 'degree', 'university', 'college', 'board', 'year_of_passing',
  'percentage', 'cgpa', 'division', 'roll_number', 'enrollment_number',
  'stream', 'specialization', 'subject',
  // Professional
  'occupation', 'employer', 'designation', 'experience_years', 'salary',
  'employee_id',
  // Banking
  'bank_name', 'account_number', 'ifsc_code', 'branch_name',
  // Physical
  'height', 'weight',
  // Other
  'photo', 'signature',
];

// ── Few-Shot Examples ───────────────────────────────────────────────
// Demonstrate expected JSON output structure.

const FEW_SHOT_EXAMPLES = [
  {
    input: {
      fields: [
        { node_id: 'n1', label: 'Full Name', field_type: 'text', hint: 'Enter your full name as per documents' },
        { node_id: 'n2', label: 'Date of Birth', field_type: 'date', hint: null },
        { node_id: 'n3', label: 'Gender', field_type: 'select', options: ['Male', 'Female', 'Other'] },
      ],
      page_context: { page_title: 'Registration Form', form_heading: 'Personal Details' },
    },
    output: {
      mappings: [
        {
          node_id: 'n1',
          profile_key: 'name',
          semantic_key: 'full_name',
          transformation: 'direct',
          reasoning: 'Label "Full Name" directly maps to the profile name field',
        },
        {
          node_id: 'n2',
          profile_key: 'dob',
          semantic_key: 'date_of_birth',
          transformation: 'direct',
          reasoning: 'Date of Birth field maps to dob profile key',
        },
        {
          node_id: 'n3',
          profile_key: 'gender',
          semantic_key: 'gender',
          transformation: 'direct',
          reasoning: 'Gender dropdown maps directly to gender profile key',
        },
      ],
    },
  },
  {
    input: {
      fields: [
        { node_id: 'n4', label: "Father's Name / Husband's Name", field_type: 'text', hint: null },
        { node_id: 'n5', label: 'PIN Code', field_type: 'text', hint: '6 digit postal code' },
        { node_id: 'n6', label: 'Upload Photo', field_type: 'file', hint: 'JPG/PNG, max 100KB' },
        { node_id: 'n7', label: 'CAPTCHA', field_type: 'text', hint: 'Enter the text shown above' },
      ],
      page_context: { page_title: 'Application Form', form_heading: 'Applicant Information' },
    },
    output: {
      mappings: [
        {
          node_id: 'n4',
          profile_key: 'father_name',
          semantic_key: 'father_or_husband_name',
          transformation: 'direct',
          reasoning: 'Combined father/husband name field — default to father_name; may need marital_status context',
        },
        {
          node_id: 'n5',
          profile_key: 'pincode',
          semantic_key: 'postal_pincode',
          transformation: 'direct',
          reasoning: 'PIN Code with 6-digit hint maps to Indian postal pincode',
        },
        {
          node_id: 'n6',
          profile_key: 'photo',
          semantic_key: 'applicant_photo',
          transformation: 'direct',
          reasoning: 'Photo upload field maps to photo profile key',
        },
        {
          node_id: 'n7',
          profile_key: null,
          semantic_key: null,
          transformation: null,
          reasoning: 'CAPTCHA is a challenge field — not mappable to profile data',
        },
      ],
    },
  },
];

// ── System Prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a form-field mapping specialist. Your task is to analyze HTML form fields and determine which profile data key each field should be filled from.

RULES:
1. Map each field to exactly ONE profile_key from the provided schema, or null if unmappable.
2. Only map fields that represent user profile/personal data.
3. Do NOT map: CAPTCHA fields, OTP fields, submit buttons, navigation elements, terms checkboxes, verification codes, or any challenge/security field.
4. For ambiguous fields (e.g. "Father's/Husband's Name"), pick the most common mapping and note the ambiguity in reasoning.
5. If a field could map to multiple profile keys, choose the most specific one.
6. Use the page context and field grouping to disambiguate fields with similar labels.
7. NEVER include actual user data values in your reasoning — only discuss field semantics.

OUTPUT FORMAT:
Return a JSON object with a single "mappings" array. Each element must have:
- node_id: string (the field's node_id from input)
- profile_key: string|null (from the provided profile schema keys)
- semantic_key: string|null (a descriptive canonical name for the field's meaning)
- transformation: "direct"|"extract"|"concatenate"|"format"|null
- reasoning: string (brief explanation of the mapping decision)

If a field is unmappable (challenge, system control, unknown purpose), set profile_key, semantic_key, and transformation to null.`;

// ── Prompt Builder ──────────────────────────────────────────────────

/**
 * Build a mapping prompt for a batch of unknown fields.
 *
 * @param {FieldDescriptor[]} fields — Fields to map (max recommended: 20 per batch)
 * @param {PageContext} pageContext — Page/form context
 * @param {object} [options]
 * @param {string[]} [options.profileKeys] — Override profile schema keys
 * @param {number} [options.maxFields] — Max fields per prompt (default: 20)
 * @returns {MappingPromptOutput}
 */
export function buildMappingPrompt(fields, pageContext, options = {}) {
  const profileKeys = options.profileKeys || PROFILE_SCHEMA_KEYS;
  const maxFields = options.maxFields || 20;

  // Truncate if too many fields (to stay within token budget)
  const truncatedFields = fields.slice(0, maxFields);

  const userPrompt = buildUserPrompt(truncatedFields, pageContext, profileKeys);
  const estimatedTokens = estimateTokens(SYSTEM_PROMPT + userPrompt);

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    estimatedTokens,
  };
}

/**
 * Build the user-level prompt content.
 *
 * @param {FieldDescriptor[]} fields
 * @param {PageContext} pageContext
 * @param {string[]} profileKeys
 * @returns {string}
 */
function buildUserPrompt(fields, pageContext, profileKeys) {
  const parts = [];

  // Page context
  parts.push('## Page Context');
  parts.push(`- Title: ${pageContext.page_title || 'Unknown'}`);
  parts.push(`- URL Domain: ${extractDomain(pageContext.page_url) || 'Unknown'}`);
  if (pageContext.form_heading) parts.push(`- Form Heading: ${pageContext.form_heading}`);
  if (pageContext.language) parts.push(`- Language: ${pageContext.language}`);
  parts.push('');

  // Profile schema (keys only — no values)
  parts.push('## Available Profile Keys');
  parts.push('Map fields ONLY to these keys (or null if unmappable):');
  parts.push('```');
  parts.push(profileKeys.join(', '));
  parts.push('```');
  parts.push('');

  // Fields to map
  parts.push('## Fields to Map');
  parts.push('');
  for (const field of fields) {
    parts.push(`### Field: ${field.node_id}`);
    parts.push(`- Label: "${field.label}"`);
    parts.push(`- Type: ${field.field_type}`);
    if (field.options?.length) {
      const displayOptions = field.options.slice(0, 10);
      parts.push(`- Options: [${displayOptions.map(o => `"${o}"`).join(', ')}${field.options.length > 10 ? ', ...' : ''}]`);
    }
    if (field.hint) parts.push(`- Hint: "${field.hint}"`);
    if (field.group) parts.push(`- Group: "${field.group}"`);
    parts.push('');
  }

  // Few-shot examples
  parts.push('## Examples');
  parts.push('');
  for (let i = 0; i < FEW_SHOT_EXAMPLES.length; i++) {
    const ex = FEW_SHOT_EXAMPLES[i];
    parts.push(`### Example ${i + 1}`);
    parts.push('Input fields:');
    for (const f of ex.input.fields) {
      parts.push(`- "${f.label}" (${f.field_type})${f.options ? ' options: [' + f.options.join(', ') + ']' : ''}`);
    }
    parts.push(`Page: "${ex.input.page_context.page_title}" → "${ex.input.page_context.form_heading}"`);
    parts.push('');
    parts.push('Expected output:');
    parts.push('```json');
    parts.push(JSON.stringify(ex.output, null, 2));
    parts.push('```');
    parts.push('');
  }

  // Final instruction
  parts.push('## Your Task');
  parts.push(`Map all ${fields.length} fields above. Return ONLY valid JSON with the "mappings" array.`);

  return parts.join('\n');
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Extract domain from URL for privacy (don't send full URL to AI).
 *
 * @param {string|null} url
 * @returns {string|null}
 */
function extractDomain(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    // Try regex fallback for partial URLs
    const match = url.match(/(?:https?:\/\/)?([^/]+)/);
    return match?.[1] || null;
  }
}

/**
 * Rough token estimate (1 token ≈ 4 chars for English text).
 *
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Build a prompt for a single field (used when re-mapping with additional context).
 *
 * @param {FieldDescriptor} field — Single field to map
 * @param {PageContext} pageContext
 * @param {object} [options]
 * @param {string} [options.previousMapping] — Previous mapping attempt to refine
 * @param {string} [options.additionalContext] — Extra context for disambiguation
 * @returns {MappingPromptOutput}
 */
export function buildSingleFieldPrompt(field, pageContext, options = {}) {
  const parts = [];
  parts.push('Map this single form field to a profile key.');
  parts.push('');
  parts.push(`Page: "${pageContext.page_title}" (${extractDomain(pageContext.page_url)})`);
  if (pageContext.form_heading) parts.push(`Form: "${pageContext.form_heading}"`);
  parts.push('');
  parts.push(`Field node_id: ${field.node_id}`);
  parts.push(`Label: "${field.label}"`);
  parts.push(`Type: ${field.field_type}`);
  if (field.options?.length) parts.push(`Options: [${field.options.slice(0, 10).join(', ')}]`);
  if (field.hint) parts.push(`Hint: "${field.hint}"`);
  if (field.group) parts.push(`Group: "${field.group}"`);
  parts.push('');

  if (options.previousMapping) {
    parts.push(`Previous mapping attempt: ${options.previousMapping} — please refine or confirm.`);
  }
  if (options.additionalContext) {
    parts.push(`Additional context: ${options.additionalContext}`);
  }

  parts.push('');
  parts.push('Available profile keys:');
  parts.push(PROFILE_SCHEMA_KEYS.join(', '));
  parts.push('');
  parts.push('Return JSON: { "mappings": [{ "node_id", "profile_key", "semantic_key", "transformation", "reasoning" }] }');

  const userPrompt = parts.join('\n');
  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    estimatedTokens: estimateTokens(SYSTEM_PROMPT + userPrompt),
  };
}

/**
 * Get the profile schema keys (for external use, e.g. confidence evaluator).
 *
 * @returns {string[]}
 */
export function getProfileSchemaKeys() {
  return [...PROFILE_SCHEMA_KEYS];
}
