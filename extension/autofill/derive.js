// derive.js — thin facade over CcDeriveProfile capability
function ccDeriveProfile(profile, serverRules) {
  var _dp = globalThis.CcDeriveProfile || {};
  if (_dp.deriveProfile) return _dp.deriveProfile(profile, serverRules);
  return Object.assign({}, profile || {});
}
