// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Semantic Aliases (Configuration)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Maps semantic_key values (from ActionPlan targets) to label patterns.
// Used by runtime/resolver.js for semantic target resolution.
//
// This is a CONFIGURATION source, not business logic.
// In production, aliases can be updated from the service without
// requiring an extension update:
//   window.ccSemanticAliases.merge(serviceProvidedAliases)
//
// Exposes: window.ccSemanticAliases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

;(function () {
  'use strict';

  var aliases = {
    'full_name':       ['full name', 'name', 'applicant name', 'candidate name'],
    'father_name':     ['father', 'father\'s name', 'father name'],
    'mother_name':     ['mother', 'mother\'s name', 'mother name'],
    'dob':             ['date of birth', 'dob', 'birth date', '\u091C\u0928\u094D\u092E \u0924\u093F\u0925\u093F'],
    'gender':          ['gender', 'sex', '\u0932\u093F\u0902\u0917'],
    'email':           ['email', 'e-mail', 'email id', 'email address'],
    'mobile':          ['mobile', 'phone', 'mobile number', 'contact', 'phone number'],
    'aadhaar':         ['aadhaar', 'aadhar', 'uidai', 'aadhaar number'],
    'pan':             ['pan', 'pan number', 'pan card'],
    'address':         ['address', 'permanent address', 'residential address'],
    'state':           ['state', '\u0930\u093E\u091C\u094D\u092F'],
    'district':        ['district', '\u091C\u093F\u0932\u093E'],
    'block':           ['block', 'tehsil', 'taluka'],
    'pincode':         ['pin', 'pincode', 'zip', 'postal code'],
    'category':        ['category', 'caste', 'reservation category', '\u0935\u0930\u094D\u0917'],
    'qualification':   ['qualification', 'education', 'degree'],
    'occupation':      ['occupation', 'profession', 'job'],
    'income':          ['income', 'annual income', 'salary'],
    'photo':           ['photo', 'photograph', 'upload photo'],
    'signature':       ['signature', 'upload signature'],
    'agree':           ['agree', 'declaration', 'i agree', 'i declare'],
  };

  /**
   * Merge additional aliases (additive, from service).
   * @param {object} newAliases — { semantic_key: [label_patterns...] }
   */
  function merge(newAliases) {
    if (!newAliases || typeof newAliases !== 'object') return;
    for (var key in newAliases) {
      if (!aliases[key]) {
        aliases[key] = newAliases[key];
      } else {
        var existing = aliases[key];
        newAliases[key].forEach(function (a) {
          if (existing.indexOf(a) === -1) existing.push(a);
        });
      }
    }
  }

  /**
   * Replace all aliases (full override from service).
   * @param {object} newAliases
   */
  function replace(newAliases) {
    if (!newAliases || typeof newAliases !== 'object') return;
    for (var k in aliases) delete aliases[k];
    for (var key in newAliases) aliases[key] = newAliases[key];
  }

  /**
   * Get the current alias dictionary.
   * @returns {object}
   */
  function getAll() {
    return aliases;
  }

  window.ccSemanticAliases = {
    aliases: aliases,
    merge: merge,
    replace: replace,
    getAll: getAll,
  };
})();
