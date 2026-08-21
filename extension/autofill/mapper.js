/**
 * Mapper facade — thin wrapper over CcMapper* capabilities.
 *
 * Parts under autofill/mapper/capabilities/ are injected before this file.
 * Public API unchanged:
 *   fuzzyMatch(formFields, profile) => mapping
 *   aiMatch(formFields, profile, groqKey, llmBaseUrl, llmModel) => Promise<mapping>
 *   resolveChoiceToOption(field, plannedValue, profileKey) => {selector,entry}|null
 *   decideConditionalChoice(field, profile) => string|null
 */

function fuzzyMatch(formFields, profile) {
  var _fm = globalThis.CcFuzzyMatch || {};
  if (_fm.fuzzyMatch) return _fm.fuzzyMatch(formFields, profile);
  return {};
}

async function aiMatch(formFields, profile, groqKey, llmBaseUrl, llmModel) {
  var _am = globalThis.CcAiMatch || {};
  if (_am.aiMatch) return _am.aiMatch(formFields, profile, groqKey, llmBaseUrl, llmModel);
  return {};
}

function resolveChoiceToOption(field, plannedValue, profileKey) {
  var _rc = globalThis.CcResolveChoice || {};
  if (_rc.resolveChoiceToOption) return _rc.resolveChoiceToOption(field, plannedValue, profileKey);
  return null;
}

function decideConditionalChoice(field, profile) {
  var _dc = globalThis.CcDecideConditional || {};
  if (_dc.decideConditionalChoice) return _dc.decideConditionalChoice(field, profile);
  return null;
}

// Expose for fill-orchestrator saved-map path
if (typeof window !== 'undefined') {
  window.ccResolveChoiceToOption = resolveChoiceToOption;
  window.ccDecideConditionalChoice = decideConditionalChoice;
}
