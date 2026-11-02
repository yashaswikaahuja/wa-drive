// ── extractFormFieldsWithFingerprint ──────────────────────────────────────────
function extractFormFieldsWithFingerprint() {
  var _fc  = (globalThis as any).CcFormContext        || {};
  var _ssf = (globalThis as any).CcScanStandardFields || {};
  var _smw = (globalThis as any).CcScanMatWidgets     || {};
  var _sng = (globalThis as any).CcScanNgDropdowns    || {};
  var _scw = (globalThis as any).CcScanCustomChoice   || {};
  var _sfv = (globalThis as any).CcSortFieldsVisual   || {};
  var _fp  = (globalThis as any).CcFingerprintForm    || {};

  var ccDomUtils = window.ccDomUtils || {};
  var doc = document;

  var helpers = {
    isInSkipContext: function (el) {
      return _fc.isInSkipContext ? _fc.isInSkipContext(el) :
        !!(el.closest && el.closest('nav,header,footer,[role="navigation"],[role="banner"]'));
    },
    humanizeAttr: function (raw) {
      return ccDomUtils.humanizeAttr ? ccDomUtils.humanizeAttr(raw) : '';
    },
    getLabel: function (el) {
      // Prefer shared getLabel (aria/label/container/humanize). Never fall back to bare id.
      if (ccDomUtils.getLabel) return ccDomUtils.getLabel(el) || '';
      var ph = (el.placeholder || '').trim();
      if (ph) return ph;
      if (ccDomUtils.humanizeAttr) {
        return ccDomUtils.humanizeAttr(el.name || el.id || el.getAttribute && el.getAttribute('formcontrolname') || '') || '';
      }
      return '';
    },
    isGoodLabel: function (s) {
      return _fc.isGoodLabel ? _fc.isGoodLabel(s, ccDomUtils) :
        !!(s && s.trim().length >= 2 && /[a-zA-Z0-9]/.test(s));
    },
    isVisuallyPresent: function (el) {
      if (!_fc.isVisuallyPresent) return true;
      var view = (el && el.ownerDocument && el.ownerDocument.defaultView) || undefined;
      return _fc.isVisuallyPresent(el, view);
    },
  };

  var docs = _fc.sameOriginDocs ? _fc.sameOriginDocs(doc) : [doc];
  // Guard — bail early if no form context on this page or a same-origin iframe
  if (_fc.hasFormContext && !_fc.hasFormContext(doc, ccDomUtils)) {
    return { formFields: [], formKey: '' };
  }

  // Collect all fields from all scan passes, including TinyMCE iframe bodies
  var formFields = [];
  var labelList  = [];

  for (var d = 0; d < docs.length; d++) {
    var one = docs[d];
    if (_ssf.scan) {
      var std = _ssf.scan(one, helpers);
      formFields = formFields.concat(std.formFields);
      labelList  = labelList.concat(std.labelList);
    }

    if (_smw.scan) {
      var mat = _smw.scan(one, formFields, helpers, 10000 + formFields.length);
      formFields = formFields.concat(mat.formFields);
      labelList  = labelList.concat(mat.labelList);
    }

    if (_sng.scan) {
      var ng = _sng.scan(one, formFields, helpers, 10000 + formFields.length);
      formFields = formFields.concat(ng.formFields);
      labelList  = labelList.concat(ng.labelList);
    }

    if (_scw.scan) {
      var custom = _scw.scan(one, formFields, helpers, 20000 + formFields.length);
      formFields = formFields.concat(custom.formFields);
      labelList  = labelList.concat(custom.labelList);
    }
  }

  // ng-select / mat-select skip the standard decorate pass — attach canonicalKey,
  // locators, fillMode before cascade wiring.
  if (_ssf.decorateField) {
    formFields.forEach(function (f: any) {
      if (!f || f.locators || !f._el) return;
      var owner = (f._el.ownerDocument) || (typeof document !== 'undefined' ? document : null);
      _ssf.decorateField(f, f._el, owner);
    });
  }

  // Cascade / AJAX after every scanner so ng-select and mat-select get dependsOn too
  if (_ssf.linkDependsOn) _ssf.linkDependsOn(formFields);
  if (_ssf.markAjaxDropdowns) _ssf.markAjaxDropdowns(formFields);

  // Sort by visual position (_el refs still present here)
  if (_sfv.sort) _sfv.sort(formFields);

  var snapshotId = 'snap.' + Date.now().toString(36);
  formFields.forEach(function (f: any, i: number) {
    f.visible = true;
    f.visualLabel = f.label || '';
    f.fieldId = snapshotId + '.' + i;
    f.snapshotId = snapshotId;
  });

  // Fingerprint + strip _el
  var hostname = location.hostname;
  var title = (document.querySelector('h1,h2,legend,.form-title,.page-title')
    ?.textContent || document.title || '').trim().slice(0, 50);
  var serviceId = '';
  try {
    var params = new URL(location.href).searchParams;
    serviceId = params.get('serviceId') || params.get('serviceid') || params.get('service_id') || '';
  } catch (e) {}
  if (!serviceId) {
    var sidEl = document.querySelector('input[name="serviceId"],input[id="serviceId"],input[name="serviceid"]');
    if (sidEl && (sidEl as any).value) serviceId = String((sidEl as any).value);
  }

  var result: any = { formKey: '', semanticFormKey: '', pageModel: null, structuralFingerprint: '' };
  if (_fp.fingerprint) {
    result = _fp.fingerprint(formFields, labelList, {
      hostname: hostname,
      title: title,
      url: location.href,
      serviceId: serviceId,
      ccModels: (typeof window !== 'undefined' && window.ccModels) || null,
    });
  }

  return {
    formFields: formFields,
    formKey: result.formKey,
    semanticFormKey: result.semanticFormKey,
    pageModel: result.pageModel,
    snapshotId: snapshotId,
    meta: {
      title: title,
      hostname: hostname,
      url: location.href,
      serviceId: serviceId || '',
      structuralFingerprint: result.structuralFingerprint || '',
    },
  };
}

// ── injectCorrectionObserver ──────────────────────────────────────────────────
function injectCorrectionObserver(mapping: any, filledBySource: any, profile: any, backendUrl: any, formKey: any) {
  var _co = (globalThis as any).CcCorrectionObserver || {};
  if (_co.inject) {
    _co.inject(mapping, filledBySource, profile, backendUrl, formKey, document);
  }
}
