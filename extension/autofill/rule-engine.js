// rule-engine.js — thin facade over CcRuleEngine capability
function ccNormVal(v) {
  var _re = globalThis.CcRuleEngine || {};
  return _re._normVal ? _re._normVal(v) : (v == null ? '' : String(v)).trim().toLowerCase();
}
function ccTypeGroup(t) {
  var _re = globalThis.CcRuleEngine || {};
  return _re._typeGroup ? _re._typeGroup(t) : 'text';
}
function ccEvaluateField(entry, field, profile, translations) {
  var _re = globalThis.CcRuleEngine || {};
  if (_re.evaluateField) return _re.evaluateField(entry, field, profile, translations);
  return { kind: 'skip' };
}
