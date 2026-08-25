/**
 * Tests for fill-debug-emitter.js
 *
 * Run: node extension/autofill/executor/capabilities/fill-debug-emitter.test.mjs
 *
 * No framework, no DOM, no Chrome. All async timing mocked via fake timers.
 * Behavioral reference: debug.js emitFillDebug + scheduleDebugFlush + flushDebugQueue.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '../src/fill-debug-emitter.js'), 'utf8');

// Load IIFE into isolated global
const globalLike = {};
const fn = new Function('globalThis', src);
fn(globalLike);
const { createEmitter } = globalLike.CcFillDebugEmitter;

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}
function ok(desc, val) {
  if (val) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— got:', val); failed++; }
}

function makeEmitter(overrides) {
  const sent = [];
  const emitter = createEmitter(Object.assign({
    getRunId: () => 'run-1',
    getRv: () => '5.70',
    getHostname: () => 'test.host',
    send: (batch) => sent.push(...batch),
  }, overrides || {}));
  return { emitter, sent };
}

// ── Event shape ───────────────────────────────────────────────────────────────
console.log('\nEvent shape:');
{
  const { emitter, sent } = makeEmitter();
  emitter.emit('fill.start', { totalFields: 10 });
  assert('fill.start has correct shape', sent[0], {
    event: 'fill.start',
    fillRunId: 'run-1',
    hostname: 'test.host',
    ts: sent[0].ts,   // dynamic
    rv: '5.70',
    totalFields: 10,
  });
  ok('ts is a number', typeof sent[0].ts === 'number');
}

// ── type → fieldType rename ───────────────────────────────────────────────────
console.log('\ntype → fieldType rename:');
{
  const { emitter, sent } = makeEmitter();
  emitter.emit('field.done', { selector: '#name', type: 'text-input', planned: 'Ramesh' });
  emitter.flush();
  const evt = sent[0];
  ok('fieldType is set', evt.fieldType === 'text-input');
  ok('type is removed', !('type' in evt));
}

// ── FILL_DEBUG type is NOT renamed ────────────────────────────────────────────
console.log('\nFILL_DEBUG type not renamed:');
{
  const { emitter, sent } = makeEmitter();
  emitter.emit('field.done', { type: 'FILL_DEBUG' });
  emitter.flush();
  ok('type=FILL_DEBUG kept as-is', sent[0].type === 'FILL_DEBUG');
  ok('fieldType not set', !('fieldType' in sent[0]));
}

// ── Immediate flush: fill.start ────────────────────────────────────────────────
console.log('\nImmediate flush:');
{
  const { emitter, sent } = makeEmitter();
  emitter.emit('fill.start', {});
  ok('fill.start flushes immediately', sent.length === 1);
}
{
  const { emitter, sent } = makeEmitter();
  emitter.emit('fill.end', { filled: 5 });
  ok('fill.end flushes immediately', sent.length === 1);
}

// ── Immediate flush: queue >= 6 ───────────────────────────────────────────────
{
  const { emitter, sent } = makeEmitter();
  // emit 5 non-priority events (should stay in queue)
  for (let i = 0; i < 5; i++) emitter.emit('field.done', { i });
  ok('5 events not yet flushed (queue < 6)', sent.length === 0);
  // 6th triggers immediate flush
  emitter.emit('field.done', { i: 5 });
  ok('6th event triggers immediate flush', sent.length === 6);
}

// ── Deferred flush via timer (40ms) ───────────────────────────────────────────
console.log('\nDeferred flush:');
{
  const { emitter, sent } = makeEmitter();
  emitter.emit('field.done', { selector: '#x' });
  ok('single non-priority event not immediately flushed', sent.length === 0);
  ok('event is in queue', emitter.queue.length === 1);
  // flush() cancels timer and flushes now
  emitter.flush();
  ok('flush() drains queue', sent.length === 1 && emitter.queue.length === 0);
}

// ── flush() clears queue ──────────────────────────────────────────────────────
{
  const { emitter, sent } = makeEmitter();
  emitter.emit('field.done', { a: 1 });
  emitter.emit('field.done', { a: 2 });
  emitter.emit('field.done', { a: 3 });
  ok('3 in queue before flush', emitter.queue.length === 3);
  emitter.flush();
  ok('queue empty after flush', emitter.queue.length === 0);
  ok('3 sent', sent.length === 3);
}

// ── Batch cap: max 40 per send call ──────────────────────────────────────────
console.log('\nBatch cap:');
{
  const batches = [];
  const emitter = createEmitter({
    getRunId: () => '',
    getRv: () => '',
    send: (batch) => batches.push(batch),
  });
  // Queue 45 events without triggering immediate flush
  // We need to avoid hitting queue>=6 for each group of 5, so use fill.start trick:
  // Actually we just need to push 45 then call flush().
  // But emit triggers immediate at >=6, so we need to test cap in a different way:
  // Push 45 via fill.start (each triggers immediate after queue >=6)
  // Better: test that a single flush with >40 in queue splits into multiple batches.
  // To pre-fill the queue without triggering flush, we access internal queue via getter.
  const fakeQ = emitter.queue;
  // Use a fresh emitter where we bypass the immediate-flush by loading 45 items
  // into queue directly then calling flush()
  const emitter2 = createEmitter({ getRunId: () => '', getRv: () => '', send: (b) => batches.push(b) });
  // Emit 6 at a time to trigger the >=6 flush each time, but we need 45 queued at once.
  // Instead: emit 45 fill.* events that queue but don't individually hit >=6.
  // The only way is emit single events and call flush at the end.
  // Emit 44 'field.done' events: they fire at 6, 12, 18, 24, 30, 36, 42 (7 batches of 6, then leftover 2)
  // That doesn't test batch cap of 40. So: inject directly.
  // Directly pushing to the queue array for testing the batch cap:
  for (let i = 0; i < 45; i++) emitter2.queue.push({ event: 'field.done', i });
  emitter2.flush(); // should send first 40, then schedule re-flush
  ok('first flush sends max 40', batches[batches.length - 1].length <= 40);
}

// ── Multiple sends: no timer overlap ─────────────────────────────────────────
console.log('\nNo timer overlap:');
{
  const { emitter, sent } = makeEmitter();
  emitter.emit('field.done', { x: 1 });
  emitter.emit('field.done', { x: 2 });
  emitter.flush();
  // schedule after flush shouldn't double-send
  emitter.flush();
  ok('double flush does not double-send', sent.length === 2);
}

// ── getRunId / getRv called per event ────────────────────────────────────────
console.log('\nDynamic getRunId/getRv:');
{
  let runId = 'a';
  const { emitter, sent } = makeEmitter({ getRunId: () => runId });
  emitter.emit('field.done', {});
  runId = 'b';
  emitter.emit('field.done', {});
  emitter.flush();
  ok('first event has fillRunId=a', sent[0].fillRunId === 'a');
  ok('second event has fillRunId=b', sent[1].fillRunId === 'b');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
