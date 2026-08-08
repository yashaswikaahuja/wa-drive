#!/usr/bin/env node
/**
 * Unit tests for extension/perception/canonical-hash.js
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const { canonicalize, computeCanonicalHash, VOLATILE_FIELDS } = require(resolve(ROOT, 'extension/perception/canonical-hash.js'));

let passed = 0;
let failed = 0;
function ok(cond, msg) { if (cond) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.error(`  ✗ FAIL: ${msg}`); } }

console.log('\n=== Canonical Hash ===');
{
  // Sorted keys
  const a = canonicalize({ z: 1, a: 2, m: 3 }, false);
  ok(a === '{"a":2,"m":3,"z":1}', 'keys sorted alphabetically');

  // Nested objects sorted
  const b = canonicalize({ outer: { z: 'last', a: 'first' } }, false);
  ok(b === '{"outer":{"a":"first","z":"last"}}', 'nested keys also sorted');

  // Arrays preserve order
  const c = canonicalize([3, 1, 2], false);
  ok(c === '[3,1,2]', 'array order preserved');

  // null / boolean / number
  ok(canonicalize(null, false) === 'null', 'null');
  ok(canonicalize(true, false) === 'true', 'true');
  ok(canonicalize(42.5, false) === '42.5', 'number');
  ok(canonicalize(Infinity, false) === 'null', 'Infinity → null');

  // Strings escaped properly
  ok(canonicalize('hello "world"', false) === '"hello \\"world\\""', 'string escaping');

  // Volatile fields excluded at root
  const snapshot = { snapshot_id: 'x', observed_at: 'y', revision: 5, canonical_hash: 'z', kind: 'page_snapshot', nodes: {} };
  const rootCanon = canonicalize(snapshot, true);
  ok(!rootCanon.includes('snapshot_id'), 'snapshot_id excluded from root canonical');
  ok(!rootCanon.includes('observed_at'), 'observed_at excluded');
  ok(!rootCanon.includes('"revision"'), 'revision excluded');
  ok(!rootCanon.includes('canonical_hash'), 'canonical_hash excluded');
  ok(rootCanon.includes('"kind"'), 'non-volatile fields preserved');

  // Volatile fields kept in nested objects
  const nested = { data: { revision: 99 } };
  const nestedCanon = canonicalize(nested, true);
  ok(nestedCanon.includes('"revision":99'), 'nested "revision" preserved (not root)');

  // Same content, different property order → same canonical
  const obj1 = { b: 1, a: 2, c: { z: 3, x: 4 } };
  const obj2 = { c: { x: 4, z: 3 }, a: 2, b: 1 };
  ok(canonicalize(obj1, false) === canonicalize(obj2, false), 'property order irrelevant');

  // computeCanonicalHash output format
  const hash = await computeCanonicalHash({ kind: 'page_snapshot', nodes: {} });
  ok(/^sha256:[a-f0-9]{64}$/.test(hash), 'hash matches sha256:<64hex> format');

  // Same content → same hash
  const h1 = await computeCanonicalHash({ kind: 'page_snapshot', nodes: { a: 1 } });
  const h2 = await computeCanonicalHash({ kind: 'page_snapshot', nodes: { a: 1 } });
  ok(h1 === h2, 'identical content → identical hash');

  // Different content → different hash
  const h3 = await computeCanonicalHash({ kind: 'page_snapshot', nodes: { a: 2 } });
  ok(h1 !== h3, 'different content → different hash');

  // Volatile fields don't change the hash
  const base = { kind: 'page_snapshot', nodes: { x: 1 } };
  const withVolatile = { ...base, snapshot_id: 'snap1', observed_at: '2026-01-01T00:00:00Z', revision: 42, canonical_hash: 'sha256:0000' };
  const hBase = await computeCanonicalHash(base);
  const hVol = await computeCanonicalHash(withVolatile);
  ok(hBase === hVol, 'volatile fields do not affect hash');

  // VOLATILE_FIELDS set is correct
  ok(VOLATILE_FIELDS.has('snapshot_id'), 'VOLATILE_FIELDS includes snapshot_id');
  ok(VOLATILE_FIELDS.has('canonical_hash'), 'VOLATILE_FIELDS includes canonical_hash');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
