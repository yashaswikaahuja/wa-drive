/**
 * Tests for ng-session-manager.js
 *
 * Run: node extension/autofill/executor/capabilities/ng-session-manager.test.mjs
 *
 * Pure JS — no DOM, no framework. Timer functions mocked inline.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '../src/ng-session-manager.js'), 'utf8');

const globalLike = {};
new Function('globalThis', src)(globalLike);
const { cancelSession, createSession, cleanupSession } = globalLike.CcNgSessionManager;

let passed = 0, failed = 0;
function ok(desc, val) {
  if (val) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— got:', val); failed++; }
}
function is(desc, actual, expected) {
  const v = actual === expected;
  if (v) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— expected:', expected, 'got:', actual); failed++; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeSession(overrides) {
  let intervalCleared = false;
  let timeoutsCleared = [];
  let observerDisconnected = false;

  const session = Object.assign({
    id: 'test01',
    fieldKey: 'label',
    resolved: false,
    cancelled: false,
    pollTimer: 99,
    timeoutIds: [1, 2, 3],
    observer: {
      disconnect: () => { observerDisconnected = true; }
    },
    startedAt: Date.now(),
  }, overrides);

  return { session, intervalCleared: () => intervalCleared, timeoutsCleared: () => timeoutsCleared, observerDisconnected: () => observerDisconnected };
}

// Patch global timer functions for testing
const _clearInterval = clearInterval;
const _clearTimeout = clearTimeout;

// ── cancelSession ─────────────────────────────────────────────────────────────
console.log('\ncancelSession:');
{
  const sessions = new Map();
  const { session } = makeSession();
  sessions.set('field1', session);

  let clearedIntervals = [], clearedTimeouts = [];
  global.clearInterval = (id) => clearedIntervals.push(id);
  global.clearTimeout = (id) => clearedTimeouts.push(id);

  cancelSession('field1', sessions);

  ok('session marked cancelled', session.cancelled === true);
  ok('pollTimer cleared', clearedIntervals.includes(99));
  ok('all timeoutIds cleared', clearedTimeouts.length === 3);
  ok('observer disconnected', session.observer === null);
  ok('session removed from store', !sessions.has('field1'));

  global.clearInterval = _clearInterval;
  global.clearTimeout = _clearTimeout;
}

// no-op when session not in map
{
  const sessions = new Map();
  cancelSession('nonexistent', sessions); // should not throw
  ok('no-op for missing label', true);
}

// no-op when sessions is null
{
  cancelSession('x', null); // should not throw
  ok('no-op for null sessions', true);
}

// no-op when sessions is undefined
{
  cancelSession('x', undefined);
  ok('no-op for undefined sessions', true);
}

// ── cancelSession: null observer ──────────────────────────────────────────────
{
  const sessions = new Map();
  const { session } = makeSession({ observer: null, pollTimer: null, timeoutIds: [] });
  sessions.set('f', session);

  global.clearInterval = () => {};
  global.clearTimeout = () => {};

  cancelSession('f', sessions);
  ok('null observer handled gracefully', !sessions.has('f'));

  global.clearInterval = _clearInterval;
  global.clearTimeout = _clearTimeout;
}

// ── createSession ─────────────────────────────────────────────────────────────
console.log('\ncreateSession:');
{
  const sessions = new Map();
  const s = createSession('my-label', sessions);

  ok('session added to store', sessions.has('my-label'));
  ok('session is same reference', sessions.get('my-label') === s);
  is('fieldKey set', s.fieldKey, 'my-label');
  ok('id is non-empty string', typeof s.id === 'string' && s.id.length > 0);
  ok('resolved is false', s.resolved === false);
  ok('cancelled is false', s.cancelled === false);
  ok('pollTimer is null', s.pollTimer === null);
  ok('timeoutIds is empty array', Array.isArray(s.timeoutIds) && s.timeoutIds.length === 0);
  ok('observer is null', s.observer === null);
  ok('startedAt is a number', typeof s.startedAt === 'number' && s.startedAt > 0);
}

// two sessions have different ids
{
  const sessions = new Map();
  const a = createSession('a', sessions);
  const b = createSession('b', sessions);
  ok('different labels produce different sessions', a !== b);
  ok('second session in store', sessions.has('b'));
}

// ── cleanupSession ────────────────────────────────────────────────────────────
console.log('\ncleanupSession:');
{
  const sessions = new Map();
  const { session } = makeSession();
  sessions.set('f2', session);

  let clearedIntervals = [], clearedTimeouts = [];
  global.clearInterval = (id) => clearedIntervals.push(id);
  global.clearTimeout = (id) => clearedTimeouts.push(id);

  cleanupSession(session, sessions, 'f2');

  ok('pollTimer cleared', clearedIntervals.includes(99));
  ok('timeoutIds cleared', clearedTimeouts.length === 3);
  ok('observer disconnected', session.observer === null);
  ok('session removed from store', !sessions.has('f2'));

  global.clearInterval = _clearInterval;
  global.clearTimeout = _clearTimeout;
}

// cleanupSession without store (session-internal cleanup only)
{
  const { session } = makeSession({ observer: null, pollTimer: null, timeoutIds: [] });
  global.clearInterval = () => {};
  global.clearTimeout = () => {};

  cleanupSession(session, null, undefined); // should not throw
  ok('cleanupSession with null store does not throw', true);

  global.clearInterval = _clearInterval;
  global.clearTimeout = _clearTimeout;
}

// ── cancelSession cancels the correct session only ────────────────────────────
console.log('\nIsolation:');
{
  const sessions = new Map();
  const s1 = createSession('field-A', sessions);
  const s2 = createSession('field-B', sessions);

  global.clearInterval = () => {};
  global.clearTimeout = () => {};

  cancelSession('field-A', sessions);

  ok('field-A removed', !sessions.has('field-A'));
  ok('field-B untouched', sessions.has('field-B'));
  ok('s1 cancelled', s1.cancelled === true);
  ok('s2 not cancelled', s2.cancelled === false);

  global.clearInterval = _clearInterval;
  global.clearTimeout = _clearTimeout;
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
