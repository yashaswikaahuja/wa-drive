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
    description: 'Type a value into a text/textarea input',
    widgetTypes: ['input-text', 'input-email', 'input-tel', 'input-number', 'input-password', 'input-url', 'input-search', 'textarea', 'mat-input', 'generic'],
    handler: async function (action, ctx) {
      var el = ctx.element;
      if (!el) return { status: 'failed', error: 'element_not_found' };

      var value = action.value || '';
      var nativeSetter = Object.getOwnPropertyDescriptor(
        el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        'value'
      );

      el.focus();
      if (nativeSetter && nativeSetter.set) nativeSetter.set.call(el, value);
      else el.value = value;

      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) || '' }));
      el.blur();

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
      var options = Array.from(el.options);
      var opt = window.ccMatchOption ? window.ccMatchOption(value, options) : null;

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
      var selector = action.target && action.target.css_selector;
      if (!selector) return { status: 'failed', error: 'selector required for wait_element' };

      var timeoutMs = (action.options && action.options.timeout_ms) || 5000;
      var checkVisible = action.options && action.options.visible;
      var deadline = Date.now() + timeoutMs;

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

  // ══════════════════════════════════════════════════════════════════════
  // Default Widget Resolvers
  // ══════════════════════════════════════════════════════════════════════

  registerWidgetResolver(function (el) {
    if (el.closest && el.closest('.ng-select')) return 'ng-select';
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
