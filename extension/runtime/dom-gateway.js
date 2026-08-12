/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
(function () {
'use strict';
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
  /** Parallel array of live Elements — browser-private, never in public IR. */
  const liveElements = [];
  let truncated = false;

  function walk(element, depth, parentIndex) {
    if (nodes.length >= maxNodes) { truncated = true; return; }
    if (depth > maxDepth) { truncated = true; return; }
    if (!element || element.nodeType !== 1) return;

    // Skip only CyberControl-owned UI roots (not portal data-cc-id markers)
    if (element.id && element.id.startsWith('_cc_')) return;

    const fact = extractElementFacts(element, false);
    fact._parentIndex = parentIndex;
    fact._depth = depth;
    const thisIndex = nodes.length;
    nodes.push(fact);
    liveElements.push(element);

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

  // Batch geometry after structural walk (phase_3_6): one layout pass for rects
  if (includeGeometry && liveElements.length > 0) {
    const geos = readGeometryBatch(liveElements);
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].geometry = geos[i] || null;
    }
  }

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

  const labelledBy = element.getAttribute('aria-labelledby') || null;
  const describedBy = element.getAttribute('aria-describedby') || null;
  const ariaControls = element.getAttribute('aria-controls') || null;
  const ariaOwns = element.getAttribute('aria-owns') || null;
  const errorMessage = element.getAttribute('aria-errormessage') || null;
  const hasPopup = element.getAttribute('aria-haspopup') || null;
  const htmlFor = tag === 'label' ? (element.getAttribute('for') || null) : null;

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
    className: normalizeClassName(element.className),
    // Extra attributes used by classifier
    maxlength: element.getAttribute('maxlength') || null,
    matdatepicker: element.hasAttribute('matDatepicker') ? '' : null,
    // Private observation aids for edge-factory (never copied into public IR nodes)
    labelledByIds: splitDomIds(labelledBy),
    describedByIds: splitDomIds(describedBy),
    controlsIds: splitDomIds(ariaControls),
    ownsIds: splitDomIds(ariaOwns),
    errorMessageIds: splitDomIds(errorMessage),
    hasPopup: hasPopup || null,
    htmlFor,
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

  // Geometry is filled by captureStructuralFacts via readGeometryBatch after walk
  // (phase_3_6). Standalone extract does not attach geometry here.
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
 * Resolve visual-context helpers (phase_3_6) when loaded; else local fallbacks.
 */
function visualContextApi() {
  if (typeof globalThis !== 'undefined' && globalThis.CcVisualContext) {
    return globalThis.CcVisualContext;
  }
  if (typeof require === 'function') {
    try { return require('../perception/visual-context.js'); } catch { /* browser */ }
  }
  return null;
}

/**
 * Read bounding geometry for an element.
 * Coordinate space: document CSS pixels + viewport_intersection (page-ir / visual-context).
 * Fail-closed: returns null rather than fabricating layout.
 */
function readGeometry(element) {
  try {
    if (!element || typeof element.getBoundingClientRect !== 'function') return null;
    const rect = element.getBoundingClientRect();
    const vc = visualContextApi();
    const viewport = vc?.readPageViewport
      ? vc.readPageViewport(typeof window !== 'undefined' ? window : null)
      : {
        width: (typeof window !== 'undefined' ? window.innerWidth : 0)
          || document.documentElement?.clientWidth || 0,
        height: (typeof window !== 'undefined' ? window.innerHeight : 0)
          || document.documentElement?.clientHeight || 0,
        device_pixel_ratio: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
        scroll_x: typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0,
        scroll_y: typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0,
      };

    let zHint = null;
    try {
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
      if (style) {
        const pos = String(style.position || '').toLowerCase();
        if (pos && pos !== 'static') {
          zHint = vc?.parseZIndexHint
            ? vc.parseZIndexHint(style)
            : (style.zIndex && style.zIndex !== 'auto' ? parseInt(style.zIndex, 10) : null);
          if (zHint != null && !Number.isFinite(zHint)) zHint = null;
        }
      }
    } catch { /* z-index optional */ }

    if (vc?.geometryFromClientRect) {
      return vc.geometryFromClientRect(rect, viewport, zHint);
    }

    // Fallback without visual-context module
    const vw = viewport.width;
    const vh = viewport.height;
    const intersection = computeViewportIntersection(rect, vw, vh);
    return {
      x: Math.round(rect.left + (viewport.scroll_x || 0)),
      y: Math.round(rect.top + (viewport.scroll_y || 0)),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewport_intersection: intersection,
      z_index_hint: zHint,
    };
  } catch {
    return null;
  }
}

/**
 * Batched geometry read for multiple elements (single layout pass for rects).
 * @param {Element[]} elements
 * @returns {object[]} Array of geometry objects (same order as input).
 */
function readGeometryBatch(elements) {
  const list = Array.isArray(elements) ? elements : [];
  // Phase 1: force layout once, collect client rects
  const rects = list.map((el) => {
    try {
      return el && typeof el.getBoundingClientRect === 'function'
        ? el.getBoundingClientRect()
        : null;
    } catch {
      return null;
    }
  });
  const vc = visualContextApi();
  const viewport = vc?.readPageViewport
    ? vc.readPageViewport(typeof window !== 'undefined' ? window : null)
    : {
      width: typeof window !== 'undefined' ? (window.innerWidth || 0) : 0,
      height: typeof window !== 'undefined' ? (window.innerHeight || 0) : 0,
      device_pixel_ratio: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
      scroll_x: typeof window !== 'undefined' ? (window.scrollX || 0) : 0,
      scroll_y: typeof window !== 'undefined' ? (window.scrollY || 0) : 0,
    };
  // Phase 2: styles only for non-static (optional z-index)
  return list.map((el, i) => {
    const rect = rects[i];
    if (!rect) return null;
    let zHint = null;
    try {
      const style = el && typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
      if (style && String(style.position || '').toLowerCase() !== 'static') {
        zHint = vc?.parseZIndexHint ? vc.parseZIndexHint(style) : null;
      }
    } catch { /* ignore */ }
    if (vc?.geometryFromClientRect) {
      return vc.geometryFromClientRect(rect, viewport, zHint);
    }
    return {
      x: Math.round(rect.left + (viewport.scroll_x || 0)),
      y: Math.round(rect.top + (viewport.scroll_y || 0)),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewport_intersection: computeViewportIntersection(rect, viewport.width, viewport.height),
      z_index_hint: zHint,
    };
  });
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

/** Browser-private file tokens for upload (never service filesystem paths). */
const _fileReferences = new Map();

/**
 * Register a File/Blob under an opaque file_reference token for ActionPlan upload.
 * @param {string} token
 * @param {File|Blob} file
 */
function registerFileReference(token, file) {
  if (!token || typeof token !== 'string') throw new Error('file_reference token required');
  if (!file) throw new Error('file required');
  _fileReferences.set(token, file);
}

/**
 * Perform a mechanical action on an element with pre-validation.
 * TOCTOU: checks element is still connected immediately before acting.
 * @param {Element} element
 * @param {object} action — { op: string, ... }
 * @param {object} [options]
 * @param {Element|null} [options.optionElement] — for select_option
 * @returns {{ success: boolean, error: string|null }}
 */
function performAction(element, action, options = {}) {
  // Final TOCTOU check — no yield between check and act
  if (!element?.isConnected) return { success: false, error: 'stale_target' };
  // Fact-index placeholders must never reach interaction (APE-P1-03)
  if (element._factIndex != null && typeof element.nodeType !== 'number') {
    return { success: false, error: 'stale_target' };
  }
  if (typeof element.nodeType === 'number' && element.nodeType !== 1) {
    return { success: false, error: 'stale_target' };
  }

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
    case 'select_option': {
      // Mechanical only: option is a concrete bound Element, not fuzzy text
      const optionElement = options.optionElement;
      if (!optionElement?.isConnected) return { success: false, error: 'stale_target' };
      if (element.tagName === 'SELECT' && optionElement.tagName === 'OPTION') {
        const owner = optionElement.closest('select');
        if (owner !== element) return { success: false, error: 'stale_target' };
        if (element.multiple) {
          optionElement.selected = true;
        } else {
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
          if (setter) setter.call(element, optionElement.value);
          else element.value = optionElement.value;
          optionElement.selected = true;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // Custom overlay option: click the option node itself (no selector search)
        optionElement.click();
      }
      return { success: true, error: null };
    }
    case 'expand_collapse': {
      const want = !!action.expanded;
      const cur = element.getAttribute('aria-expanded');
      const isOpen = cur === 'true';
      if (isOpen !== want) element.click();
      return { success: true, error: null };
    }
    case 'upload': {
      if (element.tagName !== 'INPUT' || String(element.type).toLowerCase() !== 'file') {
        return { success: false, error: 'action_unsupported' };
      }
      const token = action.file_reference;
      if (!token || typeof token !== 'string') {
        return { success: false, error: 'file_reference_invalid' };
      }
      const file = _fileReferences.get(token);
      if (!file) return { success: false, error: 'file_reference_invalid' };
      try {
        const dt = new DataTransfer();
        dt.items.add(file instanceof File ? file : new File([file], 'upload.bin'));
        element.files = dt.files;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, error: null };
      } catch {
        return { success: false, error: 'gateway_error' };
      }
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

/** Normalize SVGAnimatedString / DOMTokenList / string className to a plain string. */
function normalizeClassName(className) {
  if (!className) return '';
  if (typeof className === 'string') return className;
  if (typeof className.baseVal === 'string') return className.baseVal;
  try { return String(className); } catch { return ''; }
}

/** Split space-separated DOM id references into a bounded unique list. */
function splitDomIds(value) {
  if (!value || typeof value !== 'string') return [];
  const out = [];
  const seen = Object.create(null);
  for (const part of value.split(/\s+/)) {
    const id = part.trim();
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push(id);
    if (out.length >= 16) break;
  }
  return out;
}

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
    const label = element.ownerDocument?.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label) return label.textContent.trim().slice(0, 160);
  }
  // Wrapping label
  const wrapping = element.closest?.('label');
  if (wrapping) {
    const clone = wrapping.cloneNode(true);
    clone.querySelectorAll('input,select,textarea').forEach((el) => el.remove());
    const text = clone.textContent.trim();
    if (text) return text.slice(0, 160);
  }
  // Title / placeholder fallback
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
    registerFileReference,
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
    registerFileReference,
  };
}
})();
