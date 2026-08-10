/**
 * CyberControl Page IR Validator — pre-publication schema validation.
 *
 * Validates a PageSnapshot or PageDelta against architecture/page-ir.schema.json.
 * On failure: returns structured errors, never publishes invalid IR.
 *
 * Initialization:
 *   await initValidator({ schemaPath: '/path/to/page-ir.schema.json' })
 *   — or —
 *   await initValidator({ schema: parsedSchemaObject })
 */

let _validateFn = null;
let _initialized = false;

/**
 * Initialize the validator.
 * @param {object} options
 * @param {string} [options.schemaPath] — absolute path to page-ir.schema.json
 * @param {object} [options.schema] — pre-loaded schema JSON object
 * @param {string} [options.ajvPath] — path to a node_modules containing ajv (e.g. ratification harness)
 */
async function initValidator(options = {}) {
  if (_initialized) return;
  let schema = options.schema;
  if (!schema && options.schemaPath) {
    const fs = await import('node:fs');
    schema = JSON.parse(fs.readFileSync(options.schemaPath, 'utf8'));
  }
  if (!schema) {
    // No schema available — use structural fallback
    _validateFn = _structuralFallback;
    _initialized = true;
    return;
  }

  // Try AJV (full Draft 2020-12 validation)
  let Ajv;
  const ajvPaths = [
    'ajv/dist/2020.js',
    'ajv',
    ...(options.ajvPath ? [options.ajvPath + '/ajv/dist/2020.js', options.ajvPath + '/ajv'] : []),
  ];
  for (const p of ajvPaths) {
    try {
      const m = await import(p);
      Ajv = m.default || m;
      break;
    } catch { /* try next */ }
  }
  // Try createRequire from ajvPath as last resort
  if (!Ajv && options.ajvPath) {
    try {
      const { createRequire } = await import('node:module');
      const req = createRequire(options.ajvPath + '/ajv/package.json');
      Ajv = req('ajv/dist/2020');
    } catch { /* fallback below */ }
  }
  if (!Ajv) {
    _validateFn = _structuralFallback;
    _initialized = true;
    return;
  }

  const ajv = new Ajv({ strict: false, allErrors: true });
  try {
    const fmts = await import('ajv-formats');
    (fmts.default || fmts)(ajv);
  } catch { /* formats optional */ }
  const validate = ajv.compile(schema);

  _validateFn = (data) => {
    const valid = validate(data);
    if (valid) return { valid: true, errors: null };
    const errors = (validate.errors || []).map((e) =>
      `${e.instancePath || '/'} ${e.message}${e.params ? ' ' + JSON.stringify(e.params) : ''}`
    );
    return { valid: false, errors };
  };
  _initialized = true;
}

/**
 * Lightweight structural fallback when AJV is unavailable.
 */
function _structuralFallback(data) {
  if (!data || typeof data !== 'object') return { valid: false, errors: ['input is not an object'] };
  if (data.kind === 'page_snapshot') {
    const required = ['schema_version', 'producer', 'snapshot_id', 'document_id', 'revision', 'observed_at', 'canonical_hash', 'page', 'contexts', 'nodes', 'edges', 'state', 'diagnostics', 'privacy'];
    const missing = required.filter((k) => !(k in data));
    if (missing.length) return { valid: false, errors: missing.map((k) => `missing required: ${k}`) };
    return { valid: true, errors: null };
  }
  if (data.kind === 'page_delta') {
    const required = ['schema_version', 'producer', 'delta_id', 'document_id', 'base_revision', 'result_snapshot_id', 'result_canonical_hash', 'observed_at', 'operations', 'privacy'];
    const missing = required.filter((k) => !(k in data));
    if (missing.length) return { valid: false, errors: missing.map((k) => `missing required: ${k}`) };
    return { valid: true, errors: null };
  }
  return { valid: false, errors: [`unknown kind: ${data.kind}`] };
}

/**
 * Validate a PageSnapshot (schema only).
 * @param {object} snapshot
 * @returns {{ valid: boolean, errors: string[]|null }}
 */
function validateSnapshot(snapshot) {
  if (!_initialized) throw new Error('Validator not initialized. Call initValidator() first.');
  return _validateFn(snapshot);
}

/**
 * Validate a PageDelta.
 * @param {object} delta
 * @returns {{ valid: boolean, errors: string[]|null }}
 */
function validateDelta(delta) {
  if (!_initialized) throw new Error('Validator not initialized. Call initValidator() first.');
  return _validateFn(delta);
}

/**
 * Graph invariants (#131): parent_id/contains, acyclicity, no depends_on,
 * no dangling transitions_to, endpoint resolution.
 * Lazy-loads graph-invariants module in Node; uses global in browser.
 * @param {object} snapshot
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateGraphInvariants(snapshot) {
  let impl = null;
  let loadError = null;
  if (typeof globalThis !== 'undefined' && globalThis.CcGraphInvariants?.validateGraphInvariants) {
    impl = globalThis.CcGraphInvariants.validateGraphInvariants;
  } else if (typeof require !== 'undefined') {
    try {
      // eslint-disable-next-line global-require
      impl = require('./graph-invariants.js').validateGraphInvariants;
    } catch (e) {
      loadError = e?.message || String(e);
    }
  }
  // IMP-P1-01 (#133): fail closed — missing enforcement is a publication failure
  if (!impl) {
    return {
      valid: false,
      errors: [
        'graph_invariants_unavailable: graph-invariants module failed to load'
          + (loadError ? ` (${loadError})` : '; ensure perception/graph-invariants.js is loaded before publish'),
      ],
    };
  }
  return impl(snapshot);
}

/**
 * Schema + graph invariants for publication gate.
 * @param {object} snapshot
 * @returns {{ valid: boolean, errors: string[]|null }}
 */
function validateSnapshotStrict(snapshot) {
  const schema = validateSnapshot(snapshot);
  if (!schema.valid) return schema;
  const graph = validateGraphInvariants(snapshot);
  if (!graph.valid) return { valid: false, errors: graph.errors };
  return { valid: true, errors: null };
}

/** Whether the validator has been initialized. */
function isInitialized() {
  return _initialized;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initValidator,
    validateSnapshot,
    validateDelta,
    validateGraphInvariants,
    validateSnapshotStrict,
    isInitialized,
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcValidator = {
    initValidator,
    validateSnapshot,
    validateDelta,
    validateGraphInvariants,
    validateSnapshotStrict,
    isInitialized,
  };
}
