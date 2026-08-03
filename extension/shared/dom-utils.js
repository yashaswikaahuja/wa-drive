// ── shared/dom-utils.js ────────────────────────────────────────────────────
// Single source of truth for DOM utility functions used across the extension.
// Exposes: window.ccDomUtils = { getLabel, isVisible, isGoodLabel }
// ────────────────────────────────────────────────────────────────────────────

;(function () {
  'use strict';

  /**
   * Check if an element is visible in the viewport.
   * Combines all checks from across the codebase:
   * - getBoundingClientRect dimensions
   * - getComputedStyle display/visibility/opacity
   * - offsetParent (detects display:none ancestors)
   */
  function isVisible(el) {
    if (!el) return false;
    // offsetParent is null for hidden elements (display:none, or <html>/<body>)
    // but also for position:fixed — so we can't rely on it alone
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    var style = getComputedStyle(el);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;
    return true;
  }

  /**
   * Determine if a label text is "good" (meaningful, not just whitespace or generic).
   */
  function isGoodLabel(text) {
    if (!text || text.length < 2) return false;
    var t = text.toLowerCase().trim();
    // Reject generic/placeholder labels
    if (/^(select|choose|enter|type|input|field|\*|\.|-|_)$/i.test(t)) return false;
    // Reject if just numbers/symbols
    if (/^[\d\s\-_.*/]+$/.test(t)) return false;
    return true;
  }

  /**
   * Resolve the human-readable label for a form element.
   * This is the most complete implementation, merging extractor.js getLabel
   * and drivers/dom.js getLabelFor.
   *
   * Priority:
   *   1. <label for="id">
   *   2. aria-label / aria-labelledby
   *   3. Wrapping <label>
   *   4. Preceding <td> in a table row
   *   5. Container label (.form-group, mat-form-field, etc.)
   *   6. Parent hierarchy label (up to 4 hops)
   *   7. Preceding sibling element
   *   8. Placeholder (last resort)
   */
  function getLabel(el) {
    if (!el) return '';

    // 1. Explicit <label for="id">
    if (el.id) {
      try {
        var lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (lbl && isGoodLabel(lbl.textContent.trim())) return lbl.textContent.trim();
      } catch (e) {}
    }

    // 2. aria-label / aria-labelledby
    var ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && isGoodLabel(ariaLabel)) return ariaLabel.trim();
    var labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      var lEl = document.getElementById(labelledBy);
      if (lEl && isGoodLabel(lEl.textContent.trim())) return lEl.textContent.trim();
    }

    // 3. Wrapping <label>
    var wrappingLabel = el.closest('label');
    if (wrappingLabel) {
      var clone = wrappingLabel.cloneNode(true);
      clone.querySelectorAll('input,select,textarea,button').forEach(function (e) { e.remove(); });
      var t = clone.textContent.trim();
      if (isGoodLabel(t)) return t;
    }

    // 4. Preceding <td> in a table row
    var td = el.closest('td');
    if (td) {
      var prevTd = td.previousElementSibling;
      if (prevTd && isGoodLabel(prevTd.textContent.trim())) {
        return prevTd.textContent.trim().slice(0, 80);
      }
    }

    // 5. Container label (.form-group, mat-form-field, etc.)
    var container = el.closest('.form-group,.form-field,.field-wrapper,.input-group,mat-form-field,[class*="form-row"],[class*="field-row"]');
    if (container) {
      var cLbl = container.querySelector('label,mat-label,.label,.field-label,.control-label,.form-label');
      if (cLbl && isGoodLabel(cLbl.textContent.trim())) return cLbl.textContent.trim();
    }

    // 6. Parent hierarchy label (up to 4 hops — from drivers/dom.js)
    var p = el.parentElement;
    var hop = 0;
    while (p && hop < 4) {
      var pLbl = p.querySelector(':scope > label, :scope > .label, :scope > .field-label, :scope > .control-label, :scope > .form-label, :scope > mat-label');
      if (pLbl && pLbl !== el && isGoodLabel(pLbl.textContent.trim())) {
        return pLbl.textContent.trim();
      }
      p = p.parentElement;
      hop++;
    }

    // 7. Preceding sibling element
    var prev = el.previousElementSibling;
    if (prev && ['LABEL', 'SPAN', 'DIV', 'P'].includes(prev.tagName)) {
      var pt = prev.textContent.trim();
      if (isGoodLabel(pt) && pt.length < 80 && !prev.querySelector('input,select,textarea')) {
        return pt;
      }
    }

    // 8. Placeholder as last resort
    if (el.placeholder && isGoodLabel(el.placeholder) && el.placeholder.length < 60) {
      return el.placeholder;
    }

    return '';
  }

  // Expose globally
  window.ccDomUtils = {
    getLabel: getLabel,
    isVisible: isVisible,
    isGoodLabel: isGoodLabel,
  };
})();
