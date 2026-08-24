/**
 * AUTO-GENERATED
 * Source: @cc/drivers
 * Rebuild: pnpm --filter cybercontrol-extension build
 */

/* ==== dispatch.js ==== */
/**
 * CyberControl driver dispatcher — window.cc.do(action) → result
 *
 * Drivers are the BROWSER ISA: low-level primitives that observe or mutate
 * the page. Each driver has a JSON Schema for input + output. The dispatcher
 * validates input, runs the driver, persists a trace.
 *
 * Consumers:
 *   - autofill executor (composes type → wait → verify)
 *   - AI agent in hub backend (calls drivers via WebSocket bridge)
 *   - manual debugging from devtools (cc.do({...}) at console)
 *
 * Design principles:
 *   - One entry point: window.cc.do(action). Everything goes through it.
 *   - Stable schemas: change-resistant. Adding a new field is fine; renaming
 *     or removing a field is a breaking change.
 *   - Side-effect declarations: every driver flags 'observe' | 'mutate' |
 *     'navigate' so the agent / preview-mode can decide what to confirm.
 *   - Trace everything: each call gets a traceId, recorded with input,
 *     output, duration, before/after observations.
 *
 * Action shape:
 *   {
 *     name: 'dom.query',
 *     args: { ... },
 *     options?: { dryRun?: boolean, timeout?: number, traceId?: string }
 *   }
 *
 * Result shape:
 *   {
 *     ok: boolean,
 *     result?: any,        // driver-specific
 *     observed?: any,      // post-call observation (e.g. element after fill)
 *     error?: string,      // when ok=false
 *     traceId: string,
 *     durationMs: number,
 *     driver: string,
 *     timestamp: number
 *   }
 */
;(function () {
  if (window.cc && window.cc._dispatchInstalled) return;
  window.cc = window.cc || {};
  window.cc._dispatchInstalled = true;

  // Driver registry — populated by individual driver files
  // Each entry: { name, description, sideEffect, input, output, handler }
  const _registry = {};

  window.cc.registerDriver = function registerDriver(driver) {
    if (!driver || !driver.name || typeof driver.handler !== 'function') {
      console.warn('[cc] invalid driver:', driver);
      return;
    }
    if (_registry[driver.name]) {
      // Re-registration is allowed for hot-reload during development
      // console.debug('[cc] re-registering driver:', driver.name);
    }
    _registry[driver.name] = driver;
  };

  window.cc.listDrivers = function listDrivers() {
    return Object.values(_registry).map(d => ({
      name: d.name,
      description: d.description,
      sideEffect: d.sideEffect,
      input: d.input,
      output: d.output,
    }));
  };

  // ── Tiny JSON-schema-ish validator (just type + required) ───────────────
  function validateAgainstSchema(value, schema, path) {
    path = path || '$';
    if (!schema) return { ok: true };
    if (schema.type === 'object') {
      if (value === null || typeof value !== 'object' || Array.isArray(value))
        return { ok: false, error: path + ': expected object, got ' + (Array.isArray(value) ? 'array' : typeof value) };
      const required = schema.required || [];
      for (const key of required) {
        if (!(key in value)) return { ok: false, error: path + '.' + key + ': required' };
      }
      const props = schema.properties || {};
      for (const [key, sub] of Object.entries(props)) {
        if (key in value) {
          const r = validateAgainstSchema(value[key], sub, path + '.' + key);
          if (!r.ok) return r;
        }
      }
      return { ok: true };
    }
    if (schema.type === 'array') {
      if (!Array.isArray(value))
        return { ok: false, error: path + ': expected array' };
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          const r = validateAgainstSchema(value[i], schema.items, path + '[' + i + ']');
          if (!r.ok) return r;
        }
      }
      return { ok: true };
    }
    if (schema.type === 'string') {
      if (typeof value !== 'string')
        return { ok: false, error: path + ': expected string, got ' + typeof value };
      if (schema.enum && !schema.enum.includes(value))
        return { ok: false, error: path + ': must be one of ' + schema.enum.join(',') };
      return { ok: true };
    }
    if (schema.type === 'number' || schema.type === 'integer') {
      if (typeof value !== 'number')
        return { ok: false, error: path + ': expected number, got ' + typeof value };
      return { ok: true };
    }
    if (schema.type === 'boolean') {
      if (typeof value !== 'boolean')
        return { ok: false, error: path + ': expected boolean, got ' + typeof value };
      return { ok: true };
    }
    return { ok: true }; // unknown type — let it through
  }

  // ── Trace recorder — extension-isolated memory only ─────────────────────
  // Traces may contain action selectors and values, so they must never be
  // serialized into page-readable DOM attributes or storage.
  if (!window._ccTraces) window._ccTraces = [];
  function recordTrace(entry) {
    window._ccTraces.push(entry);
    if (window._ccTraces.length > 100) window._ccTraces.shift();
  }

  function makeTraceId() {
    return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  // ── Main dispatcher ──────────────────────────────────────────────────────
  window.cc.do = async function ccDo(action) {
    const t0 = Date.now();
    const traceId = (action && action.options && action.options.traceId) || makeTraceId();
    if (!action || typeof action !== 'object') {
      return { ok: false, error: 'action must be an object', traceId, durationMs: 0 };
    }
    const driver = _registry[action.name];
    if (!driver) {
      const err = 'unknown-driver: ' + action.name + ' (available: ' + Object.keys(_registry).join(', ') + ')';
      const out = { ok: false, error: err, traceId, durationMs: 0, driver: action.name };
      recordTrace({ traceId, action, result: out, ts: t0 });
      return out;
    }

    // Validate input
    const args = action.args || {};
    if (driver.input) {
      const v = validateAgainstSchema(args, driver.input);
      if (!v.ok) {
        const out = { ok: false, error: 'invalid-args: ' + v.error, traceId, durationMs: 0, driver: driver.name };
        recordTrace({ traceId, action, result: out, ts: t0 });
        return out;
      }
    }

    // Honor dry-run for mutating drivers
    if (action.options && action.options.dryRun && driver.sideEffect !== 'observe') {
      const out = {
        ok: true,
        result: { dryRun: true },
        traceId,
        durationMs: Date.now() - t0,
        driver: driver.name,
        timestamp: t0,
      };
      recordTrace({ traceId, action, result: out, ts: t0 });
      return out;
    }

    // Execute
    let result, error;
    try {
      result = await Promise.resolve(driver.handler(args, { traceId, options: action.options || {} }));
    } catch (e) {
      error = (e && e.message) || String(e);
    }

    const durationMs = Date.now() - t0;
    const out = error
      ? { ok: false, error, traceId, durationMs, driver: driver.name, timestamp: t0 }
      : { ok: true, result, traceId, durationMs, driver: driver.name, timestamp: t0 };
    recordTrace({ traceId, action, result: out, ts: t0 });
    return out;
  };

  // Convenience: cc.run([action, action, ...]) — sequential composition
  window.cc.run = async function ccRun(actions) {
    const results = [];
    for (const action of actions) {
      const r = await window.cc.do(action);
      results.push(r);
      if (!r.ok && !(action.options && action.options.continueOnError)) break;
    }
    return { ok: results.every(r => r.ok), steps: results };
  };
})();

/* ==== dom.js ==== */
/**
 * DOM observation drivers — read-only primitives.
 *
 * Drivers:
 *   - dom.query   → find elements by selector or semantic query
 *   - dom.read    → read state of a single element
 *   - dom.snapshot → list visible interactive elements with metadata
 *
 * All sideEffect: 'observe'.
 */
;(function () {
  if (!window.cc || !window.cc.registerDriver) return;

  // ── Helpers ──────────────────────────────────────────────────────────────
  // Delegate to shared/dom-utils.js (injected before drivers run)
  function isVisible(el) {
    return window.ccDomUtils.isVisible(el);
  }

  function getLabelFor(el) {
    return window.ccDomUtils.getLabel(el);
  }

  function selectorFor(el) {
    if (!el) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    if (el.name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(el.name) + '"]';
    // Best-effort path
    const path = [];
    let cur = el;
    while (cur && cur.tagName && path.length < 5) {
      let part = cur.tagName.toLowerCase();
      if (cur.className && typeof cur.className === 'string') {
        const cls = cur.className.trim().split(/\s+/).filter(c => /^[a-z][\w-]*$/i.test(c)).slice(0, 2);
        if (cls.length) part += '.' + cls.join('.');
      }
      const parent = cur.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
      }
      path.unshift(part);
      cur = parent;
    }
    return path.join(' > ');
  }

  function summarizeEl(el, opts) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const cls = (el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '';
    // Semantic kind — what the LLM agent should pick the tool for.
    let kind = 'unknown';
    if (tag === 'select' || tag === 'ng-select' || tag === 'mat-select' || cls.includes('ng-select') || cls.includes('mat-select')) {
      kind = 'dropdown';
    } else if (tag === 'textarea') {
      kind = 'text';
    } else if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase();
      if (t === 'radio') kind = 'radio';
      else if (t === 'checkbox') kind = 'checkbox';
      else if (t === 'submit' || t === 'button') kind = 'button';
      else if (t === 'file') kind = 'file';
      else kind = 'text';
    } else if (tag === 'button' || el.getAttribute('role') === 'button') {
      kind = 'button';
    } else if (tag === 'a') {
      kind = 'link';
    }
    const sum = {
      tag,
      kind,
      type: el.type || null,
      id: el.id || null,
      name: el.name || null,
      role: el.getAttribute('role') || null,
      placeholder: el.placeholder || null,
      value: 'value' in el ? (el.value || '') : null,
      label: getLabelFor(el),
      text: (el.textContent || '').trim().slice(0, 80),
      disabled: !!el.disabled,
      readOnly: !!el.readOnly,
      visible: isVisible(el),
      bounds: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      selector: selectorFor(el),
    };
    if (opts && opts.includeAttrs) {
      sum.attrs = {};
      for (const a of el.attributes) sum.attrs[a.name] = a.value;
    }
    return sum;
  }

  // ── dom.query ────────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'dom.query',
    description: 'Find DOM elements by CSS selector or by semantic kind+text. Returns up to `limit` element summaries (visible only by default).',
    sideEffect: 'observe',
    input: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector. Mutually exclusive with kind+text.' },
        kind: { type: 'string', enum: ['button', 'link', 'input', 'select', 'textarea', 'checkbox', 'radio', 'any'], description: 'Semantic kind' },
        text: { type: 'string', description: 'Substring match against element textContent (case-insensitive)' },
        limit: { type: 'integer', description: 'Max results (default 10)' },
        includeHidden: { type: 'boolean', description: 'Include non-visible elements (default false)' },
      },
    },
    output: {
      type: 'object',
      properties: {
        count: { type: 'integer' },
        elements: { type: 'array' },
      },
    },
    handler: async function (args) {
      const limit = args.limit || 10;
      let candidates = [];
      if (args.selector) {
        candidates = Array.from(document.querySelectorAll(args.selector));
      } else if (args.kind || args.text) {
        let sel = '';
        if (args.kind === 'button') sel = 'button, input[type="submit"], input[type="button"], [role="button"]';
        else if (args.kind === 'link') sel = 'a[href]';
        else if (args.kind === 'input') sel = 'input:not([type="hidden"]), textarea';
        else if (args.kind === 'select') sel = 'select, mat-select, .ng-select';
        else if (args.kind === 'textarea') sel = 'textarea';
        else if (args.kind === 'checkbox') sel = 'input[type="checkbox"], mat-checkbox';
        else if (args.kind === 'radio') sel = 'input[type="radio"], mat-radio-button';
        else sel = 'input, button, select, textarea, a, [role="button"]';
        candidates = Array.from(document.querySelectorAll(sel));
        if (args.text) {
          const re = new RegExp(args.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          candidates = candidates.filter(el => re.test((el.textContent || el.value || el.placeholder || '').trim()));
        }
      } else {
        return { count: 0, elements: [], error: 'must provide selector OR kind+text' };
      }
      if (!args.includeHidden) candidates = candidates.filter(isVisible);
      const elements = candidates.slice(0, limit).map(el => summarizeEl(el));
      return { count: candidates.length, elements };
    },
  });

  // ── dom.read ─────────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'dom.read',
    description: 'Read full state of a single element (label, value, attrs, bounds, visibility).',
    sideEffect: 'observe',
    input: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
      },
      required: ['selector'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const el = document.querySelector(args.selector);
      if (!el) return { found: false };
      return { found: true, ...summarizeEl(el, { includeAttrs: true }) };
    },
  });

  // ── dom.snapshot ─────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'dom.snapshot',
    description: 'List all visible interactive elements on the page (inputs, buttons, selects, links). Use this to give an AI agent context about what is on the page.',
    sideEffect: 'observe',
    input: {
      type: 'object',
      properties: {
        kinds: { type: 'array', items: { type: 'string' } },
        limit: { type: 'integer' },
      },
    },
    output: { type: 'object' },
    handler: async function (args) {
      const kinds = args.kinds || ['input', 'button', 'link', 'select'];
      const limit = args.limit || 100;
      let sels = [];
      if (kinds.includes('input')) sels.push('input:not([type="hidden"])', 'textarea');
      if (kinds.includes('button')) sels.push('button', 'input[type="submit"]', 'input[type="button"]', '[role="button"]');
      if (kinds.includes('link')) sels.push('a[href]');
      if (kinds.includes('select')) {
        // Native + Angular Material + ng-select. Common patterns:
        //   <select>
        //   <mat-select> wrapped in <mat-form-field>
        //   <ng-select> from @ng-select/ng-select
        //   <div class="ng-select">  some sites use plain divs styled as ng-select
        //   <div class="value-area">  custom dropdowns (SSC OTR pattern)
        sels.push('select', 'mat-select', 'ng-select', '.ng-select', '.mat-select-trigger', 'div.value-area', '.ng-select-container');
      }
      if (kinds.includes('checkbox')) sels.push('input[type="checkbox"]', 'mat-checkbox');
      if (kinds.includes('radio')) sels.push('input[type="radio"]', 'mat-radio-button');
      const els = Array.from(document.querySelectorAll(sels.join(',')))
        .filter(isVisible)
        .slice(0, limit);
      return {
        url: location.href,
        title: document.title,
        elementCount: els.length,
        elements: els.map(el => summarizeEl(el)),
      };
    },
  });
})();

/* ==== input.js ==== */
/**
 * Input drivers — keystroke-style typing, clearing, focusing.
 * Wraps window.keystrokeFillSync from autofill/plugins/keystroke-input.js.
 *
 * Drivers:
 *   - input.type  → type a value via real keystroke event sequence
 *   - input.clear → clear an input field
 *   - input.focus → focus an element
 */
;(function () {
  if (!window.cc || !window.cc.registerDriver) return;

  function findEl(args) {
    if (!args.target) return null;
    return document.querySelector(args.target);
  }

  function readActual(el) {
    if (!el) return '';
    if (el.tagName === 'SELECT') {
      const o = el.options[el.selectedIndex];
      return o ? (o.text || o.value) : '';
    }
    return el.value || '';
  }

  // ── input.type ───────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'input.type',
    description: 'Type a value into a text/email/tel/textarea field via real keystroke events. Triggers framework validators (Aadhaar, OTP, masked inputs work). Dispatches Tab+focusout at the end so site Tab-handlers run (RTPS Hindi transliteration, ASP postback, etc).',
    sideEffect: 'mutate',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'CSS selector for the field' },
        value: { type: 'string', description: 'String to type' },
        clearFirst: { type: 'boolean', description: 'Clear existing value before typing (default true)' },
      },
      required: ['target', 'value'],
    },
    output: {
      type: 'object',
      properties: {
        actualValue: { type: 'string', description: 'Element value after typing (may differ from input due to masking/formatting)' },
        verified: { type: 'boolean', description: 'Whether actualValue matches expected (alphanum-stripped compare)' },
      },
    },
    handler: async function (args) {
      const el = findEl(args);
      if (!el) throw new Error('element-not-found: ' + args.target);
      if (typeof window.keystrokeFillSync !== 'function') {
        throw new Error('keystroke-input plugin not loaded');
      }
      const before = readActual(el);
      window.keystrokeFillSync(el, String(args.value));
      // Settle for framework reaction
      await new Promise(r => setTimeout(r, 120));
      const after = readActual(el);
      const expectedNorm = String(args.value).toLowerCase().replace(/[^a-z0-9]/g, '');
      const actualNorm = after.toLowerCase().replace(/[^a-z0-9]/g, '');
      let verified = expectedNorm === actualNorm
        || (actualNorm.length > 0 && actualNorm.startsWith(expectedNorm.slice(0, Math.max(8, expectedNorm.length - 2))));
      // Masked input pattern (UIDAI etc): actual shows '********6597'; accept if length matches and last 4 match
      if (!verified && after.length === String(args.value).length && after.length >= 8) {
        const tail = String(args.value).slice(-4).toLowerCase();
        if (after.toLowerCase().endsWith(tail)) verified = true;
      }
      return { before, actualValue: after, verified };
    },
  });

  // ── input.clear ──────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'input.clear',
    description: 'Clear a text input/textarea via native value setter + input event sequence.',
    sideEffect: 'mutate',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string' },
      },
      required: ['target'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const el = findEl(args);
      if (!el) throw new Error('element-not-found: ' + args.target);
      const before = readActual(el);
      const isTextarea = el.tagName === 'TEXTAREA';
      const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      try { el.focus(); } catch (e) {}
      try { el.select(); } catch (e) {}
      if (desc) desc.set.call(el, ''); else el.value = '';
      try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })); }
      catch (e) { el.dispatchEvent(new Event('input', { bubbles: true })); }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { before, actualValue: el.value };
    },
  });

  // ── input.focus ──────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'input.focus',
    description: 'Focus an element. Scrolls into view first.',
    sideEffect: 'mutate',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        scrollIntoView: { type: 'boolean' },
      },
      required: ['target'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const el = findEl(args);
      if (!el) throw new Error('element-not-found: ' + args.target);
      if (args.scrollIntoView !== false) {
        try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
        await new Promise(r => setTimeout(r, 100));
      }
      try { el.focus(); } catch (e) {}
      return { focused: document.activeElement === el };
    },
  });
})();

/* ==== select.js ==== */
/**
 * Select drivers — pick options from native <select>, ng-select, mat-select,
 * and custom JS-driven dropdowns.
 *
 * Drivers:
 *   - select.option  → pick option by value/text/index
 *   - select.cascade → fill a dependent dropdown (waits for parent's options to populate)
 */
;(function () {
  if (!window.cc || !window.cc.registerDriver) return;

  function findEl(target) {
    if (!target) return null;
    return document.querySelector(target);
  }

  // Native <select>: find option using shared/option-match.js
  function pickNativeOption(sel, value) {
    return window.ccMatchOption(value, Array.from(sel.options), { excludePlaceholders: false });
  }

  function fillNativeSelect(sel, value) {
    const opt = pickNativeOption(sel, value);
    if (!opt) return { ok: false, reason: 'no-matching-option', options: Array.from(sel.options).slice(0, 20).map(o => o.text) };
    sel.value = opt.value;
    sel.selectedIndex = opt.index;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, selectedText: opt.text, selectedValue: opt.value };
  }

  // ── select.option ────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'select.option',
    description: 'Pick an option from a dropdown. Auto-detects native <select>, ng-select, mat-select. Match by text (case-insensitive contains).',
    sideEffect: 'mutate',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'CSS selector for the dropdown' },
        value: { type: 'string', description: 'Option text or value to select' },
      },
      required: ['target', 'value'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const el = findEl(args.target);
      if (!el) throw new Error('element-not-found: ' + args.target);

      // Route by element kind
      const tag = el.tagName.toLowerCase();
      const cls = (el.className || '').toLowerCase();
      const isNg = tag === 'ng-select' || cls.includes('ng-select') || el.closest('.ng-select');
      const isMat = tag === 'mat-select' || cls.includes('mat-select') || el.closest('mat-select');
      const isCustom = isNg || isMat;

      if (tag === 'select' && !isCustom) {
        const r = fillNativeSelect(el, args.value);
        if (!r.ok) return r;
        return { strategy: 'native-select', ...r };
      }

      // ng-select / mat-select / cascade — delegate to plugins if present
      if (typeof window.findPlugin === 'function') {
        const plugin = window.findPlugin(el, { profileKey: '', label: '' });
        if (plugin) {
          const result = plugin.fill(el, args.value, { profileKey: '', parentValues: {}, attempt: 1 });
          await new Promise(r => setTimeout(r, 200));
          return { strategy: 'plugin:' + plugin.id, ...result };
        }
      }

      // Last-ditch: try opening + clicking option
      try { el.click(); } catch (e) {}
      await new Promise(r => setTimeout(r, 300));
      const v = String(args.value).toLowerCase();
      const opts = Array.from(document.querySelectorAll('.ng-option, .mat-option, [role="option"]'))
        .filter(o => (o.textContent || '').trim().toLowerCase().includes(v));
      if (opts[0]) {
        opts[0].click();
        return { strategy: 'click-option', selectedText: opts[0].textContent.trim() };
      }
      return { ok: false, reason: 'no-matching-option', strategy: 'unknown' };
    },
  });

  // ── select.cascade ───────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'select.cascade',
    description: 'Fill a dependent <select> that gets populated after parent selection. Waits for AJAX network idle (parent populated this dropdown via XHR/fetch), then picks the option. Use for state→district→block chains.',
    sideEffect: 'mutate',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        value: { type: 'string' },
        waitMs: { type: 'integer', description: 'Max wait for options (default 6000)' },
      },
      required: ['target', 'value'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const maxWait = args.waitMs || 6000;
      const deadline = Date.now() + maxWait;

      // Wait for network idle (parent's AJAX) + options to populate
      while (Date.now() < deadline) {
        const el = findEl(args.target);
        if (el) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'select' && el.options.length > 1) break;
          if ((tag === 'ng-select' || tag === 'mat-select') && el.querySelectorAll('.ng-option, .mat-option').length > 0) break;
        }
        // Check ccAjaxActive from network monitor
        const active = parseInt(document.body.dataset.ccAjaxActive || '0', 10);
        if (active === 0) {
          const lastActivity = parseInt(document.body.dataset.ccAjaxLastActivity || '0', 10);
          if (Date.now() - lastActivity > 200) break;
        }
        await new Promise(r => setTimeout(r, 100));
      }

      const el = findEl(args.target);
      if (!el) throw new Error('element-not-found: ' + args.target);

      // Now select via the standard select.option driver
      return await window.cc.do({ name: 'select.option', args: { target: args.target, value: args.value } }).then(r => r.result || r);
    },
  });
})();

/* ==== interaction.js ==== */
/**
 * Click + wait drivers — interaction primitives.
 *
 * Drivers:
 *   - click             → click an element (button, link, anything)
 *   - wait.element      → wait for an element to appear / become visible
 *   - wait.networkIdle  → wait for in-flight fetch + XHR to drain
 *   - wait.ms           → fixed delay (use sparingly — prefer state-based waits)
 */
;(function () {
  if (!window.cc || !window.cc.registerDriver) return;

  function isVisible(el) {
    return window.ccDomUtils.isVisible(el);
  }

  // ── click ────────────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'click',
    description: 'Click an element. Scrolls into view, fires a real click. Returns { clicked, navigated } where navigated indicates whether the page URL changed within 2s.',
    sideEffect: 'mutate',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default left)' },
        scrollIntoView: { type: 'boolean' },
      },
      required: ['target'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const el = document.querySelector(args.target);
      if (!el) throw new Error('element-not-found: ' + args.target);
      if (args.scrollIntoView !== false) {
        try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
        await new Promise(r => setTimeout(r, 100));
      }
      const urlBefore = location.href;
      try { el.click(); } catch (e) { throw new Error('click-failed: ' + e.message); }
      await new Promise(r => setTimeout(r, 200));
      const urlAfter = location.href;
      // Brief poll for navigation
      let navigated = urlAfter !== urlBefore;
      if (!navigated) {
        const settle = Date.now() + 2000;
        while (Date.now() < settle && location.href === urlBefore) {
          await new Promise(r => setTimeout(r, 100));
        }
        navigated = location.href !== urlBefore;
      }
      return { clicked: true, navigated, urlBefore, urlAfter: location.href };
    },
  });

  // ── wait.element ─────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'wait.element',
    description: 'Wait for an element matching selector to appear and (optionally) become visible. Resolves with element summary or times out.',
    sideEffect: 'observe',
    input: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        visible: { type: 'boolean', description: 'Require visibility (default true)' },
        timeoutMs: { type: 'integer', description: 'Default 8000' },
      },
      required: ['selector'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const requireVisible = args.visible !== false;
      const timeout = args.timeoutMs || 8000;
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const el = document.querySelector(args.selector);
        if (el && (!requireVisible || isVisible(el))) {
          const r = el.getBoundingClientRect();
          return { found: true, waitedMs: Date.now() - (deadline - timeout), bounds: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
        }
        await new Promise(r => setTimeout(r, 100));
      }
      return { found: false, waitedMs: timeout };
    },
  });

  // ── wait.networkIdle ─────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'wait.networkIdle',
    description: 'Wait until in-flight fetch + XHR count reaches 0 and stays quiet for `quietMs`. Delegates to shared/network-idle.js.',
    sideEffect: 'observe',
    input: {
      type: 'object',
      properties: {
        quietMs: { type: 'integer', description: 'Required quiet duration (default 200)' },
        maxMs: { type: 'integer', description: 'Max total wait (default 5000)' },
      },
    },
    output: { type: 'object' },
    handler: async function (args) {
      return window.ccWaitForNetworkIdle(args.quietMs || 200, args.maxMs || 5000);
    },
  });

  // ── wait.ms ──────────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'wait.ms',
    description: 'Fixed delay. Use SPARINGLY — prefer wait.element or wait.networkIdle.',
    sideEffect: 'observe',
    input: {
      type: 'object',
      properties: {
        ms: { type: 'integer' },
      },
      required: ['ms'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const ms = Math.min(Math.max(0, args.ms || 0), 30000);
      await new Promise(r => setTimeout(r, ms));
      return { waitedMs: ms };
    },
  });
})();
