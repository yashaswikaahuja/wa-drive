/**
 * ng-dropdown plugin — handles Angular custom dropdown widgets.
 *
 * Structural auto-detection (no adapter required):
 * 1. Find trigger: .value-area, .ng-value-container, .select-type, or first clickable child
 * 2. Click trigger to open overlay
 * 3. Find options: li elements in nearest overlay/panel
 * 4. Match and click option
 * 5. Verify selection
 */

var TRIGGER_SELECTORS = ['.value-area', '.select-type', '.ng-value-container', '.ng-select-container', '[tabindex]'];
var OPTION_SELECTORS = ['li', '.ng-option', 'mat-option', '.dropdown-item'];
var OVERLAY_SELECTORS = ['app-dropdown', 'ng-dropdown-panel', '.ng-dropdown-panel', '.dropdown-options', '.options-list', 'ul', 'cdk-overlay-container'];

// Search for option items using multiple selectors (fallback when no adapter)
function findOptionsInContainer(container, optSel, isVisible) {
  if (optSel) {
    return Array.from(container.querySelectorAll(optSel)).filter(isVisible);
  }
  // Try each known option selector until we find visible options
  for (var sel of OPTION_SELECTORS) {
    var items = Array.from(container.querySelectorAll(sel)).filter(isVisible);
    if (items.length > 0) return items;
  }
  return [];
}

var NgDropdownPlugin = {
  id: 'ng-dropdown',
  description: 'Angular custom ng-dropdown: auto-detect trigger/options, click to select',

  supports(el, fieldContext) {
    if (!el) return false;
    if (fieldContext.type === 'ng-dropdown') return true;
    if (el.classList && el.classList.contains('ng-dropdown')) return true;
    if (el.tagName === 'NG-SELECT' || (el.closest && el.closest('ng-select'))) return true;
    return false;
  },

  fill(el, value, context) {
    var adapter = context.portalAdapters || {};

    function isVisible(node) {
      return window.ccDomUtils.isVisible(node);
    }

    // Find trigger element
    let trigger = null;
    if (adapter.triggerSelector) trigger = el.querySelector(adapter.triggerSelector);
    if (!trigger) {
      for (const sel of TRIGGER_SELECTORS) {
        trigger = el.querySelector(sel);
        if (trigger && isVisible(trigger)) break;
      }
    }
    if (!trigger) trigger = el;

    // Click to open
    trigger.click();

    // Poll for options after DOM stabilizes
    var startTime = Date.now();
    var optSel = adapter.optionSelector || null;

    return new Promise((resolve) => {
      let attempts = 0;
      var poll = setInterval(() => {
        attempts++;
        if (Date.now() - startTime > 5000) {
          clearInterval(poll);
          document.body.click(); // close
          resolve({ success: false, settled: true, reason: 'timeout-no-options' });
          return;
        }

        // Find options - check overlays, then inside element
        let opts = [];
        // Try adapter-specified container first
        if (adapter.optionsContainer) {
          var container = document.querySelector(adapter.optionsContainer);
          if (container) opts = findOptionsInContainer(container, optSel, isVisible);
        }
        // Try overlay selectors
        if (opts.length === 0) {
          for (const oSel of OVERLAY_SELECTORS) {
            var containers = document.querySelectorAll(oSel);
            for (const c of containers) {
              var items = findOptionsInContainer(c, optSel, isVisible);
              if (items.length > 0) { opts = items; break; }
            }
            if (opts.length > 0) break;
          }
        }
        // Try inside the element itself
        if (opts.length === 0) {
          opts = findOptionsInContainer(el, optSel, isVisible);
        }

        if (opts.length === 0 && attempts < 15) return; // keep waiting

        // Match option using shared/option-match.js (injected before plugins)
        var match = null;
        var optTexts = opts.map(function(o) { return o.textContent.trim(); });
        var matched = window.ccMatchOption(value, optTexts);
        if (matched) {
          match = opts.find(function(o) { return o.textContent.trim() === matched; });
        }

        if (match) {
          clearInterval(poll);
          ['pointerdown','mousedown','mouseup','click'].forEach(ev =>
            match.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }))
          );
          // Verify after click
          setTimeout(() => {
            var displayed = el.querySelector('.value-area,.ng-value-label,.select-type');
            var ok = displayed && !(/select|choose/i.test(displayed.textContent.trim()));
            resolve({ success: ok !== false, settled: true, waitMs: Date.now() - startTime, matchedText: match.textContent.trim() });
          }, 500);
        } else if (attempts >= 15) {
          clearInterval(poll);
          document.body.click();
          resolve({ success: false, settled: true, reason: 'no-matching-option', optionCount: opts.length });
        }
      }, 300);
    });
  },

  meta: {
    interactionFamily: 'ng-dropdown',
    needsStabilization: true,
    populatesChildren: false,
    dependsOn: [],
    waitFor: 'dom-quiet',
    needsParentValues: false,
  },
};

registerPlugin(NgDropdownPlugin);
