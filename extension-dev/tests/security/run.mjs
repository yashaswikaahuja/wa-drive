#!/usr/bin/env node
/**
 * CHECK-011: Permanent Extension & Browser Boundary Security Regression Suite.
 *
 * This suite is intentionally independent from issue-specific verification and
 * must remain a required CI job. Every fixed extension/browser security defect
 * should add a regression here (or in a child suite invoked here) before its
 * issue is closed.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
const TRUSTED = 'https://app.cybercontrol.fun';
const HOSTILE = 'https://evil.example';
const TOKEN = 'sentinel-access-token-never-exfiltrate';
const BACKEND = 'https://evil-backend.example';

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}
function equal(actual, expected, message) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${message}${JSON.stringify(actual) === JSON.stringify(expected) ? '' : ` (actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)})`}`);
}
function jsonHasSecret(value) {
  const text = JSON.stringify(value);
  return text.includes(TOKEN) || text.includes(BACKEND);
}
function walkFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) files.push(...walkFiles(path));
    else files.push(path);
  }
  return files;
}

// ────────────────────────────────────────────────────────────────────────────
// SEC-001: real content.js bridge — hostile postMessage payloads fail closed
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== SEC-001: hostile postMessage payloads fail closed ===');
function loadContentBridge(backgroundResponse = { ok: true, version: 'test' }) {
  let messageHandler = null;
  const sent = [];
  const posted = [];
  const windowObj = {
    _ccCSBridgeInit: false,
    addEventListener(type, fn) { if (type === 'message') messageHandler = fn; },
    postMessage(data, targetOrigin) { posted.push({ data, targetOrigin }); },
  };
  windowObj.self = windowObj;
  const chromeObj = {
    runtime: {
      lastError: null,
      sendMessage(msg, cb) { sent.push(msg); cb?.(backgroundResponse); },
    },
  };
  const sandbox = { window: windowObj, chrome: chromeObj, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('extension/content.js'), sandbox, { filename: 'extension/content.js' });
  return {
    fire(event) { messageHandler?.(event); },
    sent,
    posted,
    windowObj,
    accept: sandbox.__ccBridgeAccept,
  };
}

{
  const bridge = loadContentBridge();
  const valid = (overrides = {}) => ({
    source: bridge.windowObj,
    origin: TRUSTED,
    data: { _cc: true, type: 'CONNECT', token: TOKEN, backendUrl: BACKEND, _reqId: 'req-1' },
    ...overrides,
  });

  bridge.fire(valid());
  ok(bridge.sent.length === 1 && bridge.sent[0].type === 'CONNECT', 'trusted CONNECT reaches extension runtime');
  ok(!('_cc' in bridge.sent[0]) && !('_reqId' in bridge.sent[0]), 'bridge control fields are stripped before dispatch');
  ok(bridge.posted.length === 1 && bridge.posted[0].targetOrigin === TRUSTED, 'reply is scoped to the exact sender origin');
  ok(bridge.posted.every((entry) => entry.targetOrigin !== '*'), 'bridge never broadcasts replies with *');

  const hostileCases = [
    ['hostile origin', { origin: HOSTILE }],
    ['trusted-origin prefix spoof', { origin: 'https://app.cybercontrol.fun.evil.example' }],
    ['trusted host over HTTP', { origin: 'http://app.cybercontrol.fun' }],
    ['trusted host on alternate port', { origin: 'https://app.cybercontrol.fun:444' }],
    ['foreign window source', { source: {} }],
    ['missing source', { source: null }],
    ['missing marker', { data: { type: 'CONNECT', token: TOKEN, backendUrl: BACKEND } }],
    ['false marker', { data: { _cc: false, type: 'CONNECT', token: TOKEN, backendUrl: BACKEND } }],
    ['self-reply marker', { data: { _cc: true, _cc_from_cs: true, type: 'CONNECT', token: TOKEN, backendUrl: BACKEND } }],
    ['unknown type', { data: { _cc: true, type: 'RUN_ARBITRARY', token: TOKEN, backendUrl: BACKEND } }],
    ['missing payload', { data: null }],
    ['primitive payload', { data: 'CONNECT' }],
  ];
  for (const [name, override] of hostileCases) {
    const sentBefore = bridge.sent.length;
    const postedBefore = bridge.posted.length;
    bridge.fire(valid(override));
    ok(bridge.sent.length === sentBefore, `${name} is not forwarded`);
    ok(bridge.posted.length === postedBefore, `${name} receives no extension response`);
  }

  ok(typeof bridge.accept === 'function', 'real bridge acceptance predicate is testable');
  const allowedTypes = ['CONNECT', 'PING', 'OPEN_AND_DISPATCH', 'DISPATCH_JOB', 'DISPATCH_JOB_DIRECT', 'CONTENT_READY', 'GET_TAB_ID', 'AUTOFILL_TRIGGER', 'TEACH_JOB'];
  for (const type of allowedTypes) {
    ok(bridge.accept({ source: bridge.windowObj, origin: TRUSTED, data: { _cc: true, type } }) === true, `trusted ${type} remains explicitly allowlisted`);
    ok(bridge.accept({ source: bridge.windowObj, origin: HOSTILE, data: { _cc: true, type } }) === false, `hostile ${type} remains rejected`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SEC-003: execute real background listeners; CONNECT cannot overwrite state
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== SEC-003: CONNECT overwrite and token exfiltration resistance ===');
function loadBackground() {
  const listeners = new Map();
  const storage = {
    accessToken: 'original-token',
    refreshToken: 'original-refresh',
    backendUrl: 'https://api.cybercontrol.fun',
    user: { id: 'original-user' },
  };

  const addListener = (path, fn) => {
    const list = listeners.get(path) || [];
    list.push(fn);
    listeners.set(path, list);
  };
  const selectStorage = (keys) => {
    if (keys == null) return { ...storage };
    if (typeof keys === 'string') return { [keys]: storage[keys] };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, storage[key]]));
    return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, storage[key] ?? fallback]));
  };

  const node = (path) => new Proxy(function chromeMock() {}, {
    get(_target, prop) {
      const next = `${path}.${String(prop)}`;
      if (prop === 'addListener') return (fn) => addListener(path, fn);
      if (next === 'chrome.runtime.getManifest') return () => ({ version: 'security-test' });
      if (next === 'chrome.runtime.lastError') return null;
      if (next === 'chrome.storage.local.get') return (keys, cb) => {
        const result = selectStorage(keys);
        cb?.(result);
        return Promise.resolve(result);
      };
      if (next === 'chrome.storage.local.set') return (values, cb) => {
        Object.assign(storage, values);
        cb?.();
        return Promise.resolve();
      };
      if (next === 'chrome.storage.local.remove') return (keys, cb) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        cb?.();
        return Promise.resolve();
      };
      return node(next);
    },
    apply() { return Promise.resolve(undefined); },
  });

  const sandbox = {
    chrome: node('chrome'),
    console,
    URL,
    Map,
    Date,
    Promise,
    importScripts() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    fetch: async () => ({ ok: false, json: async () => ({}) }),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('extension/background.js'), sandbox, { filename: 'extension/background.js' });
  return { listeners, storage };
}
function invoke(listener, message, sender) {
  let response;
  const returned = listener(message, sender, (value) => { response = value; });
  return { response, returned };
}

{
  let bg;
  try {
    bg = loadBackground();
    ok(true, 'real background.js loads in the security harness');
  } catch (error) {
    ok(false, `real background.js loads in the security harness (${error.message})`);
  }

  if (bg) {
    const onMessage = bg.listeners.get('chrome.runtime.onMessage')?.[0];
    const onConnect = bg.listeners.get('chrome.runtime.onConnect')?.[0];
    const onExternal = bg.listeners.get('chrome.runtime.onMessageExternal')?.[0];
    ok(typeof onMessage === 'function', 'real runtime.onMessage listener is captured');
    ok(typeof onConnect === 'function', 'real runtime.onConnect listener is captured');
    ok(typeof onExternal === 'function', 'real runtime.onMessageExternal listener is captured');

    const original = JSON.parse(JSON.stringify(bg.storage));
    const attack = { type: 'CONNECT', token: TOKEN, refreshToken: 'evil-refresh', backendUrl: BACKEND, user: { id: 'attacker' } };

    const internalAttack = invoke(onMessage, attack, { origin: HOSTILE, url: `${HOSTILE}/form` });
    equal(internalAttack.response, { ok: false, error: 'untrusted sender' }, 'runtime.onMessage explicitly rejects hostile CONNECT');
    equal(bg.storage, original, 'hostile runtime CONNECT cannot overwrite auth/backend state');

    const externalAttack = invoke(onExternal, attack, { origin: HOSTILE, url: `${HOSTILE}/app` });
    equal(externalAttack.response, { ok: false, error: 'untrusted sender' }, 'runtime.onMessageExternal explicitly rejects hostile CONNECT');
    equal(bg.storage, original, 'hostile external CONNECT cannot overwrite auth/backend state');

    let portMessage;
    const portReplies = [];
    onConnect({
      name: 'cc_bridge',
      sender: { origin: HOSTILE, url: `${HOSTILE}/form` },
      onDisconnect: { addListener() {} },
      onMessage: { addListener(fn) { portMessage = fn; } },
      postMessage(value) { portReplies.push(value); },
    });
    portMessage?.({ _reqId: 'port-attack', ...attack });
    ok(portReplies[0]?.response?.error === 'untrusted sender', 'long-lived bridge port rejects hostile CONNECT');
    equal(bg.storage, original, 'hostile port CONNECT cannot overwrite auth/backend state');

    const trusted = invoke(onMessage, attack, { origin: TRUSTED, url: `${TRUSTED}/app` });
    ok(trusted.response?.ok === true, 'trusted frontend CONNECT remains functional');
    ok(bg.storage.accessToken === TOKEN && bg.storage.backendUrl === BACKEND, 'trusted frontend may update auth/backend state');
    ok(!jsonHasSecret(trusted.response), 'CONNECT response never echoes token or backend URL');

    bg.storage.accessToken = TOKEN;
    bg.storage.backendUrl = BACKEND;
    const ping = invoke(onMessage, { type: 'PING' }, { origin: HOSTILE, url: `${HOSTILE}/form` });
    ok(ping.response?.ok === true, 'non-mutating PING remains available');
    ok(!jsonHasSecret(ping.response), 'PING cannot exfiltrate stored token or backend URL');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SEC-002: no page-readable credential, fill-record, or undo channels
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== SEC-002: page-readable exfiltration sinks remain absent ===');
{
  const extensionRoot = resolve(ROOT, 'extension');
  const sources = walkFiles(extensionRoot)
    .filter((path) => path.endsWith('.js'))
    .map((path) => ({ rel: relative(ROOT, path).replaceAll('\\', '/'), text: readFileSync(path, 'utf8') }));
  const sensitiveAttrs = [
    'data-cc-token', 'data-cc-backend', 'data-cc-formkey', 'data-cc-profile-id',
    'data-cc-llm-url', 'data-cc-llm-model', 'data-cc-llm-key',
    'data-cc-corrections', 'data-cc-records', 'data-cc-undo',
  ];
  for (const attr of sensitiveAttrs) {
    const offenders = sources.filter(({ text }) => text.includes(attr)).map(({ rel }) => rel);
    ok(offenders.length === 0, `${attr} is absent from extension JavaScript${offenders.length ? ` (${offenders.join(', ')})` : ''}`);
  }

  const traceDomOffenders = sources.filter(({ text }) => /(?:dataset\.ccTraces|data-cc-traces)/.test(text)).map(({ rel }) => rel);
  ok(traceDomOffenders.length === 0, `driver traces containing selectors/values never use page-readable DOM channels${traceDomOffenders.length ? ` (${traceDomOffenders.join(', ')})` : ''}`);

  const pageStorageSecret = /(?:localStorage|sessionStorage)\.(?:setItem|getItem)\(\s*['"](?:accessToken|refreshToken|backendUrl|llmKey|groqKey|cc[_-]token)/i;
  const storageOffenders = sources.filter(({ text }) => pageStorageSecret.test(text)).map(({ rel }) => rel);
  ok(storageOffenders.length === 0, `credentials are never placed in page-readable local/session storage${storageOffenders.length ? ` (${storageOffenders.join(', ')})` : ''}`);

  const popup = read('extension/popup.js');
  const executor = read('extension/autofill/executor.js');
  const background = read('extension/background.js');
  ok(popup.includes('window.__ccFillCtx'), 'fill credentials enter only the isolated-world context');
  ok(executor.includes('window.__ccFillCtx'), 'executor reads credentials from isolated-world context');
  ok(executor.includes('window.__ccFillRecords'), 'fill records stay in isolated-world memory');
  ok(popup.includes('window.__ccUndoSnapshot'), 'undo values stay in isolated-world memory');
  ok(background.includes('window.__ccFillRecords'), 'background reads fill records from isolated-world memory');

  const manifest = JSON.parse(read('extension/manifest.json'));
  ok((manifest.content_scripts || []).every((entry) => !entry.world || entry.world === 'ISOLATED'), 'content scripts never run in MAIN world');
  ok(!/world\s*:\s*['"]MAIN['"][\s\S]{0,500}__ccFillCtx/.test(popup), 'credential context is never installed by a MAIN-world injection');
}

// ────────────────────────────────────────────────────────────────────────────
// SEC-004: narrow host permissions are a reviewed exact allowlist
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== SEC-004: host permissions remain narrow and explicit ===');
{
  const manifest = JSON.parse(read('extension/manifest.json'));
  const approved = [
    '*://app.cybercontrol.fun/*',
    '*://*.ssc.nic.in/*',
    '*://*.ssc.gov.in/*',
    '*://*.rrbcdg.gov.in/*',
    '*://*.indianrailways.gov.in/*',
    '*://*.upsconline.nic.in/*',
    '*://*.upsc.gov.in/*',
    '*://*.nta.ac.in/*',
    '*://*.jeemain.nta.nic.in/*',
    '*://*.neet.nta.nic.in/*',
    '*://*.bseb.inter.nic.in/*',
    '*://*.cbse.nic.in/*',
    '*://*.onlinesbi.sbi/*',
    '*://*.passportindia.gov.in/*',
    '*://*.digilocker.gov.in/*',
    '*://*.umang.gov.in/*',
    '*://*.services.india.gov.in/*',
  ];
  const permissions = manifest.host_permissions || [];
  equal([...permissions].sort(), [...approved].sort(), 'host_permissions equals the reviewed portal allowlist');
  ok(!permissions.some((value) => ['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*'].includes(value)), 'no broad host wildcard is granted');
  ok(new Set(permissions).size === permissions.length, 'host_permissions contains no duplicate grants');
  const matches = (manifest.content_scripts || []).flatMap((entry) => entry.matches || []);
  equal([...matches].sort(), [...permissions].sort(), 'content-script matches do not exceed host permissions');
}

// ────────────────────────────────────────────────────────────────────────────
// Browser boundary: selectors/private bindings never cross public wire schemas
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== Browser boundary: selector and private-binding leakage ===');
{
  const schemaFiles = [
    'architecture/page-ir.schema.json',
    'architecture/action-plan.schema.json',
    'architecture/execution-observation.schema.json',
  ];
  const forbidden = new Set([
    'selector', 'selectors', 'css_selector', 'xpath', 'outer_html', 'inner_html',
    'dom_handle', 'element_reference', 'live_node_reference', 'binding_id',
    'binding_table', 'private_binding', 'private_bindings', 'option_selectors',
    'trigger_selector', 'option_selector', 'verify_selector', 'options_container', '_el',
  ]);
  function collectForbidden(value, location = '$', found = []) {
    if (!value || typeof value !== 'object') return found;
    if (value.properties && typeof value.properties === 'object') {
      for (const key of Object.keys(value.properties)) {
        if (forbidden.has(key.toLowerCase())) found.push(`${location}.properties.${key}`);
      }
    }
    if (Array.isArray(value.required)) {
      for (const key of value.required) {
        if (typeof key === 'string' && forbidden.has(key.toLowerCase())) found.push(`${location}.required:${key}`);
      }
    }
    for (const [key, child] of Object.entries(value)) collectForbidden(child, `${location}.${key}`, found);
    return found;
  }
  for (const file of schemaFiles) {
    const schema = JSON.parse(read(file));
    const leaks = collectForbidden(schema);
    ok(leaks.length === 0, `${file} defines no selector/private-binding fields${leaks.length ? ` (${leaks.join(', ')})` : ''}`);
    ok(schema.additionalProperties === false || file.endsWith('page-ir.schema.json'), `${file} root rejects undeclared fields`);
  }

  const actionPlan = JSON.parse(read('architecture/action-plan.schema.json'));
  equal(actionPlan.$defs.Target.required, ['context_id', 'node_id'], 'ActionPlan target uses only public context/node identity');
  equal(Object.keys(actionPlan.$defs.Target.properties), ['context_id', 'node_id'], 'ActionPlan target cannot carry selector fallback fields');
  ok(actionPlan.$defs.Target.additionalProperties === false, 'ActionPlan target rejects selector smuggling');

  const gatewayPolicy = read('architecture/gateway-security.yml');
  const domPolicy = read('architecture/dom-access-policy.yml');
  const extensionSource = walkFiles(resolve(ROOT, 'extension')).filter((path) => path.endsWith('.js')).map((path) => readFileSync(path, 'utf8')).join('\n');
  ok(gatewayPolicy.includes('page_reachable: false'), 'gateway policy keeps private bindings out of page scope');
  ok(domPolicy.includes('serialization: prohibited') && domPolicy.includes('persistence: prohibited'), 'private binding table cannot be serialized or persisted');
  ok(!/window\.ccDomGateway\s*=/.test(extensionSource), 'extension does not expose a page-callable DOM gateway');
}

// ────────────────────────────────────────────────────────────────────────────
// Pillar integrity: the suite and issue-closure policy are mandatory in CI
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== Permanent CI pillar and issue-closure policy ===');
{
  const workflow = read('.github/workflows/architecture.yml');
  const verification = read('architecture/verification.yml');
  const securityPolicy = read('architecture/gateway-security.yml');
  ok(/extension-security:\s*[\s\S]*?CHECK-011: Extension & browser boundary security/.test(workflow), 'GitHub Actions has a dedicated extension-security job');
  ok(workflow.includes('node extension-dev/tests/security/run.mjs'), 'dedicated CI job executes this permanent suite');
  ok(verification.includes('CHECK-011') && verification.includes('severity: fail'), 'verification registry defines CHECK-011 as a hard failure');
  ok(securityPolicy.includes('security_regression_policy:'), 'gateway policy defines a permanent security regression policy');
  ok(securityPolicy.includes('before the fix issue is closed'), 'security issue closure requires regression coverage');
}

console.log('\n────────────────────────────────────────────────────────');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
