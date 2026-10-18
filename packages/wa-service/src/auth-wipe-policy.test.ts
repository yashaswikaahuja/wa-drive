import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isHardDesync, isSoftCrypto, shouldWipeAuthKeys } from './auth-wipe-policy.ts';

test('timeouts and soft decrypt never wipe the saved login', () => {
  assert.equal(shouldWipeAuthKeys({ loggedOut: false, hardDesync: false }), false);
  assert.equal(isHardDesync('Connection Terminated'), false);
  assert.equal(isHardDesync('408'), false);
  assert.equal(isSoftCrypto('failed to decrypt message'), true);
  assert.equal(isHardDesync('failed to decrypt message'), false);
  assert.equal(isSoftCrypto('No matching sessions found'), true);
});

test('logout and hard future-offset are the only wipes', () => {
  assert.equal(shouldWipeAuthKeys({ loggedOut: true, hardDesync: false }), true);
  assert.equal(
    shouldWipeAuthKeys({
      loggedOut: false,
      hardDesync: isHardDesync('SessionError: Over 2000 messages into the future'),
    }),
    true,
  );
});

test('session source cannot wipe auth after N reconnects or soft decrypt', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'session.ts'), 'utf8');
  assert.doesNotMatch(src, /nextAttempt\s*>=\s*3/);
  assert.match(src, /shouldWipeAuthKeys/);
  assert.doesNotMatch(src, /failed to decrypt message\|invalidmessageexception\|bad mac\|signal\.\*desync\|desync/i);
  const wipeCalls = src.split('await clearPostgresAuthState').length - 1;
  assert.equal(wipeCalls, 3, `await clearPostgresAuthState appears ${wipeCalls} times`);
  assert.doesNotMatch(src, /softRestartWhileConnected/);
  assert.doesNotMatch(src, /syncFullHistory:\s*true/);
  assert.match(src, /isSocketLive/);
  assert.match(src, /Replacing dead socket/);
  assert.match(src, /historyAfterSec/);
  assert.match(src, /ephemeralMessage/);
  assert.match(src, /getMessage:/);
  assert.doesNotMatch(src, /shouldSyncHistoryMessage:\s*\(\)\s*=>\s*false/);
});
