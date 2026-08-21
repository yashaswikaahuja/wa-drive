/**
 * fingerprint-form — Form fingerprinting + pageModel assembly
 *
 * Produces two stable form identifiers from a scanned field set:
 *
 *   formKey         — djb2 hash of "hostname::title::top10Labels"
 *                     Fast, DOM-structure-sensitive identifier
 *
 *   semanticFormKey — djb2 hash of "hostname|top15NormalizedLabels"
 *                     Stable across DOM changes (label-text based), prefixed "s_"
 *
 * Optionally builds a PageModel via ccModels.createPageModel if provided.
 * Strips _el DOM references from all fields (not serialisable across
 * chrome.scripting.executeScript boundary).
 *
 * Public API (on globalThis.CcFingerprintForm):
 *   fingerprint(formFields, labelList, opts) => { formKey, semanticFormKey, pageModel }
 *
 * opts: { hostname, title, ccModels? }
 * Side effect: strips _el from every field in formFields.
 *
 * See docs/fingerprint-form.md for full documentation.
 */
(function (root) {
  'use strict';

  function djb2(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * @param {Array} formFields  — field objects (will have _el stripped in-place)
   * @param {Array} labelList   — flat label strings collected during scan
   * @param {{ hostname: string, title: string, ccModels?: object }} opts
   * @returns {{ formKey: string, semanticFormKey: string, pageModel: object|null }}
   */
  function fingerprint(formFields, labelList, opts) {
    opts = opts || {};
    var hostname = opts.hostname || '';
    var title = opts.title || '';
    var ccModels = opts.ccModels || null;

    // ── formKey: top-10 labels sorted ──
    var labelSig = labelList.slice().sort().slice(0, 10).join('|');
    var formKey = djb2(hostname + '::' + title + '::' + labelSig);

    // ── semanticFormKey: top-15 normalized labels sorted ──
    var semanticLabels = formFields
      .map(function (f) {
        return (f.label || '').toLowerCase().replace(/[^a-z\s]/g, '').trim();
      })
      .filter(function (l) { return l.length > 2; })
      .sort()
      .slice(0, 15);
    var semRaw = hostname + '|' + semanticLabels.join('|');
    var semanticFormKey = 's_' + djb2(semRaw);

    // ── pageModel (optional) ──
    var pageModel = null;
    if (ccModels && typeof ccModels.createPageModel === 'function') {
      pageModel = ccModels.createPageModel(
        { formFields: formFields, formKey: formKey, semanticFormKey: semanticFormKey },
        { url: opts.url || '', hostname: hostname, title: title }
      );
    }

    // ── Strip DOM references (not serialisable) ──
    formFields.forEach(function (f) { delete f._el; });

    return { formKey: formKey, semanticFormKey: semanticFormKey, pageModel: pageModel };
  }

  root.CcFingerprintForm = { fingerprint: fingerprint, _djb2: djb2 };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcFingerprintForm;
