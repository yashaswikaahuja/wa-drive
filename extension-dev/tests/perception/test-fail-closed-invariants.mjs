#!/usr/bin/env node
/**
 * IMP-P1-01 — fail closed when graph invariants unavailable (#133)
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

console.log('\n=== Fail-closed graph invariants (P1-01) ===');

// Module must exist on disk
ok(existsSync(resolve(ROOT, 'apps/extension/perception/graph-invariants.js')), 'graph-invariants.js present');
ok(existsSync(resolve(ROOT, 'apps/extension/perception/delta-apply.js')), 'delta-apply.js present');

// Bundle lists must include graph-invariants
const browserLists = [
  'extension-dev/tests/browser/run-perception-browser.mjs',
  'extension-dev/tests/browser/run-widget-classification.mjs',
  'extension-dev/tests/browser/bench-snapshot.mjs',
];
for (const rel of browserLists) {
  const src = readFileSync(resolve(ROOT, rel), 'utf8');
  ok(src.includes('graph-invariants.js'), `${rel} loads graph-invariants`);
}

// Validator fail-closed when CcGraphInvariants missing and require path broken
{
  const validatorPath = resolve(ROOT, 'apps/extension/perception/validator.js');
  // Isolate: load validator in a fresh require cache after temporarily masking module
  const giPath = resolve(ROOT, 'apps/extension/perception/graph-invariants.js');
  // Direct unit: call validateGraphInvariants with global stripped
  const { validateGraphInvariants, initValidator } = require(validatorPath);
  await initValidator({ schema: null });

  const saved = globalThis.CcGraphInvariants;
  const Module = require('module');
  const orig = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (String(id).includes('graph-invariants')) {
      throw new Error('simulated missing module');
    }
    return orig.apply(this, arguments);
  };
  try {
    delete globalThis.CcGraphInvariants;
    // Clear cached graph-invariants if any
    try { delete require.cache[require.resolve(giPath)]; } catch { /* */ }
    // Re-require validator path won't rebind function; test the fail-closed logic inline
    // by invoking with patched require - the already-loaded validateGraphInvariants uses
    // require('./graph-invariants.js') relative to validator — patch catches it.
    const result = validateGraphInvariants({ nodes: {}, edges: [], contexts: [] });
    ok(result.valid === false, 'missing module → valid:false');
    ok((result.errors || []).some((e) => /graph_invariants_unavailable/i.test(e)), 'error code graph_invariants_unavailable');
  } finally {
    Module.prototype.require = orig;
    if (saved) globalThis.CcGraphInvariants = saved;
    else delete globalThis.CcGraphInvariants;
  }
}

// When module loads, normal validation works
{
  const { validateGraphInvariants } = require(resolve(ROOT, 'apps/extension/perception/graph-invariants.js'));
  const r = validateGraphInvariants({
    contexts: [{ context_id: 'ctx.a', access: 'accessible' }],
    nodes: {
      'n.1': {
        node_id: 'n.1', kind: 'page', context_id: 'ctx.a', parent_id: null, order: 0,
        privacy: { classification: 'ordinary', redacted: false },
      },
    },
    edges: [],
  });
  ok(r.valid, 'loaded invariants accept minimal valid graph');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
