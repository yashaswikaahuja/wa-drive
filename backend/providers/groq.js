/**
 * Groq Provider Adapter
 * Normalizes observation -> Groq prompt, Groq response -> action plan.
 * Schema: EXECUTION_SCHEMA v1.0
 */

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

function normalizeObservation(observation) {
  const { fields, profile, formKey, hostname } = observation;
  const fieldList = fields.map(f =>
    `- ${f.label} (type: ${f.type}, selector: ${f.selector})`
  ).join('\n');
  const profileKeys = Object.entries(profile)
    .filter(([,v]) => v)
    .map(([k,v]) => `${k}: ${v}`)
    .join('\n');

  return {
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a form-filling assistant. Given form fields and a user profile, return a JSON array of actions to fill the form. Use ONLY these action types: fill_text, select_option, skip. Return ONLY valid JSON array, no explanation.\n\nRules:\n- If field label contains name and profile has full name, split into first/last if needed\n- For DOB fields: use dd/mm/yyyy or split into day/month/year\n- Skip fields with no matching profile data\n- Skip captcha, OTP, password fields\n- Each action: {"type":"fill_text"|"select_option"|"skip","target":"<selector>","value":"<value>","reason":"<why>"}'
      },
      {
        role: 'user',
        content: `Form: ${hostname} (${formKey})\n\nFields:\n${fieldList}\n\nProfile:\n${profileKeys}\n\nReturn JSON array of actions.`
      }
    ],
    max_tokens: 2000,
    temperature: 0.1
  };
}

function normalizeResponse(groqResponse) {
  try {
    const content = groqResponse.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { actions: [], confidence: 0, error: 'no-json-in-response' };
    const actions = JSON.parse(jsonMatch[0]);
    const VALID_TYPES = ['fill_text', 'select_option', 'click_dropdown', 'click_option', 'click_button', 'scroll_to', 'wait', 'skip'];
    const validated = actions.filter(a => VALID_TYPES.includes(a.type));
    return {
      actions: validated,
      confidence: validated.length / Math.max(actions.length, 1),
      provider: 'groq',
      model: MODEL,
      rawTokens: groqResponse.usage?.total_tokens || 0
    };
  } catch (e) {
    return { actions: [], confidence: 0, error: e.message };
  }
}

export { normalizeObservation, normalizeResponse, GROQ_API };
