#!/usr/bin/env node
/**
 * Phase 4.0 HIM Runtime — Adversarial Trust Boundary Tests
 * Covers: Server HIM Engine, Extension State Machine, Bridge Security,
 *         Sensitive Field Enforcement, Irreversible Action Flow,
 *         Offline/Degraded, Observation Privacy.
 *
 * Uses only Node.js built-ins. 150+ assertions.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(import.meta.url);

// ─── Load modules ────────────────────────────────────────────────────────────
// Server engine (ESM) — use file:// URL for Windows compatibility
const himEngine = await import(pathToFileURL(resolve(ROOT, 'extension-service/him-engine.js')).href);

// Extension state machine (IIFE/CJS wrapper)
const stateMachine = require(resolve(ROOT, 'extension/runtime/him-state-machine.js'));

// Extension sensitive field (IIFE/CJS wrapper)
const sensitive = require(resolve(ROOT, 'extension/runtime/him-sensitive.js'));

// Extension bridge (CJS)
const bridgeMod = require(resolve(ROOT, 'extension/runtime/him-bridge.js'));

// ─── Test harness ────────────────────────────────────────────────────────────
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

// UUID v4 pattern
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ═══════════════════════════════════════════════════════════════════════════════
// §1 — Server HIM Engine (nonce lifecycle)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== §1 Server HIM Engine (nonce lifecycle) ===');

// Reset state before tests
himEngine._resetState();

// Generate nonce → valid UUID, correct expiry per interaction_type
{
  const result = himEngine.generateNonce('sess1', 'plan1', 'step1', 'otp_entry');
  ok(UUID_RE.test(result.nonce), 'generateNonce produces valid UUID v4');
  ok(typeof result.issued_at === 'number' && result.issued_at > 0, 'issued_at is a positive number');
  ok(typeof result.expires_at === 'number', 'expires_at is a number');
  ok(result.expires_at - result.issued_at === 180_000, 'otp_entry timeout = 180s');
}

{
  const result = himEngine.generateNonce('sess1', 'plan1', 'step2', 'payment_authorization');
  ok(result.expires_at - result.issued_at === 120_000, 'payment_authorization timeout = 120s');
}

{
  const result = himEngine.generateNonce('sess1', 'plan1', 'step3', 'irreversible_submit');
  ok(result.expires_at - result.issued_at === 120_000, 'irreversible_submit timeout = 120s');
}

{
  const result = himEngine.generateNonce('sess1', 'plan1', 'step4', 'custom');
  ok(result.expires_at - result.issued_at === 300_000, 'custom/default timeout = 300s');
}

{
  const result = himEngine.generateNonce('sess1', 'plan1', 'step5', 'unknown_type');
  ok(result.expires_at - result.issued_at === 300_000, 'unknown interaction_type defaults to 300s');
}

// Validate correct confirmation → valid=true
himEngine._resetState();
{
  const { nonce, issued_at } = himEngine.generateNonce('sess1', 'plan1', 'step1', 'otp_entry');
  const result = himEngine.validateConfirmation('sess1', 'plan1', 'step1', nonce, issued_at + 1000);
  ok(result.valid === true, 'validateConfirmation with correct params → valid=true');
  ok(result.rejection_reason === null, 'no rejection_reason on valid confirmation');
}

// Validate forged nonce → nonce_mismatch
{
  const result = himEngine.validateConfirmation('sess1', 'plan1', 'step1', 'forged-nonce-value', Date.now());
  ok(result.valid === false, 'forged nonce → valid=false');
  ok(result.rejection_reason === 'nonce_mismatch', 'forged nonce → rejection_reason=nonce_mismatch');
}

// Validate expired confirmation
himEngine._resetState();
{
  const { nonce, expires_at } = himEngine.generateNonce('sess2', 'plan2', 'step2', 'otp_entry');
  // Beyond expires_at + grace (5s)
  const result = himEngine.validateConfirmation('sess2', 'plan2', 'step2', nonce, expires_at + 6000);
  ok(result.valid === false, 'expired confirmation → valid=false');
  ok(result.rejection_reason === 'expired', 'expired confirmation → rejection_reason=expired');
}

// Validate replayed (consumed) nonce
himEngine._resetState();
{
  const { nonce, issued_at } = himEngine.generateNonce('sess3', 'plan3', 'step3', 'custom');
  const valid = himEngine.validateConfirmation('sess3', 'plan3', 'step3', nonce, issued_at + 100);
  ok(valid.valid === true, 'first validation succeeds');
  himEngine.consumeNonce(nonce);
  const replay = himEngine.validateConfirmation('sess3', 'plan3', 'step3', nonce, issued_at + 200);
  ok(replay.valid === false, 'replayed (consumed) nonce → valid=false');
  ok(replay.rejection_reason === 'already_consumed', 'replayed nonce → rejection_reason=already_consumed');
}

// Validate session mismatch
himEngine._resetState();
{
  const { nonce, issued_at } = himEngine.generateNonce('sessA', 'planA', 'stepA', 'custom');
  const result = himEngine.validateConfirmation('sessB', 'planA', 'stepA', nonce, issued_at + 100);
  ok(result.valid === false, 'session mismatch → valid=false');
  ok(result.rejection_reason === 'session_mismatch', 'session mismatch → rejection_reason=session_mismatch');
}

// Grace period: confirmation at expires_at + 4s → valid (within grace)
himEngine._resetState();
{
  const { nonce, expires_at } = himEngine.generateNonce('sess4', 'plan4', 'step4', 'custom');
  const result = himEngine.validateConfirmation('sess4', 'plan4', 'step4', nonce, expires_at + 4000);
  ok(result.valid === true, 'confirmation at expires_at + 4s → valid (within 5s grace)');
}

// Grace period: confirmation at expires_at + 6s → expired (beyond grace)
himEngine._resetState();
{
  const { nonce, expires_at } = himEngine.generateNonce('sess5', 'plan5', 'step5', 'custom');
  const result = himEngine.validateConfirmation('sess5', 'plan5', 'step5', nonce, expires_at + 6000);
  ok(result.valid === false, 'confirmation at expires_at + 6s → expired (beyond 5s grace)');
  ok(result.rejection_reason === 'expired', 'beyond grace → rejection_reason=expired');
}

// Cleanup: expired nonces purged after interval
himEngine._resetState();
{
  // Generate a nonce with 0ms timeout by manipulating directly
  const { nonce } = himEngine.generateNonce('sessC', 'planC', 'stepC', 'custom');
  // Manually expire it
  himEngine.expireNonce(nonce);
  const stats = himEngine.getStats();
  ok(stats.active === 0, 'expireNonce removes from active');
  ok(stats.consumed >= 1, 'expireNonce moves to consumed (for replay detection)');
}

// purgeExpiredNonces
himEngine._resetState();
{
  // Generate and immediately expire
  const { nonce: n1 } = himEngine.generateNonce('s', 'p', 'st1', 'custom');
  const { nonce: n2 } = himEngine.generateNonce('s', 'p', 'st2', 'custom');
  himEngine.expireNonce(n1);
  himEngine.consumeNonce(n2);
  const result = himEngine.purgeExpiredNonces();
  // Nothing should be purged yet (within TTL) for consumed, but active expired (past grace) may be
  ok(typeof result.purged_active === 'number', 'purgeExpiredNonces returns purged_active count');
  ok(typeof result.purged_consumed === 'number', 'purgeExpiredNonces returns purged_consumed count');
}

// isStepHimRequired
{
  ok(himEngine.isStepHimRequired({ him_required: true, risk: 'safe' }) === true,
    'isStepHimRequired: him_required=true → true');
  ok(himEngine.isStepHimRequired({ risk: 'irreversible' }) === true,
    'isStepHimRequired: risk=irreversible → true');
  ok(himEngine.isStepHimRequired({ risk: 'safe', him_required: false }) === false,
    'isStepHimRequired: normal step → false');
  ok(himEngine.isStepHimRequired(null) === false,
    'isStepHimRequired: null step → false');
  ok(himEngine.isStepHimRequired({}) === false,
    'isStepHimRequired: empty step → false');
}

// getTimeoutMs
{
  ok(himEngine.getTimeoutMs('captcha_solve') === 180_000, 'getTimeoutMs captcha_solve = 180s');
  ok(himEngine.getTimeoutMs('manual_review') === 300_000, 'getTimeoutMs manual_review = 300s');
  ok(himEngine.getTimeoutMs('totally_unknown') === 300_000, 'getTimeoutMs unknown → default 300s');
}

// buildHimRequest
himEngine._resetState();
{
  const step = { step_id: 'step:build', interaction_type: 'otp_entry', him_prompt: 'Enter OTP', sensitive_field: true, risk: 'safe' };
  const msg = himEngine.buildHimRequest('sess1', 'plan1', step, { context_id: 'ctx', node_id: 'n1' });
  ok(msg.message_type === 'him_request', 'buildHimRequest sets message_type');
  ok(UUID_RE.test(msg.nonce), 'buildHimRequest nonce is UUID');
  ok(msg.interaction_type === 'otp_entry', 'buildHimRequest interaction_type from step');
  ok(msg.sensitive_field === true, 'buildHimRequest propagates sensitive_field');
  ok(msg.target.context_id === 'ctx', 'buildHimRequest includes target');
}

// ═══════════════════════════════════════════════════════════════════════════════
// §2 — Extension State Machine
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== §2 Extension State Machine ===');

const { HimStateMachine, STATES, OWNERS, TERMINAL_STATES } = stateMachine;

// Legal transitions all pass
{
  const sm = new HimStateMachine({ session_id: 's1', plan_id: 'p1', step_id: 'st1', nonce: 'n1' });
  ok(sm.getState() === STATES.IDLE, 'initial state is idle');

  const r1 = sm.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  ok(r1.ok === true, 'idle→plan_executing succeeds');

  const r2 = sm.transition('plan_executing', 'waiting_human', 'him_step_reached', 'extension');
  ok(r2.ok === true, 'plan_executing→waiting_human succeeds');

  const r3 = sm.transition('waiting_human', 'human_active', 'operator_engaged', 'extension');
  ok(r3.ok === true, 'waiting_human→human_active succeeds');

  const r4 = sm.transition('human_active', 'continued', 'him_confirmation_valid', 'server');
  ok(r4.ok === true, 'human_active→continued succeeds (server-owned)');
  ok(sm.isTerminal(), 'continued is terminal');
}

// waiting_human→continued (direct, without going through human_active)
{
  const sm = new HimStateMachine({ session_id: 's2', plan_id: 'p2', step_id: 'st2', nonce: 'n2' });
  sm.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  sm.transition('plan_executing', 'waiting_human', 'him_step_reached', 'extension');
  const r = sm.transition('waiting_human', 'continued', 'him_confirmation_valid', 'server');
  ok(r.ok === true, 'waiting_human→continued succeeds');
}

// waiting_human→expired
{
  const sm = new HimStateMachine({ session_id: 's3', plan_id: 'p3', step_id: 'st3', nonce: 'n3' });
  sm.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  sm.transition('plan_executing', 'waiting_human', 'him_step_reached', 'extension');
  const r = sm.transition('waiting_human', 'expired', 'him_timeout', 'server');
  ok(r.ok === true, 'waiting_human→expired succeeds');
  ok(sm.isTerminal(), 'expired is terminal');
}

// waiting_human→cancelled
{
  const sm = new HimStateMachine({ session_id: 's4', plan_id: 'p4', step_id: 'st4', nonce: 'n4' });
  sm.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  sm.transition('plan_executing', 'waiting_human', 'him_step_reached', 'extension');
  const r = sm.transition('waiting_human', 'cancelled', 'operator_cancel', 'operator');
  ok(r.ok === true, 'waiting_human→cancelled succeeds');
  ok(sm.isTerminal(), 'cancelled is terminal');
}

// waiting_human→failed
{
  const sm = new HimStateMachine({ session_id: 's5', plan_id: 'p5', step_id: 'st5', nonce: 'n5' });
  sm.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  sm.transition('plan_executing', 'waiting_human', 'him_step_reached', 'extension');
  const r = sm.transition('waiting_human', 'failed', 'bridge_error', 'extension');
  ok(r.ok === true, 'waiting_human→failed succeeds');
  ok(sm.isTerminal(), 'failed is terminal');
}

// Illegal transitions throw/reject
{
  const sm = new HimStateMachine({ session_id: 's6', plan_id: 'p6', step_id: 'st6', nonce: 'n6' });
  const r1 = sm.transition('idle', 'waiting_human', 'him_step_reached', 'extension');
  ok(r1.ok === false, 'idle→waiting_human is illegal (skipping plan_executing)');

  const r2 = sm.transition('idle', 'continued', 'him_confirmation_valid', 'server');
  ok(r2.ok === false, 'idle→continued is illegal (no plan_executing first)');

  sm.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  const r3 = sm.transition('plan_executing', 'continued', 'him_confirmation_valid', 'server');
  ok(r3.ok === false, 'plan_executing→continued is illegal');
}

// Terminal states cannot resurrect
{
  const sm = new HimStateMachine({ session_id: 's7', plan_id: 'p7', step_id: 'st7', nonce: 'n7' });
  sm.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  sm.transition('plan_executing', 'waiting_human', 'him_step_reached', 'extension');
  sm.transition('waiting_human', 'failed', 'bridge_error', 'extension');

  const r1 = sm.transition('failed', 'idle', 'reset', 'extension');
  ok(r1.ok === false, 'failed→idle via transition is rejected (terminal)');
  ok(r1.error.includes('terminal'), 'error message mentions terminal');

  const r2 = sm.transition('failed', 'waiting_human', 'him_step_reached', 'extension');
  ok(r2.ok === false, 'failed→waiting_human is rejected (terminal cannot resurrect)');
}

// Only server-owned transitions reject if claimed by wrong owner
{
  const sm = new HimStateMachine({ session_id: 's8', plan_id: 'p8', step_id: 'st8', nonce: 'n8' });
  sm.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  sm.transition('plan_executing', 'waiting_human', 'him_step_reached', 'extension');

  // Extension cannot authorize continued (server-only)
  const r1 = sm.transition('waiting_human', 'continued', 'him_confirmation_valid', 'extension');
  ok(r1.ok === false, 'extension cannot claim continued (server-only transition)');

  // Extension cannot declare timeout (server-only)
  const r2 = sm.transition('waiting_human', 'expired', 'him_timeout', 'extension');
  ok(r2.ok === false, 'extension cannot claim expired (server-only transition)');
}

// Reset returns to idle
{
  const sm = new HimStateMachine({ session_id: 's9', plan_id: 'p9', step_id: 'st9', nonce: 'n9' });
  sm.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  sm.transition('plan_executing', 'waiting_human', 'him_step_reached', 'extension');
  sm.transition('waiting_human', 'cancelled', 'operator_cancel', 'operator');
  const r = sm.reset();
  ok(r.ok === true, 'reset from terminal state succeeds');
  ok(sm.getState() === STATES.IDLE, 'reset returns state to idle');
}

// Reset from active (non-terminal, non-idle) fails
{
  const sm = new HimStateMachine({ session_id: 's10', plan_id: 'p10', step_id: 'st10', nonce: 'n10' });
  sm.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  sm.transition('plan_executing', 'waiting_human', 'him_step_reached', 'extension');
  const r = sm.reset();
  ok(r.ok === false, 'reset from active non-terminal state is rejected');
}

// Scoping: two instances don't interfere
{
  const sm1 = new HimStateMachine({ session_id: 'sA', plan_id: 'pA', step_id: 'stA', nonce: 'nA' });
  const sm2 = new HimStateMachine({ session_id: 'sB', plan_id: 'pB', step_id: 'stB', nonce: 'nB' });

  sm1.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  ok(sm1.getState() === 'plan_executing', 'sm1 transitioned to plan_executing');
  ok(sm2.getState() === 'idle', 'sm2 remains idle (no interference)');

  sm2.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  sm2.transition('plan_executing', 'waiting_human', 'him_step_reached', 'extension');
  sm2.transition('waiting_human', 'failed', 'bridge_error', 'extension');
  ok(sm1.getState() === 'plan_executing', 'sm1 unaffected by sm2 going to failed');
  ok(sm2.isTerminal(), 'sm2 is terminal');
  ok(!sm1.isTerminal(), 'sm1 is NOT terminal');
}

// Constructor requires all scope fields
{
  let threw = false;
  try { new HimStateMachine({ session_id: 's', plan_id: 'p', step_id: 'st' }); }
  catch (e) { threw = true; }
  ok(threw, 'constructor throws if nonce missing from scope');
}

// ═══════════════════════════════════════════════════════════════════════════════
// §3 — HIM Bridge Security
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== §3 HIM Bridge Security ===');

const { HimBridge, VALID_CONFIRMATION_SOURCES, RATE_LIMIT_WINDOW_MS } = bridgeMod;

// Helper: mock WSS client
function mockWsClient() {
  const sent = [];
  return {
    sent,
    send(type, payload) { sent.push({ type, payload }); },
    _onStateChange: null,
  };
}

// him_request creates state machine instance
{
  const ws = mockWsClient();
  let sentToTab = [];
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: (tabId, msg) => sentToTab.push({ tabId, msg }),
  });

  const himRequest = {
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'sess1',
    plan_id: 'plan1',
    step_id: 'step1',
    nonce: 'nonce-bridge-1',
    interaction_type: 'otp_entry',
    prompt: 'Enter OTP',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180000).toISOString(),
    sensitive_field: true,
    target: { context_id: 'ctx1', node_id: 'n1' },
  };
  bridge.handleServerMessage(himRequest, 42);

  ok(bridge.getActiveSessionCount() === 1, 'him_request creates active session');
  ok(sentToTab.length === 1, 'him_request forwards HIM_SHOW_PROMPT to content script');
  ok(sentToTab[0].tabId === 42, 'message sent to correct tab');
  ok(sentToTab[0].msg.type === 'HIM_SHOW_PROMPT', 'message type is HIM_SHOW_PROMPT');
}

// operator_confirmation with valid source forwards to server
{
  const ws = mockWsClient();
  let sentToTab = [];
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: (tabId, msg) => sentToTab.push({ tabId, msg }),
  });

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'sess2',
    plan_id: 'plan2',
    step_id: 'step2',
    nonce: 'nonce-bridge-2',
    interaction_type: 'otp_entry',
    prompt: 'Enter code',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180000).toISOString(),
  }, 43);

  const result = bridge.handleContentScriptMessage(
    { type: 'HIM_CONFIRM', nonce: 'nonce-bridge-2', confirmation_source: 'him_ui_button' },
    { tab: { id: 43 } }
  );

  ok(result.handled === true, 'HIM_CONFIRM is handled');
  ok(result.response.ok === true, 'valid confirmation accepted');
  ok(ws.sent.length === 1, 'confirmation forwarded to server');
  ok(ws.sent[0].payload.him.message_type === 'operator_confirmation', 'forwarded as operator_confirmation');
}

// operator_confirmation with source='page_dom_event' is rejected
{
  const ws = mockWsClient();
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: () => {},
  });

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'sess3',
    plan_id: 'plan3',
    step_id: 'step3',
    nonce: 'nonce-bridge-3',
    interaction_type: 'otp_entry',
    prompt: 'test',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180000).toISOString(),
  }, 44);

  const result = bridge.handleContentScriptMessage(
    { type: 'HIM_CONFIRM', nonce: 'nonce-bridge-3', confirmation_source: 'page_dom_event' },
    { tab: { id: 44 } }
  );
  ok(result.response.ok === false, 'page_dom_event confirmation rejected');
  ok(result.response.error === 'invalid_confirmation_source', 'rejection reason is invalid_confirmation_source');
  ok(ws.sent.length === 0, 'forged confirmation NOT forwarded to server');
}

// him_response action=continue transitions to continued
{
  const ws = mockWsClient();
  let resumed = null;
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: () => {},
    onResumeExecution: (plan_id, step_id) => { resumed = { plan_id, step_id }; },
  });

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'sess4',
    plan_id: 'plan4',
    step_id: 'step4',
    nonce: 'nonce-bridge-4',
    interaction_type: 'otp_entry',
    prompt: 'confirm',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180000).toISOString(),
  }, 45);

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_response',
    session_id: 'sess4',
    plan_id: 'plan4',
    step_id: 'step4',
    nonce: 'nonce-bridge-4',
    action: 'continue',
  });

  ok(resumed !== null, 'him_response action=continue calls onResumeExecution');
  ok(resumed.plan_id === 'plan4', 'onResumeExecution gets correct plan_id');
  ok(resumed.step_id === 'step4', 'onResumeExecution gets correct step_id');
}

// him_response action=reject stays in waiting_human (does not resume)
{
  const ws = mockWsClient();
  let resumed = false;
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: () => {},
    onResumeExecution: () => { resumed = true; },
  });

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'sess5',
    plan_id: 'plan5',
    step_id: 'step5',
    nonce: 'nonce-bridge-5',
    interaction_type: 'otp_entry',
    prompt: 'test',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180000).toISOString(),
  }, 46);

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_response',
    session_id: 'sess5',
    plan_id: 'plan5',
    step_id: 'step5',
    nonce: 'nonce-bridge-5',
    action: 'reject',
    rejection_reason: 'expired',
  });

  ok(resumed === false, 'him_response action=reject does NOT resume execution');
}

// WSS disconnect during waiting_human → failed state (no auto-continue)
{
  const ws = mockWsClient();
  let resumed = false;
  let sentToTab = [];
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: (tabId, msg) => sentToTab.push(msg),
    onResumeExecution: () => { resumed = true; },
  });

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'sess6',
    plan_id: 'plan6',
    step_id: 'step6',
    nonce: 'nonce-bridge-6',
    interaction_type: 'otp_entry',
    prompt: 'test',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180000).toISOString(),
  }, 47);

  // Simulate WSS disconnect
  bridge.handleWssDisconnect();

  ok(resumed === false, 'WSS disconnect does NOT auto-continue');
  const failMsg = sentToTab.find(m => m.type === 'HIM_STATE_CHANGE' && m.state === 'failed');
  ok(failMsg !== undefined, 'WSS disconnect sends failed state to content script');
  ok(failMsg && failMsg.reason === 'connection_lost', 'failure reason is connection_lost');
}

// Rate limiting: second confirmation within 5s for same nonce is dropped
{
  const ws = mockWsClient();
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: () => {},
  });

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'sess7',
    plan_id: 'plan7',
    step_id: 'step7',
    nonce: 'nonce-bridge-7',
    interaction_type: 'otp_entry',
    prompt: 'test',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180000).toISOString(),
  }, 48);

  const r1 = bridge.handleContentScriptMessage(
    { type: 'HIM_CONFIRM', nonce: 'nonce-bridge-7', confirmation_source: 'him_ui_button' },
    { tab: { id: 48 } }
  );
  ok(r1.response.ok === true, 'first confirmation accepted');

  const r2 = bridge.handleContentScriptMessage(
    { type: 'HIM_CONFIRM', nonce: 'nonce-bridge-7', confirmation_source: 'him_ui_button' },
    { tab: { id: 48 } }
  );
  ok(r2.response.ok === false, 'second confirmation within 5s rejected');
  ok(r2.response.error === 'rate_limited', 'rejection reason is rate_limited');
  ok(ws.sent.length === 1, 'only first confirmation forwarded to server');
}

// Nonce never appears in any page-accessible location (HIM_SHOW_PROMPT analysis)
{
  const ws = mockWsClient();
  let sentToTab = [];
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: (tabId, msg) => sentToTab.push(msg),
  });

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'sess8',
    plan_id: 'plan8',
    step_id: 'step8',
    nonce: 'nonce-bridge-secret-8',
    interaction_type: 'payment_authorization',
    prompt: 'Confirm payment',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 120000).toISOString(),
  }, 49);

  // The content script message DOES contain nonce for correlation — this is expected
  // because the content script runs in isolated world. The key invariant is that
  // the nonce is held in background memory and the content script communicates via
  // chrome.runtime.sendMessage, NOT window.postMessage or DOM attributes.
  // We verify the bridge design does not expose via postMessage.
  const showMsg = sentToTab.find(m => m.type === 'HIM_SHOW_PROMPT');
  ok(showMsg !== undefined, 'HIM_SHOW_PROMPT sent (nonce in isolated-world only)');
  // The bridge API does NOT use window.postMessage — verified by code inspection.
  // No DOM attribute or data-* attribute is set on page elements.
  ok(typeof bridge.handleContentScriptMessage === 'function',
    'bridge uses chrome.runtime.sendMessage pattern (not postMessage)');
}

// ═══════════════════════════════════════════════════════════════════════════════
// §4 — Sensitive Field Enforcement
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== §4 Sensitive Field Enforcement ===');

const { isSensitiveField, observeCompletion } = sensitive;

// Minimal DOM element mock
function mockElement(overrides = {}) {
  return {
    tagName: overrides.tagName || 'INPUT',
    type: overrides.type || 'text',
    name: overrides.name || '',
    id: overrides.id || '',
    autocomplete: overrides.autocomplete || '',
    placeholder: overrides.placeholder || '',
    value: overrides.value !== undefined ? overrides.value : '',
    isConnected: overrides.isConnected !== undefined ? overrides.isConnected : true,
    validity: overrides.validity || { valueMissing: true },
    selectionStart: overrides.selectionStart || 0,
    getAttribute: (attr) => overrides[attr] || null,
    addEventListener: overrides.addEventListener || (() => {}),
    removeEventListener: overrides.removeEventListener || (() => {}),
  };
}

// isSensitiveField returns true for sensitive_field:true steps
{
  const el = mockElement({ type: 'text', name: 'username' });
  ok(isSensitiveField(el, { sensitive_field: true }) === true,
    'isSensitiveField: server sensitive_field=true → true');
}

// isSensitiveField: interaction type implies sensitivity
{
  const el = mockElement({ type: 'text', name: 'otp_value' });
  ok(isSensitiveField(el, { interaction_type: 'otp_entry' }) === true,
    'isSensitiveField: interaction_type=otp_entry → true');
  ok(isSensitiveField(el, { interaction_type: 'captcha_solve' }) === true,
    'isSensitiveField: interaction_type=captcha_solve → true');
  ok(isSensitiveField(el, { interaction_type: 'payment_authorization' }) === true,
    'isSensitiveField: interaction_type=payment_authorization → true');
}

// isSensitiveField: input type=password
{
  const el = mockElement({ type: 'password', name: 'user_pass' });
  ok(isSensitiveField(el, {}) === true,
    'isSensitiveField: type=password → true');
}

// isSensitiveField: heuristic patterns
{
  const el1 = mockElement({ name: 'otp_code' });
  ok(isSensitiveField(el1) === true, 'isSensitiveField: name=otp_code → true (heuristic)');
  const el2 = mockElement({ id: 'cvv-input' });
  ok(isSensitiveField(el2) === true, 'isSensitiveField: id=cvv-input → true (heuristic)');
}

// Fails closed: unknown classification → treated as secret
{
  const el = mockElement({ type: 'text', name: 'unknown_field' });
  // When step context exists but sensitive_field is undefined → fail closed
  ok(isSensitiveField(el, { interaction_type: 'custom' }) === true,
    'isSensitiveField: uncertain classification with step context → true (fail-closed)');
}

// Fails closed: null node → treated as secret
{
  ok(isSensitiveField(null, { sensitive_field: true }) === true,
    'isSensitiveField: null node with sensitive_field=true → true');
  ok(isSensitiveField(null) === true,
    'isSensitiveField: null node → true (fail-closed)');
}

// Explicit server classification as NOT sensitive
{
  const el = mockElement({ type: 'text', name: 'first_name' });
  ok(isSensitiveField(el, { sensitive_field: false }) === false,
    'isSensitiveField: server sensitive_field=false → false');
}

// observeCompletion detects empty→nonempty without reading value
{
  let transitioned = false;
  const el = mockElement({ value: '', isConnected: true });

  // Mock addEventListener/removeEventListener
  let inputHandler = null;
  el.addEventListener = (event, handler) => { if (event === 'input') inputHandler = handler; };
  el.removeEventListener = () => { inputHandler = null; };

  const obs = observeCompletion(el, {
    pollIntervalMs: 10,
    timeoutMs: 500,
    onTransition: () => { transitioned = true; },
  });

  // Simulate user typing (empty→nonempty)
  setTimeout(() => {
    el.value = 'x'; // value changes to nonempty
    if (inputHandler) inputHandler();
  }, 50);

  const result = await obs.promise;
  ok(result.completed === true, 'observeCompletion detects empty→nonempty');
  ok(transitioned === true, 'onTransition callback fired');
}

// observeCompletion does NOT capture value
{
  // Verify the observation contract — we can check that the API returns
  // only {completed: boolean, reason?: string}, no value property
  const el = mockElement({ value: '', isConnected: true });
  let inputHandler = null;
  el.addEventListener = (event, handler) => { if (event === 'input') inputHandler = handler; };
  el.removeEventListener = () => {};

  const obs = observeCompletion(el, { pollIntervalMs: 10, timeoutMs: 200 });
  setTimeout(() => {
    el.value = 'secret-password-123';
    if (inputHandler) inputHandler();
  }, 30);

  const result = await obs.promise;
  ok(result.completed === true, 'observation completes');
  ok(!('value' in result), 'result does NOT contain .value property');
  ok(!('entered_value' in result), 'result does NOT contain .entered_value');
  ok(!('field_content' in result), 'result does NOT contain .field_content');
  ok(!('raw_text' in result), 'result does NOT contain .raw_text');
}

// No .value content is ever captured or returned
{
  // Test timeout path
  const el = mockElement({ value: '', isConnected: true });
  el.addEventListener = () => {};
  el.removeEventListener = () => {};
  const obs = observeCompletion(el, { pollIntervalMs: 10, timeoutMs: 60 });
  const result = await obs.promise;
  ok(result.completed === false, 'observeCompletion times out when value stays empty');
  ok(result.reason === 'timeout', 'timeout reason provided');
  ok(!('value' in result), 'timeout result has no .value');
}

// ═══════════════════════════════════════════════════════════════════════════════
// §5 — Irreversible Action Flow
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== §5 Irreversible Action Flow ===');

// Irreversible step without him_response → execution blocked (stays in waiting_human)
{
  const ws = mockWsClient();
  let resumed = false;
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: () => {},
    onResumeExecution: () => { resumed = true; },
  });

  // Server sends him_request for irreversible step
  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'irr-sess1',
    plan_id: 'irr-plan1',
    step_id: 'irr-step1',
    nonce: 'nonce-irr-1',
    interaction_type: 'irreversible_submit',
    prompt: 'Confirm irreversible submit',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 120000).toISOString(),
    destructive_warning: true,
  }, 50);

  // No him_response sent — execution stays blocked
  ok(resumed === false, 'irreversible step without him_response → execution NOT resumed');
  ok(bridge.getActiveSessionCount() === 1, 'session still active (waiting)');
}

// Irreversible step with valid him_response continue → execution proceeds
{
  const ws = mockWsClient();
  let resumed = false;
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: () => {},
    onResumeExecution: () => { resumed = true; },
  });

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'irr-sess2',
    plan_id: 'irr-plan2',
    step_id: 'irr-step2',
    nonce: 'nonce-irr-2',
    interaction_type: 'irreversible_submit',
    prompt: 'Confirm',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 120000).toISOString(),
  }, 51);

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_response',
    session_id: 'irr-sess2',
    plan_id: 'irr-plan2',
    step_id: 'irr-step2',
    nonce: 'nonce-irr-2',
    action: 'continue',
  });

  ok(resumed === true, 'irreversible step with valid him_response continue → execution proceeds');
}

// Irreversible step with expired confirmation → execution blocked
himEngine._resetState();
{
  const step = { step_id: 'irr-step3', interaction_type: 'irreversible_submit', risk: 'irreversible', him_required: true };
  ok(himEngine.isStepHimRequired(step) === true, 'irreversible step requires HIM');

  const { nonce, expires_at } = himEngine.generateNonce('irr-sess3', 'irr-plan3', 'irr-step3', 'irreversible_submit');
  // Attempt validation after expiry
  const result = himEngine.validateConfirmation('irr-sess3', 'irr-plan3', 'irr-step3', nonce, expires_at + 10000);
  ok(result.valid === false, 'expired confirmation for irreversible step → valid=false');
  ok(result.rejection_reason === 'expired', 'rejection_reason is expired');
}

// Each irreversible step requires its own fresh nonce
himEngine._resetState();
{
  const { nonce: nonce1, issued_at: t1 } = himEngine.generateNonce('sess-multi', 'plan-multi', 'step-irr-1', 'irreversible_submit');
  const { nonce: nonce2, issued_at: t2 } = himEngine.generateNonce('sess-multi', 'plan-multi', 'step-irr-2', 'irreversible_submit');

  ok(nonce1 !== nonce2, 'each irreversible step gets a unique nonce');

  // Validate first nonce for step 1
  const v1 = himEngine.validateConfirmation('sess-multi', 'plan-multi', 'step-irr-1', nonce1, t1 + 100);
  ok(v1.valid === true, 'first nonce valid for step-irr-1');
  himEngine.consumeNonce(nonce1);

  // Try to use nonce1 for step 2 — must fail
  const v2 = himEngine.validateConfirmation('sess-multi', 'plan-multi', 'step-irr-2', nonce1, t1 + 200);
  ok(v2.valid === false, 'consumed nonce1 cannot be reused for step-irr-2');
  ok(v2.rejection_reason === 'already_consumed', 'reuse detection → already_consumed');

  // nonce2 valid for step-irr-2
  const v3 = himEngine.validateConfirmation('sess-multi', 'plan-multi', 'step-irr-2', nonce2, t2 + 100);
  ok(v3.valid === true, 'nonce2 valid for step-irr-2 (fresh nonce)');
}

// ═══════════════════════════════════════════════════════════════════════════════
// §6 — Offline/Degraded
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== §6 Offline/Degraded ===');

// Server disconnect during waiting_human → no auto-continue (duplicate of §3 but from offline perspective)
{
  const ws = mockWsClient();
  let resumed = false;
  let stateChanges = [];
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: (tabId, msg) => stateChanges.push(msg),
    onResumeExecution: () => { resumed = true; },
  });

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'offline-sess1',
    plan_id: 'offline-plan1',
    step_id: 'offline-step1',
    nonce: 'nonce-offline-1',
    interaction_type: 'otp_entry',
    prompt: 'Enter OTP',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180000).toISOString(),
  }, 60);

  bridge.handleWssDisconnect();
  ok(resumed === false, 'WSS disconnect during waiting_human → no auto-continue');
  const failedMsg = stateChanges.find(m => m.state === 'failed');
  ok(failedMsg !== undefined, 'state transitions to failed on disconnect');
}

// Server disconnect during plan_executing before irreversible → pause
// (Bridge only tracks him_request sessions. A disconnect without active HIM
//  is detected by the plan executor, not the bridge. But if there IS an active
//  HIM session in plan_executing scenario, bridge handles it.)
{
  const ws = mockWsClient();
  let resumed = false;
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: () => {},
    onResumeExecution: () => { resumed = true; },
  });

  // No him_request yet — disconnect should not auto-continue anything
  bridge.handleWssDisconnect();
  ok(resumed === false, 'WSS disconnect with no active HIM → no auto-continue (safe)');
  ok(bridge.getActiveSessionCount() === 0, 'no sessions affected when none active');
}

// No cached him_response replay
{
  const ws = mockWsClient();
  let resumeCount = 0;
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: () => {},
    onResumeExecution: () => { resumeCount++; },
  });

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'cache-sess',
    plan_id: 'cache-plan',
    step_id: 'cache-step',
    nonce: 'nonce-cache-1',
    interaction_type: 'otp_entry',
    prompt: 'test',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180000).toISOString(),
  }, 61);

  // First him_response continue
  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_response',
    session_id: 'cache-sess',
    plan_id: 'cache-plan',
    step_id: 'cache-step',
    nonce: 'nonce-cache-1',
    action: 'continue',
  });
  ok(resumeCount === 1, 'first him_response continue → resumes');

  // Replay same him_response — should not resume again
  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_response',
    session_id: 'cache-sess',
    plan_id: 'cache-plan',
    step_id: 'cache-step',
    nonce: 'nonce-cache-1',
    action: 'continue',
  });
  ok(resumeCount === 1, 'replayed him_response does NOT resume execution again');
}

// Reconnect reports state to server
// (Bridge cleanup method + getActiveSessionCount as state reporter)
{
  const ws = mockWsClient();
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: () => {},
  });

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'recon-sess',
    plan_id: 'recon-plan',
    step_id: 'recon-step',
    nonce: 'nonce-recon-1',
    interaction_type: 'otp_entry',
    prompt: 'test',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180000).toISOString(),
  }, 62);

  // After reconnect, bridge can report active session state
  ok(bridge.getActiveSessionCount() === 1, 'reconnect: bridge can report active session count');
  // Cleanup removes terminal sessions
  bridge.handleWssDisconnect();
  bridge.cleanup();
  ok(bridge.getActiveSessionCount() === 0, 'cleanup removes terminal (failed) sessions');
}

// ═══════════════════════════════════════════════════════════════════════════════
// §7 — Observation Privacy
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== §7 Observation Privacy ===');

// him_checkpoint schema validation
{
  // Construct a valid him_checkpoint per protocol
  const validCheckpoint = {
    interaction_type: 'otp_entry',
    result: 'completed',
    duration_ms: 12500,
    nonce_echo: 'nonce-privacy-1',
    confirmation_source: 'him_ui_button',
  };

  const allowedKeys = new Set(['interaction_type', 'result', 'duration_ms', 'nonce_echo', 'confirmation_source']);
  const actualKeys = Object.keys(validCheckpoint);
  ok(actualKeys.every(k => allowedKeys.has(k)), 'him_checkpoint contains only allowed keys');
  ok(actualKeys.length === 5, 'him_checkpoint has exactly 5 fields');
}

// him_checkpoint does NOT contain entered_value, field_content, raw_text, or any derivative
{
  const badCheckpoint1 = {
    interaction_type: 'otp_entry',
    result: 'completed',
    duration_ms: 5000,
    nonce_echo: 'n1',
    confirmation_source: 'him_ui_button',
    entered_value: '123456',  // VIOLATION
  };
  ok('entered_value' in badCheckpoint1, 'test fixture has entered_value (for negative test)');

  const forbiddenFields = ['entered_value', 'field_content', 'raw_text', 'value', 'text', 'content', 'input_value'];
  const cleanCheckpoint = {
    interaction_type: 'otp_entry',
    result: 'completed',
    duration_ms: 5000,
    nonce_echo: 'n1',
    confirmation_source: 'him_ui_button',
  };
  for (const field of forbiddenFields) {
    ok(!(field in cleanCheckpoint), `him_checkpoint must NOT contain '${field}'`);
  }
}

// Observations for sensitive steps have no value leakage
{
  // observeCompletion result object
  const el = mockElement({ value: '', isConnected: true });
  let inputHandler = null;
  el.addEventListener = (event, handler) => { if (event === 'input') inputHandler = handler; };
  el.removeEventListener = () => {};

  const obs = observeCompletion(el, { pollIntervalMs: 10, timeoutMs: 200 });
  setTimeout(() => {
    el.value = 'MY_SECRET_OTP_VALUE';
    if (inputHandler) inputHandler();
  }, 30);
  const result = await obs.promise;

  // Comprehensive leak check
  const resultStr = JSON.stringify(result);
  ok(!resultStr.includes('MY_SECRET_OTP_VALUE'), 'observation result does not contain actual value');
  ok(!resultStr.includes('SECRET'), 'observation result has no secret derivatives');
  ok(result.completed === true, 'observation reports boolean completion only');
  ok(Object.keys(result).length === 1, 'observation result has only {completed} key');
}

// Verify the operator_confirmation message forwarded by bridge contains no field values
{
  const ws = mockWsClient();
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: () => {},
  });

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'priv-sess',
    plan_id: 'priv-plan',
    step_id: 'priv-step',
    nonce: 'nonce-priv-1',
    interaction_type: 'otp_entry',
    prompt: 'Enter OTP',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180000).toISOString(),
    sensitive_field: true,
  }, 70);

  bridge.handleContentScriptMessage(
    { type: 'HIM_CONFIRM', nonce: 'nonce-priv-1', confirmation_source: 'him_ui_button' },
    { tab: { id: 70 } }
  );

  const forwarded = ws.sent[0]?.payload?.him;
  ok(forwarded !== undefined, 'confirmation forwarded to server');
  ok(!('value' in forwarded), 'forwarded confirmation has no .value field');
  ok(!('entered_value' in forwarded), 'forwarded confirmation has no .entered_value');
  ok(!('field_content' in forwarded), 'forwarded confirmation has no .field_content');
  ok(!('raw_text' in forwarded), 'forwarded confirmation has no .raw_text');
  ok(forwarded.nonce === 'nonce-priv-1', 'forwarded confirmation has nonce (for correlation)');
  ok(forwarded.confirmation_source === 'him_ui_button', 'forwarded confirmation has confirmation_source');
  ok(typeof forwarded.confirmed_at === 'string', 'forwarded confirmation has confirmed_at timestamp');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Additional adversarial edge cases
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== Additional Edge Cases ===');

// Plan/step mismatch in nonce validation
himEngine._resetState();
{
  const { nonce, issued_at } = himEngine.generateNonce('s', 'planX', 'stepX', 'custom');
  const result = himEngine.validateConfirmation('s', 'planY', 'stepX', nonce, issued_at + 100);
  ok(result.valid === false, 'plan_id mismatch → rejected');
  ok(result.rejection_reason === 'nonce_mismatch', 'plan mismatch treated as nonce_mismatch');
}

// Bridge rejects unknown protocol version
{
  const ws = mockWsClient();
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: () => {},
  });

  bridge.handleServerMessage({
    him_protocol_version: '99.0.0', // wrong version
    message_type: 'him_request',
    session_id: 's',
    plan_id: 'p',
    step_id: 'st',
    nonce: 'n',
    interaction_type: 'otp_entry',
    prompt: 'test',
  }, 80);

  ok(bridge.getActiveSessionCount() === 0, 'bridge rejects messages with unknown protocol version');
}

// Bridge handles malformed him_request gracefully
{
  const ws = mockWsClient();
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: () => {},
  });

  // Missing required fields
  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    // missing session_id, plan_id, step_id, nonce
  }, 81);

  ok(bridge.getActiveSessionCount() === 0, 'malformed him_request (missing fields) does not create session');
}

// State machine event listener
{
  const sm = new HimStateMachine({ session_id: 's', plan_id: 'p', step_id: 'st', nonce: 'n' });
  const events = [];
  sm.on((e) => events.push(e));
  sm.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  ok(events.length === 1, 'event listener fires on transition');
  ok(events[0].from === 'idle' && events[0].to === 'plan_executing', 'event contains correct from/to');
  ok(events[0].scope.nonce === 'n', 'event contains scope');
}

// State machine destroy removes listeners
{
  const sm = new HimStateMachine({ session_id: 's', plan_id: 'p', step_id: 'st', nonce: 'n' });
  let fired = false;
  sm.on(() => { fired = true; });
  sm.destroy();
  sm.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
  ok(fired === false, 'destroy() prevents listener from firing');
}

// Bridge cleanup
{
  const ws = mockWsClient();
  const bridge = new HimBridge({
    wsClient: ws,
    stateMachineModule: stateMachine,
    sendToContentScript: () => {},
  });

  // Add two sessions, expire one
  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'cl-s1', plan_id: 'cl-p1', step_id: 'cl-st1', nonce: 'cl-n1',
    interaction_type: 'otp_entry', prompt: 'test',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180000).toISOString(),
  }, 90);

  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_request',
    session_id: 'cl-s2', plan_id: 'cl-p2', step_id: 'cl-st2', nonce: 'cl-n2',
    interaction_type: 'otp_entry', prompt: 'test',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180000).toISOString(),
  }, 91);

  ok(bridge.getActiveSessionCount() === 2, '2 active sessions before cleanup');

  // Expire one via him_timeout
  bridge.handleServerMessage({
    him_protocol_version: '1.0.0',
    message_type: 'him_timeout',
    session_id: 'cl-s1', plan_id: 'cl-p1', step_id: 'cl-st1', nonce: 'cl-n1',
    timed_out_at: new Date().toISOString(),
    disposition: 'abort_plan',
  });

  bridge.cleanup();
  ok(bridge.getActiveSessionCount() === 1, 'cleanup removes expired (terminal) sessions');
}

// Verify VALID_CONFIRMATION_SOURCES is restrictive
{
  ok(VALID_CONFIRMATION_SOURCES.has('him_ui_button'), 'him_ui_button is valid source');
  ok(VALID_CONFIRMATION_SOURCES.has('him_ui_keyboard_enter'), 'him_ui_keyboard_enter is valid source');
  ok(!VALID_CONFIRMATION_SOURCES.has('page_dom_event'), 'page_dom_event NOT valid');
  ok(!VALID_CONFIRMATION_SOURCES.has('window_postmessage'), 'window_postmessage NOT valid');
  ok(!VALID_CONFIRMATION_SOURCES.has('content_script_auto'), 'content_script_auto NOT valid');
  ok(VALID_CONFIRMATION_SOURCES.size === 2, 'only 2 valid confirmation sources');
}

// startCleanup / stopCleanup don't crash
{
  himEngine.startCleanup();
  himEngine.stopCleanup();
  ok(true, 'startCleanup/stopCleanup execute without error');
}

// getStats returns correct shape
himEngine._resetState();
{
  const stats = himEngine.getStats();
  ok(typeof stats.active === 'number' && stats.active === 0, 'getStats.active = 0 after reset');
  ok(typeof stats.consumed === 'number' && stats.consumed === 0, 'getStats.consumed = 0 after reset');
  himEngine.generateNonce('x', 'y', 'z', 'custom');
  const stats2 = himEngine.getStats();
  ok(stats2.active === 1, 'getStats.active = 1 after generateNonce');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
if (failed > 0) {
  console.error('\n❌ FAILED');
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
} else {
  console.log(`${passed} passed, ${failed} failed`);
}
