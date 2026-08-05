/**
 * CyberControl Widget Classifier — deterministic widget taxonomy classification.
 *
 * Maps observed DOM facts to the Widget schema defined in page-ir.schema.json.
 * Classification is evidence-based with confidence scoring.
 *
 * Categories (architecture/widget-taxonomy.yml):
 *   text_entry, selection, toggle, date_time, file_upload, action,
 *   challenge, container, unknown
 */

/**
 * Classify an element's widget behavior from its observed facts.
 *
 * @param {object} facts — element facts from dom-gateway (tag, role, type, state, etc.)
 * @returns {object|null} Widget schema object, or null for non-interactive content.
 */
function classifyWidget(facts) {
  const tag = (facts.tag || '').toLowerCase();
  const role = (facts.role || '').toLowerCase();
  const type = (facts.type || '').toLowerCase();

  // Non-interactive elements without an explicit ARIA role → null
  const nonInteractive = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
    'section', 'article', 'aside', 'main', 'nav', 'header', 'footer', 'figure',
    'figcaption', 'blockquote', 'pre', 'code', 'hr', 'br', 'img', 'picture',
    'video', 'audio', 'source', 'canvas', 'svg'];
  if (nonInteractive.includes(tag) && !role) return null;

  // ── Text entry ────────────────────────────────────────────────────
  if (tag === 'textarea' || role === 'textbox') {
    return widget('text_entry', 'none', 'native', null, null, 0.95, ['focus', 'type_text', 'clear']);
  }
  if (tag === 'input' && !['checkbox', 'radio', 'submit', 'button', 'reset', 'file', 'hidden', 'image'].includes(type)) {
    if (['date', 'datetime-local', 'month', 'week', 'time'].includes(type)) {
      return widget('date_time', 'one', 'native', `native-${type}`, null, 0.9, ['focus', 'type_text', 'clear']);
    }
    return widget('text_entry', 'none', 'native', null, null, 0.95, ['focus', 'type_text', 'clear']);
  }

  // ── Selection ─────────────────────────────────────────────────────
  if (tag === 'select') {
    const multi = facts.state?.multiple || false;
    return widget('selection', multi ? 'many' : 'one', 'native', 'native-select', null, 0.95, multi ? ['focus', 'select_many'] : ['focus', 'select_one']);
  }
  if (role === 'combobox' || role === 'listbox') {
    return widget('selection', 'one', 'overlay', 'custom-combobox', null, 0.8, ['focus', 'expand', 'select_one']);
  }
  if (tag === 'mat-select' || tag === 'ng-select') {
    return widget('selection', 'one', 'overlay', tag, null, 0.85, ['focus', 'expand', 'select_one']);
  }

  // ── Toggle ────────────────────────────────────────────────────────
  if ((tag === 'input' && type === 'checkbox') || role === 'checkbox') {
    return widget('toggle', 'none', 'native', null, null, 0.95, ['focus', 'toggle']);
  }
  if ((tag === 'input' && type === 'radio') || role === 'radio') {
    return widget('toggle', 'one', 'native', null, null, 0.95, ['focus', 'toggle']);
  }
  if (role === 'switch') {
    return widget('toggle', 'none', 'native', 'switch', null, 0.9, ['focus', 'toggle']);
  }

  // ── File upload ───────────────────────────────────────────────────
  if (tag === 'input' && type === 'file') {
    return widget('file_upload', 'none', 'native', null, null, 0.95, ['focus', 'upload']);
  }

  // ── Action (buttons, links) ───────────────────────────────────────
  if (tag === 'button' || tag === 'a' || role === 'button' || role === 'link' ||
      (tag === 'input' && ['submit', 'button', 'reset', 'image'].includes(type))) {
    return widget('action', 'none', 'native', null, null, 0.9, ['focus', 'activate']);
  }

  // ── Challenge (CAPTCHA) ───────────────────────────────────────────
  if (role === 'captcha' || /captcha|recaptcha|hcaptcha/i.test(facts.accessibleName || '')) {
    return widget('challenge', 'none', 'composite', 'captcha', null, 0.7, []);
  }

  // ── Container (role-based) ────────────────────────────────────────
  if (['tablist', 'tabpanel', 'dialog', 'alertdialog', 'menu', 'menubar', 'toolbar', 'tree', 'treegrid', 'grid'].includes(role)) {
    return widget('container', 'none', 'composite', role, null, 0.75, ['focus', 'expand']);
  }

  // ── Fallback: elements with ARIA roles that indicate interactivity ─
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
 * @param {object|null} widgetObj
 * @returns {string[]}
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
