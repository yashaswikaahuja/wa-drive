// ── shared/dom-utils.js ────────────────────────────────────────────────────
// Single source of truth for DOM utility functions used across the extension.
// Exposes: window.ccDomUtils = { getLabel, isVisible, isGoodLabel, humanizeAttr }
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
    if (!text) return false;
    var t = text.replace(/[*:\s]/g, '');
    if (t.length < 2) return false;
    // Reject obvious placeholder-only text (when option text gets captured as label)
    var lower = text.toLowerCase().trim();
    if (/^(please\s+select|select(\s+(an?|one))?|--\s*select|choose|select\.{2,}|enter|type|input|field)$/i.test(lower)) return false;
    if (/^[\d\s\-_.*/]+$/.test(text)) return false;
    // Reject if mostly years/numbers separated by whitespace (option list of years got captured)
    var nonDigits = text.replace(/[\d\s\n\r,]/g, '').trim();
    if (text.length > 30 && nonDigits.length < text.length * 0.3) return false;
    // Reject if too long (>250 chars likely a paragraph or option list dump)
    if (text.length > 250) return false;
    // Reject if has too many newlines (option list captured)
    if ((text.match(/\n/g) || []).length > 3) return false;
    return true;
  }

  function cleanLabelText(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[*：:]+$/g, '')
      .trim();
  }

  /**
   * Turn technical name/id attributes into a readable label.
   * Examples: fatherName → Father Name, father_name → Father Name, txtDOB → DOB
   * Returns '' for opaque framework ids (mat-input-3, uuids, etc.).
   */
  function humanizeAttr(raw) {
    if (!raw || typeof raw !== 'string') return '';
    var s = raw.trim();
    if (!s) return '';
    // Reject opaque framework / generated ids early
    if (/^(mat-|cdk-|ng-|mdc-|react-|ember\d|form-field-|ctl\d)/i.test(s)) return '';
    if (/^[0-9a-f]{8,}(-[0-9a-f]{4,})+$/i.test(s)) return ''; // uuid-ish
    if (/^(id|input|select|field|ctrl|control)\d+$/i.test(s)) return '';
    // Strip common control prefixes used on Indian gov portals
    s = s.replace(/^(txt|ddl|cmb|cbo|chk|opt|btn|fld|inp|lbl|hdn|uc|UserControl_?)/i, '');
    if (!s || s.length < 2 || s.length > 60) return '';
    // snake / kebab / camel → words
    s = s
      .replace(/[_\-.]+/g, ' ')
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
    if (!/[a-zA-Z]{2,}/.test(s)) return '';
    // Avoid returning pure technical remnants
    if (/^(name|value|type|class|style)$/i.test(s)) return '';
    return s.replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); });
  }

  function textFromLabelEl(lbl) {
    if (!lbl) return '';
    // Prefer clone-without-controls so checkbox/radio wrapper labels work
    try {
      if (lbl.querySelector && lbl.querySelector('input,select,textarea,button')) {
        var clone = lbl.cloneNode(true);
        clone.querySelectorAll('input,select,textarea,button').forEach(function (e) { e.remove(); });
        return cleanLabelText(clone.textContent);
      }
    } catch (e) {}
    return cleanLabelText(lbl.textContent);
  }

  /**
   * Resolve the human-readable label for a form element.
   *
   * Priority:
   *   1. <label for="id">
   *   2. aria-label / aria-labelledby (supports multi-id)
   *   3. Wrapping <label>
   *   4. Fieldset <legend>
   *   5. Preceding <th>/<td> in a table row
   *   6. Container label (.form-group, mat-form-field, etc.)
   *   7. Parent hierarchy label (up to 5 hops)
   *   8. Preceding sibling element
   *   9. data-* / title attributes
   *  10. Placeholder
   *  11. Humanized name / id (last resort — never leave blank when possible)
   */
  function getLabel(el) {
    if (!el) return '';

    // 1. Explicit <label for="id">
    if (el.id) {
      try {
        var lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        var t1 = textFromLabelEl(lbl);
        if (isGoodLabel(t1)) return t1;
      } catch (e) {}
    }

    // 2. aria-label / aria-labelledby (space-separated id list supported)
    var ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && isGoodLabel(cleanLabelText(ariaLabel))) return cleanLabelText(ariaLabel);
    var labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      var parts = String(labelledBy).trim().split(/\s+/).filter(Boolean);
      var joined = parts.map(function (id) {
        var lEl = document.getElementById(id);
        return lEl ? cleanLabelText(lEl.textContent) : '';
      }).filter(Boolean).join(' ');
      if (isGoodLabel(joined)) return joined;
    }

    // 3. Wrapping <label>
    var wrappingLabel = el.closest && el.closest('label');
    if (wrappingLabel) {
      var tWrap = textFromLabelEl(wrappingLabel);
      if (isGoodLabel(tWrap)) return tWrap;
    }

    // 4. Fieldset legend (applies to inputs inside fieldsets, not only radios)
    var fieldset = el.closest && el.closest('fieldset');
    if (fieldset) {
      var legend = fieldset.querySelector(':scope > legend, legend');
      var tLeg = cleanLabelText(legend && legend.textContent);
      if (isGoodLabel(tLeg) && tLeg.length < 120) return tLeg;
    }

    // 5. Preceding <th>/<td> in a table row
    var cell = el.closest && el.closest('td,th');
    if (cell) {
      var prevCell = cell.previousElementSibling;
      while (prevCell) {
        if (/^(TD|TH)$/i.test(prevCell.tagName)) {
          var tCell = cleanLabelText(prevCell.textContent);
          if (isGoodLabel(tCell)) return tCell.slice(0, 80);
        }
        prevCell = prevCell.previousElementSibling;
      }
    }

    // 6. Container label (.form-group, mat-form-field, bootstrap, ionic, etc.)
    var container = el.closest && el.closest([
      '.form-group', '.form-field', '.field-wrapper', '.input-group', '.form-floating',
      '.mb-3', '.mb-2', '.row',
      'mat-form-field', 'mat-radio-group',
      '[class*="form-row"]', '[class*="field-row"]', '[class*="FormField"]',
      'ion-item', 'ion-input',
      'dt', 'dd',
    ].join(','));
    if (container) {
      var cLbl = container.querySelector([
        'label', 'mat-label', '.mat-mdc-floating-label', '.mat-form-field-label',
        '.label', '.field-label', '.control-label', '.form-label',
        'legend', '[class*="label"]',
      ].join(','));
      var tCont = textFromLabelEl(cLbl);
      // Avoid grabbing the whole option list from a label-like class inside dropdowns
      if (isGoodLabel(tCont) && tCont.length < 120) return tCont;
    }

    // 7. Parent hierarchy label (up to 5 hops)
    var p = el.parentElement;
    var hop = 0;
    while (p && hop < 5) {
      var pLbl = p.querySelector([
        ':scope > label',
        ':scope > .label',
        ':scope > .field-label',
        ':scope > .control-label',
        ':scope > .form-label',
        ':scope > mat-label',
        ':scope > .mat-mdc-floating-label',
        ':scope > legend',
        ':scope > span.label',
        ':scope > div.label',
      ].join(', '));
      if (pLbl && pLbl !== el) {
        var tHop = textFromLabelEl(pLbl);
        if (isGoodLabel(tHop) && tHop.length < 120) return tHop;
      }
      p = p.parentElement;
      hop++;
    }

    // 8. Preceding sibling element
    var prev = el.previousElementSibling;
    if (prev && ['LABEL', 'SPAN', 'DIV', 'P', 'STRONG', 'B', 'LEGEND'].includes(prev.tagName)) {
      var pt = cleanLabelText(prev.textContent);
      if (isGoodLabel(pt) && pt.length < 80 && !(prev.querySelector && prev.querySelector('input,select,textarea'))) {
        return pt;
      }
    }

    // 9. Explicit data / title attributes used by custom widgets
    var dataCandidates = [
      el.getAttribute('data-label'),
      el.getAttribute('data-field-label'),
      el.getAttribute('data-displayname'),
      el.getAttribute('data-display-name'),
      el.getAttribute('data-name'),
      el.getAttribute('title'),
    ];
    for (var di = 0; di < dataCandidates.length; di++) {
      var dt = cleanLabelText(dataCandidates[di]);
      if (isGoodLabel(dt) && dt.length < 80) return dt;
    }

    // 10. Placeholder as soft fallback
    if (el.placeholder && isGoodLabel(el.placeholder) && el.placeholder.length < 60) {
      return cleanLabelText(el.placeholder);
    }

    // 11. Humanize name / id — last resort so sessions never show blank / raw node ids
    var fromName = humanizeAttr(el.getAttribute('name') || el.name || '');
    if (isGoodLabel(fromName)) return fromName;
    var fromId = humanizeAttr(el.id || '');
    if (isGoodLabel(fromId)) return fromId;
    var fromFcn = humanizeAttr(el.getAttribute('formcontrolname') || '');
    if (isGoodLabel(fromFcn)) return fromFcn;

    return '';
  }

  // Expose globally
  window.ccDomUtils = {
    getLabel: getLabel,
    isVisible: isVisible,
    isGoodLabel: isGoodLabel,
    humanizeAttr: humanizeAttr,
  };
})();
