/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
(function () {
'use strict';
/**
 * CyberControl Node Factory — transforms gateway-captured facts into IR Nodes.
 *
 * Produces Node objects conforming to page-ir.schema.json.
 * Applies privacy filter, attaches evidence, classifies widgets.
 */

let _nodeSeq = 0;

/**
 * Generate a stable node_id namespaced per context.
 * @param {string} contextId
 * @param {string} tag
 * @returns {string}
 */
function generateNodeId(contextId, tag) {
  _nodeSeq += 1;
  return `${contextId}.${tag || 'el'}.${_nodeSeq}`;
}

/**
 * Determine the IR node kind from observed facts.
 * @param {object} facts — from dom-gateway
 * @returns {string}
 */
function classifyKind(facts) {
  const tag = (facts.tag || '').toLowerCase();
  const role = (facts.role || '').toLowerCase();

  // Page root
  if (tag === 'html' || role === 'document') return 'page';

  // Navigation
  if (tag === 'nav' || role === 'navigation') return 'navigation';

  // Form
  if (tag === 'form' || role === 'form') return 'form';

  // Section/Region
  if (['section', 'article', 'aside', 'main', 'header', 'footer', 'fieldset', 'legend'].includes(tag) ||
      ['region', 'banner', 'complementary', 'contentinfo', 'main'].includes(role)) return 'region';

  // Validation message
  if (role === 'alert' || role === 'status' || (tag === 'span' && facts.accessibleName?.match?.(/error|invalid|required/i))) return 'validation_message';

  // Option (in select/listbox)
  if (tag === 'option' || role === 'option' || role === 'menuitem' || role === 'treeitem') return 'option';

  // Widget/Control (interactive elements)
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' ||
      tag === 'a' || tag === 'mat-select' || tag === 'ng-select' ||
      ['textbox', 'checkbox', 'radio', 'combobox', 'listbox', 'button', 'link',
       'slider', 'switch', 'spinbutton', 'searchbox', 'tab'].includes(role)) return 'control';

  // Content (text, images, etc.)
  return 'content';
}

/**
 * Create an IR Node from gateway-observed facts.
 *
 * @param {object} facts — element facts from dom-gateway
 * @param {string} contextId — owning context
 * @param {string|null} parentId — parent node_id (null for root)
 * @param {number} order — sibling order
 * @param {object} deps — { privacyFilter, widgetClassifier }
 * @returns {object} IR Node conforming to schema
 */
function createNode(facts, contextId, parentId, order, deps) {
  const { privacyFilter, widgetClassifier } = deps;
  const kind = classifyKind(facts);
  const nodeId = generateNodeId(contextId, facts.tag);

  // Widget classification
  const widget = widgetClassifier ? widgetClassifier.classifyWidget(facts) : null;

  // Map state
  const state = {
    visible: facts.state?.visible ?? null,
    enabled: facts.state?.enabled ?? null,
    readonly: facts.state?.readonly ?? null,
    required: facts.state?.required ?? null,
    focused: facts.state?.focused ?? null,
    expanded: facts.state?.expanded ?? null,
    selected: facts.state?.selected ?? null,
    checked: facts.state?.checked ?? null,
  };

  // Map value_state
  const valueStateMap = { empty: 'empty', nonempty: 'nonempty', masked: 'masked', not_applicable: 'not_applicable' };
  const valueState = valueStateMap[facts.state?.valueState] || 'not_applicable';

  // Observed facts (no raw values)
  const observed = {
    accessible_name: facts.accessibleName || null,
    role: facts.role || null,
    sanitized_text: facts.textSnippet || null,
    language: null, // could be detected from lang attribute
    description: null,
    value_state: valueState,
  };

  // Evidence
  const factsList = [`tag:${facts.tag}`, facts.role ? `role:${facts.role}` : 'role:none'].filter(Boolean);
  const signals = [];
  if (facts.geometry) {
    const vc = (typeof globalThis !== 'undefined' && globalThis.CcVisualContext)
      || (typeof require === 'function' ? (() => { try { return require('./visual-context.js'); } catch { return null; } })() : null);
    const geoSignals = vc?.geometryEvidenceSignals
      ? vc.geometryEvidenceSignals(facts.geometry)
      : ['geometry.bbox'];
    for (const s of geoSignals) signals.push(s);
    factsList.push('geometry.present');
  }
  const evidenceItem = {
    source: 'observed',
    detector: 'dom-gateway',
    detector_version: '1.0.0',
    confidence: 1,
    facts: factsList,
  };
  if (signals.length) evidenceItem.signals = signals.slice(0, 32);
  const evidence = [evidenceItem];

  // Affordances from widget
  const affordances = widget
    ? (deps.widgetClassifier.widgetAffordances?.(widget) || [])
    : [];

  // Privacy (initial — will be refined by privacy filter)
  const privacy = { classification: 'ordinary', redacted: false, reason: null };

  // Geometry (document CSS pixels; null when omitted / fail-closed)
  let geometry = facts.geometry ? {
    x: facts.geometry.x,
    y: facts.geometry.y,
    width: facts.geometry.width,
    height: facts.geometry.height,
    viewport_intersection: facts.geometry.viewport_intersection,
    z_index_hint: facts.geometry.z_index_hint ?? null,
  } : null;

  const node = {
    node_id: nodeId,
    kind,
    context_id: contextId,
    parent_id: parentId,
    order,
    observed,
    state,
    geometry,
    privacy,
    evidence,
    affordances,
    widget,
  };

  // Apply privacy filter
  if (privacyFilter) {
    privacyFilter.applyPrivacyRules(node, { type: facts.type, autocomplete: facts.autocomplete });
  }

  // ADR-0011: geometry may remain on secret nodes; sanitize shape only
  if (node.geometry) {
    const vc = (typeof globalThis !== 'undefined' && globalThis.CcVisualContext)
      || (typeof require === 'function' ? (() => { try { return require('./visual-context.js'); } catch { return null; } })() : null);
    if (vc?.sanitizeGeometryForPrivacy) {
      node.geometry = vc.sanitizeGeometryForPrivacy(
        node.geometry,
        node.privacy?.classification
      );
    }
  }

  return node;
}

/**
 * Reset the node sequence counter (for testing).
 */
function resetNodeCounter() {
  _nodeSeq = 0;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createNode, classifyKind, generateNodeId, resetNodeCounter };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcNodeFactory = { createNode, classifyKind, generateNodeId };
}
})();
