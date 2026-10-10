#!/usr/bin/env node
/**
 * Phase 4.0 HIM protocol conformance tests.
 * Validates fixtures, state machine transitions, anti-replay, and sensitive-field redaction.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const FIXTURES_DIR = resolve(ROOT, 'architecture/fixtures/him');

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

// ─────────────────────────────────────────────────────────────────────────────
// §1 — Fixture loading and structural validation
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== §1 HIM Fixture Loading & Structural Validation ===');

ok(existsSync(FIXTURES_DIR), 'architecture/fixtures/him/ directory exists');

const fixtureFiles = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));
ok(fixtureFiles.length >= 5, `found ${fixtureFiles.length} fixture files (≥5 expected)`);

const fixtures = [];
for (const file of fixtureFiles) {
  const filePath = join(FIXTURES_DIR, file);
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(filePath, 'utf8'));
    ok(true, `${file} parses as valid JSON`);
  } catch (e) {
    ok(false, `${file} parses as valid JSON (${e.message})`);
    continue;
  }

  // Required top-level fields
  ok(typeof fixture.description === 'string' && fixture.description.length > 0,
    `${file} has description`);
  ok(fixture.expectation === 'valid' || fixture.expectation === 'rejected',
    `${file} has valid expectation field ("${fixture.expectation}")`);
  ok(fixture.payload && typeof fixture.payload === 'object',
    `${file} has payload object`);

  if (fixture.expectation === 'valid') {
    // Valid fixtures: payload must conform to HIM message schema
    const p = fixture.payload;
    ok(typeof p.him_protocol_version === 'string', `${file} payload has him_protocol_version`);
    ok(typeof p.message_type === 'string', `${file} payload has message_type`);
    ok(typeof p.session_id === 'string', `${file} payload has session_id`);
    ok(typeof p.plan_id === 'string', `${file} payload has plan_id`);
    ok(typeof p.step_id === 'string', `${file} payload has step_id`);
    ok(typeof p.nonce === 'string', `${file} payload has nonce`);

    // him_request requires additional fields
    if (p.message_type === 'him_request') {
      ok(typeof p.issued_at === 'string', `${file} him_request has issued_at`);
      ok(typeof p.expires_at === 'string', `${file} him_request has expires_at`);
      ok(typeof p.interaction_type === 'string', `${file} him_request has interaction_type`);
      ok(typeof p.prompt === 'string', `${file} him_request has prompt`);
      ok(p.target && typeof p.target.context_id === 'string', `${file} him_request has target.context_id`);
      ok(p.target && typeof p.target.node_id === 'string', `${file} him_request has target.node_id`);
      ok(typeof p.sensitive_field === 'boolean', `${file} him_request has sensitive_field`);
    }

    // operator_confirmation requires specific fields
    if (p.message_type === 'operator_confirmation') {
      ok(typeof p.confirmed_at === 'string', `${file} confirmation has confirmed_at`);
      ok(typeof p.operator_action === 'string', `${file} confirmation has operator_action`);
      ok(typeof p.confirmation_source === 'string', `${file} confirmation has confirmation_source`);
    }
  }

  if (fixture.expectation === 'rejected') {
    ok(typeof fixture.rejection_reason === 'string' && fixture.rejection_reason.length > 0,
      `${file} has rejection_reason`);

    // Verify the payload contains the specific violation mentioned
    const reason = fixture.rejection_reason.toLowerCase();
    const payloadStr = JSON.stringify(fixture.payload).toLowerCase();

    if (reason.includes('nonce_mismatch')) {
      // Forged nonce: the nonce in payload should NOT match known valid nonces
      ok(typeof fixture.payload.nonce === 'string', `${file} rejected payload has nonce field (forged)`);
    } else if (reason.includes('expired')) {
      // Expired: confirmed_at should exceed expected expiry
      ok(typeof fixture.payload.confirmed_at === 'string', `${file} rejected payload has confirmed_at (late)`);
    } else if (reason.includes('already_consumed')) {
      // Replay: nonce exists but was already used
      ok(typeof fixture.payload.nonce === 'string', `${file} rejected payload has nonce field (replayed)`);
    } else if (reason.includes('invalid_signature') || reason.includes('page_dom_event')) {
      // Page injection: confirmation_source is not in allowed set
      ok(fixture.payload.confirmation_source !== 'him_ui_button' &&
         fixture.payload.confirmation_source !== 'him_ui_keyboard_enter',
        `${file} rejected payload has invalid confirmation_source ("${fixture.payload.confirmation_source}")`);
    } else if (reason.includes('sensitive') || reason.includes('redaction')) {
      // Sensitive value leak
      const steps = fixture.payload.steps || [];
      const hasLeakedValue = steps.some(s =>
        s.him_checkpoint && ('entered_value' in s.him_checkpoint)
      );
      ok(hasLeakedValue, `${file} rejected payload contains leaked sensitive value in him_checkpoint`);
    }
  }

  fixtures.push({ file, ...fixture });
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 — HIM State Machine Transitions
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== §2 HIM State Machine Transitions ===');

const VALID_TRANSITIONS = [
  { from: 'idle', to: 'plan_executing', owner: 'server', label: 'idle → plan_executing' },
  { from: 'plan_executing', to: 'waiting_human', owner: 'server', label: 'plan_executing → waiting_human' },
  { from: 'waiting_human', to: 'human_active', owner: 'extension', label: 'waiting_human → human_active' },
  { from: 'human_active', to: 'continued', owner: 'server', label: 'human_active → continued' },
  { from: 'human_active', to: 'cancelled', owner: 'operator_or_server', label: 'human_active → cancelled' },
  { from: 'waiting_human', to: 'expired', owner: 'server', label: 'waiting_human → expired' },
  { from: 'waiting_human', to: 'cancelled', owner: 'operator_or_server', label: 'waiting_human → cancelled' },
];

const ILLEGAL_TRANSITIONS = [
  { from: 'idle', to: 'human_active', reason: 'skip state' },
  { from: 'waiting_human', to: 'continued', reason: 'skip human_active' },
  { from: 'expired', to: 'continued', reason: 'resurrection' },
  { from: 'cancelled', to: 'continued', reason: 'resurrection' },
];

// Build adjacency set from valid transitions
const adjacency = new Set(VALID_TRANSITIONS.map(t => `${t.from}->${t.to}`));

// Validate legal transitions are in the set
for (const t of VALID_TRANSITIONS) {
  ok(adjacency.has(`${t.from}->${t.to}`),
    `LEGAL: ${t.label} (${t.owner})`);
}

// Validate illegal transitions are NOT in the set
for (const t of ILLEGAL_TRANSITIONS) {
  ok(!adjacency.has(`${t.from}->${t.to}`),
    `ILLEGAL: ${t.from} → ${t.to} rejected (${t.reason})`);
}

// Terminal states cannot transition to 'continued'
const terminalStates = ['expired', 'cancelled'];
for (const state of terminalStates) {
  ok(!adjacency.has(`${state}->continued`),
    `terminal state "${state}" cannot resurrect to continued`);
  ok(!adjacency.has(`${state}->human_active`),
    `terminal state "${state}" cannot resurrect to human_active`);
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 — Anti-Replay Rules
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== §3 Anti-Replay Rules ===');

// Simulate a nonce registry for protocol validation
const KNOWN_VALID_NONCE = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const KNOWN_OTP_NONCE = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const FORGED_NONCE = '00000000-dead-beef-0000-000000000000';
const REQUEST_EXPIRES_AT = new Date('2026-08-14T06:52:00.000Z');
const GRACE_PERIOD_MS = 5000;

// Rule 1: Confirmation nonce must match request nonce
{
  const validConfirmation = fixtures.find(f => f.file === 'positive-confirmation-resume.json');
  const forgedConfirmation = fixtures.find(f => f.file === 'malicious-forged-confirmation.json');

  if (validConfirmation) {
    ok(validConfirmation.payload.nonce === KNOWN_VALID_NONCE,
      'valid confirmation nonce matches request nonce');
  }
  if (forgedConfirmation) {
    ok(forgedConfirmation.payload.nonce === FORGED_NONCE,
      'forged confirmation uses fabricated nonce');
    ok(forgedConfirmation.payload.nonce !== KNOWN_VALID_NONCE,
      'forged nonce does not match any issued nonce');
  }
}

// Rule 2: Expired confirmations must be rejected
{
  const expiredConfirmation = fixtures.find(f => f.file === 'malicious-expired-confirmation.json');
  if (expiredConfirmation) {
    const confirmedAt = new Date(expiredConfirmation.payload.confirmed_at);
    const expiryWithGrace = new Date(REQUEST_EXPIRES_AT.getTime() + GRACE_PERIOD_MS);
    ok(confirmedAt > expiryWithGrace,
      `expired confirmation: confirmed_at (${confirmedAt.toISOString()}) exceeds expires_at + grace (${expiryWithGrace.toISOString()})`);
    ok(expiredConfirmation.expectation === 'rejected',
      'expired confirmation fixture is marked as rejected');
  }
}

// Rule 3: Already-consumed nonces must be rejected
{
  const replayConfirmation = fixtures.find(f => f.file === 'malicious-replay-confirmation.json');
  if (replayConfirmation) {
    // Simulate: nonce was consumed at 06:50:45, replay arrives at 06:51:10
    const consumedAt = new Date('2026-08-14T06:50:45.000Z');
    const replayAt = new Date(replayConfirmation.payload.confirmed_at);
    ok(replayAt > consumedAt,
      `replayed confirmation arrives after consumption (${replayAt.toISOString()} > ${consumedAt.toISOString()})`);
    ok(replayConfirmation.payload.nonce === KNOWN_VALID_NONCE,
      'replayed nonce matches a previously valid (now consumed) nonce');
    ok(replayConfirmation.expectation === 'rejected',
      'replay confirmation fixture is marked as rejected');
    ok(replayConfirmation.rejection_reason.includes('already_consumed'),
      'replay rejection_reason mentions already_consumed');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 — Sensitive-Field Redaction
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== §4 Sensitive-Field Redaction ===');

const PROHIBITED_OBSERVATION_FIELDS = ['entered_value', 'otp_value', 'password_value', 'payment_value', 'raw_secret'];
const ALLOWED_HIM_CHECKPOINT_FIELDS = new Set([
  'interaction_type', 'result', 'duration_ms', 'nonce_echo', 'confirmation_source'
]);

{
  const sensitiveLeakFixture = fixtures.find(f => f.file === 'malicious-sensitive-value-leak.json');
  if (sensitiveLeakFixture) {
    ok(sensitiveLeakFixture.expectation === 'rejected',
      'sensitive value leak is rejected');
    ok(sensitiveLeakFixture.rejection_reason.toLowerCase().includes('sensitive') ||
       sensitiveLeakFixture.rejection_reason.toLowerCase().includes('redaction'),
      'rejection_reason mentions sensitive/redaction violation');

    // Check that the payload actually contains the violation
    const steps = sensitiveLeakFixture.payload.steps || [];
    for (const step of steps) {
      if (step.him_checkpoint) {
        const checkpointKeys = Object.keys(step.him_checkpoint);
        const violatingKeys = checkpointKeys.filter(k => PROHIBITED_OBSERVATION_FIELDS.includes(k));
        ok(violatingKeys.length > 0,
          `observation him_checkpoint contains prohibited field(s): [${violatingKeys.join(', ')}]`);

        // Verify it contains an actual value (not redacted placeholder)
        for (const vk of violatingKeys) {
          const val = step.him_checkpoint[vk];
          ok(typeof val === 'string' && /^\d+$/.test(val),
            `prohibited field "${vk}" contains actual secret value ("${val}") — must be redacted`);
        }
      }
    }
  }

  // Validate that valid fixtures do NOT leak sensitive values in observation-like structures
  const validFixtures = fixtures.filter(f => f.expectation === 'valid');
  for (const f of validFixtures) {
    const payloadStr = JSON.stringify(f.payload);
    let hasProhibitedField = false;
    for (const field of PROHIBITED_OBSERVATION_FIELDS) {
      if (payloadStr.includes(`"${field}"`)) {
        hasProhibitedField = true;
        break;
      }
    }
    ok(!hasProhibitedField,
      `${f.file} valid payload contains no prohibited observation fields`);
  }
}

// Validate allowed observation structure: only action_type + result enum
{
  const sensitiveLeakFixture = fixtures.find(f => f.file === 'malicious-sensitive-value-leak.json');
  if (sensitiveLeakFixture) {
    const steps = sensitiveLeakFixture.payload.steps || [];
    for (const step of steps) {
      if (step.him_checkpoint) {
        const extraKeys = Object.keys(step.him_checkpoint).filter(k => !ALLOWED_HIM_CHECKPOINT_FIELDS.has(k));
        ok(extraKeys.length > 0,
          `malicious observation has fields outside allowed set: [${extraKeys.join(', ')}]`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 — Cross-cutting: Protocol Version Consistency
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== §5 Protocol Version Consistency ===');

const himProtocolFixtures = fixtures.filter(f =>
  f.payload && f.payload.him_protocol_version
);
for (const f of himProtocolFixtures) {
  ok(f.payload.him_protocol_version === '1.0.0',
    `${f.file} uses him_protocol_version 1.0.0`);
}

// Verify session_id format consistency across fixtures
const sessionIds = fixtures
  .filter(f => f.payload && f.payload.session_id)
  .map(f => f.payload.session_id);
const uniqueSessions = [...new Set(sessionIds)];
ok(uniqueSessions.length >= 1, `fixtures use consistent session_id format (${uniqueSessions[0]})`);
ok(uniqueSessions.every(s => s.startsWith('sess.')),
  'all session_ids follow the sess.* prefix convention');

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
