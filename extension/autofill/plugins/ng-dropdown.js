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

const TRIGGER_SELECTORS = ['.value-area', '.select-type', '.ng-value-container', '.ng-select-container', '[tabindex]'];
const OPTION_SELECTORS = ['li', '.ng-option', 'mat-option', '.dropdown-item'];
const OVERLAY_SELECTORS = ['app-dropdown', 'ng-dropdown-panel', '.ng-dropdown-panel', '.dropdown-options', '.options-list', 'ul', 'cdk-overlay-container'];

const NgDropdownPlugin = {
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
    const adapter = context.portalAdapters || {};

    function isVisible(node) {
      if (!node) return false;
      const r = node.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const s = getComputedStyle(node);
      return s.display !== 'none' && s.visibility !== 'hidden';
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
    const startTime = Date.now();
    const optSel = adapter.optionSelector || null;

    return new Promise((resolve) => {
      let attempts = 0;
      const poll = setInterval(() => {
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
          const container = document.querySelector(adapter.optionsContainer);
          if (container) opts = Array.from(container.querySelectorAll(optSel || 'li')).filter(isVisible);
        }
        // Try overlay selectors
        if (opts.length === 0) {
          for (const oSel of OVERLAY_SELECTORS) {
            const containers = document.querySelectorAll(oSel);
            for (const c of containers) {
              const items = Array.from(c.querySelectorAll(optSel || 'li')).filter(isVisible);
              if (items.length > 0) { opts = items; break; }
            }
            if (opts.length > 0) break;
          }
        }
        // Try inside the element itself
        if (opts.length === 0) {
          opts = Array.from(el.querySelectorAll(optSel || 'li')).filter(isVisible);
        }

        if (opts.length === 0 && attempts < 15) return; // keep waiting

        // Match option
        const v = value.toLowerCase().trim();
        const match = opts.find(o => o.textContent.trim().toLowerCase() === v) ||
                      opts.find(o => o.textContent.trim().toLowerCase().includes(v)) ||
                      opts.find(o => v.includes(o.textContent.trim().toLowerCase()) && o.textContent.trim().length > 2);

        if (match) {
          clearInterval(poll);
          ['pointerdown','mousedown','mouseup','click'].forEach(ev =>
            match.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }))
          );
          // Verify after click
          setTimeout(() => {
            const displayed = el.querySelector('.value-area,.ng-value-label,.select-type');
            const ok = displayed && !(/select|choose/i.test(displayed.textContent.trim()));
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
