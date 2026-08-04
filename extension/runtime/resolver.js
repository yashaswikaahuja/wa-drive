// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Semantic Target Resolver
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Phase 1.5: Resolves protocol semantic targets to live DOM elements.
//
// The protocol NEVER sends CSS selectors (v2). It sends semantic targets:
//   { field_id, semantic_key, label, field_index, hint, css_selector(deprecated) }
//
// This resolver uses the last extracted PageModel to find elements.
// Resolution order per protocol.yml Section 1:
//   1. field_id    — exact match from last extraction
//   2. semantic_key — resolved via aliases + label matching
//   3. label       — fuzzy text match against extracted labels
//   4. field_index — positional fallback
//   5. hint        — disambiguation when multiple candidates
//   6. css_selector — DEPRECATED v1 fallback
//
// Exposes: window.ccResolver.{resolve, setPageContext, getResolutionLog}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

;(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════
  // State: Last known page context from extraction
  // ══════════════════════════════════════════════════════════════════════

  var _pageModel = null;     // Last PageModel from extraction
  var _fieldElements = [];   // Array of { field: FieldModel, element: Element }
  var _resolutionLog = [];   // Audit trail of resolution attempts

  // ══════════════════════════════════════════════════════════════════════
  // Semantic aliases: common semantic keys → label patterns
  // ══════════════════════════════════════════════════════════════════════

  var SEMANTIC_ALIASES = {
    'full_name':       ['full name', 'name', 'applicant name', 'candidate name'],
    'father_name':     ['father', 'father\'s name', 'father name'],
    'mother_name':     ['mother', 'mother\'s name', 'mother name'],
    'dob':             ['date of birth', 'dob', 'birth date', 'जन्म तिथि'],
    'gender':          ['gender', 'sex', 'लिंग'],
    'email':           ['email', 'e-mail', 'email id', 'email address'],
    'mobile':          ['mobile', 'phone', 'mobile number', 'contact', 'phone number'],
    'aadhaar':         ['aadhaar', 'aadhar', 'uidai', 'aadhaar number'],
    'pan':             ['pan', 'pan number', 'pan card'],
    'address':         ['address', 'permanent address', 'residential address'],
    'state':           ['state', 'राज्य'],
    'district':        ['district', 'जिला'],
    'block':           ['block', 'tehsil', 'taluka'],
    'pincode':         ['pin', 'pincode', 'zip', 'postal code'],
    'category':        ['category', 'caste', 'reservation category', 'वर्ग'],
    'qualification':   ['qualification', 'education', 'degree'],
    'occupation':      ['occupation', 'profession', 'job'],
    'income':          ['income', 'annual income', 'salary'],
    'photo':           ['photo', 'photograph', 'upload photo'],
    'signature':       ['signature', 'upload signature'],
    'agree':           ['agree', 'declaration', 'i agree', 'i declare'],
  };

  // ══════════════════════════════════════════════════════════════════════
  // Core: Set page context (called after extraction)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Update the resolver's page context after extraction.
   * @param {object} pageModel — PageModel from extraction
   * @param {Element[]} elements — Array of DOM elements in field order
   */
  function setPageContext(pageModel, elements) {
    _pageModel = pageModel;
    _fieldElements = [];

    if (!pageModel || !pageModel.forms) return;

    var allFields = [];
    pageModel.forms.forEach(function (form) {
      allFields = allFields.concat(form.fields || []);
    });

    // Pair fields with elements
    for (var i = 0; i < allFields.length; i++) {
      var el = (elements && elements[i]) || null;
      // If no element array provided, try to find by selector
      if (!el && allFields[i].selector) {
        el = document.querySelector(allFields[i].selector);
      }
      _fieldElements.push({ field: allFields[i], element: el });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Core: Resolve a semantic target to a DOM element
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Resolve a protocol semantic target to a live DOM element.
   * @param {object} target — Protocol target object
   * @returns {{ element: Element|null, method: string, confidence: string, error: string|null }}
   */
  function resolve(target) {
    if (!target) {
      return _fail('no_target', 'Target is null or undefined');
    }

    var entry = {
      target: target,
      attempted: [],
      resolved: null,
      method: null,
    };

    var result;

    // 1. field_id — exact match
    if (target.field_id) {
      result = _resolveByFieldId(target.field_id);
      entry.attempted.push({ method: 'field_id', found: !!result });
      if (result) { entry.resolved = result; entry.method = 'field_id'; _log(entry); return _success(result, 'field_id', 'exact'); }
    }

    // 2. semantic_key — alias resolution
    if (target.semantic_key) {
      result = _resolveBySemanticKey(target.semantic_key);
      entry.attempted.push({ method: 'semantic_key', found: !!result });
      if (result) { entry.resolved = result; entry.method = 'semantic_key'; _log(entry); return _success(result, 'semantic_key', 'high'); }
    }

    // 3. label — fuzzy text match
    if (target.label) {
      result = _resolveByLabel(target.label, target.hint);
      entry.attempted.push({ method: 'label', found: !!result });
      if (result) { entry.resolved = result; entry.method = 'label'; _log(entry); return _success(result, 'label', 'medium'); }
    }

    // 4. field_index — positional fallback
    if (target.field_index != null) {
      result = _resolveByIndex(target.field_index);
      entry.attempted.push({ method: 'field_index', found: !!result });
      if (result) { entry.resolved = result; entry.method = 'field_index'; _log(entry); return _success(result, 'field_index', 'low'); }
    }

    // 5. hint — standalone disambiguation
    if (target.hint) {
      result = _resolveByHint(target.hint);
      entry.attempted.push({ method: 'hint', found: !!result });
      if (result) { entry.resolved = result; entry.method = 'hint'; _log(entry); return _success(result, 'hint', 'low'); }
    }

    // 6. css_selector — DEPRECATED v1 fallback
    if (target.css_selector) {
      console.warn('[ccResolver] Using deprecated css_selector fallback:', target.css_selector);
      var el = document.querySelector(target.css_selector);
      entry.attempted.push({ method: 'css_selector', found: !!el });
      if (el) { entry.resolved = el; entry.method = 'css_selector'; _log(entry); return _success(el, 'css_selector', 'deprecated'); }
    }

    // All resolution methods exhausted
    _log(entry);
    return _fail('target_not_resolved', 'Could not resolve target: ' + JSON.stringify(target));
  }

  // ══════════════════════════════════════════════════════════════════════
  // Resolution Methods
  // ══════════════════════════════════════════════════════════════════════

  function _resolveByFieldId(fieldId) {
    for (var i = 0; i < _fieldElements.length; i++) {
      if (_fieldElements[i].field.fieldId === fieldId && _fieldElements[i].element) {
        return _fieldElements[i].element;
      }
    }
    return null;
  }

  function _resolveBySemanticKey(semanticKey) {
    var key = semanticKey.toLowerCase().replace(/[-_\s]+/g, '_');
    var aliases = SEMANTIC_ALIASES[key] || [key.replace(/_/g, ' ')];

    for (var i = 0; i < _fieldElements.length; i++) {
      var f = _fieldElements[i].field;
      var label = (f.label || '').toLowerCase();

      for (var j = 0; j < aliases.length; j++) {
        if (label === aliases[j] || label.includes(aliases[j])) {
          if (_fieldElements[i].element) return _fieldElements[i].element;
        }
      }

      // Also check name attribute
      if (f.name && f.name.toLowerCase().includes(key)) {
        if (_fieldElements[i].element) return _fieldElements[i].element;
      }
    }
    return null;
  }

  function _resolveByLabel(labelText, hint) {
    var needle = labelText.toLowerCase().trim();
    var candidates = [];

    for (var i = 0; i < _fieldElements.length; i++) {
      var f = _fieldElements[i].field;
      var fieldLabel = (f.label || '').toLowerCase().trim();

      if (!fieldLabel) continue;

      // Exact match
      if (fieldLabel === needle) {
        candidates.push({ score: 100, index: i });
        continue;
      }

      // Contains match
      if (fieldLabel.includes(needle) || needle.includes(fieldLabel)) {
        var score = Math.min(fieldLabel.length, needle.length) / Math.max(fieldLabel.length, needle.length) * 80;
        candidates.push({ score: score, index: i });
        continue;
      }

      // Word overlap
      var needleWords = needle.split(/\s+/);
      var fieldWords = fieldLabel.split(/\s+/);
      var overlap = needleWords.filter(function (w) { return fieldWords.indexOf(w) !== -1; }).length;
      if (overlap > 0) {
        var score2 = (overlap / Math.max(needleWords.length, fieldWords.length)) * 60;
        candidates.push({ score: score2, index: i });
      }
    }

    if (candidates.length === 0) return null;

    // Sort by score descending
    candidates.sort(function (a, b) { return b.score - a.score; });

    // If hint provided and multiple candidates, use hint to disambiguate
    if (candidates.length > 1 && hint) {
      var filtered = _disambiguateWithHint(candidates, hint);
      if (filtered) return filtered;
    }

    var best = candidates[0];
    if (_fieldElements[best.index].element) {
      return _fieldElements[best.index].element;
    }
    return null;
  }

  function _resolveByIndex(index) {
    if (index >= 0 && index < _fieldElements.length && _fieldElements[index].element) {
      return _fieldElements[index].element;
    }
    return null;
  }

  function _resolveByHint(hint) {
    for (var i = 0; i < _fieldElements.length; i++) {
      var f = _fieldElements[i].field;
      if (!_fieldElements[i].element) continue;

      if (hint.name && f.name && f.name.toLowerCase() === hint.name.toLowerCase()) {
        return _fieldElements[i].element;
      }
      if (hint.placeholder && f.placeholder && f.placeholder.toLowerCase().includes(hint.placeholder.toLowerCase())) {
        return _fieldElements[i].element;
      }
      if (hint.aria_label && f.ariaLabel && f.ariaLabel.toLowerCase().includes(hint.aria_label.toLowerCase())) {
        return _fieldElements[i].element;
      }
    }
    return null;
  }

  function _disambiguateWithHint(candidates, hint) {
    for (var c = 0; c < candidates.length; c++) {
      var f = _fieldElements[candidates[c].index].field;
      if (hint.name && f.name && f.name.toLowerCase() === hint.name.toLowerCase()) {
        return _fieldElements[candidates[c].index].element;
      }
      if (hint.placeholder && f.placeholder && f.placeholder.toLowerCase().includes(hint.placeholder.toLowerCase())) {
        return _fieldElements[candidates[c].index].element;
      }
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════════════════

  function _success(element, method, confidence) {
    return { element: element, method: method, confidence: confidence, error: null };
  }

  function _fail(code, message) {
    return { element: null, method: null, confidence: null, error: code + ': ' + message };
  }

  function _log(entry) {
    _resolutionLog.push(entry);
    // Keep log bounded
    if (_resolutionLog.length > 100) _resolutionLog.shift();
  }

  /**
   * Get the resolution audit log.
   * @returns {object[]}
   */
  function getResolutionLog() {
    return _resolutionLog.slice();
  }

  /**
   * Clear context (for testing).
   */
  function reset() {
    _pageModel = null;
    _fieldElements = [];
    _resolutionLog = [];
  }

  // ══════════════════════════════════════════════════════════════════════
  // Expose
  // ══════════════════════════════════════════════════════════════════════

  window.ccResolver = {
    resolve: resolve,
    setPageContext: setPageContext,
    getResolutionLog: getResolutionLog,
    reset: reset,
    SEMANTIC_ALIASES: SEMANTIC_ALIASES,
  };
})();
