/**
 * cascade-select plugin — handles dependent <select> chains (state→district→block→village).
 * 
 * Interaction contract:
 * 1. Wait for options to populate (parent must have filled first)
 * 2. Find matching option
 * 3. Apply selection with full event sequence (ASP.NET/DWR/jQuery compat)
 * 4. Report settled state
 *
 * Runtime owns: ordering (via dependsOn), retry policy, verification, replay.
 * Plugin owns: option matching, event dispatch, DWR re-apply.
 */

var CASCADE_FIELDS = ['state', 'district', 'sub_division', 'subdivision', 'block', 'panchayat', 'village', 'village_panchayat', 'post_office'];

var CASCADE_DEPENDENCIES = {
  district: ['state'],
  sub_division: ['district'],
  subdivision: ['district'],
  block: ['district', 'sub_division'],
  panchayat: ['block'],
  village: ['block'],
  village_panchayat: ['block'],
  post_office: ['block', 'village'],
};

var CascadeSelectPlugin = {
  id: 'cascade-select',
  description: 'Dependent <select> chains: waits for option population, applies with DWR/jQuery compat',

  supports(el, fieldContext) {
    if (!el || el.tagName !== 'SELECT') return false;
    // Match if field label/profileKey is a known cascade field
    var label = (fieldContext.label || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    var pk = (fieldContext.profileKey || '').toLowerCase();
    // Is this a cascade field?
    var isCascade = CASCADE_FIELDS.some(k => label.includes(k) || pk.includes(k));
    if (!isCascade) return false;
    // Is it a child (has dependencies)? Or a parent that populatesChildren?
    return true;
  },

  fill(el, value, context) {
    function findOpt(options) {
      // shared/option-match.js is injected before plugins run
      return window.ccMatchOption(value, options);
    }

    function applySelect(el, opt) {
      // Delegate to shared/select-apply.js
      return window.ccApplySelect(el, opt);
    }

    // Try immediate match
    var allOpts = Array.from(el.options);
    var opt = findOpt(allOpts);
    if (opt) {
      applySelect(el, opt);
      return { success: true, settled: true, waitMs: 0 };
    }

    // No options yet — need to wait (runtime should have waited, but report not settled)
    var realOpts = allOpts.filter(o => o.value && o.value !== '0' && o.value !== '-1' && o.value !== '');
    if (realOpts.length === 0) {
      return { success: false, settled: false, reason: 'no-options-loaded' };
    }

    // Options exist but no match
    return { success: false, settled: true, reason: 'no-matching-option', optionCount: realOpts.length };
  },

  meta: {
    interactionFamily: 'cascade',
    needsStabilization: true,
    populatesChildren: true,
    waitFor: 'options-populated',
    needsParentValues: true,
    // Dynamic dependsOn resolved per-field from CASCADE_DEPENDENCIES
    getDependsOn(profileKey) {
      var pk = (profileKey || '').toLowerCase();
      return CASCADE_DEPENDENCIES[pk] || [];
    },
  },
};

registerPlugin(CascadeSelectPlugin);
