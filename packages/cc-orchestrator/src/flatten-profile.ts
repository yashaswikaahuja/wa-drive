/**
 * flatten-profile — Profile data flattener
 *
 * Converts a nested profile (profile.data or profile) where values may be
 * { value: ... } objects into a flat { key: value } map for use by the
 * sequential fill kernel.
 *
 * Public API (on (globalThis as any).CcFlattenProfile):
 *   flattenProfile(profile) => flat object
 *
 * See docs/flatten-profile.md for full documentation.
 */
(function (root: any) {
  'use strict';

  /**
   * @param {object} profile — raw profile, may have .data or { value } wrappers
   * @returns {object} flat key→value map
   */
  function flattenProfile(profile: any) {
    var flat: any = {};
    var raw = (profile && (profile.data || profile)) || {};
    for (var k in raw) {
      var v = raw[k];
      flat[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
    }
    if (profile && profile.name) flat.name = flat.name || profile.name;
    function copyIfEmpty(fromKey: any, toKey: any) {
      if (flat[fromKey] != null && String(flat[fromKey]).trim() !== '' && (flat[toKey] == null || String(flat[toKey]).trim() === '')) {
        flat[toKey] = flat[fromKey];
      }
    }
    var keys = Object.keys(flat);
    for (var i = 0; i < keys.length; i++) {
      var src = keys[i];
      copyIfEmpty(src, src.replace(/-/g, '_'));
      copyIfEmpty(src, src.replace(/_/g, '-'));
    }
    copyIfEmpty('email-id', 'email');
    copyIfEmpty('email_id', 'email');
    copyIfEmpty('email', 'email_id');
    copyIfEmpty('phone', 'mobile');
    copyIfEmpty('mobile', 'phone');
    copyIfEmpty('sub-division', 'sub_division');
    copyIfEmpty('sub_division', 'sub-division');
    return flat;
  }

  root.CcFlattenProfile = { flattenProfile: flattenProfile };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcFlattenProfile;
