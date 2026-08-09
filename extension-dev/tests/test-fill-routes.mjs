/**
 * Test: /api/fill-plan and /api/fill-observation HTTP routes
 * Validates: auth, large payload acceptance, validation errors, observation ack.
 */
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../extension-service/', import.meta.url));
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-fill-route-tests';
process.env.JWT_SECRET = JWT_SECRET;
process.env.DATA_DIR = './data-test-fill';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/cc_test_fill';

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  \u2713', msg); }
  else { failed++; console.error('  \u2717 FAIL:', msg); }
}

function makeToken(payload = {}) {
  return jwt.sign({ userId: 'u1', workspaceId: 'ws1', role: 'operator', ...payload }, JWT_SECRET);
}

function makeSnapshot(nodeCount = 5) {
  const nodes = {};
  for (let i = 0; i < nodeCount; i++) {
    nodes[`n${i}`] = {
      node_id: `n${i}`,
      type: 'input',
      semantic_label: `Field ${i}`,
      affordances: ['type_text'],
      attributes: { name: `field_${i}` },
    };
  }
  return {
    kind: 'page_snapshot',
    document_id: 'doc-1',
    snapshot_id: 'snap-1',
    revision: 0,
    page: { origin: 'https://ssc.gov.in', route_key: '/form' },
    nodes,
    edges: [],
    state: { signals: [] },
  };
}

async function runTests() {
  // Import starts the server on process.env.PORT
  const PORT = 30000 + Math.floor(Math.random() * 10000);
  process.env.PORT = String(PORT);
  const { server } = await import('../../extension-service/index.js');
  // Wait a tick for listen callback
  await new Promise(r => setTimeout(r, 200));
  const BASE = `http://127.0.0.1:${PORT}`;

  async function req(path, method, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  }

  const token = makeToken();

  // ── /api/fill-plan tests ─────────────────────────────────────────────

  // 1. Rejects unauthenticated
  {
    const r = await req('/api/fill-plan', 'POST', { snapshot: makeSnapshot(), profile: { name: 'Test' } });
    ok(r.status === 401, '/fill-plan rejects unauthenticated request');
  }

  // 2. Rejects missing snapshot
  {
    const r = await req('/api/fill-plan', 'POST', { profile: { name: 'Test' } }, token);
    ok(r.status === 400 && r.json?.error?.includes('snapshot'), '/fill-plan rejects missing snapshot');
  }

  // 3. Rejects missing profile
  {
    const r = await req('/api/fill-plan', 'POST', { snapshot: makeSnapshot(), profile: {} }, token);
    ok(r.status === 400 && r.json?.error?.includes('profile'), '/fill-plan rejects empty profile');
  }

  // 4. Rejects invalid snapshot (missing required fields)
  {
    const r = await req('/api/fill-plan', 'POST', { snapshot: { kind: 'wrong' }, profile: { name: 'Test' } }, token);
    ok(r.status === 422, '/fill-plan rejects invalid snapshot with 422');
  }

  // 5. Accepts valid snapshot (may fail at mapping level but returns 200)
  {
    const r = await req('/api/fill-plan', 'POST', {
      snapshot: makeSnapshot(3),
      profileId: 'p1',
      profile: { name: 'Yashaswi', father_name: 'Test' },
    }, token);
    ok(r.status === 200, '/fill-plan returns 200 for valid request');
    ok(r.json && 'plan' in r.json && 'diagnostics' in r.json, '/fill-plan response has plan and diagnostics');
  }

  // 6. Handles large payload (simulating a real page with many nodes > 100KB)
  {
    const bigSnapshot = makeSnapshot(1000); // ~1000 nodes should be > 100KB JSON
    const bodySize = JSON.stringify({ snapshot: bigSnapshot, profile: { name: 'Test' }, profileId: 'p1' }).length;
    ok(bodySize > 100_000, `Large payload is ${(bodySize / 1024).toFixed(0)}KB (> 100KB)`);
    const r = await req('/api/fill-plan', 'POST', {
      snapshot: bigSnapshot,
      profileId: 'p1',
      profile: { name: 'Test', phone: '9876543210' },
    }, token);
    ok(r.status === 200, '/fill-plan accepts large payload without 413');
  }

  // ── /api/fill-observation tests ──────────────────────────────────────

  // 7. Rejects unauthenticated
  {
    const r = await req('/api/fill-observation', 'POST', { planId: 'p1', steps: [] });
    ok(r.status === 401, '/fill-observation rejects unauthenticated');
  }

  // 8. Rejects missing planId
  {
    const r = await req('/api/fill-observation', 'POST', { steps: [] }, token);
    ok(r.status === 400 && r.json?.error?.includes('planId'), '/fill-observation rejects missing planId');
  }

  // 9. Accepts valid observation
  {
    const r = await req('/api/fill-observation', 'POST', {
      sessionId: null,
      planId: 'plan-123',
      snapshot_id: 'snap-1',
      outcome: 'completed',
      steps: [
        { step_id: 's1', status: 'succeeded', failure_code: null },
        { step_id: 's2', status: 'failed', failure_code: 'stale_target' },
      ],
    }, token);
    ok(r.status === 200, '/fill-observation returns 200 for valid observation');
    ok(r.json && 'acknowledged' in r.json, '/fill-observation response has acknowledged field');
  }

  // Cleanup
  server.close();
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
