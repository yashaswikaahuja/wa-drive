/**
 * ai-match — LLM-based fallback field mapper
 */
import type { FormField, Mapping, Profile } from './types.ts';

export async function aiMatch(
  formFields: FormField[],
  profile: Profile,
  llmKey: string,
  llmBaseUrl: string,
  llmModel: string,
): Promise<Mapping> {
  const fieldDescriptions = formFields.map((f, i) =>
    i + ': label="' + (f.label || '') + '" id="' + (f.id || '') + '" name="' + (f.name || '') + '" placeholder="' + (f.placeholder || '') + '"',
  ).join('\n');

  const profileKeys = Object.entries(profile)
    .filter((kv) => kv[1] && kv[0] !== 'phone' && kv[0] !== 'updatedAt')
    .map((kv) => kv[0] + ': "' + kv[1] + '"').join('\n');

  const prompt = 'You are a form field mapper. Given form fields and a student profile, return a JSON object mapping field index to profile key.\n\nRULES:\n- Return ONLY a valid JSON object, nothing else\n- Map each field to the profile key whose VALUE should fill that field\n- "first name" fields \u2192 use "first_name" profile key\n- "last name" / "surname" fields \u2192 use "last_name" profile key\n- "middle name" fields \u2192 use "middle_name" profile key\n- "full name" / "candidate name" fields \u2192 use "name" profile key\n- Separate day/month/year dropdowns \u2192 use "dob__day", "dob__month", "dob__year"\n- Single "date of birth" text field \u2192 use "dob"\n- For address parts: use "village", "post_office", "police_station", "block", "sub_division", "district", "state", "pincode" as available\n- Only use "address" for full address text fields\n- Confirm/retype fields \u2192 same key as primary field\n- Skip: captcha, OTP, verification code, password\n- Use EXACT profile key names from the list below\n\nForm fields:\n' + fieldDescriptions + '\n\nAvailable profile keys and values:\n' + profileKeys + '\n\nReturn JSON only: {"0": "name", "2": "dob", "5": "first_name", "7": "district"}';

  try {
    const ccLLM = typeof window !== 'undefined' ? window.ccLLM : undefined;
    if (!ccLLM) return {};
    const result = await ccLLM.call({
      apiKey: llmKey,
      baseUrl: llmBaseUrl,
      model: llmModel,
      systemPrompt: 'You are a JSON-only API. Return ONLY valid JSON objects. No explanations, no markdown, no text before or after the JSON.',
      userPrompt: prompt,
      maxTokens: 300,
    });
    if (result.error) return {};
    const indexMap = ccLLM.parseJSON(result.text);
    if (!indexMap) return {};

    const mapping: Mapping = {};
    const nameParts = String(profile.name || '').trim().split(/\s+/);
    const dobParts = String(profile.dob || '').split('/');
    const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    for (const idx in indexMap) {
      const field = formFields[parseInt(idx, 10)];
      const profileKey = indexMap[idx];
      if (!field) continue;

      let value: string | number | boolean | null | undefined = null;
      if (profileKey === 'name__first') value = profile.first_name || nameParts[0] || '';
      else if (profileKey === 'name__last') value = profile.last_name || nameParts[nameParts.length - 1] || '';
      else if (profileKey === 'name__middle') value = profile.middle_name || (nameParts.length >= 3 ? nameParts.slice(1, -1).join(' ') : '');
      else if (profileKey === 'dob__day') value = dobParts[0] || '';
      else if (profileKey === 'dob__month') {
        const mn = parseInt(dobParts[1] || '0', 10);
        value = months[mn] || dobParts[1] || '';
      } else if (profileKey === 'dob__year') value = dobParts[2] || '';
      else if (profile[profileKey] != null) value = profile[profileKey] as string;

      if (value === null || value === undefined) continue;

      const fieldIdent = [field.label, field.id, field.name, field.placeholder]
        .filter(Boolean).join(' ').toLowerCase().replace(/[-\s:*()'./]/g, '_');
      const isRelativeField = /husband|wife|spouse|guardian|pati(?!_pati_ka_naam)/i.test(fieldIdent);
      const isFatherField = /father|pita/i.test(fieldIdent);
      const isMotherField = /mother|mata/i.test(fieldIdent);

      if (profileKey === 'name' && (isRelativeField || isFatherField || isMotherField)) continue;
      if ((profileKey === 'name' || profileKey === 'first_name' || profileKey === 'last_name' || profileKey === 'middle_name') && isRelativeField) continue;
      if (profileKey === 'father_name' && !isFatherField) continue;
      if (profileKey === 'mother_name' && !isMotherField) continue;

      mapping[field.selector] = { value, type: field.type || '' };
    }
    return mapping;
  } catch {
    return {};
  }
}

export const CcAiMatch = { aiMatch };
