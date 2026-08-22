// ── extractFormFieldsWithFingerprint ──────────────────────────────────────────
function extractFormFieldsWithFingerprint() {
  var _fc  = globalThis.CcFormContext        || {};
  var _ssf = globalThis.CcScanStandardFields || {};
  var _smw = globalThis.CcScanMatWidgets     || {};
  var _sng = globalThis.CcScanNgDropdowns    || {};
  var _sfv = globalThis.CcSortFieldsVisual   || {};
  var _fp  = globalThis.CcFingerprintForm    || {};

  var ccDomUtils = window.ccDomUtils || {};
  var doc = document;

  var helpers = {
    isInSkipContext: function (el) {
      return _fc.isInSkipContext ? _fc.isInSkipContext(el) :
        !!(el.closest && el.closest('nav,header,footer,[role="navigation"],[role="search"],[role="banner"]'));
    },
    getLabel: function (el) {
      return ccDomUtils.getLabel ? ccDomUtils.getLabel(el) : (el.placeholder || '');
    },
    isGoodLabel: function (s) {
      return _fc.isGoodLabel ? _fc.isGoodLabel(s, ccDomUtils) :
        !!(s && s.trim().length >= 2 && /[a-zA-Z0-9]/.test(s));
    },
  };

  // Guard — bail early if no form context
  if (_fc.hasFormContext && !_fc.hasFormContext(doc, ccDomUtils)) {
    return { formFields: [], formKey: '' };
  }

  // Collect all fields from all scan passes
  var formFields = [];
  var labelList  = [];

  if (_ssf.scan) {
    var std = _ssf.scan(doc, helpers);
    formFields = formFields.concat(std.formFields);
    labelList  = labelList.concat(std.labelList);
  }

  if (_smw.scan) {
    var mat = _smw.scan(doc, formFields, helpers, 10000);
    formFields = formFields.concat(mat.formFields);
    labelList  = labelList.concat(mat.labelList);
  }

  if (_sng.scan) {
    var ng = _sng.scan(doc, formFields, helpers, 10000 + formFields.length);
    formFields = formFields.concat(ng.formFields);
    labelList  = labelList.concat(ng.labelList);
  }

  // Sort by visual position (_el refs still present here)
  if (_sfv.sort) _sfv.sort(formFields);

  // Fingerprint + strip _el
  var hostname = location.hostname;
  var title = (document.querySelector('h1,h2,legend,.form-title,.page-title')
    ?.textContent || document.title || '').trim().slice(0, 50);

  var result = { formKey: '', semanticFormKey: '', pageModel: null };
  if (_fp.fingerprint) {
    result = _fp.fingerprint(formFields, labelList, {
      hostname: hostname,
      title: title,
      url: location.href,
      ccModels: (typeof window !== 'undefined' && window.ccModels) || null,
    });
  }

  return {
    formFields: formFields,
    formKey: result.formKey,
    semanticFormKey: result.semanticFormKey,
    pageModel: result.pageModel,
  };
}

// ── injectCorrectionObserver ──────────────────────────────────────────────────
function injectCorrectionObserver(mapping, filledBySource, profile, backendUrl, formKey) {
  var _co = globalThis.CcCorrectionObserver || {};
  if (_co.inject) {
    _co.inject(mapping, filledBySource, profile, backendUrl, formKey, document);
  }
}
