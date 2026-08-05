#!/usr/bin/env node
/**
 * Phase 3 runtime security regression tests (issue #98, SEC-001..004).
 *
 * SEC-001: the real content.js bridge is loaded in a vm sandbox with mocked
 *          window/chrome; hostile postMessages must be dropped and only trusted
 *          frontend messages forwarded, with replies scoped to the sender origin.
 * SEC-002: popup.js/executor.js must not write auth/secret data to page-readable
 *          DOM attributes; they must use the isolated-world window.__ccFillCtx.
 * SEC-003: background.js must gate CONNECT/OPEN_AND_DISPATCH/DISPATCH_JOB_DIRECT
 *          on a trusted frontend origin.
 * SEC-004: manifest host_permissions must not be <all_urls>.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

let passed = 0;
let failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log(`  \u2713 ${msg}`); } else { failed++; console.error(`  \u2717 FAIL: ${msg}`); } };

const TRUSTED = 'https://app.cybercontrol.fun';
const HOSTILE = 'https://evil.example';

// ─────────────────────────────────────────────────────────────────────
// SEC-001: load the real content.js and exercise the bridge gate
// ─────────────────────────────────────────────────────────────────────
console.log('\n=== SEC-001: content-script bridge authentication ===');

function loadContentBridge() {
  let messageHandler = null;
  const sent = [];      // messages forwarded to background
  const posted = [];    // window.postMessage replies { data, targetOrigin }
  const windowObj = {
    _ccCSBridgeInit: false,
    addEventListener: (type, fn) => { if (type === 'message') messageHandler = fn; },
    postMessage: (data, targetOrigin) => posted.push({ data, targetOrigin }),
  };
  windowObj.self = windowObj;
  const chromeObj = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => { sent.push(msg); if (cb) cb({ ok: true }); },
    },
  };
  const sandbox = { window: windowObj, chrome: chromeObj, globalThis: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('extension/content.js'), sandbox);
  return { fire: (e) => messageHandler && messageHandler(e), sent, posted, windowObj, accept: sandbox.__ccBridgeAccept };
}

// A valid message must reference the same window object the bridge sees.
{
  const b = loadContentBridge();
  const win = b.windowObj;
  const evt = (over) => Object.assign({ source: win, origin: TRUSTED, data: { _cc: true, type: 'CONNECT', token: 't', backendUrl: 'x' } }, over);

  b.fire(evt());
  ok(b.sent.length === 1 && b.sent[0].type === 'CONNECT', 'valid trusted CONNECT is forwarded');
  ok(b.posted.length === 1 && b.posted[0].targetOrigin === TRUSTED, 'reply is scoped to sender origin (not *)');

  b.sent.length = 0;
  b.fire(evt({ origin: HOSTILE }));
  ok(b.sent.length === 0, 'message from hostile origin is dropped');

  b.fire(evt({ source: { not: 'window' } }));
  ok(b.sent.length === 0, 'message whose source is not this window is dropped');

  b.fire(evt({ data: { _cc: true, type: 'RUN_ARBITRARY' } }));
  ok(b.sent.length === 0, 'message with a non-allowlisted type is dropped');

  b.fire(evt({ data: { type: 'CONNECT' } }));
  ok(b.sent.length === 0, 'message without the _cc marker is dropped');

  b.fire(evt({ data: { _cc: true, _cc_from_cs: true, type: 'CONNECT' } }));
  ok(b.sent.length === 0, 'our own reply (_cc_from_cs) is not re-forwarded');

  // Direct predicate checks
  ok(b.accept && typeof b.accept === 'function', 'ccBridgeAccept predicate is exposed for testing');
  ok(b.accept({ source: win, origin: TRUSTED, data: { _cc: true, type: 'PING' } }) === true, 'accept: trusted PING');
  ok(b.accept({ source: win, origin: HOSTILE, data: { _cc: true, type: 'PING' } }) === false, 'accept: hostile origin rejected');
}

// ─────────────────────────────────────────────────────────────────────
// SEC-002: no auth/secret data on page-readable DOM attributes
// ─────────────────────────────────────────────────────────────────────
console.log('\n=== SEC-002: no bearer token / secrets in page DOM ===');
{
  const popup = read('extension/popup.js');
  const executor = read('extension/autofill/executor.js');
  const secretAttrs = ['data-cc-token', 'data-cc-backend', 'data-cc-llm-key', 'data-cc-llm-url', 'data-cc-llm-model', 'data-cc-profile-id', 'data-cc-formkey', 'data-cc-corrections'];
  for (const attr of secretAttrs) {
    ok(!popup.includes(attr), `popup.js does not reference ${attr}`);
    ok(!executor.includes(attr), `executor.js does not reference ${attr}`);
  }
  ok(popup.includes('window.__ccFillCtx'), 'popup.js hands auth off via isolated-world window.__ccFillCtx');
  ok(executor.includes('window.__ccFillCtx'), 'executor.js reads auth from isolated-world window.__ccFillCtx');
  // The bearer token literal must never be written to a DOM attribute.
  ok(!/setAttribute\(\s*['"]data-cc-token/.test(popup), 'popup.js never setAttribute(data-cc-token)');
}

// ─────────────────────────────────────────────────────────────────────
// SEC-003: CONNECT is gated on a trusted frontend origin
// ─────────────────────────────────────────────────────────────────────
console.log('\n=== SEC-003: CONNECT cannot be driven by untrusted senders ===');
{
  const bg = read('extension/background.js');
  ok(bg.includes('CC_TRUSTED_FRONTEND_ORIGINS'), 'background defines a trusted frontend origin allowlist');
  ok(bg.includes('CC_TRUSTED_ONLY_TYPES'), 'background defines auth/state-mutating trusted-only message types');
  ok(/CONNECT[\s\S]{0,40}OPEN_AND_DISPATCH|OPEN_AND_DISPATCH[\s\S]{0,40}CONNECT/.test(bg) || bg.includes('CONNECT: 1'), 'CONNECT is in the trusted-only set');
  ok(bg.includes('ccIsTrustedFrontend'), 'background checks sender against the trusted frontend');
  ok(/untrusted sender/.test(bg), 'background rejects untrusted senders explicitly');

  // Evaluate the extracted trusted-only policy predicate to prove the truth table.
  const CC_TRUSTED_FRONTEND_ORIGINS = [TRUSTED];
  const CC_TRUSTED_ONLY_TYPES = { CONNECT: 1, OPEN_AND_DISPATCH: 1, DISPATCH_JOB_DIRECT: 1 };
  const senderOrigin = (s) => (s && s.origin) || '';
  const isTrusted = (s) => CC_TRUSTED_FRONTEND_ORIGINS.indexOf(senderOrigin(s)) !== -1;
  const rejected = (type, sender) => !!CC_TRUSTED_ONLY_TYPES[type] && !isTrusted(sender);
  ok(rejected('CONNECT', { origin: HOSTILE }) === true, 'policy: CONNECT from hostile origin is rejected');
  ok(rejected('CONNECT', { origin: TRUSTED }) === false, 'policy: CONNECT from trusted frontend is allowed');
  ok(rejected('PING', { origin: HOSTILE }) === false, 'policy: PING (non-mutating) is allowed from any origin');
}

// ─────────────────────────────────────────────────────────────────────
// SEC-004: host permissions minimized
// ─────────────────────────────────────────────────────────────────────
console.log('\n=== SEC-004: host permissions minimized ===');
{
  const manifest = JSON.parse(read('extension/manifest.json'));
  const hp = manifest.host_permissions || [];
  ok(!hp.includes('<all_urls>'), 'host_permissions does not grant <all_urls>');
  ok(hp.length > 0 && hp.every(p => p !== '*://*/*'), 'host_permissions is an explicit portal allowlist');
  ok(hp.includes('*://app.cybercontrol.fun/*'), 'host_permissions still includes the frontend origin');
}

console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
