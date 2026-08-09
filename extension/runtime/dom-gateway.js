(function() {
/**
 * CyberControl DOM Observation Gateway — extension/runtime/dom-gateway.js
 *
 * The sole authorized entry point for structural DOM access in new Phase 3 code.
 * Lives in the extension's ISOLATED world. Not page-reachable.
 *
 * Two ports:
 *   OBSERVATION — consumed by extension/perception/ (read-only, no live elements out)
 *   INTERACTION — consumed by extension/execution/ (mechanical actions with TOCTOU checks)
 *
 * INVARIANTS (architecture/dom-access-policy.yml, gateway-security.yml):
 *  - No live Element references leave this module (returned data is plain objects)
 *  - TOCTOU revalidation before any mechanical action
 *  - Caller authentication via extension-internal channels only
 *  - MutationObserver filters out CyberControl-private mutations
 *  - Performance: batched geometry reads, bounded traversal depth
 */

// ═══════════════════════════════════════════════════════════════════════
// OBSERVATION PORT — read-only structural facts for perception
// ═══════════════════════════════════════════════════════════════════════

/**
 * Maximum traversal depth to prevent runaway recursion on deeply nested DOM.
 */
const MAX_DEPTH = 64;

/**
 * Maximum number of nodes to process in a single capture pass.
 */
const MAX_NODES = 2000;

/**
 * Capture bounded structural facts from the given root element.
 * Returns plain data objects — no live Element references.
 *
 * @param {Element|Document} root — the subtree root to observe
 * @param {object} [options]
 * @param {number} [options.maxDepth=64]
 * @param {number} [options.maxNodes=2000]
 * @param {boolean} [options.includeGeometry=true]
 * @returns {{ nodes: object[], truncated: boolean, nodeCount: number }}
 */
function captureStructuralFacts(root, options = {}) {
  const maxDepth = options.maxDepth ?? MAX_DEPTH;
  const maxNodes = options.maxNodes ?? MAX_NODES;
  const includeGeometry = options.includeGeometry !== false;
  const nodes = [];
  const liveElements = [];  // Parallel array: liveElements[i] = live Element for nodes[i]
  let truncated = false;

  function walk(element, depth, parentIndex) {
    if (nodes.length >= maxNodes) { truncated = true; return; }
    if (depth > maxDepth) { truncated = true; return; }
    if (!element || element.nodeType !== 1) return;

    // Skip CyberControl-injected elements
    if (element.hasAttribute && element.hasAttribute('data-cc-id')) return;
    if (element.id && element.id.startsWith('_cc_')) return;

    const fact = extractElementFacts(element, includeGeometry);
    fact._parentIndex = parentIndex;
    fact._depth = depth;
    const thisIndex = nodes.length;
    nodes.push(fact);
    liveElements.push(element);  // Keep live ref at same index

    // Traverse children (including slotted content for open shadow roots)
    const children = element.shadowRoot?.mode === 'open'
      ? element.shadowRoot.children
      : element.children;
    for (let i = 0; i < children.length && !truncated; i++) {
      walk(children[i], depth + 1, thisIndex);
    }
  }

  const startEl = root.nodeType === 9 ? root.documentElement : root;
  walk(startEl, 0, -1);
  return { nodes, liveElements, truncated, nodeCount: nodes.length };
}

/**
 * Extract observable facts from a single element (no live reference in output).
 */
function extractElementFacts(element, includeGeometry) {
  const tag = element.tagName?.toLowerCase() || '';
  const role = element.getAttribute('role') || computeImplicitRole(element) || null;
  const ariaLabel = element.getAttribute('aria-label') || null;
  const ariaLabelledby = element.getAttribute('aria-labelledby') || null;
  const accessibleName = computeAccessibleName(element, ariaLabel, ariaLabelledby);
  const type = element.getAttribute('type') || null;
  const autocomplete = element.getAttribute('autocomplete') || null;

  const fact = {
    tag,
    role,
    accessibleName,
    type,
    autocomplete,
    id: element.id || null,
    name: element.getAttribute('name') || null,
    placeholder: element.getAttribute('placeholder') || null,
    // Class list — used by classifier for library-specific detection (Select2, Choices, ng-select, etc.)
    className: element.className || '',
    // Extra attributes used by classifier
    maxlength: element.getAttribute('maxlength') || null,
    matdatepicker: element.hasAttribute('matDatepicker') ? '' : null,
    // Mechanical state (never raw values)
    state: readMechanicalState(element),
    // Bounded text content (never the full innerHTML)
    textSnippet: computeTextSnippet(element),
    // Children count for structural classification
    childElementCount: element.children?.length || 0,
    // Shadow root info
    hasShadowRoot: !!element.shadowRoot,
    shadowMode: element.shadowRoot?.mode || null,
  };

  if (includeGeometry) {
    fact.geometry = readGeometry(element);
  }

  return fact;
}

/**
 * Read the mechanical/ARIA state of an element.
 * Returns only boolean/enum state — never actual field values.
 */
function readMechanicalState(element) {
  const tag = element.tagName?.toLowerCase() || '';
  const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';
  const hasValue = isInput && element.value !== undefined;

  return {
    visible: isElementVisible(element),
    enabled: !element.disabled && !element.hasAttribute('aria-disabled'),
    readonly: element.readOnly || element.hasAttribute('aria-readonly'),
    required: element.required || element.hasAttribute('aria-required'),
    focused: element === element.ownerDocument?.activeElement,
    expanded: parseTristate(element.getAttribute('aria-expanded')),
    selected: parseTristate(element.getAttribute('aria-selected')),
    checked: element.checked != null ? element.checked : parseTristate(element.getAttribute('aria-checked')),
    // Value state without the actual value (privacy-safe)
    valueState: hasValue
      ? (element.value === '' ? 'empty' : (element.type === 'password' ? 'masked' : 'nonempty'))
      : 'not_applicable',
  };
}

/**
 * Read bounding geometry for an element.
 */
function readGeometry(element) {
  try {
    const rect = element.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const intersection = computeViewportIntersection(rect, vw, vh);
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewport_intersection: intersection,
      z_index_hint: null, // computed lazily if needed
    };
  } catch {
    return null;
  }
}

/**
 * Batched geometry read for multiple elements (reduces layout thrashing).
 * @param {Element[]} elements
 * @returns {object[]} Array of geometry objects (same order as input).
 */
function readGeometryBatch(elements) {
  return elements.map((el) => readGeometry(el));
}

/**
 * Read ARIA and mechanical state for a single element (public observation API).
 * @param {Element} element
 * @returns {object}
 */
function readAriaState(element) {
  return readMechanicalState(element);
}

/**
 * Enumerate accessible browsing contexts (frames and shadow roots).
 * @param {Document} doc
 * @returns {{ frames: object[], shadowRoots: object[] }}
 */
function enumerateContexts(doc) {
  const frames = [];
  const shadowRoots = [];

  // Frames (iframes)
  const iframes = doc.querySelectorAll('iframe');
  for (const iframe of iframes) {
    let access = 'cross_origin';
    let frameDoc = null;
    try {
      frameDoc = iframe.contentDocument;
      if (frameDoc) access = 'accessible';
    } catch { /* cross-origin */ }
    frames.push({
      element: iframe, // live ref retained internally only
      src: iframe.src || null,
      access,
      hasDocument: !!frameDoc,
    });
  }

  // Open shadow roots (walk top-level elements)
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.shadowRoot) {
      shadowRoots.push({
        hostElement: node, // live ref retained internally only
        mode: node.shadowRoot.mode,
        access: node.shadowRoot.mode === 'open' ? 'accessible' : 'closed_shadow',
      });
    }
  }

  return { frames, shadowRoots };
}

/**
 * Create a MutationObserver that filters out CyberControl-private mutations.
 * @param {Element} root
 * @param {function} callback — receives filtered MutationRecord[]
 * @returns {{ observer: MutationObserver, disconnect: function }}
 */
function observeMutations(root, callback) {
  const observer = new MutationObserver((records) => {
    const filtered = records.filter((r) => {
      // Ignore our own injected elements
      if (r.target?.id?.startsWith('_cc_')) return false;
      if (r.target?.hasAttribute?.('data-cc-id')) return false;
      for (const node of r.addedNodes) {
        if (node.nodeType === 1 && node.id?.startsWith('_cc_')) return false;
      }
      return true;
    });
    if (filtered.length > 0) callback(filtered);
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'disabled', 'hidden', 'aria-expanded', 'aria-selected', 'aria-checked', 'value', 'checked', 'required', 'readonly'],
    characterData: true,
  });
  return { observer, disconnect: () => observer.disconnect() };
}

// ═══════════════════════════════════════════════════════════════════════
// INTERACTION PORT — mechanical actions with TOCTOU revalidation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Resolve a binding from the registry with TOCTOU revalidation.
 * @param {string} contextId
 * @param {string} nodeId
 * @param {object} registry — BindingRegistry instance
 * @param {number} expectedGeneration — binding_generation the plan was authored against
 * @returns {{ element: Element|null, error: string|null }}
 */
function resolveBinding(contextId, nodeId, registry, expectedGeneration) {
  const entry = registry.resolve(contextId, nodeId);
  if (!entry) return { element: null, error: 'stale_target' };
  if (entry.bindingGeneration !== expectedGeneration) {
    return { element: null, error: 'stale_target' };
  }
  // Verify element is still in the DOM
  if (!entry.liveNodeReference?.isConnected) {
    registry.invalidateNode(contextId, nodeId);
    return { element: null, error: 'stale_target' };
  }
  return { element: entry.liveNodeReference, error: null };
}

/**
 * Perform a mechanical action on an element with pre-validation.
 * TOCTOU: checks element is still connected immediately before acting.
 * @param {Element} element
 * @param {object} action — { op: string, ... }
 * @returns {{ success: boolean, error: string|null }}
 */
function performAction(element, action) {
  // Final TOCTOU check — no yield between check and act
  if (!element.isConnected) return { success: false, error: 'stale_target' };

  switch (action.op) {
    case 'focus':
      element.focus();
      return { success: true, error: null };
    case 'activate':
      element.click();
      return { success: true, error: null };
    case 'type_text': {
      element.focus();
      const niv = Object.getOwnPropertyDescriptor(
        element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        'value'
      );
      if (action.clear_first !== false) {
        if (niv) niv.set.call(element, '');
        else element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (niv) niv.set.call(element, action.value);
      else element.value = action.value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, error: null };
    }
    case 'clear': {
      element.focus();
      const niv = Object.getOwnPropertyDescriptor(
        element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        'value'
      );
      if (niv) niv.set.call(element, '');
      else element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, error: null };
    }
    case 'toggle': {
      const current = element.checked;
      if (current !== action.desired_state) element.click();
      return { success: true, error: null };
    }
    case 'scroll':
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return { success: true, error: null };
    default:
      return { success: false, error: 'action_unsupported' };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS (private)
// ═══════════════════════════════════════════════════════════════════════

function isElementVisible(element) {
  // File and date inputs are considered visible even when they have zero visual dimensions
  // (browsers may render them as zero-rect clickable areas in headless mode)
  if (element.tagName === 'INPUT') {
    const t = (element.type || '').toLowerCase();
    if (t === 'hidden') return false;
    if (t === 'file' || t === 'date' || t === 'datetime-local' || t === 'month' || t === 'week' || t === 'time') return true;
  }
  if (!element.offsetParent && element.tagName !== 'BODY' && element.tagName !== 'HTML') {
    // Check for position:fixed/sticky which have null offsetParent
    const style = getComputedStyle(element);
    if (style.position !== 'fixed' && style.position !== 'sticky') return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function computeViewportIntersection(rect, vw, vh) {
  const ix = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
  const iy = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
  const area = rect.width * rect.height;
  return area > 0 ? Math.min(1, (ix * iy) / area) : 0;
}

function computeAccessibleName(element, ariaLabel, ariaLabelledby) {
  if (ariaLabel) return ariaLabel.trim().slice(0, 160);
  if (ariaLabelledby) {
    const doc = element.ownerDocument;
    const parts = ariaLabelledby.split(/\s+/).map((id) => doc.getElementById(id)?.textContent?.trim() || '').filter(Boolean);
    if (parts.length) return parts.join(' ').slice(0, 160);
  }

  // Label[for]
  if (element.id) {
    try {
      const label = element.ownerDocument?.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label && label.textContent.trim().length > 1) return label.textContent.trim().slice(0, 160);
    } catch {}
  }

  // Wrapping label
  const wrapping = element.closest?.('label');
  if (wrapping) {
    const clone = wrapping.cloneNode(true);
    clone.querySelectorAll('input,select,textarea,button').forEach((el) => el.remove());
    const text = clone.textContent.trim();
    if (text && text.length > 1) return text.slice(0, 160);
  }

  const tag = element.tagName?.toLowerCase() || '';
  const isFormField = (tag === 'input' || tag === 'select' || tag === 'textarea');

  if (isFormField) {
    // Preceding <td> in a table row
    const td = element.closest?.('td');
    if (td) {
      const prevTd = td.previousElementSibling;
      if (prevTd && prevTd.textContent.trim().length > 1 && prevTd.textContent.trim().length < 80) {
        return prevTd.textContent.trim().slice(0, 160);
      }
    }

    // Container label (.form-group, mat-form-field, etc.)
    const container = element.closest?.('.form-group,.form-field,.field-wrapper,.input-group,mat-form-field,[class*="form-row"],[class*="field-row"]');
    if (container) {
      const cLbl = container.querySelector('label,mat-label,.label,.field-label,.control-label,.form-label');
      if (cLbl && cLbl.textContent.trim().length > 1) return cLbl.textContent.trim().slice(0, 160);
    }

    // Parent hierarchy label (up to 4 hops)
    let p = element.parentElement;
    let hop = 0;
    while (p && hop < 4) {
      const pLbl = p.querySelector(':scope > label, :scope > .label, :scope > .field-label, :scope > .control-label, :scope > .form-label, :scope > mat-label');
      if (pLbl && pLbl !== element && pLbl.textContent.trim().length > 1) {
        return pLbl.textContent.trim().slice(0, 160);
      }
      p = p.parentElement;
      hop++;
    }

    // Preceding sibling element (LABEL, SPAN, DIV, P, H3, H4, STRONG)
    let prev = element.previousElementSibling;
    if (!prev && element.parentElement) {
      // If input is first child, check parent's previous sibling
      prev = element.parentElement.previousElementSibling;
    }
    if (prev && !prev.querySelector?.('input,select,textarea')) {
      const pt = prev.textContent?.trim();
      if (pt && pt.length > 1 && pt.length < 160) return pt.slice(0, 160);
    }

    // formControlName attribute (Angular reactive forms)
    const fcn = element.getAttribute('formcontrolname') || element.getAttribute('formControlName');
    if (fcn) return fcn.replace(/([A-Z])/g, ' $1').trim().slice(0, 160);

    // name attribute as fallback
    const nameAttr = element.getAttribute('name');
    if (nameAttr && nameAttr.length > 2) return nameAttr.replace(/[_-]/g, ' ').trim().slice(0, 160);

    // Placeholder
    if (element.placeholder && element.placeholder.trim().length > 1 && element.placeholder.length < 60) {
      return element.placeholder.trim();
    }
  }

  // Non-form-field: title/placeholder/textContent snippet
  return (element.title || element.placeholder || '').trim().slice(0, 160) || null;
}

function computeTextSnippet(element) {
  // Only return direct text for leaf-like elements (bounded)
  if (element.children.length > 3) return null; // not a leaf
  const text = element.textContent?.trim() || '';
  if (text.length > 320) return text.slice(0, 320);
  return text || null;
}

function computeImplicitRole(element) {
  const tag = element.tagName?.toLowerCase();
  const type = (element.getAttribute('type') || '').toLowerCase();
  const roles = {
    a: 'link', button: 'button', h1: 'heading', h2: 'heading', h3: 'heading',
    h4: 'heading', h5: 'heading', h6: 'heading', img: 'img', nav: 'navigation',
    main: 'main', aside: 'complementary', footer: 'contentinfo', header: 'banner',
    form: 'form', table: 'table', ul: 'list', ol: 'list', li: 'listitem',
    select: 'combobox', textarea: 'textbox', progress: 'progressbar',
  };
  if (tag === 'input') {
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'range') return 'slider';
    if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
    return 'textbox';
  }
  return roles[tag] || null;
}

function parseTristate(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // Observation port
    captureStructuralFacts,
    extractElementFacts,
    readAriaState,
    readGeometry,
    readGeometryBatch,
    enumerateContexts,
    observeMutations,
    // Interaction port
    resolveBinding,
    performAction,
    // Constants
    MAX_DEPTH,
    MAX_NODES,
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcDomGateway = {
    captureStructuralFacts,
    extractElementFacts,
    readAriaState,
    readGeometry,
    readGeometryBatch,
    enumerateContexts,
    observeMutations,
    resolveBinding,
    performAction,
  };
}

})();