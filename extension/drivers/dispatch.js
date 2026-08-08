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
