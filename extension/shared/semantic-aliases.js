// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Semantic Aliases (Service-Provided)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Maps semantic_key values to label patterns for target resolution.
// Used by runtime/resolver.js.
//
// THE EXTENSION DOES NOT OWN THIS DATA.
// Aliases are loaded from the service at runtime via:
//   window.ccSemanticAliases.load(backendUrl, token)
//
// The extension starts with an EMPTY dictionary.
// If the service is unreachable, the resolver still works via:
//   - field_id (exact match)
//   - label (fuzzy match)
//   - field_index (positional)
//   - hint (disambiguation)
//   - css_selector (deprecated fallback)
//
// semantic_key resolution is the ONLY method that needs aliases.
// All other resolution methods work without any alias data.
//
// Exposes: window.ccSemanticAliases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

;(function () {
  'use strict';

  // Starts EMPTY. Populated by service at runtime.
  var aliases = {};
  var _loaded = false;
  var _source = 'none'; // 'none' | 'service' | 'cache' | 'fallback'

  /**
   * Load aliases from the service.
   * @param {string} backendUrl
   * @param {string} token — Bearer token
   * @returns {Promise<boolean>} true if loaded successfully
   */
  async function load(backendUrl, token) {
    if (!backendUrl) return false;
    try {
      var headers = { 'Authorization': 'Bearer ' + token };
      var res = await fetch(backendUrl + '/settings/semantic-aliases', { headers: headers });
      if (res.ok) {
        var data = await res.json();
        if (data && typeof data === 'object') {
          // Service returns { aliases: { key: [patterns...] } }
          var serviceAliases = data.aliases || data;
          replace(serviceAliases);
          _loaded = true;
          _source = 'service';
          return true;
        }
      }
    } catch (e) {
      // Service unreachable — try localStorage cache
      try {
        var cached = localStorage.getItem('cc_semantic_aliases');
        if (cached) {
          replace(JSON.parse(cached));
          _loaded = true;
          _source = 'cache';
          return true;
        }
      } catch (e2) { /* no cache available */ }
    }
    return false;
  }

  /**
   * Merge additional aliases (additive).
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
    _cacheAliases();
  }

  /**
   * Replace all aliases (full override from service).
   * @param {object} newAliases
   */
  function replace(newAliases) {
    if (!newAliases || typeof newAliases !== 'object') return;
    for (var k in aliases) delete aliases[k];
    for (var key in newAliases) aliases[key] = newAliases[key];
    _cacheAliases();
  }

  /**
   * Cache to localStorage for offline/degraded mode.
   */
  function _cacheAliases() {
    try {
      if (Object.keys(aliases).length > 0) {
        localStorage.setItem('cc_semantic_aliases', JSON.stringify(aliases));
      }
    } catch (e) { /* localStorage unavailable */ }
  }

  /**
   * Get the current alias dictionary.
   * @returns {object}
   */
  function getAll() {
    return aliases;
  }

  /**
   * Get load status.
   * @returns {{ loaded: boolean, source: string, count: number }}
   */
  function status() {
    return { loaded: _loaded, source: _source, count: Object.keys(aliases).length };
  }

  window.ccSemanticAliases = {
    aliases: aliases,
    load: load,
    merge: merge,
    replace: replace,
    getAll: getAll,
    status: status,
  };
})();
