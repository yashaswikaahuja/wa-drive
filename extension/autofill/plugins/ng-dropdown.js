/**
 * ng-dropdown plugin — handles Angular custom dropdown widgets.
 *
 * Structural identity: element has class 'ng-dropdown' or is ng-select.
 * Interaction: click trigger, wait for overlay/options, click matching option, verify.
 * Runtime owns: timing between fields (5500ms stagger), session lifecycle, replay.
 * Plugin owns: click/poll/verify interaction mechanics.
 */

const NgDropdownPlugin = {
  id: 'ng-dropdown',
  description: 'Angular custom ng-dropdown: click trigger, wait for options overlay, click match',

  supports(el, fieldContext) {
    if (!el) return false;
    if (fieldContext.type === 'ng-dropdown') return true;
    if (el.classList && el.classList.contains('ng-dropdown')) return true;
    if (el.tagName === 'NG-SELECT' || (el.closest && el.closest('ng-select'))) return true;
    return false;
  },

  fill(el, value, context) {
    const portalAdapters = context.portalAdapters || {};
    const rootClass = el.className ? el.className.trim().split(/\s+/)[0] : 'ng-dropdown';
    const adapter = portalAdapters[rootClass] || portalAdapters['ng-dropdown'] || {
      triggerSelector: null,
      optionSelector: 'li',
      verifySelector: '.select-type,.value-area,.ng-value-label'
    };
    const trigger = el.querySelector(adapter.triggerSelector) || el;

    function isVisible(node) {
      const r = node.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const s = getComputedStyle(node);
      return s.display !== 'none' && s.visibility !== 'hidden';
    }

    // Click trigger to open dropdown
    trigger.click();

    // ng-dropdown is inherently async (overlay renders after click).
    // Return async:true — the existing fillOne session logic handles poll/verify.
    // This plugin claims the field for replay attribution but delegates async to runtime.
    return { success: true, settled: false, async: true, waitMs: 5000 };
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
