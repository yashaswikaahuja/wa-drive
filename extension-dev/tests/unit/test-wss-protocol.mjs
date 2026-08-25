#!/usr/bin/env node
/**
 * CyberControl Phase 3.4 — WSS Protocol Tests
 *
 * Tests ws-server, ws-handlers, ws-client, and reconnect-manager.
 * Uses the real ws package to test server↔client communication.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(resolve(ROOT, 'apps/extension-service/package.json'));

// Set JWT_SECRET for auth tests
process.env.JWT_SECRET = 'test-secret-for-wss-phase-34';

const jwt = require('jsonwebtoken');
const { WebSocket } = require('ws');

// Dynamic import of ES modules
import { pathToFileURL } from 'node:url';
const { attachWebSocket, shutdown: shutdownWss, sessions } = await import(pathToFileURL(resolve(ROOT, 'apps/extension-service/src/ws/server.js')).href);
const { createHandlers } = await import(pathToFileURL(resolve(ROOT, 'apps/extension-service/src/ws/handlers.js')).href);
const { ReconnectManager, DEFAULTS } = require(resolve(ROOT, 'apps/extension/runtime/reconnect-manager.js'));
const { WsClient, STATE } = require(resolve(ROOT, 'apps/extension/runtime/ws-client.js'));

let passed = 0;
let failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error(`  ✗ FAIL: ${msg}`); } }

// ── Test server setup ─────────────────────────────────────────────────
const PORT = 19876; // unlikely to conflict
const TOKEN = jwt.sign({ userId: 'user1', workspaceId: 'ws-test-001', role: 'operator' }, process.env.JWT_SECRET);
const BAD_TOKEN = 'invalid.token.here';

let httpServer;
let wsServerHandle;

async function startServer() {
  // Allow plain ws:// in tests (production forbids plaintext)
  process.env.ALLOW_WS_PLAINTEXT = '1';
  process.env.NODE_ENV = 'test';
  _clientSeq = 0;
  httpServer = createServer((req, res) => {
    if (req.url === '/health') { res.end('ok'); return; }
    res.writeHead(404); res.end();
  });
  const handlers = createHandlers({
    resolveMapping: (workspaceId, snapshot) => {
      // Return a mock action plan for testing
      return { kind: 'action_plan', plan_id: 'test-plan-1', steps: [] };
    },
    recordObservation: () => {},
    recordTeachData: () => {},
    syncKnowledge: (workspaceId, req) => ({ manifest_version: 'v1', data: [] }),
  });
  wsServerHandle = attachWebSocket(httpServer, {
    onConnection: handlers.onConnection,
    onMessage: handlers.onMessage,
    onClose: handlers.onClose,
  });
  await new Promise((r) => httpServer.listen(PORT, r));
}

async function stopServer() {
  shutdownWss();
  await new Promise((r) => httpServer.close(r));
}

function connectWs(token) {
  return new WebSocket(`ws://localhost:${PORT}/ws?token=${encodeURIComponent(token)}`);
}

/** Stamp protocol envelope required by Phase 3.4 server. */
let _clientSeq = 0;
function envMsg(type, extra = {}) {
  _clientSeq += 1;
  return JSON.stringify({
    v: 1,
    id: `test.${Date.now().toString(36)}.${_clientSeq}`,
    type,
    seq: _clientSeq,
    ts: Date.now(),
    ...extra,
  });
}

function waitForMessage(ws, type, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// RECONNECT MANAGER TESTS (pure, no server needed)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== Reconnect Manager ===');
{
  const rm = new ReconnectManager({ baseDelayMs: 100, maxDelayMs: 1000, multiplier: 2, jitter: 0 });
  ok(rm.attempts === 0, 'initial attempts is 0');
  ok(rm.active === false, 'initially inactive');

  // Schedule reconnect
  let called = false;
  rm.scheduleReconnect(() => { called = true; });
  ok(rm.attempts === 1, 'attempts incremented');
  ok(rm.active === true, 'active after schedule');
  await sleep(150);
  ok(called, 'connectFn called after delay');

  // Second attempt should have longer delay
  called = false;
  rm.scheduleReconnect(() => { called = true; });
  ok(rm.attempts === 2, 'second attempt');
  await sleep(120); // base * 2^1 = 200ms — shouldn't fire yet
  ok(!called, 'second attempt has longer delay (not fired at 120ms)');
  await sleep(120); // total ~240ms > 200ms
  ok(called, 'second attempt fired after ~200ms');

  // Reset
  rm.reset();
  ok(rm.attempts === 0, 'reset clears attempts');
  ok(rm.active === false, 'reset clears active');

  // Max attempts
  const rmMax = new ReconnectManager({ baseDelayMs: 10, maxAttempts: 2, jitter: 0 });
  let gaveUp = false;
  rmMax._onGiveUp = () => { gaveUp = true; };
  rmMax.scheduleReconnect(() => {});
  await sleep(20);
  rmMax.scheduleReconnect(() => {});
  await sleep(20);
  rmMax.scheduleReconnect(() => {});
  // After 3rd attempt with max=2, should give up
  ok(rmMax.attempts === 3, 'attempts exceeds max');

  // Cancel
  const rmCancel = new ReconnectManager({ baseDelayMs: 500, jitter: 0 });
  let cancelCalled = false;
  rmCancel.scheduleReconnect(() => { cancelCalled = true; });
  rmCancel.cancel();
  await sleep(600);
  ok(!cancelCalled, 'cancel prevents reconnect');

  // getState
  const rmState = new ReconnectManager({ baseDelayMs: 100 });
  const state = rmState.getState();
  ok(state.active === false, 'getState reports inactive');
  ok(state.attempts === 0, 'getState reports 0 attempts');
}

// ═══════════════════════════════════════════════════════════════════════
// WS-CLIENT TESTS (pure, no real WebSocket)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== WsClient (unit) ===');
{
  const client = new WsClient({
    url: 'wss://example.com/ws',
    token: 'test-token',
  });
  ok(client.state === STATE.DISCONNECTED, 'initial state is disconnected');
  ok(client.sessionId === null, 'no session ID initially');

  // Verify Suspended Mode: cannot send when not connected
  let threw = false;
  try { client.send('test'); } catch { threw = true; }
  ok(threw, 'send throws in disconnected state (Suspended Mode)');
}

// ═══════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS (real server + client)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== WSS Integration ===');
await startServer();

// Test 1: Auth failure with bad token
{
  const ws = connectWs(BAD_TOKEN);
  const closePromise = new Promise((r) => ws.on('close', (code) => r(code)));
  const code = await closePromise;
  ok(code === 4002, `bad token rejected with code 4002 (got ${code})`);
}

// Test 2: Auth failure with no token
{
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const closePromise = new Promise((r) => ws.on('close', (code) => r(code)));
  const code = await closePromise;
  ok(code === 4001, `missing token rejected with code 4001 (got ${code})`);
}

// Test 3: Successful connection and welcome message
{
  const ws = connectWs(TOKEN);
  const msg = await waitForMessage(ws, 'connected');
  ok(msg.type === 'connected', 'received connected message');
  ok(typeof msg.sessionId === 'string', 'sessionId in welcome');
  ok(msg.heartbeatMs > 0, 'heartbeat interval in welcome');
  ok(sessions.size === 1, 'server tracks 1 session');
  ws.close();
  await sleep(50);
  ok(sessions.size === 0, 'session removed after close');
}

// Test 4: Send PageSnapshot, receive ack + action_plan
{
  const ws = connectWs(TOKEN);
  await waitForMessage(ws, 'connected');

  const snapshot = { kind: 'page_snapshot', snapshot_id: 'snap.t.1', revision: 0 };
  // Collect multiple messages
  const messages = [];
  const collectPromise = new Promise((resolve) => {
    const handler = (data) => {
      messages.push(JSON.parse(data.toString()));
      if (messages.length >= 2) { ws.off('message', handler); resolve(); }
    };
    ws.on('message', handler);
    setTimeout(() => { ws.off('message', handler); resolve(); }, 2000);
  });

  ws.send(envMsg('page_snapshot', { id: 'req1', snapshot }));
  await collectPromise;

  const ack = messages.find((m) => m.type === 'snapshot_ack');
  const plan = messages.find((m) => m.type === 'action_plan');
  ok(!!ack && ack.snapshotId === 'snap.t.1', 'snapshot_ack has correct snapshotId');
  ok(!!ack && ack.ref === 'req1', 'ack references the request');
  ok(!!plan && plan.plan.kind === 'action_plan', 'received action_plan');

  ws.close();
  await sleep(50);
}

// Test 5: Send PageDelta, receive ack
{
  const ws = connectWs(TOKEN);
  await waitForMessage(ws, 'connected');

  const delta = { kind: 'page_delta', result_snapshot_id: 'snap.t.2', revision: 1 };
  ws.send(envMsg('page_delta', { id: 'req2', delta }));

  const ack = await waitForMessage(ws, 'delta_ack');
  ok(ack.resultSnapshotId === 'snap.t.2', 'delta_ack has result snapshot');
  ok(ack.ref === 'req2', 'delta_ack references request');

  ws.close();
  await sleep(50);
}

// Test 6: Send execution observation
{
  const ws = connectWs(TOKEN);
  await waitForMessage(ws, 'connected');

  const observation = { kind: 'execution_observation', observation_id: 'obs.1', outcome: 'completed' };
  ws.send(envMsg('execution_observation', { id: 'req3', observation }));

  const ack = await waitForMessage(ws, 'observation_ack');
  ok(ack.observationId === 'obs.1', 'observation_ack has ID');
  ok(ack.outcome === 'completed', 'observation_ack has outcome');

  ws.close();
  await sleep(50);
}

// Test 7: Sync request
{
  const ws = connectWs(TOKEN);
  await waitForMessage(ws, 'connected');

  ws.send(envMsg('sync_request', { id: 'req4', requestType: 'bootstrap', payload: {} }));

  const resp = await waitForMessage(ws, 'sync_response');
  ok(resp.requestType === 'bootstrap', 'sync_response echoes requestType');
  ok(resp.ref === 'req4', 'sync_response references request');

  ws.close();
  await sleep(50);
}

// Test 8: Ping/pong
{
  const ws = connectWs(TOKEN);
  await waitForMessage(ws, 'connected');

  ws.send(envMsg('ping', { id: 'req5' }));
  const pong = await waitForMessage(ws, 'pong');
  ok(pong.ref === 'req5', 'pong references ping');
  ok(typeof pong.serverTime === 'number', 'pong has serverTime');

  ws.close();
  await sleep(50);
}

// Test 9: Resume
{
  const ws = connectWs(TOKEN);
  await waitForMessage(ws, 'connected');

  ws.send(envMsg('resume', { id: 'req6', lastSnapshotId: 'snap.old', lastRevision: 5 }));
  const ack = await waitForMessage(ws, 'resume_ack');
  ok(ack.accepted === true, 'resume accepted');
  ok(ack.lastSnapshotId === 'snap.old', 'resume echoes lastSnapshotId');

  ws.close();
  await sleep(50);
}

// Test 10: Unknown message type
{
  const ws = connectWs(TOKEN);
  await waitForMessage(ws, 'connected');

  ws.send(envMsg('nonexistent_type'));
  const err = await waitForMessage(ws, 'error');
  ok(err.code === 'unknown_message_type', 'unknown type returns error');

  ws.close();
  await sleep(50);
}

// Test 11: Invalid JSON
{
  const ws = connectWs(TOKEN);
  await waitForMessage(ws, 'connected');

  ws.send('not valid json{{{');
  const err = await waitForMessage(ws, 'error');
  ok(err.code === 'invalid_json', 'invalid JSON returns error');

  ws.close();
  await sleep(50);
}

// Test 12: Multiple concurrent connections for same workspace
{
  const ws1 = connectWs(TOKEN);
  const ws2 = connectWs(TOKEN);
  const c1 = await waitForMessage(ws1, 'connected');
  const c2 = await waitForMessage(ws2, 'connected');
  ok(c1.sessionId !== c2.sessionId, 'concurrent sessions get distinct sessionIds');
  ok(sessions.size === 2, `two concurrent sessions tracked (got ${sessions.size})`);
  ws1.close();
  ws2.close();
  await sleep(80);
  ok(sessions.size === 0, 'both sessions cleaned up');
}

// Test 13: Duplicate message id rejected (no second side effect)
{
  const ws = connectWs(TOKEN);
  await waitForMessage(ws, 'connected');
  const payload = {
    v: 1,
    id: 'dup-id-1',
    type: 'page_snapshot',
    seq: 100,
    snapshot: { kind: 'page_snapshot', snapshot_id: 'snap.dup', revision: 0 },
  };
  ws.send(JSON.stringify(payload));
  const ack1 = await waitForMessage(ws, 'snapshot_ack');
  ok(ack1.snapshotId === 'snap.dup', 'first snapshot accepted');
  ws.send(JSON.stringify(payload)); // same id
  const err = await waitForMessage(ws, 'error');
  ok(err.code === 'duplicate_message', `duplicate rejected (got ${err.code})`);
  ws.close();
  await sleep(50);
}

// Test 14: Stale / out-of-order seq rejected
{
  const ws = connectWs(TOKEN);
  await waitForMessage(ws, 'connected');
  ws.send(JSON.stringify({
    v: 1, id: 'seq-a', type: 'ping', seq: 10, ts: Date.now(),
  }));
  await waitForMessage(ws, 'pong');
  ws.send(JSON.stringify({
    v: 1, id: 'seq-b', type: 'ping', seq: 9, ts: Date.now(),
  }));
  const err = await waitForMessage(ws, 'error');
  ok(err.code === 'stale_message', `stale seq rejected (got ${err.code})`);
  ws.close();
  await sleep(50);
}

// Test 15: Missing protocol version rejected
{
  const ws = connectWs(TOKEN);
  await waitForMessage(ws, 'connected');
  ws.send(JSON.stringify({ id: 'nov', type: 'ping' }));
  const err = await waitForMessage(ws, 'error');
  ok(err.code === 'missing_version' || err.code === 'protocol_version_unsupported',
    `missing v rejected (got ${err.code})`);
  ws.close();
  await sleep(50);
}

// Test 16: tabId / workflowId isolation fields accepted on session
{
  const ws = connectWs(TOKEN);
  await waitForMessage(ws, 'connected');
  ws.send(envMsg('page_snapshot', {
    id: 'tab-wf-1',
    tabId: 'tab-42',
    workflowId: 'wf-9',
    snapshot: { kind: 'page_snapshot', snapshot_id: 'snap.tab', revision: 0 },
  }));
  const ack = await waitForMessage(ws, 'snapshot_ack');
  ok(ack.tabId === 'tab-42', 'snapshot_ack echoes tabId');
  ok(ack.workflowId === 'wf-9', 'snapshot_ack echoes workflowId');
  ws.close();
  await sleep(50);
}

// Test 17: Production rejects plaintext WS
{
  await stopServer();
  const prev = process.env.NODE_ENV;
  const prevAllow = process.env.ALLOW_WS_PLAINTEXT;
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOW_WS_PLAINTEXT;
  // Need fresh server instance — attachWebSocket throws if already attached
  // stopServer already called shutdown which nulls _wss
  httpServer = createServer();
  const handlers = createHandlers({});
  try {
    wsServerHandle = attachWebSocket(httpServer, {
      onConnection: handlers.onConnection,
      onMessage: handlers.onMessage,
      onClose: handlers.onClose,
    });
  } catch (e) {
    // if already attached, fail soft
    ok(false, `reattach for prod test: ${e.message}`);
  }
  await new Promise((r) => httpServer.listen(PORT + 1, r));
  const ws = new WebSocket(`ws://localhost:${PORT + 1}/ws?token=${encodeURIComponent(TOKEN)}`);
  const closed = await new Promise((r) => ws.on('close', (code) => r(code)));
  ok(closed === 4005, `plaintext forbidden in production (code ${closed})`);
  process.env.NODE_ENV = prev;
  if (prevAllow != null) process.env.ALLOW_WS_PLAINTEXT = prevAllow;
  else process.env.ALLOW_WS_PLAINTEXT = '1';
  shutdownWss();
  await new Promise((r) => httpServer.close(r));
}

// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
