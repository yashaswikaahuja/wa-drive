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

      // Try to find the plugin
      if (typeof findPlugin === 'function') {
        var plugin = findPlugin(el, { type: 'ng-dropdown', label: '' });
        if (plugin) {
          try {
            var result = await plugin.fill(el, value, { portalAdapters: {}, attempt: 1 });
            if (result && result.success) {
              return { status: 'success', actual_value: result.matchedText || value };
            }
            return { status: 'failed', error: result.reason || 'plugin_fill_failed' };
          } catch (e) {
            return { status: 'failed', error: 'plugin_error: ' + e.message };
          }
        }
      }

      // Fallback: try click-based interaction
      // Click the element to open dropdown
      el.click();
      await new Promise(function (r) { setTimeout(r, 300); });

      // Look for visible options
      var opts = el.querySelectorAll('li, .ng-option, .dropdown-item');
      if (!opts.length) {
        // Try overlay
        var panel = document.querySelector('.ng-dropdown-panel, ng-dropdown-panel, .cdk-overlay-container');
        if (panel) opts = panel.querySelectorAll('li, .ng-option, .dropdown-item');
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
        var optTexts = Array.from(opts).map(function (o) { return o.textContent.trim(); });
        var matchedText = window.ccMatchOption(value, optTexts);
        if (matchedText) {
          matched = Array.from(opts).find(function (o) { return o.textContent.trim() === matchedText; });
        }
      }

      if (!matched) {
        document.body.click();
        return { status: 'failed', error: 'no_matching_option', actual_value: null };
      }

      matched.click();
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
