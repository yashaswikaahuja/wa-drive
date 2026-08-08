// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Plugin → Capability Bridge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Phase 1.7: Registers plugin-based capability handlers so the runner
// can execute ng-dropdown and mat-select through the capability registry
// instead of falling through to executor.js.
//
// Loaded AFTER plugins are registered (ng-dropdown.js, etc.)
// Exposes no new globals — just registers capabilities.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

;(function () {
  'use strict';

  // ── ng-dropdown select_option handler ─────────────────────────────
  // Higher priority than native-select handler (priority 0)
  window.ccCapabilities.register({
    name: 'select_option',
    description: 'Select option in ng-dropdown (delegates to NgDropdownPlugin)',
    widgetTypes: ['ng-select', 'ng-dropdown', 'combobox'],
    priority: 10,
    handler: async function (action, ctx) {
      var el = ctx.element;
      if (!el) return { status: 'failed', error: 'element_not_found' };
      var value = action.value || '';

      // Try to find the plugin — check multiple field context types
      if (typeof findPlugin === 'function') {
        var plugin = findPlugin(el, { type: 'ng-dropdown', label: '' }) ||
                     findPlugin(el, { type: 'ng-select', label: '' });
        if (plugin) {
          try {
            var result = await plugin.fill(el, value, { portalAdapters: {}, attempt: 1 });
            if (result && result.success) {
              return { status: 'success', actual_value: result.matchedText || value };
            }
            // If plugin found options but couldn't match, that's a real failure
            if (result && result.optionCount > 0) {
              return { status: 'failed', error: result.reason || 'plugin_fill_failed' };
            }
            // Plugin found 0 options — fall through to bridge's own logic
          } catch (e) {
            // Plugin threw — fall through to bridge's own logic
          }
        }
      }

      // Fallback: click-based interaction with wait for DOM update
      // Find trigger element (ng-select has .ng-select-container as click target)
      var trigger = el.querySelector('.ng-select-container, .ng-value-container, .value-area, .select-type') || el;
      trigger.click();
      // Also toggle the opened class (some implementations need it)
      if (el.classList && !el.classList.contains('ng-select-opened')) {
        el.classList.add('ng-select-opened');
      }

      // Wait for dropdown panel to appear
      var deadline = Date.now() + 3000;
      var opts = [];
      while (Date.now() < deadline) {
        await new Promise(function (r) { setTimeout(r, 150); });

        // Check inside element first (most common for ng-select)
        var panel = el.querySelector('.ng-dropdown-panel, .dropdown-options');
        if (panel) {
          var items = panel.querySelectorAll('.ng-option, li, .dropdown-item');
          if (items.length > 0) { opts = Array.from(items); break; }
        }
        // Check document-level overlays
        var overlays = document.querySelectorAll('.ng-dropdown-panel, ng-dropdown-panel, .cdk-overlay-container');
        for (var p = 0; p < overlays.length; p++) {
          var oItems = overlays[p].querySelectorAll('.ng-option, li, .dropdown-item');
          if (oItems.length > 0) { opts = Array.from(oItems); break; }
        }
        if (opts.length > 0) break;
      }

      if (!opts.length) {
        document.body.click(); // close
        return { status: 'failed', error: 'no_options_found' };
      }

      // Match option
      var matched = null;
      var valueLower = value.toLowerCase().trim();
      for (var i = 0; i < opts.length; i++) {
        var text = opts[i].textContent.trim().toLowerCase();
        if (text === valueLower || text.includes(valueLower) || valueLower.includes(text)) {
          matched = opts[i];
          break;
        }
      }

      if (!matched && window.ccMatchOption) {
        var optTexts = opts.map(function (o) { return o.textContent.trim(); });
        var matchedText = window.ccMatchOption(value, optTexts);
        if (matchedText) {
          matched = opts.find(function (o) { return o.textContent.trim() === matchedText; });
        }
      }

      if (!matched) {
        document.body.click();
        return { status: 'failed', error: 'no_matching_option', actual_value: null };
      }

      // Click with full event sequence
      matched.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      matched.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      matched.click();
      await new Promise(function (r) { setTimeout(r, 300); });
      return { status: 'success', actual_value: matched.textContent.trim() };
    },
    validates: function (action) {
      if (!action.value) return { valid: false, error: 'value required' };
      return { valid: true };
    },
  });

  // ── mat-select select_option handler ──────────────────────────────
  window.ccCapabilities.register({
    name: 'select_option',
    description: 'Select option in mat-select (Angular Material)',
    widgetTypes: ['mat-select'],
    priority: 10,
    handler: async function (action, ctx) {
      var el = ctx.element;
      if (!el) return { status: 'failed', error: 'element_not_found' };
      var value = action.value || '';

      // Click to open mat-select panel
      el.click();
      await new Promise(function (r) { setTimeout(r, 300); });

      // Find options in the CDK overlay
      var opts = document.querySelectorAll('mat-option, .mat-option, .mat-mdc-option');
      if (!opts.length) {
        var panel = document.querySelector('.mat-select-panel, .mat-mdc-select-panel, .cdk-overlay-pane');
        if (panel) opts = panel.querySelectorAll('mat-option, .mat-option');
      }

      if (!opts.length) {
        document.body.click();
        return { status: 'failed', error: 'no_mat_options_found' };
      }

      // Match
      var matched = null;
      var valueLower = value.toLowerCase().trim();
      for (var i = 0; i < opts.length; i++) {
        var text = (opts[i].textContent || '').trim().toLowerCase();
        if (text === valueLower || text.includes(valueLower)) {
          matched = opts[i];
          break;
        }
      }

      if (!matched && window.ccMatchOption) {
        var optTexts = Array.from(opts).map(function (o) { return o.textContent.trim(); });
        var matchedText = window.ccMatchOption(value, optTexts);
        if (matchedText) {
          matched = Array.from(opts).find(function (o) { return o.textContent.trim() === matchedText; });
        }
      }

      if (!matched) {
        document.body.click();
        return { status: 'failed', error: 'no_matching_mat_option' };
      }

      matched.click();
      await new Promise(function (r) { setTimeout(r, 200); });
      return { status: 'success', actual_value: matched.textContent.trim() };
    },
    validates: function (action) {
      if (!action.value) return { valid: false, error: 'value required' };
      return { valid: true };
    },
  });
})();
