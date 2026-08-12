/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
/**
 * Phase 3.6 Visual Context — mechanical geometry helpers (#160).
 * Normative: architecture/visual-context.yml v0.1.0
 * Document CSS pixels + page.viewport; no screenshots/pixels/selectors.
 */
(function () {
'use strict';

/** Material geometry change threshold (VC-ARCH-P2-01) — matches delta-emitter tolerance */
const MATERIAL_GEOMETRY_EPS_PX = 1;
const MATERIAL_INTERSECTION_EPS = 0.01;
/** Max gap (document px) for progressive visual proximity grouping */
const VISUAL_PROXIMITY_GAP_PX = 48;
const MAX_VISUAL_GROUP_EDGES = 400;

/**
 * Page viewport metadata (frozen PageMetadata.viewport shape).
 * @param {Window|null} [win]
 */
function readPageViewport(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!w) {
    return { width: 0, height: 0, device_pixel_ratio: 1, scroll_x: 0, scroll_y: 0 };
  }
  const doc = w.document || (typeof document !== 'undefined' ? document : null);
  return {
    width: w.innerWidth || doc?.documentElement?.clientWidth || 0,
    height: w.innerHeight || doc?.documentElement?.clientHeight || 0,
    device_pixel_ratio: w.devicePixelRatio || 1,
    scroll_x: w.scrollX || w.pageXOffset || 0,
    scroll_y: w.scrollY || w.pageYOffset || 0,
  };
}

/**
 * Viewport intersection ratio for a client-space DOMRect-like.
 * @param {{left:number,right:number,top:number,bottom:number,width:number,height:number}} rect
 * @param {number} vw
 * @param {number} vh
 * @returns {number} [0,1]
 */
function computeViewportIntersection(rect, vw, vh) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return 0;
  const ix = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
  const iy = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
  const area = rect.width * rect.height;
  if (!(area > 0)) return 0;
  const ratio = (ix * iy) / area;
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(1, ratio));
}

/**
 * Parse z-index hint from computed style. null when static / auto / unparseable.
 * @param {CSSStyleDeclaration|null|undefined} style
 * @returns {number|null}
 */
function parseZIndexHint(style) {
  if (!style) return null;
  const pos = String(style.position || '').toLowerCase();
  if (pos === 'static' || pos === '') return null;
  const raw = style.zIndex;
  if (raw == null || raw === '' || raw === 'auto') return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build public Node.geometry from client rect + scroll (document CSS pixels).
 * Fail-closed: invalid → null (omit geometry rather than fabricate).
 *
 * @param {DOMRect|object|null} clientRect — getBoundingClientRect result (viewport space)
 * @param {{scroll_x?:number,scroll_y?:number,width?:number,height?:number}} viewport
 * @param {number|null} [zIndexHint]
 * @returns {object|null}
 */
function geometryFromClientRect(clientRect, viewport, zIndexHint = null) {
  if (!clientRect) return null;
  const width = Number(clientRect.width);
  const height = Number(clientRect.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 0 || height < 0) return null;

  const sx = Number(viewport?.scroll_x) || 0;
  const sy = Number(viewport?.scroll_y) || 0;
  const vw = Number(viewport?.width) || 0;
  const vh = Number(viewport?.height) || 0;

  const left = Number(clientRect.left ?? clientRect.x);
  const top = Number(clientRect.top ?? clientRect.y);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;

  const right = left + width;
  const bottom = top + height;
  const intersection = computeViewportIntersection(
    { left, right, top, bottom, width, height },
    vw,
    vh
  );

  return {
    // Document CSS pixels (page-ir coordinate_space)
    x: Math.round(left + sx),
    y: Math.round(top + sy),
    width: Math.round(width),
    height: Math.round(height),
    viewport_intersection: Math.round(intersection * 1000) / 1000,
    z_index_hint: zIndexHint == null ? null : zIndexHint,
  };
}

/**
 * Whether two geometries differ beyond material epsilon (revision-relevant).
 */
function geometriesMateriallyEqual(a, b, epsPx = MATERIAL_GEOMETRY_EPS_PX, epsI = MATERIAL_INTERSECTION_EPS) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    Math.abs((a.x || 0) - (b.x || 0)) <= epsPx
    && Math.abs((a.y || 0) - (b.y || 0)) <= epsPx
    && Math.abs((a.width || 0) - (b.width || 0)) <= epsPx
    && Math.abs((a.height || 0) - (b.height || 0)) <= epsPx
    && Math.abs((a.viewport_intersection || 0) - (b.viewport_intersection || 0)) <= epsI
  );
}

/**
 * Axis-aligned gap between two document-space boxes (0 if overlap).
 */
function geometryGap(a, b) {
  if (!a || !b) return Infinity;
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const dx = Math.max(0, Math.max(a.x - bx2, b.x - ax2));
  const dy = Math.max(0, Math.max(a.y - by2, b.y - ay2));
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Mechanical visual proximity (not business section membership).
 */
function areVisuallyProximate(a, b, maxGap = VISUAL_PROXIMITY_GAP_PX) {
  return geometryGap(a, b) <= maxGap;
}

/**
 * Evidence signal codes for a geometry object (public IR evidence.signals).
 */
function geometryEvidenceSignals(geometry) {
  if (!geometry) return [];
  const signals = ['geometry.bbox'];
  if (geometry.viewport_intersection != null) signals.push('geometry.viewport_intersection');
  if (geometry.z_index_hint != null) signals.push('geometry.z_index');
  if (geometry.viewport_intersection === 0) signals.push('geometry.offscreen');
  return signals;
}

/**
 * Sanitize geometry for secret nodes: keep numbers; never encode text.
 * (Side-channel width ban is observational — width is layout, not redacted.)
 */
function sanitizeGeometryForPrivacy(geometry, classification) {
  if (!geometry) return null;
  // Geometry remains allowed for secret/sensitive (ADR-0011); no text fields exist here.
  if (classification === 'secret' || classification === 'sensitive') {
    return {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      viewport_intersection: geometry.viewport_intersection,
      z_index_hint: geometry.z_index_hint ?? null,
    };
  }
  return geometry;
}

/**
 * Detect likely virtualized list containers for diagnostic only (no invented rows).
 * @param {Document|null} doc
 * @returns {boolean}
 */
function hasVirtualizationHints(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return false;
  // Private diagnostic probes only — results are never selectors in public IR.
  // Prefer ARIA/data attributes over framework class names when possible.
  try {
    if (doc.querySelector('[data-virtualized], [data-virtuoso-scroller], [aria-rowcount]')) {
      return true;
    }
    // Framework classes: diagnostic only; do not publish class names
    if (doc.querySelector('.ReactVirtualized, .ag-body-viewport')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Canonical undirected edge endpoints for visual edges (source_id < target_id).
 * Prevents duplicate reversed visually_groups_with edges (VC-IMPL-P1-01).
 * @returns {[string, string]|null}
 */
function orderedEdgeEndpoints(idA, idB) {
  if (!idA || !idB || idA === idB) return null;
  return idA < idB ? [idA, idB] : [idB, idA];
}

const FORBIDDEN_PUBLIC_VISUAL_KEYS = Object.freeze([
  'screenshot', 'screenshot_ref', 'pixel_buffer', 'canvas_image_data', 'video_frame',
  'css_selector', 'xpath', 'dom_handle', 'element_reference', 'binding_id',
  'outer_html', 'inner_html', 'business_region_label', 'workflow_intent',
]);

const api = {
  MATERIAL_GEOMETRY_EPS_PX,
  MATERIAL_INTERSECTION_EPS,
  VISUAL_PROXIMITY_GAP_PX,
  MAX_VISUAL_GROUP_EDGES,
  FORBIDDEN_PUBLIC_VISUAL_KEYS,
  readPageViewport,
  computeViewportIntersection,
  parseZIndexHint,
  geometryFromClientRect,
  geometriesMateriallyEqual,
  geometryGap,
  areVisuallyProximate,
  geometryEvidenceSignals,
  sanitizeGeometryForPrivacy,
  hasVirtualizationHints,
  orderedEdgeEndpoints,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.CcVisualContext = api;
})();
