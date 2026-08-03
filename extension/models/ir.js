// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Intermediate Representation (IR)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Phase 1.1: Formal models that sit between perception and planning.
//
// Perception (extractor.js) produces → PageModel
// Planner consumes → PageModel + Profile
// Executor receives → ActionPlan (from protocol.yml)
//
// The planner NEVER reads raw DOM. The executor NEVER receives PageModel.
//
// Exposes: window.ccModels.{PageModel, FormModel, FieldModel, createPageModel}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

;(function () {
  'use strict';

  var IR_VERSION = '1.0.0';

  // ══════════════════════════════════════════════════════════════════════
  // FieldModel — represents a single form field
  // ══════════════════════════════════════════════════════════════════════

  /**
   * @param {object} raw - Raw field data from DOM extraction
   * @returns {object} FieldModel
   */
  function FieldModel(raw) {
    return {
      // ── Identity (stable across reloads) ────────────────────────────
      fieldId: raw.fieldId || raw.selector || null,
      semanticKey: raw.semanticKey || null,

      // ── Label & context ─────────────────────────────────────────────
      label: raw.label || '',
      placeholder: raw.placeholder || '',
      ariaLabel: raw.ariaLabel || null,
      ariaDescribedBy: raw.ariaDescribedBy || null,
      contextText: raw.contextText || null,  // surrounding text for disambiguation

      // ── DOM identity (for execution layer only) ─────────────────────
      selector: raw.selector || null,
      id: raw.id || '',
      name: raw.name || '',
      index: typeof raw.index === 'number' ? raw.index : -1,

      // ── Type & behavior ─────────────────────────────────────────────
      type: raw.type || 'text',           // text|dropdown|radio-group|checkbox-group|mat-select|date|file|custom
      inputType: raw.inputType || null,   // original HTML input type (email, tel, number, etc.)
      widgetType: raw.widgetType || null, // detected component (ng-select, mat-select, react-select, native)

      // ── State ───────────────────────────────────────────────────────
      value: raw.value || '',
      required: raw.required || false,
      disabled: raw.disabled || false,
      visible: raw.visible !== false,     // default true
      readOnly: raw.readOnly || false,

      // ── Options (dropdowns, radios, checkboxes) ─────────────────────
      options: raw.options || null,        // string[] or {text, value}[]
      optionSelectors: raw.optionSelectors || null,

      // ── Relationships ───────────────────────────────────────────────
      dependsOn: raw.dependsOn || null,   // fieldId of parent (cascade dependency)
      groupName: raw.groupName || null,   // for radio/checkbox groups
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // FormModel — represents a logical form on the page
  // ══════════════════════════════════════════════════════════════════════

  /**
   * @param {object} raw
   * @returns {object} FormModel
   */
  function FormModel(raw) {
    return {
      // ── Identity ────────────────────────────────────────────────────
      formKey: raw.formKey || '',
      semanticFormKey: raw.semanticFormKey || '',
      formAction: raw.formAction || null,
      formMethod: raw.formMethod || null,

      // ── Fields ──────────────────────────────────────────────────────
      fields: (raw.fields || []).map(function (f) { return FieldModel(f); }),
      fieldCount: (raw.fields || []).length,

      // ── Structure ───────────────────────────────────────────────────
      hasFileUpload: raw.hasFileUpload || false,
      hasCaptcha: raw.hasCaptcha || false,
      hasSubmitButton: raw.hasSubmitButton || false,
      submitSelector: raw.submitSelector || null,

      // ── Cascade dependencies (derived) ──────────────────────────────
      cascadeChains: raw.cascadeChains || [],  // e.g. [["state", "district", "block"]]
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // PageModel — top-level model for the entire page
  // ══════════════════════════════════════════════════════════════════════

  /**
   * @param {object} raw
   * @returns {object} PageModel
   */
  function PageModel(raw) {
    return {
      // ── Metadata ────────────────────────────────────────────────────
      version: IR_VERSION,
      extractedAt: raw.extractedAt || new Date().toISOString(),
      url: raw.url || '',
      hostname: raw.hostname || '',
      title: raw.title || '',

      // ── Page fingerprint (deterministic) ────────────────────────────
      pageFingerprint: raw.pageFingerprint || '',

      // ── Forms ───────────────────────────────────────────────────────
      forms: (raw.forms || []).map(function (f) { return FormModel(f); }),
      primaryForm: raw.primaryForm != null ? raw.primaryForm : null,  // index of the main form

      // ── Page context ────────────────────────────────────────────────
      isMultiPage: raw.isMultiPage || false,
      currentStep: raw.currentStep || null,    // e.g. "2 of 5"
      totalSteps: raw.totalSteps || null,

      // ── Capabilities detected ───────────────────────────────────────
      frameworks: raw.frameworks || [],       // ['angular', 'jquery', 'react', 'dwr']
      hasOtp: raw.hasOtp || false,
      hasPayment: raw.hasPayment || false,
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Helpers: stable ID generation
  // ══════════════════════════════════════════════════════════════════════

  function generateStableId(f, index) {
    // Priority: id > name > label-based hash > positional fallback
    if (f.id) return 'id:' + f.id;
    if (f.name) return 'name:' + f.name + (f.type === 'radio-group' ? '' : ':' + index);
    // Hash from label + type for fields without id/name
    var raw = (f.label || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30) + ':' + (f.type || 'text');
    var h = 0;
    for (var i = 0; i < raw.length; i++) { h = ((h << 5) - h) + raw.charCodeAt(i); h |= 0; }
    return 'f_' + Math.abs(h).toString(36);
  }

  // ══════════════════════════════════════════════════════════════════════
  // createPageModel — converts raw extractor output to PageModel
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Bridge function: takes the legacy extractor output and produces a
   * formal PageModel. This allows incremental migration — extractor.js
   * continues to work as before, and this function wraps its output.
   *
   * @param {object} extractorOutput - { formFields, formKey, semanticFormKey }
   * @param {object} pageContext - { url, hostname, title, frameworks }
   * @returns {object} PageModel
   */
  function createPageModel(extractorOutput, pageContext) {
    var fields = (extractorOutput.formFields || []).map(function (f, i) {
      // Generate stable field ID from label + name + type + index
      // More stable than CSS selector across page reloads
      var stableId = generateStableId(f, i);
      return FieldModel({
        fieldId: stableId,
        semanticKey: null,  // computed by service, not extension
        label: f.label || '',
        placeholder: f.placeholder || '',
        ariaLabel: f._el ? f._el.getAttribute('aria-label') : null,
        ariaDescribedBy: f._el ? f._el.getAttribute('aria-describedby') : null,
        contextText: f._el ? getContextText(f._el) : null,
        selector: f.selector,
        id: f.id || '',
        name: f.name || '',
        index: f.index != null ? f.index : i,
        type: f.type || 'text',
        inputType: f._el ? (f._el.type || null) : null,
        widgetType: detectWidgetType(f),
        value: f.value || '',
        required: f._el ? (f._el.required || f._el.getAttribute('aria-required') === 'true') : false,
        disabled: f._el ? (f._el.disabled || f._el.getAttribute('aria-disabled') === 'true') : false,
        visible: f._el ? isFieldVisible(f._el) : true,
        readOnly: f._el ? f._el.readOnly : false,
        options: f.options || null,
        optionSelectors: f.optionSelectors || null,
        dependsOn: null,  // detected in cascade analysis
        groupName: f.name || null,
      });
    });

    // Detect cascade dependencies (state → district → block pattern)
    var cascadeChains = detectCascadeChains(fields);
    cascadeChains.forEach(function (chain) {
      for (var i = 1; i < chain.length; i++) {
        var child = fields.find(function (f) { return f.fieldId === chain[i]; });
        if (child) child.dependsOn = chain[i - 1];
      }
    });

    var form = FormModel({
      formKey: extractorOutput.formKey || '',
      semanticFormKey: extractorOutput.semanticFormKey || '',
      formAction: null,
      formMethod: null,
      fields: fields,
      hasFileUpload: fields.some(function (f) { return f.type === 'file'; }),
      hasCaptcha: detectCaptcha(),
      hasSubmitButton: !!document.querySelector('button[type="submit"],input[type="submit"]'),
      submitSelector: getSubmitSelector(),
      cascadeChains: cascadeChains,
    });

    return PageModel({
      url: (pageContext && pageContext.url) || location.href,
      hostname: (pageContext && pageContext.hostname) || location.hostname,
      title: (pageContext && pageContext.title) || document.title.slice(0, 80),
      pageFingerprint: extractorOutput.semanticFormKey || extractorOutput.formKey || '',
      forms: [form],
      primaryForm: 0,
      isMultiPage: detectMultiPage(),
      currentStep: detectCurrentStep(),
      totalSteps: null,
      frameworks: detectFrameworks(),
      hasOtp: detectOtp(),
      hasPayment: false,
    });
  }

  // ── Helper: get surrounding context text for disambiguation ────────
  function getContextText(el) {
    if (!el) return null;
    var container = el.closest('tr,.form-group,.form-field,[class*="form-row"],fieldset');
    if (!container) return null;
    var text = container.textContent.replace(/\s+/g, ' ').trim();
    return text.length > 200 ? text.slice(0, 200) : text;
  }

  // ── Helper: detect widget type from field data ─────────────────────
  function detectWidgetType(f) {
    if (f.type === 'mat-select') return 'mat-select';
    if (f.type === 'ng-select') return 'ng-select';
    if (f.type === 'dropdown') return 'native-select';
    if (f.type === 'radio-group') return 'radio';
    if (f.type === 'checkbox-group' || f.type === 'checkbox-agreement') return 'checkbox';
    if (f._el && f._el.closest('.ng-select')) return 'ng-select';
    if (f._el && f._el.closest('mat-form-field')) return 'mat-input';
    return 'native';
  }

  // ── Helper: detect if field is visible ─────────────────────────────
  function isFieldVisible(el) {
    if (typeof window.ccDomUtils !== 'undefined') return window.ccDomUtils.isVisible(el);
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    var s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }

  // ── Helper: detect cascade chains (state→district→block) ───────────
  function detectCascadeChains(fields) {
    var chains = [];
    var cascadeKeywords = [
      ['state', 'district', 'block', 'village'],
      ['state', 'district', 'sub_division'],
      ['country', 'state', 'city'],
    ];
    cascadeKeywords.forEach(function (pattern) {
      var chain = [];
      pattern.forEach(function (keyword) {
        var match = fields.find(function (f) {
          var ident = (f.label + ' ' + f.name + ' ' + f.id).toLowerCase();
          return ident.includes(keyword) && f.type === 'dropdown';
        });
        if (match) chain.push(match.fieldId);
      });
      if (chain.length >= 2) chains.push(chain);
    });
    return chains;
  }

  // ── Helper: detect CAPTCHA presence ────────────────────────────────
  function detectCaptcha() {
    return !!(
      document.querySelector('[class*="captcha"],[id*="captcha"],iframe[src*="recaptcha"],iframe[src*="hcaptcha"]') ||
      document.querySelector('img[src*="captcha"]')
    );
  }

  // ── Helper: detect submit button ───────────────────────────────────
  function getSubmitSelector() {
    var btn = document.querySelector('button[type="submit"],input[type="submit"]');
    if (btn && btn.id) return '#' + btn.id;
    if (btn && btn.name) return '[name="' + btn.name + '"]';
    return null;
  }

  // ── Helper: detect if page is multi-step ───────────────────────────
  function detectMultiPage() {
    return !!(
      document.querySelector('.step,.wizard-step,[class*="step-"],.progress-step') ||
      document.querySelector('[class*="wizard"],[class*="multi-step"]')
    );
  }

  // ── Helper: detect current step indicator ──────────────────────────
  function detectCurrentStep() {
    var active = document.querySelector('.step.active,.step.current,[class*="step-"].active,[aria-current="step"]');
    if (!active) return null;
    return active.textContent.trim().slice(0, 20);
  }

  // ── Helper: detect page frameworks ─────────────────────────────────
  function detectFrameworks() {
    var fw = [];
    if (typeof jQuery !== 'undefined' || typeof $ !== 'undefined') fw.push('jquery');
    if (document.querySelector('[ng-app],[ng-controller],[_nghost]')) fw.push('angular');
    if (document.querySelector('[data-reactroot],[data-reactid]') || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined') fw.push('react');
    if (typeof dwr !== 'undefined') fw.push('dwr');
    if (document.querySelector('mat-form-field,mat-select')) fw.push('angular-material');
    return fw;
  }

  // ── Helper: detect OTP field ───────────────────────────────────────
  function detectOtp() {
    return !!(
      document.querySelector('[name*="otp"],[id*="otp"],[placeholder*="OTP"],[autocomplete="one-time-code"]')
    );
  }

  // ── Expose ─────────────────────────────────────────────────────────
  window.ccModels = {
    version: IR_VERSION,
    PageModel: PageModel,
    FormModel: FormModel,
    FieldModel: FieldModel,
    createPageModel: createPageModel,
  };
})();
