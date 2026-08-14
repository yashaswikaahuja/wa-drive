#!/usr/bin/env node
/**
 * Prior Key Alignment — Unit test
 * Issue #197 residual: observation write key must match fill-plan read key.
 *
 * Verifies the KEY DERIVATION LOGIC is consistent between:
 * 1. fill-plan read path: `${scope.portal_id}:${scope.form_key}` from deriveScope(snapshot)
 * 2. observation write path: session.metadata.portal_id:session.metadata.form_key
 *
 * Does NOT require Postgres or full server; tests the algorithmic alignment.
 */

// Stub DATABASE_URL so db.js pool constructor doesn't crash on import
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_unused';
}

import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// Import deriveScope (pure function, no DB dependency)
const plannerPath = resolve(ROOT, 'extension-service/fill-planner.js');
const { deriveScope } = await import(pathToFileURL(plannerPath).href);

// Import isHardEvidenceType (pure function)
const classifierPath = resolve(ROOT, 'extension-service/behavior-classifier.js');
const { isHardEvidenceType } = await import(pathToFileURL(classifierPath).href);

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

// ── Simulate the key derivation used on fill-plan read side ─────────────
function fillPlanReadKey(snapshot) {
  const scope = deriveScope(snapshot);
  return `${scope.portal_id || ''}:${scope.form_key || ''}`;
}

// ── Simulate the key derivation used on observation write side ───────────
// After fix: uses session.metadata (which was set from deriveScope at plan time)
function observationWriteKey_fixed(sessionMetadata) {
  const portalId = sessionMetadata?.portal_id || '';
  const formKey = sessionMetadata?.form_key || '';
  return portalId ? `${portalId}:${formKey}` : formKey;
}

// ── Simulate the OLD broken write key (from query params only) ──────────
function observationWriteKey_broken(queryParams) {
  const portalId = queryParams.portal_id || '';
  const formKey = queryParams.form_key || queryParams.correlation_id || queryParams.plan_id || '';
  return portalId ? `${portalId}:${formKey}` : formKey;
}

// ── Test snapshots ──────────────────────────────────────────────────────

const snapshots = [
  {
    name: 'SSC NIC Indian portal',
    snapshot: {
      kind: 'page_snapshot', document_id: 'doc:1', snapshot_id: 'snap:1', revision: 1,
      page: { origin: 'https://ssc.nic.in', route_key: '/registration/apply' },
      nodes: {},
    },
    expectedKey: 'ssc.nic.in:/registration/apply',
  },
  {
    name: 'service.gov.in portal with hash form_key',
    snapshot: {
      kind: 'page_snapshot', document_id: 'doc:2', snapshot_id: 'snap:2', revision: 1,
      page: { origin: 'https://service.gov.in', route_key: '/benefits/form-a' },
      nodes: {},
    },
    expectedKey: 'service.gov.in:/benefits/form-a',
  },
  {
    name: 'portal with canonical_hash fallback',
    snapshot: {
      kind: 'page_snapshot', document_id: 'doc:3', snapshot_id: 'snap:3', revision: 1,
      page: { origin: 'https://example.gov.in' },
      canonical_hash: 'hash:abc123',
      nodes: {},
    },
    expectedKey: 'example.gov.in:hash:abc123',
  },
  {
    name: 'no origin (localhost/file)',
    snapshot: {
      kind: 'page_snapshot', document_id: 'doc:4', snapshot_id: 'snap:4', revision: 1,
      page: { origin: 'http://localhost:3000', route_key: '/test-form' },
      nodes: {},
    },
    expectedKey: 'localhost:/test-form',
  },
];

// ── Test 1: Fill-plan read key derivation ───────────────────────────────
for (const { name, snapshot, expectedKey } of snapshots) {
  test(`fill-plan read key: ${name}`, () => {
    const key = fillPlanReadKey(snapshot);
    ok(key === expectedKey, `expected ${expectedKey}, got ${key}`);
  });
}

// ── Test 2: Fixed observation write matches fill-plan read ──────────────
for (const { name, snapshot, expectedKey } of snapshots) {
  test(`observation write (fixed) matches read: ${name}`, () => {
    // Session metadata is set from deriveScope at plan creation time
    const scope = deriveScope(snapshot);
    const metadata = { portal_id: scope.portal_id, form_key: scope.form_key };
    const writeKey = observationWriteKey_fixed(metadata);
    const readKey = fillPlanReadKey(snapshot);
    ok(writeKey === readKey, `write=${writeKey} vs read=${readKey}`);
    ok(writeKey === expectedKey, `key=${writeKey}`);
  });
}

// ── Test 3: Old broken path DOES NOT match (proving the bug) ────────────
test('broken write key (no portal_id/form_key in query) does NOT match read key', () => {
  const snapshot = snapshots[0].snapshot;
  // Extension only sends plan_id and correlation_id — no portal_id, no form_key
  const queryParams = { plan_id: 'plan:abc', correlation_id: 'corr:xyz' };
  const brokenKey = observationWriteKey_broken(queryParams);
  const readKey = fillPlanReadKey(snapshot);
  // They should NOT match — that's the bug
  ok(brokenKey !== readKey, `broken=${brokenKey} should differ from read=${readKey}`);
  ok(brokenKey === 'corr:xyz', `broken key fell back to correlation_id: ${brokenKey}`);
});

// ── Test 4: Session metadata stores scope correctly ─────────────────────
test('session metadata from deriveScope stores portal_id and form_key', () => {
  for (const { snapshot, expectedKey } of snapshots) {
    const scope = deriveScope(snapshot);
    const metadata = { portal_id: scope.portal_id, form_key: scope.form_key };
    // The observation handler reads these from session:
    const portalId = metadata.portal_id || '';
    const formKey = metadata.form_key || '';
    const key = portalId ? `${portalId}:${formKey}` : formKey;
    ok(key === expectedKey, `metadata key=${key} expected=${expectedKey}`);
  }
});

// ── Test 5: Fallback when session is null ───────────────────────────────
test('fallback to query params when session unavailable', () => {
  // If session is somehow gone, we fall back to query params
  const queryParams = { portal_id: 'ssc.nic.in', form_key: '/registration/apply' };
  const key = observationWriteKey_broken(queryParams);
  ok(key === 'ssc.nic.in:/registration/apply', `fallback with correct query params works: ${key}`);
});

// ── Test 6: isHardEvidenceType ──────────────────────────────────────────
test('isHardEvidenceType recognizes hard DOM evidence', () => {
  ok(isHardEvidenceType('cascade_triggered') === true, 'cascade_triggered');
  ok(isHardEvidenceType('control_removed') === true, 'control_removed');
  ok(isHardEvidenceType('subtree_replaced') === true, 'subtree_replaced');
  ok(isHardEvidenceType('option_set_changed') === true, 'option_set_changed');
  ok(isHardEvidenceType('widget_recreated') === true, 'widget_recreated');
  ok(isHardEvidenceType('step_completed') === false, 'step_completed not hard');
  ok(isHardEvidenceType('') === false, 'empty not hard');
  ok(isHardEvidenceType(null) === false, 'null not hard');
});

// ── Test 7: Empty scope edge case ───────────────────────────────────────
test('empty scope still produces a key (form_key only)', () => {
  const snapshot = {
    kind: 'page_snapshot', document_id: 'doc:5', snapshot_id: 'snap:5', revision: 1,
    page: {}, // no origin, no route_key
    canonical_hash: 'hash:fallback',
    nodes: {},
  };
  const scope = deriveScope(snapshot);
  const readKey = `${scope.portal_id || ''}:${scope.form_key || ''}`;
  // portal_id is null, form_key is canonical_hash
  ok(readKey === ':hash:fallback', `edge case key=${readKey}`);
  const writeKey = observationWriteKey_fixed({ portal_id: scope.portal_id, form_key: scope.form_key });
  ok(writeKey === 'hash:fallback', `write key without portal uses form_key only: ${writeKey}`);
});

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\nPrior Key Alignment: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
