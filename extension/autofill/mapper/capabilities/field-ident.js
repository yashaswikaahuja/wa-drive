/**
 * field-ident — Field identity normalisation helpers
 *
 * Three helpers for converting raw DOM field data into a stable
 * normalised identity string used for alias matching:
 *
 *   normalizeIdent(s)         — lowercases and collapses separators to _
 *   labelPrimaryIdent(field)  — label-primary identity (prefers label over id/name)
 *   normChoice(s)             — strips non-alphanumerics for option comparison
 *
 * Public API (on globalThis.CcFieldIdent):
 *   normalizeIdent(s)
 *   labelPrimaryIdent(field)
 *   normChoice(s)
 *
 * See docs/field-ident.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Lowercase and collapse separators (spaces, hyphens, colons, etc.) to _.
   * @param {string} s
   * @returns {string}
   */
  function normalizeIdent(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[-\s:*()'./\\]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Produce a label-primary identity for a form field.
   * Label text is the primary signal; DOM id/name are included only as soft hints.
   *
   * @param {object} field — { label, id, name, placeholder }
   * @returns {{ ident, matchBy, labelEn, labelRaw, labelStrong }}
   */
  function labelPrimaryIdent(field) {
    var raw = String(field.label || '').trim();
    var en = raw.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
    var enCore = en.replace(/[^a-z0-9]/gi, '');
    // Good label: bilingual English part ≥3 alnum OR raw unicode label ≥4 chars
    var labelStrong = enCore.length >= 3 || raw.replace(/\s/g, '').length >= 4;
    var matchBy = 'label';
    var parts = [];
    if (en) {
      parts.push(en, en); // double-weight English tokens from label
    }
    if (raw && raw !== en) {
      parts.push(raw); // keep full bilingual string for Hindi keyword hooks
    }
    // Placeholder only as soft hint
    if (field.placeholder && String(field.placeholder).trim().length > 2) {
      parts.push(String(field.placeholder).trim());
    }
    // Always include name/id lightly so groups labeled only "Yes" still see "changed"/"isAddressSame"
    if (field.name) parts.push(String(field.name));
    if (field.id) parts.push(String(field.id));
    var ident = normalizeIdent(parts.join(' '));
    if (!labelStrong) {
      // Weak/missing label — last resort: DOM keys
      matchBy = 'dom-fallback';
      var domBits = [field.placeholder, field.id, field.name].filter(Boolean).join(' ');
      ident = normalizeIdent((ident ? ident + ' ' : '') + domBits);
    }
    return { ident: ident, matchBy: matchBy, labelEn: en, labelRaw: raw, labelStrong: labelStrong };
  }

  /**
   * Normalise for option comparison — strips non-alphanumerics, lowercase.
   * @param {string} s
   * @returns {string}
   */
  function normChoice(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  root.CcFieldIdent = {
    normalizeIdent: normalizeIdent,
    labelPrimaryIdent: labelPrimaryIdent,
    normChoice: normChoice,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
