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
    var norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    var v = norm(value);
    var vWords = v.split(' ').filter(w => w.length > 1);

    function findOpt(options) {
      var opts = options.filter(o => {
        if (!o.value || o.value === '0' || o.value === '-1' || o.value === '') return false;
        var txt = o.text.toLowerCase();
        return !txt.includes('select') && !txt.includes('choose') && !txt.includes('loading') && txt !== '--';
      });
      var overlapScore = o => { const ot = norm(o.text); return vWords.filter(w => ot.includes(w)).length; };
      return opts.find(o => o.value.toLowerCase() === value.toLowerCase().trim()) ||
             opts.find(o => norm(o.text) === v) ||
             opts.find(o => norm(o.value) === v) ||
             opts.find(o => norm(o.text).startsWith(v) && v.length > 2) ||
             opts.find(o => v.startsWith(norm(o.text)) && norm(o.text).length > 2) ||
             opts.find(o => norm(o.text).includes(v) && v.length > 3) ||
             opts.find(o => v.includes(norm(o.text)) && norm(o.text).length > 3) ||
             (() => { const best = opts.filter(o => overlapScore(o) === vWords.length && vWords.length > 0); return best.length === 1 ? best[0] : null; })();
    }

    function applySelect(el, opt) {
      el.focus();
      el.dispatchEvent(new Event('focus', { bubbles: true }));
      Array.from(el.options).forEach(o => { o.selected = false; });
      opt.selected = true;
      el.selectedIndex = opt.index;
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
      if (nativeSetter) nativeSetter.set.call(el, opt.value);
      else el.value = opt.value;
      ['mousedown','mouseup','click','input','change'].forEach(ev =>
        el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }))
      );
      if (typeof el.onchange === 'function') { try { el.onchange.call(el, new Event('change')); } catch {} }
      if (typeof $ !== 'undefined') { try { $(el).trigger('change'); } catch {} }
      try { el.dispatchEvent(new Event('propertychange', { bubbles: true })); } catch {}
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      // DWR re-apply after 3.5s
      var _rv = opt.value, _ri = opt.index;
      setTimeout(() => {
        if (el.value !== _rv) {
          el.selectedIndex = _ri; el.value = _rv;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, 3500);
      return true;
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
