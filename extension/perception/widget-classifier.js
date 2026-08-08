/**
 * CyberControl Widget Classifier v2 — Phase 3.2
 *
 * Deterministic widget taxonomy classification covering all major widget families.
 * Classification is evidence-based, behavior-first, framework-name-second.
 *
 * Families (architecture/widget-taxonomy.yml):
 *   text_entry, selection, toggle, date_time, file_upload, action,
 *   challenge, container, unknown
 *
 * Adapter IDs (cross-reference extension/perception/adapters/):
 *   native-select, native-select-multi, select2, choices, ng-select,
 *   ng-dropdown, mat-select, react-select, vue-select, bootstrap-select,
 *   flatpickr, jquery-ui-datepicker, mat-datepicker, split-date,
 *   otp-group, virtualized-list, native-text, native-toggle, native-file
 */

// ── Detection helpers ─────────────────────────────────────────────────

/** Check class list of an element fact for a set of class substrings. */
function hasClass(facts, ...fragments) {
  const cls = (facts.className || facts.class || '').toLowerCase();
  return fragments.some((f) => cls.includes(f));
}

/** Check accessible name (label) for keyword patterns. */
function nameMatches(facts, pattern) {
  return pattern.test(facts.accessibleName || '');
}

// ── Classification entry point ────────────────────────────────────────

/**
 * Classify an element's widget behavior from its observed facts.
 *
 * @param {object} facts — element facts from dom-gateway
 *   { tag, role, type, accessibleName, className, id, name,
 *     state, childElementCount, hasShadowRoot, textSnippet }
 * @returns {object|null} Widget schema object, or null for non-interactive content.
 */
function classifyWidget(facts) {
  const tag = (facts.tag || '').toLowerCase();
  const role = (facts.role || '').toLowerCase();
  const type = (facts.type || '').toLowerCase();
  const id = (facts.id || '').toLowerCase();
  const name = (facts.name || '').toLowerCase();
  const cls = (facts.className || facts.class || '').toLowerCase();

  // Non-interactive elements without ARIA role or known library class → null
  const nonInteractive = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
    'section', 'article', 'aside', 'main', 'nav', 'header', 'footer', 'figure',
    'figcaption', 'blockquote', 'pre', 'code', 'hr', 'br', 'img', 'picture',
    'video', 'audio', 'source', 'canvas', 'svg'];
  const knownLibraryClass = cls && (
    cls.includes('select2') || cls.includes('choices') || cls.includes('ng-select') ||
    cls.includes('ng-dropdown') || cls.includes('v-select') || cls.includes('vs__') ||
    cls.includes('react-select') || cls.includes('bootstrap-select') || cls.includes('selectpicker') ||
    cls.includes('flatpickr') || cls.includes('otp') || cls.includes('captcha') ||
    cls.includes('recaptcha') || cls.includes('hcaptcha') || cls.includes('turnstile') ||
    cls.includes('virtual-scroll') || cls.includes('cdk-virtual-scroll')
  );
  if (nonInteractive.includes(tag) && !role && !knownLibraryClass) return null;

  // ── 1. OTP / Verification code group ─────────────────────────────
  // OTP inputs are secret by nature — classify before text_entry
  if (tag === 'input' && (type === 'text' || type === 'number' || type === '') &&
      (nameMatches(facts, /otp|one.time|verification.code|auth.code/i) ||
       /otp|otpinput/i.test(cls) || /otp/i.test(id) || /otp/i.test(name) ||
       facts.autocomplete === 'one-time-code' ||
       (facts.maxlength && Number(facts.maxlength) === 1))) {
    return widget('challenge', 'many', 'composite', 'otp-group', 'otp-group', 0.85,
      ['focus', 'type_text']);
  }

  // ── 2. CAPTCHA / Human challenge ──────────────────────────────────
  if (role === 'captcha' ||
      /captcha|recaptcha|hcaptcha|turnstile/i.test(facts.accessibleName || '') ||
      /captcha|recaptcha|hcaptcha/i.test(cls)) {
    return widget('challenge', 'none', 'composite', 'captcha', 'captcha', 0.85, []);
  }

  // ── 3. Select2 ────────────────────────────────────────────────────
  // Select2 wraps a <select> with a sibling .select2-container
  if (cls.includes('select2') ||
      (tag === 'span' && cls.includes('select2-selection')) ||
      (role === 'combobox' && cls.includes('select2'))) {
    const multi = cls.includes('multiple') || facts.state?.multiple;
    return widget('selection', multi ? 'many' : 'one', 'overlay', 'select2', 'select2',
      0.9, ['focus', 'expand', multi ? 'select_many' : 'select_one']);
  }

  // ── 4. Choices.js ─────────────────────────────────────────────────
  if (cls.includes('choices__inner') || cls.includes('choices__list') ||
      cls.includes('choices__item') || cls.includes('choices')) {
    const multi = cls.includes('multiple') || facts.state?.multiple;
    return widget('selection', multi ? 'many' : 'one', 'overlay', 'choices', 'choices',
      0.9, ['focus', 'expand', multi ? 'select_many' : 'select_one']);
  }

  // ── 5. ng-select (class-based) ──────────────────────────────────────
  if (tag === 'ng-select' || cls.includes('ng-select') || cls.includes('ng-dropdown-panel')) {
    return widget('selection', 'one', 'overlay', 'ng-select', 'ng-select', 0.9,
      ['focus', 'expand', 'select_one']);
  }

  // ── 5b. ng-dropdown (CyberControl-specific class, distinct from ng-select) ─
  if (tag === 'div' && cls.includes('ng-dropdown') && !cls.includes('ng-select')) {
    return widget('selection', 'one', 'overlay', 'ng-dropdown', 'ng-dropdown', 0.9,
      ['focus', 'expand', 'select_one']);
  }

  // ── 6. Angular Material mat-select ───────────────────────────────
  if (tag === 'mat-select' || cls.includes('mat-select') || cls.includes('mat-mdc-select') ||
      (role === 'combobox' && (cls.includes('mat-') || cls.includes('mdc-')))) {
    return widget('selection', 'one', 'overlay', 'mat-select', 'mat-select', 0.9,
      ['focus', 'expand', 'select_one']);
  }

  // ── 7. React-Select ───────────────────────────────────────────────
  if (cls.includes('react-select') || cls.includes('__control') && cls.includes('css-')) {
    const multi = cls.includes('is-multi') || facts.state?.multiple;
    return widget('selection', multi ? 'many' : 'one', 'overlay', 'react-select', 'react-select',
      0.85, ['focus', 'expand', multi ? 'select_many' : 'select_one']);
  }

  // ── 8. Vue-Select / v-select ─────────────────────────────────────
  if (tag === 'v-select' || cls.includes('v-select') || cls.includes('vs__') ) {
    return widget('selection', 'one', 'overlay', 'vue-select', 'vue-select', 0.85,
      ['focus', 'expand', 'select_one']);
  }

  // ── 9. Bootstrap-Select ───────────────────────────────────────────
  if (cls.includes('bootstrap-select') || cls.includes('selectpicker') ||
      (role === 'combobox' && cls.includes('btn-group'))) {
    return widget('selection', 'one', 'overlay', 'bootstrap-select', 'bootstrap-select',
      0.85, ['focus', 'expand', 'select_one']);
  }

  // ── 10. Flatpickr ─────────────────────────────────────────────────
  if (cls.includes('flatpickr') || cls.includes('flatpickr-input') ||
      (tag === 'input' && facts.id && /flatpickr/i.test(facts.id))) {
    return widget('date_time', 'one', 'overlay', 'flatpickr', 'flatpickr', 0.9,
      ['focus', 'activate', 'type_text']);
  }

  // ── 11. jQuery UI Datepicker ──────────────────────────────────────
  if (cls.includes('hasDatepicker') || cls.includes('ui-datepicker') ||
      cls.includes('datepicker') && !cls.includes('mat-') && !cls.includes('flatpickr')) {
    return widget('date_time', 'one', 'overlay', 'jquery-ui-datepicker', 'jquery-ui-datepicker',
      0.85, ['focus', 'activate', 'type_text']);
  }

  // ── 12. Angular Material Datepicker ───────────────────────────────
  if ((tag === 'input' && (facts.matdatepicker != null || cls.includes('mat-date'))) ||
      cls.includes('mat-datepicker') || cls.includes('mat-calendar')) {
    return widget('date_time', 'one', 'overlay', 'mat-datepicker', 'mat-datepicker', 0.9,
      ['focus', 'type_text']);
  }

  // ── 13. Split-date group (DD/MM/YYYY in separate inputs) ──────────
  // Heuristic: a text/number input inside a fieldset/div with date-part role/name/id
  if (tag === 'input' && (type === 'text' || type === 'number') &&
      (/\b(dd|mm|yyyy|day|month|year|date_day|date_month|date_year)\b/i.test(id) ||
       /\b(dd|mm|yyyy|day|month|year)\b/i.test(name) ||
       /split.?date|date.?part|date.?field/i.test(cls))) {
    return widget('date_time', 'many', 'composite', 'split-date', 'split-date', 0.8,
      ['focus', 'type_text']);
  }

  // ── 14. Virtualized list (TanStack, React-Window, etc.) ───────────
  if (cls.includes('react-window') || cls.includes('react-virtual') ||
      cls.includes('virtual-scroll') || cls.includes('cdk-virtual-scroll') ||
      role === 'listbox' && cls.includes('virtual')) {
    return widget('selection', 'one', 'overlay', 'virtualized-list', 'virtualized-list',
      0.7, ['focus', 'scroll', 'select_one']);
  }

  // ── 15. Native text / textarea ────────────────────────────────────
  if (tag === 'textarea' || role === 'textbox') {
    return widget('text_entry', 'none', 'native', 'native-text', 'native-text', 0.95,
      ['focus', 'type_text', 'clear']);
  }
  if (tag === 'input' &&
      !['checkbox', 'radio', 'submit', 'button', 'reset', 'file', 'hidden', 'image'].includes(type)) {
    if (['date', 'datetime-local', 'month', 'week', 'time'].includes(type)) {
      return widget('date_time', 'one', 'native', `native-${type}`, `native-${type}`, 0.95,
        ['focus', 'type_text', 'clear']);
    }
    if (type === 'number') {
      return widget('text_entry', 'none', 'native', 'native-number', 'native-text', 0.95,
        ['focus', 'type_text', 'clear']);
    }
    return widget('text_entry', 'none', 'native', 'native-text', 'native-text', 0.95,
      ['focus', 'type_text', 'clear']);
  }

  // ── 16. Native select ────────────────────────────────────────────
  if (tag === 'select') {
    const multi = facts.state?.multiple || false;
    return widget('selection', multi ? 'many' : 'one', 'native',
      multi ? 'native-select-multi' : 'native-select',
      multi ? 'native-select-multi' : 'native-select',
      0.95, multi ? ['focus', 'select_many'] : ['focus', 'select_one']);
  }

  // ── 17. Generic combobox / listbox ────────────────────────────────
  if (role === 'combobox' || role === 'listbox') {
    return widget('selection', 'one', 'overlay', 'custom-combobox', null, 0.75,
      ['focus', 'expand', 'select_one']);
  }

  // ── 18. Toggle (checkbox / radio / switch) ────────────────────────
  if ((tag === 'input' && type === 'checkbox') || role === 'checkbox') {
    return widget('toggle', 'none', 'native', 'native-toggle', 'native-toggle', 0.95,
      ['focus', 'toggle']);
  }
  if ((tag === 'input' && type === 'radio') || role === 'radio') {
    return widget('toggle', 'one', 'native', 'native-toggle', 'native-toggle', 0.95,
      ['focus', 'toggle']);
  }
  if (role === 'switch') {
    return widget('toggle', 'none', 'native', 'switch', 'native-toggle', 0.9, ['focus', 'toggle']);
  }

  // ── 19. File upload ───────────────────────────────────────────────
  if (tag === 'input' && type === 'file') {
    return widget('file_upload', 'none', 'native', 'native-file', 'native-file', 0.95,
      ['focus', 'upload']);
  }

  // ── 20. Action ───────────────────────────────────────────────────
  if (tag === 'button' || tag === 'a' || role === 'button' || role === 'link' ||
      (tag === 'input' && ['submit', 'button', 'reset', 'image'].includes(type))) {
    return widget('action', 'none', 'native', null, null, 0.9, ['focus', 'activate']);
  }

  // ── 21. Container ────────────────────────────────────────────────
  if (['tablist', 'tabpanel', 'dialog', 'alertdialog', 'menu', 'menubar',
       'toolbar', 'tree', 'treegrid', 'grid'].includes(role)) {
    return widget('container', 'none', 'composite', role, null, 0.75, ['focus', 'expand']);
  }

  // ── 22. Fallback: known ARIA role → unknown widget ─────────────────
  if (role) {
    return widget('unknown', 'unknown', 'unknown', null, null, 0.3, ['focus']);
  }

  return null;
}

/**
 * Helper: construct a Widget schema object.
 */
function widget(behaviorKind, cardinality, interactionMode, implementationHint, adapterId, confidence, affordances) {
  return {
    behavior_kind: behaviorKind,
    cardinality: cardinality || 'none',
    interaction_mode: interactionMode || 'unknown',
    implementation_hint: implementationHint || null,
    adapter_id: adapterId || null,
    status: confidence >= 0.8 ? 'recognized' : confidence >= 0.5 ? 'partially_recognized' : 'opaque',
    confidence,
  };
}

/**
 * Map a Widget classification to the Node affordances array.
 */
function widgetAffordances(widgetObj) {
  if (!widgetObj) return [];
  const map = {
    text_entry: ['focus', 'type_text', 'clear'],
    selection: ['focus', 'select_one'],
    toggle: ['focus', 'toggle'],
    date_time: ['focus', 'type_text', 'clear'],
    file_upload: ['focus', 'upload'],
    action: ['focus', 'activate'],
    challenge: [],
    container: ['focus'],
    unknown: ['focus'],
  };
  return map[widgetObj.behavior_kind] || [];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { classifyWidget, widgetAffordances };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcWidgetClassifier = { classifyWidget, widgetAffordances };
}
