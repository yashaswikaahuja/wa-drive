// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Capability Registry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Phase 1.2: Formal capability interface for browser actions.
//
// The registry is the execution runtime's public API.
// The planner sends action names. The registry dispatches to capabilities.
// New capabilities can be added without touching the executor.
//
// Exposes: window.ccCapabilities.{register, dispatch, list, resolve}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

;(function () {
  'use strict';

  var REGISTRY_VERSION = '1.0.0';
  var capabilities = {};    // action_name → capability definition
  var widgetResolvers = []; // ordered list of widget-type resolvers

  // ══════════════════════════════════════════════════════════════════════
  // Capability Interface
  // ══════════════════════════════════════════════════════════════════════
  //
  // Every capability must implement:
  // {
  //   name: string,              — matches protocol action vocabulary
  //   description: string,       — human-readable
  //   handler: async function(action, context) → result,
  //   validates: function(action) → {valid, error},
  //   widgetTypes: string[],     — which widget types this handles (for select/click)
  // }

  /**
   * Register a capability.
   * @param {object} cap — capability definition
   */
  function register(cap) {
    if (!cap || !cap.name) throw new Error('[ccCapabilities] name is required');
    if (typeof cap.handler !== 'function') throw new Error('[ccCapabilities] handler must be a function: ' + cap.name);

    // Allow multiple handlers for same action (widget-specific overrides)
    if (!capabilities[cap.name]) {
      capabilities[cap.name] = [];
    }
    capabilities[cap.name].push({
      name: cap.name,
      description: cap.description || '',
      handler: cap.handler,
      validates: cap.validates || function () { return { valid: true }; },
      widgetTypes: cap.widgetTypes || ['*'],
      priority: cap.priority || 0,
    });

    // Sort by priority descending (higher priority checked first)
    capabilities[cap.name].sort(function (a, b) { return b.priority - a.priority; });
  }

  /**
   * Register a widget-type resolver.
   * Resolvers determine which widget type a target element is.
   * @param {function} resolver — (element) → string|null
   */
  function registerWidgetResolver(resolver) {
    if (typeof resolver !== 'function') throw new Error('[ccCapabilities] resolver must be a function');
    widgetResolvers.push(resolver);
  }

  /**
   * Resolve the widget type of a DOM element.
   * @param {Element} el
   * @returns {string} widget type identifier
   */
  function resolveWidgetType(el) {
    if (!el) return 'unknown';
    for (var i = 0; i < widgetResolvers.length; i++) {
      var result = widgetResolvers[i](el);
      if (result) return result;
    }
    // Default resolution
    var tag = el.tagName;
    if (tag === 'SELECT') return 'native-select';
    if (tag === 'INPUT') return 'input-' + (el.type || 'text');
    if (tag === 'TEXTAREA') return 'textarea';
    if (tag === 'BUTTON' || (tag === 'INPUT' && el.type === 'submit')) return 'button';
    if (el.getAttribute('role') === 'combobox') return 'combobox';
    if (el.getAttribute('role') === 'listbox') return 'listbox';
    return 'generic';
  }

  /**
   * Dispatch an action to the appropriate capability handler.
   * @param {object} action — { action: string, target, value, options, timeout_ms }
   * @param {object} context — { element, widgetType, pageModel }
   * @returns {Promise<object>} — { status, actual_value, error, duration_ms }
   */
  async function dispatch(action, context) {
    var t0 = Date.now();
    var actionName = action.action || action.name;

    if (!actionName) {
      return { status: 'failed', error: 'no_action_name', duration_ms: 0 };
    }

    var handlers = capabilities[actionName];
    if (!handlers || handlers.length === 0) {
      return { status: 'failed', error: 'capability_not_found: ' + actionName, duration_ms: 0 };
    }

    // Determine widget type for resolution
    var widgetType = (context && context.widgetType) || 'generic';

    // Find the best matching handler
    var handler = null;
    for (var i = 0; i < handlers.length; i++) {
      var h = handlers[i];
      if (h.widgetTypes.indexOf('*') !== -1 || h.widgetTypes.indexOf(widgetType) !== -1) {
        handler = h;
        break;
      }
    }

    if (!handler) {
      // Fallback to first registered handler for this action
      handler = handlers[0];
    }

    // Validate
    var validation = handler.validates(action);
    if (!validation.valid) {
      return { status: 'failed', error: 'validation: ' + validation.error, duration_ms: 0 };
    }

    // Execute with timeout
    var timeoutMs = action.timeout_ms || 10000;
    try {
      var result = await Promise.race([
        handler.handler(action, context || {}),
        new Promise(function (_, rej) {
          setTimeout(function () { rej(new Error('timeout')); }, timeoutMs);
        }),
      ]);
      result.duration_ms = Date.now() - t0;
      return result;
    } catch (e) {
      return {
        status: e.message === 'timeout' ? 'timeout' : 'failed',
        error: e.message,
        duration_ms: Date.now() - t0,
      };
    }
  }

  /**
   * List all registered capabilities.
   * @returns {string[]} capability names
   */
  function list() {
    return Object.keys(capabilities);
  }

  /**
   * Get full capability metadata for protocol negotiation.
   * @returns {object[]} capability descriptors
   */
  function manifest() {
    var result = [];
    for (var name in capabilities) {
      var handlers = capabilities[name];
      result.push({
        name: name,
        handlers: handlers.length,
        widgetTypes: handlers.reduce(function (acc, h) { return acc.concat(h.widgetTypes); }, []),
        description: handlers[0].description,
      });
    }
    return result;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Core Action Primitives
  // ══════════════════════════════════════════════════════════════════════

  // ── fill_text ─────────────────────────────────────────────────────
  register({
    name: 'fill_text',
    description: 'Type a value into a text/textarea input (keystroke simulation)',
    widgetTypes: ['input-text', 'input-email', 'input-tel', 'input-number', 'input-password', 'input-url', 'input-search', 'input-date', 'textarea', 'mat-input', 'generic'],
    handler: async function (action, ctx) {
      var el = ctx.element;
      if (!el) return { status: 'failed', error: 'element_not_found' };

      var value = action.value || '';
      el.focus();
      el.dispatchEvent(new Event('focus', { bubbles: true }));

      // Clear existing value
      var nativeSetter = Object.getOwnPropertyDescriptor(
        el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        'value'
      );

      // Type character by character for framework compatibility
      if (nativeSetter && nativeSetter.set) nativeSetter.set.call(el, '');
      else el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));

      for (var i = 0; i < value.length; i++) {
        var ch = value[i];
        el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keypress', { key: ch, bubbles: true }));

        // Set value progressively
        var partial = value.substring(0, i + 1);
        if (nativeSetter && nativeSetter.set) nativeSetter.set.call(el, partial);
        else el.value = partial;

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
      }

      // Final events
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      el.blur();
      el.dispatchEvent(new Event('blur', { bubbles: true }));

      return { status: 'success', actual_value: el.value };
    },
    validates: function (action) {
      if (action.value == null) return { valid: false, error: 'value required' };
      return { valid: true };
    },
  });

  // ── select_option ─────────────────────────────────────────────────
  register({
    name: 'select_option',
    description: 'Select a dropdown option (native <select>)',
    widgetTypes: ['native-select'],
    priority: 0,
    handler: async function (action, ctx) {
      var el = ctx.element;
      if (!el) return { status: 'failed', error: 'element_not_found' };

      var value = action.value || '';
      var timeoutMs = action.timeout_ms || 10000;
      var deadline = Date.now() + timeoutMs;

      // Poll for matching option (handles cascade selects where options load async)
      var opt = null;
      while (Date.now() < deadline) {
        var options = Array.from(el.options);
        opt = window.ccMatchOption ? window.ccMatchOption(value, options) : null;
        if (opt) break;
        // If select has only 1 option (placeholder), wait for more to load
        if (options.length <= 1) {
          await new Promise(function (r) { setTimeout(r, 300); });
          continue;
        }
        // Has multiple options but none match — wait a bit more (DWR can be slow)
        await new Promise(function (r) { setTimeout(r, 500); });
        // Re-check after wait
        options = Array.from(el.options);
        opt = window.ccMatchOption ? window.ccMatchOption(value, options) : null;
        if (opt) break;
        // Still no match — keep polling if we have time
        if (options.length <= 1) continue;
        break;
      }

      if (!opt) return { status: 'failed', error: 'no_matching_option', actual_value: null };

      if (window.ccApplySelect) {
        window.ccApplySelect(el, opt);
      } else {
        el.value = opt.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      return { status: 'success', actual_value: opt.text || opt.value };
    },
    validates: function (action) {
      if (!action.value) return { valid: false, error: 'value required for select' };
      return { valid: true };
    },
  });

  // ── click ─────────────────────────────────────────────────────────
  register({
    name: 'click',
    description: 'Click an element',
    widgetTypes: ['*'],
    handler: async function (action, ctx) {
      var el = ctx.element;
      if (!el) return { status: 'failed', error: 'element_not_found' };

      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      el.focus();
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      if (action.options && action.options.double) {
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      }

      return { status: 'success' };
    },
  });

  // ── check ─────────────────────────────────────────────────────────
  register({
    name: 'check',
    description: 'Set checkbox/radio checked state',
    widgetTypes: ['input-checkbox', 'input-radio', 'checkbox', 'radio'],
    handler: async function (action, ctx) {
      var el = ctx.element;
      if (!el) return { status: 'failed', error: 'element_not_found' };

      var shouldCheck = action.value === 'true' || action.value === true;
      if (el.checked !== shouldCheck) {
        el.checked = shouldCheck;
        el.dispatchEvent(new Event('click', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      return { status: 'success', actual_value: String(el.checked) };
    },
    validates: function (action) {
      if (action.value == null) return { valid: false, error: 'value required (true/false)' };
      return { valid: true };
    },
  });

  // ── wait_network ──────────────────────────────────────────────────
  register({
    name: 'wait_network',
    description: 'Wait for network idle',
    widgetTypes: ['*'],
    handler: async function (action) {
      var quietMs = (action.options && action.options.quiet_ms) || 200;
      var maxMs = (action.options && action.options.max_ms) || 5000;

      if (window.ccWaitForNetworkIdle) {
        var result = await window.ccWaitForNetworkIdle(quietMs, maxMs);
        return { status: result.idle ? 'success' : 'timeout', actual_value: null };
      }

      // Fallback: fixed delay
      await new Promise(function (r) { setTimeout(r, quietMs); });
      return { status: 'success', actual_value: null };
    },
  });

  // ── wait_element ──────────────────────────────────────────────────
  register({
    name: 'wait_element',
    description: 'Wait for an element to appear in DOM',
    widgetTypes: ['*'],
    handler: async function (action) {
      var timeoutMs = (action.options && action.options.timeout_ms) || 5000;
      var checkVisible = action.options && action.options.visible;
      var deadline = Date.now() + timeoutMs;

      // Try semantic resolution first (protocol v2)
      var target = action.target;
      if (target && window.ccResolver) {
        while (Date.now() < deadline) {
          var resolution = window.ccResolver.resolve(target);
          if (resolution.element) {
            if (!checkVisible) return { status: 'success' };
            if (window.ccDomUtils && window.ccDomUtils.isVisible(resolution.element)) return { status: 'success' };
            var rect = resolution.element.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) return { status: 'success' };
          }
          await new Promise(function (r) { setTimeout(r, 100); });
        }
        return { status: 'timeout', error: 'element not found within timeout (semantic resolution)' };
      }

      // Deprecated fallback: css_selector (v1 compatibility)
      var selector = target && target.css_selector;
      if (!selector) return { status: 'failed', error: 'no target provided for wait_element' };

      console.warn('[ccCapabilities] wait_element using deprecated css_selector:', selector);
      while (Date.now() < deadline) {
        var el = document.querySelector(selector);
        if (el) {
          if (!checkVisible) return { status: 'success' };
          if (window.ccDomUtils && window.ccDomUtils.isVisible(el)) return { status: 'success' };
        }
        await new Promise(function (r) { setTimeout(r, 100); });
      }

      return { status: 'timeout', error: 'element not found within timeout' };
    },
  });

  // ── wait_time ─────────────────────────────────────────────────────
  register({
    name: 'wait_time',
    description: 'Fixed delay',
    widgetTypes: ['*'],
    handler: async function (action) {
      var ms = (action.options && action.options.ms) || 1000;
      await new Promise(function (r) { setTimeout(r, ms); });
      return { status: 'success' };
    },
  });

  // ── scroll_to ─────────────────────────────────────────────────────
  register({
    name: 'scroll_to',
    description: 'Scroll element into view',
    widgetTypes: ['*'],
    handler: async function (action, ctx) {
      var el = ctx.element;
      if (!el) return { status: 'failed', error: 'element_not_found' };
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return { status: 'success' };
    },
  });

  // ── navigate ──────────────────────────────────────────────────────
  register({
    name: 'navigate',
    description: 'Navigate to a URL',
    widgetTypes: ['*'],
    handler: async function (action) {
      var url = action.value;
      if (!url) return { status: 'failed', error: 'url required' };
      window.location.href = url;
      return { status: 'success' };
    },
    validates: function (action) {
      if (!action.value) return { valid: false, error: 'value (url) required' };
      return { valid: true };
    },
  });

  // ── extract ───────────────────────────────────────────────────────
  register({
    name: 'extract',
    description: 'Read current page state',
    widgetTypes: ['*'],
    handler: async function (action) {
      // Delegate to extractor if available
      if (typeof extractFormFieldsWithFingerprint === 'function') {
        var result = extractFormFieldsWithFingerprint();
        return { status: 'success', actual_value: JSON.stringify(result.pageModel || result) };
      }
      return { status: 'failed', error: 'extractor not available' };
    },
  });

  // ── assert ────────────────────────────────────────────────────────
  register({
    name: 'assert',
    description: 'Verify a condition',
    widgetTypes: ['*'],
    handler: async function (action, ctx) {
      var el = ctx.element;
      var opts = action.options || {};

      if (opts.exists !== undefined) {
        var exists = !!el;
        if (opts.exists && !exists) return { status: 'failed', error: 'element does not exist' };
        if (!opts.exists && exists) return { status: 'failed', error: 'element exists but should not' };
        return { status: 'success' };
      }

      if (opts.visible !== undefined && el) {
        var visible = window.ccDomUtils ? window.ccDomUtils.isVisible(el) : true;
        if (opts.visible && !visible) return { status: 'failed', error: 'element not visible' };
        if (!opts.visible && visible) return { status: 'failed', error: 'element visible but should not be' };
        return { status: 'success' };
      }

      if (opts.expected_value !== undefined && el) {
        var actual = el.value || el.textContent || '';
        if (actual.trim() !== String(opts.expected_value).trim()) {
          return { status: 'failed', error: 'expected "' + opts.expected_value + '" got "' + actual.trim() + '"' };
        }
        return { status: 'success', actual_value: actual.trim() };
      }

      return { status: 'success' };
    },
  });

  // ── upload_file ───────────────────────────────────────────────────
  register({
    name: 'upload_file',
    description: 'Trigger file input for upload',
    widgetTypes: ['input-file', '*'],
    handler: async function (action, ctx) {
      var el = ctx.element;
      if (!el) return { status: 'failed', error: 'element_not_found' };

      // If element is not a file input, try to find one nearby
      if (el.type !== 'file') {
        var fileInput = el.querySelector('input[type="file"]') ||
                        (el.closest && el.closest('.field, .form-group, mat-form-field') &&
                         el.closest('.field, .form-group, mat-form-field').querySelector('input[type="file"]'));
        if (fileInput) el = fileInput;
        else return { status: 'failed', error: 'no_file_input_found' };
      }

      // In content script context, we cannot programmatically set files.
      // The file value must come from the service as a reference.
      // For now: signal that human intervention is needed for file upload.
      var filename = action.value || '';
      if (!filename) {
        return { status: 'waiting_human', actual_value: 'file_upload_required', prompt: 'Please upload the required file' };
      }

      // Try DataTransfer approach (works in some browsers for testing)
      try {
        var dt = new DataTransfer();
        var file = new File([''], filename, { type: 'application/octet-stream' });
        dt.items.add(file);
        el.files = dt.files;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { status: 'success', actual_value: filename };
      } catch (e) {
        // DataTransfer not supported — request human
        return { status: 'waiting_human', actual_value: 'file_upload_required', prompt: 'Please upload: ' + filename };
      }
    },
    validates: function (action) {
      return { valid: true }; // value is optional (empty means request human)
    },
  });

  // ── request_human ─────────────────────────────────────────────────
  register({
    name: 'request_human',
    description: 'Pause for operator action (OTP, CAPTCHA, payment)',
    widgetTypes: ['*'],
    handler: async function (action) {
      var reason = action.reason || action.options && action.options.reason || 'unknown';
      var prompt = action.prompt || action.value || 'Operator action required';
      var timeoutMs = (action.options && action.options.timeout_ms) || 0; // 0 = indefinite

      // Emit event for UI layer to display prompt
      console.log('[ccCapabilities] request_human: ' + reason + ' — ' + prompt);
      try {
        document.dispatchEvent(new CustomEvent('cc:human_required', {
          detail: { reason: reason, prompt: prompt, timeout_ms: timeoutMs }
        }));
      } catch (e) {}

      // In production, this would pause and wait for operator signal.
      // For now, return waiting_human status — the runner should handle this.
      return { status: 'waiting_human', actual_value: reason, prompt: prompt };
    },
    validates: function (action) {
      if (!action.reason && !(action.options && action.options.reason)) {
        return { valid: false, error: 'reason required for request_human' };
      }
      return { valid: true };
    },
  });

  // ── confirm_submission ────────────────────────────────────────────
  register({
    name: 'confirm_submission',
    description: 'Ask operator to approve irreversible action',
    widgetTypes: ['*'],
    handler: async function (action) {
      var prompt = action.prompt || action.value || 'Confirm submission?';
      var destructive = action.options && action.options.destructive;

      console.log('[ccCapabilities] confirm_submission: ' + prompt + (destructive ? ' [DESTRUCTIVE]' : ''));
      try {
        document.dispatchEvent(new CustomEvent('cc:confirm_required', {
          detail: { prompt: prompt, destructive: !!destructive }
        }));
      } catch (e) {}

      // SAFETY: Never auto-confirm. Always return waiting_human.
      return { status: 'waiting_human', actual_value: 'awaiting_confirmation', prompt: prompt };
    },
    validates: function (action) {
      if (!action.prompt && !action.value) {
        return { valid: false, error: 'prompt required for confirm_submission' };
      }
      return { valid: true };
    },
  });

  // ── wait_external ─────────────────────────────────────────────────
  register({
    name: 'wait_external',
    description: 'Wait for external event (redirect, email, processing)',
    widgetTypes: ['*'],
    handler: async function (action) {
      var reason = action.reason || action.options && action.options.reason || 'external';
      var timeoutMs = (action.options && action.options.timeout_ms) || 30000;
      var detectType = action.detect || (action.options && action.options.detect) || null;

      console.log('[ccCapabilities] wait_external: ' + reason);

      // Basic detection implementations
      if (detectType) {
        var type = typeof detectType === 'string' ? detectType : detectType.type;
        var pattern = typeof detectType === 'object' ? detectType.pattern : null;
        var deadline = Date.now() + timeoutMs;

        switch (type) {
          case 'url_change':
            var startUrl = window.location.href;
            while (Date.now() < deadline) {
              if (window.location.href !== startUrl) {
                if (!pattern || new RegExp(pattern).test(window.location.href)) {
                  return { status: 'success', actual_value: window.location.href };
                }
              }
              await new Promise(function (r) { setTimeout(r, 200); });
            }
            return { status: 'timeout', error: 'url did not change within timeout' };

          case 'network_idle':
            if (window.ccWaitForNetworkIdle) {
              var res = await window.ccWaitForNetworkIdle(500, timeoutMs);
              return { status: res.idle ? 'success' : 'timeout' };
            }
            await new Promise(function (r) { setTimeout(r, Math.min(timeoutMs, 3000)); });
            return { status: 'success' };

          case 'timeout':
            await new Promise(function (r) { setTimeout(r, timeoutMs); });
            return { status: 'success' };

          default:
            // Unknown detect type — just wait
            await new Promise(function (r) { setTimeout(r, Math.min(timeoutMs, 5000)); });
            return { status: 'success' };
        }
      }

      // No detection specified — return waiting_human for manual signal
      return { status: 'waiting_human', actual_value: reason };
    },
  });

  // ══════════════════════════════════════════════════════════════════════
  // Default Widget Resolvers
  // ══════════════════════════════════════════════════════════════════════

  registerWidgetResolver(function (el) {
    if (!el) return null;
    // Detect ng-select / ng-dropdown in all common variants
    if (el.tagName === 'NG-SELECT') return 'ng-select';
    if (el.classList && (el.classList.contains('ng-select') || el.classList.contains('ng-dropdown'))) return 'ng-select';
    if (el.closest && (el.closest('.ng-select') || el.closest('.ng-dropdown') || el.closest('ng-select'))) return 'ng-select';
    return null;
  });

  registerWidgetResolver(function (el) {
    if (el.tagName === 'MAT-SELECT' || (el.closest && el.closest('mat-form-field mat-select'))) return 'mat-select';
    return null;
  });

  registerWidgetResolver(function (el) {
    if (el.getAttribute && el.getAttribute('role') === 'combobox') return 'combobox';
    return null;
  });

  // ══════════════════════════════════════════════════════════════════════
  // Expose
  // ══════════════════════════════════════════════════════════════════════

  window.ccCapabilities = {
    version: REGISTRY_VERSION,
    register: register,
    registerWidgetResolver: registerWidgetResolver,
    resolveWidgetType: resolveWidgetType,
    dispatch: dispatch,
    list: list,
    manifest: manifest,
  };
})();
