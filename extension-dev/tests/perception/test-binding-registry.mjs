#!/usr/bin/env node
/**
 * Unit tests for extension/perception/binding-registry.js
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const { BindingRegistry } = require(resolve(ROOT, 'extension/perception/binding-registry.js'));

let passed = 0;
let failed = 0;
function ok(cond, msg) { if (cond) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.error(`  ✗ FAIL: ${msg}`); } }
function equal(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + (JSON.stringify(a) === JSON.stringify(b) ? '' : ` (got ${JSON.stringify(a)})`)); }

console.log('\n=== Binding Registry ===');
{
  const reg = new BindingRegistry();

  // bind + resolve round-trip
  const el1 = { tagName: 'INPUT', id: 'name' };
  reg.bind('ctx1', 'node1', el1, 'adapter-text', 0);
  const entry = reg.resolve('ctx1', 'node1');
  ok(entry !== null, 'resolve returns entry after bind');
  ok(entry.liveNodeReference === el1, 'liveNodeReference is the original element');
  ok(entry.bindingGeneration === 1, 'initial bindingGeneration is 1');
  equal(entry.adapterId, 'adapter-text', 'adapterId stored correctly');
  equal(entry.createdRevision, 0, 'createdRevision stored correctly');

  // resolve missing key
  ok(reg.resolve('ctx1', 'nonexistent') === null, 'resolve missing node returns null');
  ok(reg.resolve('ctx_missing', 'node1') === null, 'resolve missing context returns null');

  // getGeneration
  equal(reg.getGeneration('ctx1', 'node1'), 1, 'getGeneration returns current generation');
  equal(reg.getGeneration('ctx1', 'missing'), 0, 'getGeneration returns 0 for missing');

  // rebind increments generation
  const el2 = { tagName: 'INPUT', id: 'name-v2' };
  reg.rebind('ctx1', 'node1', el2);
  ok(reg.resolve('ctx1', 'node1').liveNodeReference === el2, 'rebind updates element');
  equal(reg.getGeneration('ctx1', 'node1'), 2, 'rebind increments bindingGeneration');

  // upsert: same element keeps generation; replacement advances
  const touch = reg.upsert('ctx1', 'node1', el2, 'adapter-text', 5);
  ok(touch.action === 'touched', 'upsert same element is touch');
  equal(reg.getGeneration('ctx1', 'node1'), 2, 'upsert same element keeps generation');
  equal(reg.resolve('ctx1', 'node1').createdRevision, 5, 'upsert same element updates createdRevision');
  const el3 = { tagName: 'INPUT', id: 'name-v3' };
  const rebound = reg.upsert('ctx1', 'node1', el3, 'adapter-text', 6);
  ok(rebound.action === 'rebound', 'upsert different element is rebind');
  equal(reg.getGeneration('ctx1', 'node1'), 3, 'upsert replacement advances generation 2→3');
  const freshEl = { tagName: 'INPUT', id: 'fresh' };
  const bound = reg.upsert('ctx1', 'node-new', freshEl, null, 6);
  ok(bound.action === 'bound' && bound.bindingGeneration === 1, 'upsert new node binds at generation 1');

  // rebind non-existent throws
  let threw = false;
  try { reg.rebind('ctx1', 'ghost', {}); } catch { threw = true; }
  ok(threw, 'rebind on non-existent binding throws');

  // multiple contexts are isolated
  reg.bind('ctx2', 'nodeA', { id: 'a' }, null, 1);
  reg.bind('ctx2', 'nodeB', { id: 'b' }, null, 1);
  // ctx1: node1 + node-new from upsert tests; ctx2: nodeA + nodeB
  equal(reg.size, 4, 'size is 4 after adding to second context');

  // invalidateContext removes only that context
  reg.invalidateContext('ctx2');
  ok(reg.resolve('ctx2', 'nodeA') === null, 'ctx2 entries removed');
  ok(reg.resolve('ctx1', 'node1') !== null, 'ctx1 entries preserved');
  equal(reg.size, 2, 'size is 2 after invalidateContext (ctx1 remains)');

  // invalidateNode
  reg.bind('ctx1', 'node2', { id: 'n2' }, null, 2);
  reg.invalidateNode('ctx1', 'node2');
  ok(reg.resolve('ctx1', 'node2') === null, 'invalidateNode removes specific binding');
  ok(reg.resolve('ctx1', 'node1') !== null, 'other bindings in same context preserved');

  // invalidateAll
  reg.bind('ctx3', 'n1', {}, null, 3);
  reg.invalidateAll();
  equal(reg.size, 0, 'invalidateAll clears everything');

  // entries() iterator
  reg.bind('ctx4', 'a', {}, null, 0);
  reg.bind('ctx4', 'b', {}, null, 0);
  const all = [...reg.entries()];
  equal(all.length, 2, 'entries() yields all bindings');
  ok(all.every((e) => e.contextId === 'ctx4'), 'entries() includes contextId');

  // serialization prohibited
  let jsonThrew = false;
  try { JSON.stringify(reg); } catch { jsonThrew = true; }
  ok(jsonThrew, 'JSON.stringify(registry) throws');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
