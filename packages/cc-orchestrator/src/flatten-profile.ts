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
    return flat;
  }

  root.CcFlattenProfile = { flattenProfile: flattenProfile };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcFlattenProfile;
