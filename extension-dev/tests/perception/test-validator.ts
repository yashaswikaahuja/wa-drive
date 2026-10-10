#!/usr/bin/env node
/**
 * Unit tests for apps/extension/perception/validator.js
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const { initValidator, validateSnapshot, validateDelta, isInitialized } = require(resolve(ROOT, 'apps/extension/perception/validator.js'));

let passed = 0;
let failed = 0;
function ok(cond, msg) { if (cond) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.error(`  ✗ FAIL: ${msg}`); } }

console.log('\n=== Page IR Validator ===');

// Initialize
await initValidator({
  schemaPath: resolve(ROOT, 'architecture/page-ir.schema.json'),
  ajvPath: resolve(ROOT, 'extension-dev/tests/ratification/node_modules'),
});
ok(isInitialized(), 'validator initialized successfully');

// Minimal valid snapshot
const validSnapshot = {
  kind: 'page_snapshot',
  schema_version: '2.0.0',
  producer: { name: 'cybercontrol-browser-perception', version: '1.0.0', detectors: { test: 'v1' } },
  snapshot_id: 'snap.test.1.abc',
  document_id: 'doc.test.1.xyz',
  revision: 0,
  observed_at: new Date().toISOString(),
  canonical_hash: 'sha256:' + '0'.repeat(64),
  page: { origin: 'https://example.com', path: '/', route_key: null, title: 'Test', language: 'en', viewport: { width: 1280, height: 720, device_pixel_ratio: 1, scroll_x: 0, scroll_y: 0 } },
  contexts: [{ context_id: 'ctx.top', parent_context_id: null, kind: 'top_level', document_id: 'doc.test.1.xyz', origin: 'https://example.com', access: 'accessible', root_node_id: 'page.root', diagnostic_code: null }],
  nodes: {
    'page.root': {
      node_id: 'page.root', kind: 'page', context_id: 'ctx.top', parent_id: null, order: 0,
      observed: { accessible_name: 'Test Page', role: 'document', sanitized_text: null, language: 'en', description: null, value_state: 'not_applicable' },
      state: { visible: true, enabled: true, readonly: false, required: false, focused: false, expanded: null, selected: null, checked: null },
      geometry: null,
      privacy: { classification: 'public', redacted: false, reason: null },
      evidence: [{ source: 'observed', detector: 'dom-gateway', detector_version: '1.0.0', confidence: 1, facts: ['document root'] }],
      affordances: [],
      widget: null,
    },
  },
  edges: [],
  state: { signals: [], candidates: [] },
  diagnostics: [],
  privacy: { classification: 'public', redacted: false, reason: null },
};

{
  const result = validateSnapshot(validSnapshot);
  ok(result.valid === true, 'valid minimal snapshot passes validation');
  ok(result.errors === null, 'no errors on valid snapshot');
}

// Missing required field
{
  const broken = { ...validSnapshot };
  delete broken.canonical_hash;
  const result = validateSnapshot(broken);
  ok(result.valid === false, 'missing canonical_hash fails validation');
  ok(result.errors && result.errors.length > 0, 'errors array is non-empty');
}

// Wrong kind
{
  const wrongKind = { ...validSnapshot, kind: 'page_delta' };
  const result = validateSnapshot(wrongKind);
  ok(result.valid === false, 'wrong kind fails (page_delta is not a PageSnapshot match)');
}

// Invalid identifier pattern
{
  const badId = JSON.parse(JSON.stringify(validSnapshot));
  badId.snapshot_id = '123-invalid'; // starts with digit
  const result = validateSnapshot(badId);
  ok(result.valid === false, 'invalid Identifier pattern fails');
}

// Extra field (additionalProperties)
{
  const extra = JSON.parse(JSON.stringify(validSnapshot));
  extra.nodes['page.root'].selector = '#root'; // forbidden extra field
  const result = validateSnapshot(extra);
  ok(result.valid === false, 'extra field (selector) on node fails additionalProperties');
}

// Secret node violating redaction
{
  const secretBad = JSON.parse(JSON.stringify(validSnapshot));
  secretBad.nodes['page.root'].privacy = { classification: 'secret', redacted: false, reason: null };
  const result = validateSnapshot(secretBad);
  ok(result.valid === false, 'secret node with redacted:false fails schema conditional');
}

// validateDelta works (basic)
{
  let threw = false;
  try { validateDelta({ kind: 'page_delta' }); } catch { threw = true; }
  ok(!threw, 'validateDelta does not throw on minimal input');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
