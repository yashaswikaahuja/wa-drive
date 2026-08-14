#!/usr/bin/env node
/**
 * Phase 4.10 — WSS Adaptive Execution Transport unit tests
 * Issue #204: fill_plan_request + fill_observation_wss handlers.
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_unused';
}

import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

let passed = 0;
let failed = 0;

function ok(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function test(name, fn) {
  try { fn(); }
  catch (e) { failed++; console.error(`  FAIL: ${name} — ${e.message}`); }
}

// ── Source verification ─────────────────────────────────────────────────

const handlersSource = readFileSync(resolve(ROOT, 'extension-service/ws-handlers.js'), 'utf8');

test('ws-handlers has fill_plan_request handler', () => {
  ok(handlersSource.includes("handlers.set('fill_plan_request'"), 'fill_plan_request registered');
});

test('ws-handlers has fill_observation_wss handler', () => {
  ok(handlersSource.includes("handlers.set('fill_observation_wss'"), 'fill_observation_wss registered');
});

test('fill_plan_request imports classifyFormBehavior', () => {
  ok(handlersSource.includes('classifyFormBehavior'), 'uses classifier');
});

test('fill_plan_request imports mergeExecutionMode', () => {
  ok(handlersSource.includes('mergeExecutionMode'), 'uses mode merge');
});

test('fill_plan_request imports applyStaticBounds', () => {
  ok(handlersSource.includes('applyStaticBounds'), 'uses static bounds');
});

test('fill_plan_request has anti-duplicate filter', () => {
  ok(handlersSource.includes('getCommittedNodeIds'), 'anti-duplicate');
  ok(handlersSource.includes('anti_duplicate_filtered'), 'reports filtered count');
});

test('fill_plan_request has plan race supersession', () => {
  ok(handlersSource.includes('supersedePlan'), 'supersedes prior plan');
  ok(handlersSource.includes('supersedes_plan_id'), 'reports superseded id');
});

test('fill_plan_request has fill_complete detection', () => {
  ok(handlersSource.includes('fill_complete: true'), 'fill_complete flag');
});

test('fill_plan_request sends fill_plan_response', () => {
  ok(handlersSource.includes("type: 'fill_plan_response'"), 'response type correct');
});

test('fill_observation_wss has plan race guard', () => {
  ok(handlersSource.includes('isPlanActive'), 'checks plan active');
  ok(handlersSource.includes("code: 'stale_plan'"), 'rejects stale plan');
});

test('fill_observation_wss sends fill_observation_rejected on stale', () => {
  ok(handlersSource.includes("type: 'fill_observation_rejected'"), 'rejection message type');
});

test('fill_observation_wss marks steps completed', () => {
  ok(handlersSource.includes('markStepCompleted'), 'marks completed steps');
  ok(handlersSource.includes('markStepFailed'), 'marks failed steps');
});

test('fill_observation_wss sends fill_observation_ack', () => {
  ok(handlersSource.includes("type: 'fill_observation_ack'"), 'ack message type');
});

// ── Behavioral parity with HTTPS ────────────────────────────────────────

test('WSS uses same classification as HTTPS', () => {
  // Both import from behavior-classifier.js
  ok(handlersSource.includes("'./behavior-classifier.js'"), 'same classifier module');
});

test('WSS uses same execution-mode merge as HTTPS', () => {
  ok(handlersSource.includes("'./execution-mode.js'"), 'same mode module');
});

test('WSS uses same static-bounds as HTTPS', () => {
  ok(handlersSource.includes("'./static-bounds.js'"), 'same bounds module');
});

test('WSS uses same fill-session as HTTPS', () => {
  ok(handlersSource.includes("'./fill-session.js'"), 'same session module');
});

test('WSS dynamic clamp same as HTTPS (steps.length === 1)', () => {
  ok(handlersSource.includes("plan.steps = [plan.steps[0]]"), 'clamps to 1 step');
  ok(handlersSource.includes("planClamped = true"), 'sets planClamped flag');
});

// ── No duplicate on reconnect ───────────────────────────────────────────

test('resume handler exists (reconnect support)', () => {
  ok(handlersSource.includes("handlers.set('resume'"), 'resume handler registered');
});

test('dedupe by message id prevents double-fill', () => {
  // ws-server.js has seenMessageIds dedupe
  const wsSource = readFileSync(resolve(ROOT, 'extension-service/ws-server.js'), 'utf8');
  ok(wsSource.includes('seenMessageIds'), 'message id dedupe in ws-server');
  ok(wsSource.includes('duplicate_message'), 'duplicate rejection');
});

// ── Protocol safety ─────────────────────────────────────────────────────

test('WSS does not classify independently (uses server modules)', () => {
  // Should NOT have its own classification logic inline
  ok(!handlersSource.includes('HARD_EVIDENCE_TYPES = new Set'), 'no inline hard evidence set');
});

test('WSS does not skip demotion safety', () => {
  ok(handlersSource.includes('preference_demotion'), 'demotion passed through');
});

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\nWSS Adaptive Transport (M4.10): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
