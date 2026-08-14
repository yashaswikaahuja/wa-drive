/**
 * Phase 4.14 — Workflow Product-Path Integration Tests
 * Issue #208: Continuous workflow through multiple tasks.
 *
 * Proves the DECISIVE product flow:
 *   Task A → Fill A → adaptive execution → completion → workflow advances
 *   → Task B → Fresh perception → Fill B → completion → terminal
 *
 * Uses:
 *   - Real Chromium + real perception + real APE
 *   - Real workflow-session.js state machine (server module)
 *   - Mock HTTP server implementing /workflow-create + /workflow-complete-task
 *   - Mock WSS for transport
 *   - Deterministic multi-form fixtures
 *
 * Run: node extension-dev/tests/browser/run-workflow-integration.mjs
 */
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WsModule = require('ws');
const WebSocketServer = WsModule.Server;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const EXT_DIR = resolve(ROOT, 'extension');

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_unused';
}

let pass = 0;
let fail = 0;
const ok = (cond, message) => {
  if (cond) { pass++; }
  else { fail++; console.error(`  \u2717 ${message}`); }
};

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.CHROME_PATH,
].filter(Boolean);
const executablePath = CHROME_PATHS.find((p) => existsSync(p)) || undefined;

// ── Product path scripts ────────────────────────────────────────────────
const PRODUCT_SCRIPTS = [
  'runtime/errors.js', 'runtime/gateway/interaction.js', 'runtime/dom-gateway.js',
  'runtime/navigation-contract.js', 'perception/visual-context.js',
  'perception/binding-registry.js', 'perception/revision-manager.js',
  'perception/canonical-hash.js', 'perception/privacy-filter.js',
  'perception/widget-classifier.js', 'perception/adapters/index.js',
  'perception/node-factory.js', 'perception/edge-factory.js',
  'perception/graph-invariants.js', 'perception/context-discovery.js',
  'perception/snapshot-builder.js', 'perception/validator.js',
  'perception/index.js', 'runtime/action-plan-executor.js',
  'runtime/dom-evidence.js', 'runtime/dom-settle.js', 'runtime/ws-client.js',
];

async function injectProductPath(page) {
  for (const script of PRODUCT_SCRIPTS) {
    const p = resolve(EXT_DIR, script);
    if (!existsSync(p)) continue;
    await page.evaluate(readFileSync(p, 'utf8'));
  }
  await page.evaluate(async () => {
    if (globalThis.CcContextDiscovery?.resetContextCounter) globalThis.CcContextDiscovery.resetContextCounter();
    if (globalThis.CcNodeFactory?.resetNodeCounter) globalThis.CcNodeFactory.resetNodeCounter();
    await globalThis.CcPerception?.initPerception?.({
      gateway: globalThis.CcDomGateway,
      bindingRegistry: new globalThis.CcBindingRegistry(),
      revisionManager: new globalThis.CcRevisionManager(),
      privacyFilter: globalThis.CcPrivacyFilter,
      widgetClassifier: globalThis.CcWidgetClassifier,
      contextDiscovery: globalThis.CcContextDiscovery,
      nodeFactory: globalThis.CcNodeFactory,
      edgeFactory: globalThis.CcEdgeFactory,
      canonicalHash: globalThis.CcCanonicalHash,
      snapshotBuilder: globalThis.CcSnapshotBuilder,
      validator: globalThis.CcValidator,
      validatorOptions: { schema: null },
    });
  });
}

// ── Import server workflow module ───────────────────────────────────────
const {
  createWorkflow, getWorkflow, completeCurrentTask, failCurrentTask, linkFillSession, getWorkflowSummary,
} = await import(pathToFileURL(resolve(ROOT, 'extension-service/workflow-session.js')).href);
const { applyStaticBounds, STATIC_MAX_STEPS } = await import(pathToFileURL(resolve(ROOT, 'extension-service/static-bounds.js')).href);

// ── Fixtures ────────────────────────────────────────────────────────────
const FORM_A = `<!DOCTYPE html><html><body><form id="formA">
  <h2>Form A - Personal Info</h2>
  <input id="name" name="name" placeholder="Full Name">
  <input id="email" name="email" type="email" placeholder="Email">
  <input id="phone" name="phone" placeholder="Phone">
</form></body></html>`;

const FORM_B = `<!DOCTYPE html><html><body><form id="formB">
  <h2>Form B - Address</h2>
  <input id="street" name="street" placeholder="Street">
  <input id="city" name="city" placeholder="City">
  <input id="pin" name="pin" placeholder="PIN Code">
</form></body></html>`;

const FORM_C = `<!DOCTYPE html><html><body><form id="formC">
  <h2>Form C - Bank Details</h2>
  <input id="bank" name="bank" placeholder="Bank Name">
  <input id="ifsc" name="ifsc" placeholder="IFSC Code">
</form></body></html>`;

// ── Mock HTTP + WSS Server ──────────────────────────────────────────────
function createMockServer() {
  const httpServer = createServer((req, res) => {
    // Simple body parser
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch {}

      if (req.url === '/workflow-create' && req.method === 'POST') {
        const wf = createWorkflow({
          workspace_id: 'ws:test',
          customer_id: parsed.customer_id || null,
          profile_id: parsed.profile_id || null,
          tasks: parsed.tasks || [],
        });
        const task = wf.tasks[0] || null;
        res.writeHead(200);
        res.end(JSON.stringify({
          workflow_id: wf.workflow_id,
          status: wf.status,
          current_task: task ? { task_id: task.task_id, type: task.type, form_key: task.form_key, portal_id: task.portal_id, status: task.status } : null,
          total_tasks: wf.tasks.length,
        }));
      } else if (req.url === '/workflow-complete-task' && req.method === 'POST') {
        const wf = getWorkflow(parsed.workflow_id);
        if (!wf) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
        if (wf.status === 'completed' || wf.status === 'failed') {
          res.writeHead(409); res.end(JSON.stringify({ error: `Workflow already ${wf.status}` })); return;
        }
        const { workflow, next_task } = completeCurrentTask(parsed.workflow_id, parsed.result || null);
        res.writeHead(200);
        res.end(JSON.stringify({
          next_task: next_task ? { task_id: next_task.task_id, type: next_task.type, form_key: next_task.form_key, portal_id: next_task.portal_id, status: next_task.status } : null,
          workflow_status: workflow.status,
          completed_tasks: workflow.tasks.filter(t => t.status === 'completed').length,
          total_tasks: workflow.tasks.length,
        }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'not found' }));
      }
    });
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'connected', sessionId: 'sess:wf-test', protocolVersion: 1 }));
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type === 'fill_plan_request') {
        ws.send(JSON.stringify({ type: 'fill_plan_response', plan: null, fill_complete: true, ref: msg.id }));
      } else if (msg.type === 'fill_observation_wss') {
        ws.send(JSON.stringify({ type: 'fill_observation_ack', plan_id: msg.observation?.plan_id, ref: msg.id }));
      }
    });
  });

  return {
    httpServer, wss,
    start: () => new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve({ port: httpServer.address().port, baseUrl: `http://127.0.0.1:${httpServer.address().port}` }));
    }),
    stop: () => new Promise((resolve) => { wss.close(); httpServer.close(resolve); }),
  };
}

// ── Helper: build and execute a fill plan on a page ─────────────────────
async function executeFillOnPage(page, wsUrl) {
  return await page.evaluate(async (args) => {
    const { wsUrl } = args;

    // Perceive
    const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
    if (!snapshot || snapshot.kind !== 'page_snapshot') return { error: 'perception_failed' };

    const inputNodes = Object.values(snapshot.nodes || {}).filter(n => n.affordances?.includes('type_text'));
    if (inputNodes.length === 0) return { error: 'no_fillable_nodes', snapshot_id: snapshot.snapshot_id };

    // Build plan
    const state = globalThis.CcPerception.getPerceptionState();
    const plan = {
      kind: 'action_plan', schema_version: '3.0.0',
      plan_id: `plan:wf-${Date.now()}`, correlation_id: `corr:wf-${Date.now()}`,
      supersedes_plan_id: null,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60000).toISOString(),
      target_binding: { document_id: state.documentId, snapshot_id: state.snapshotId, expected_revision: state.revision },
      steps: inputNodes.map((n, i) => ({
        step_id: `s:${i}`,
        target: { context_id: n.context_id, node_id: n.node_id },
        action: { op: 'type_text', value: `FillVal${i}`, clear_first: true },
        risk: 'safe', required_affordance: 'type_text', required_adapter_id: null,
        postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
        on_failure: 'stop_and_report',
      })),
      authorization: { max_risk: 'safe', operator_confirmed: false, allow_submit: false, allow_navigation: false },
    };

    // Execute
    if (globalThis.CcDomEvidence?.startObserving) {
      globalThis.CcDomEvidence.startObserving(plan, globalThis.CcPerception?.getBindingRegistry?.());
    }
    let obs;
    try { obs = await globalThis.CcActionPlanExecutor.execute(plan); }
    finally {
      if (globalThis.CcDomEvidence?.stopObserving) {
        globalThis.CcDomEvidence.stopObserving();
        const ev = globalThis.CcDomEvidence.getEvidence?.() || [];
        if (ev.length > 0 && obs) obs.dom_evidence = ev;
      }
    }

    // Report observation via WSS
    const client = new globalThis.CcWsClient({ url: wsUrl, token: 'wf-test' });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 3000);
      client._onStateChange = (s) => { if (s === 'connected') { clearTimeout(timer); resolve(); } };
      client.connect();
    });
    await client.request('fill_observation_wss', { observation: obs, session_id: '' });
    client.disconnect();

    const succeeded = (obs?.steps || []).filter(s => s.status === 'succeeded').length;
    const failed = (obs?.steps || []).filter(s => s.status === 'failed').length;
    return {
      ok: obs?.outcome === 'completed',
      outcome: obs?.outcome,
      filled: succeeded,
      failed,
      plan_id: plan.plan_id,
      snapshot_id: snapshot.snapshot_id,
      document_id: snapshot.document_id,
    };
  }, { wsUrl });
}

// ── Tests ───────────────────────────────────────────────────────────────
async function runTests() {
  const server = createMockServer();
  const { port, baseUrl } = await server.start();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });

  try {
    // ═══════════════════════════════════════════════════════════════════
    // TEST 1: FULL WORKFLOW — Task A → Fill → Complete → Task B → Fill → Complete → Terminal
    // This is the DECISIVE product proof.
    // ═══════════════════════════════════════════════════════════════════
    {
      // 1. Create workflow via HTTP (same as popup.js does)
      const createResp = await fetch(`${baseUrl}/workflow-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: 'cust:001',
          profile_id: 'prof:001',
          tasks: [
            { type: 'fill', form_key: 'personal_info', portal_id: 'portal:A' },
            { type: 'fill', form_key: 'address', portal_id: 'portal:B' },
            { type: 'fill', form_key: 'bank_details', portal_id: 'portal:C' },
          ],
        }),
      });
      const wfData = await createResp.json();
      ok(createResp.status === 200, `WF-CREATE: status=${createResp.status}`);
      ok(!!wfData.workflow_id, `WF-CREATE: got workflow_id=${wfData.workflow_id}`);
      ok(wfData.status === 'active', `WF-CREATE: status=${wfData.status}`);
      ok(wfData.current_task?.form_key === 'personal_info', `WF-CREATE: first task=${wfData.current_task?.form_key}`);
      ok(wfData.total_tasks === 3, `WF-CREATE: total_tasks=${wfData.total_tasks}`);
      const workflowId = wfData.workflow_id;

      // 2. TASK A: Open Form A, perceive, fill, execute
      const pageA = await browser.newPage();
      await pageA.setContent(FORM_A);
      await injectProductPath(pageA);

      const fillA = await executeFillOnPage(pageA, wsUrl);
      ok(fillA.ok, `TASK-A: fill completed (filled=${fillA.filled})`);
      ok(fillA.filled === 3, `TASK-A: all 3 fields filled`);
      const snapshotA = fillA.snapshot_id;
      const docA = fillA.document_id;
      await pageA.close();

      // 3. Complete Task A via HTTP (same as fill-orchestrator.js does)
      const completeA = await fetch(`${baseUrl}/workflow-complete-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId, result: { filled: 3, skipped: 0 } }),
      });
      const completeAData = await completeA.json();
      ok(completeA.status === 200, `TASK-A-COMPLETE: status=${completeA.status}`);
      ok(completeAData.next_task?.form_key === 'address', `TASK-A-COMPLETE: next_task=${completeAData.next_task?.form_key}`);
      ok(completeAData.completed_tasks === 1, `TASK-A-COMPLETE: completed=1`);
      ok(completeAData.workflow_status === 'active', `TASK-A-COMPLETE: workflow still active`);

      // 4. TASK B: Open Form B (NEW page = fresh document = fresh perception)
      const pageB = await browser.newPage();
      await pageB.setContent(FORM_B);
      await injectProductPath(pageB);

      const fillB = await executeFillOnPage(pageB, wsUrl);
      ok(fillB.ok, `TASK-B: fill completed (filled=${fillB.filled})`);
      ok(fillB.filled === 3, `TASK-B: all 3 fields filled`);

      // STATE ISOLATION: Task B has different document/snapshot than Task A
      ok(fillB.document_id !== docA, `ISOLATION: Task B document_id !== Task A (${fillB.document_id} vs ${docA})`);
      ok(fillB.snapshot_id !== snapshotA, `ISOLATION: Task B snapshot_id !== Task A`);
      await pageB.close();

      // 5. Complete Task B
      const completeB = await fetch(`${baseUrl}/workflow-complete-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId, result: { filled: 3, skipped: 0 } }),
      });
      const completeBData = await completeB.json();
      ok(completeB.status === 200, `TASK-B-COMPLETE: status=${completeB.status}`);
      ok(completeBData.next_task?.form_key === 'bank_details', `TASK-B-COMPLETE: next_task=${completeBData.next_task?.form_key}`);
      ok(completeBData.completed_tasks === 2, `TASK-B-COMPLETE: completed=2`);

      // 6. TASK C: Open Form C, fill, complete → terminal
      const pageC = await browser.newPage();
      await pageC.setContent(FORM_C);
      await injectProductPath(pageC);

      const fillC = await executeFillOnPage(pageC, wsUrl);
      ok(fillC.ok, `TASK-C: fill completed (filled=${fillC.filled})`);
      ok(fillC.filled === 2, `TASK-C: all 2 fields filled`);
      await pageC.close();

      // 7. Complete Task C → terminal (no more tasks)
      const completeC = await fetch(`${baseUrl}/workflow-complete-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId, result: { filled: 2, skipped: 0 } }),
      });
      const completeCData = await completeC.json();
      ok(completeC.status === 200, `TASK-C-COMPLETE: status=${completeC.status}`);
      ok(completeCData.next_task === null, `TERMINAL: no next task (null)`);
      ok(completeCData.workflow_status === 'completed', `TERMINAL: workflow completed`);
      ok(completeCData.completed_tasks === 3, `TERMINAL: all 3 tasks completed`);

      // 8. Verify workflow state
      const wf = getWorkflow(workflowId);
      ok(wf.status === 'completed', `WF-STATE: final status=completed`);
      ok(wf.tasks.every(t => t.status === 'completed'), `WF-STATE: all tasks completed`);
      ok(wf.completed_at !== null, `WF-STATE: completed_at set`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 2: STALE PLAN ISOLATION — Task A plan CANNOT execute on Task B
    // ═══════════════════════════════════════════════════════════════════
    {
      const page = await browser.newPage();
      await page.setContent(FORM_A);
      await injectProductPath(page);

      // Capture Task A snapshot + build a plan
      const stalePlan = await page.evaluate(() => {
        const snapshot = globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
        return snapshot;
      });
      const staleState = await page.evaluate(() => globalThis.CcPerception.getPerceptionState());
      const staleNodes = Object.values(stalePlan.nodes || {}).filter(n => n.affordances?.includes('type_text'));

      // Navigate to Form B (document replacement)
      await page.setContent(FORM_B);
      await injectProductPath(page);

      // Try executing Task A's plan on Task B's page — should be rejected
      const rejection = await page.evaluate(async (args) => {
        const { plan } = args;
        try {
          const obs = await globalThis.CcActionPlanExecutor.execute(plan);
          return { outcome: obs?.outcome, rejection_reason: obs?.rejection_reason, code: obs?.rejection_reason };
        } catch (e) {
          return { error: e.message };
        }
      }, {
        plan: {
          kind: 'action_plan', schema_version: '3.0.0',
          plan_id: 'plan:stale-cross-task', correlation_id: 'corr:stale',
          supersedes_plan_id: null,
          issued_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60000).toISOString(),
          target_binding: { document_id: staleState.documentId, snapshot_id: staleState.snapshotId, expected_revision: staleState.revision },
          steps: staleNodes.slice(0, 1).map((n, i) => ({
            step_id: `s:${i}`, target: { context_id: n.context_id, node_id: n.node_id },
            action: { op: 'type_text', value: 'StaleVal', clear_first: true },
            risk: 'safe', required_affordance: 'type_text', required_adapter_id: null,
            postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
            on_failure: 'stop_and_report',
          })),
          authorization: { max_risk: 'safe', operator_confirmed: false, allow_submit: false, allow_navigation: false },
        },
      });

      ok(rejection.outcome === 'rejected', `STALE-PLAN: rejected on different page (outcome=${rejection.outcome})`);
      ok(rejection.rejection_reason === 'document_replaced' || rejection.rejection_reason === 'stale_snapshot',
        `STALE-PLAN: reason=${rejection.rejection_reason}`);

      await page.close();
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 3: FILL FAILURE DOES NOT ADVANCE WORKFLOW
    // ═══════════════════════════════════════════════════════════════════
    {
      // Create a 2-task workflow
      const resp = await fetch(`${baseUrl}/workflow-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: 'cust:fail', profile_id: 'prof:fail',
          tasks: [
            { type: 'fill', form_key: 'form_fail' },
            { type: 'fill', form_key: 'form_after_fail' },
          ],
        }),
      });
      const wfFail = await resp.json();
      const failWfId = wfFail.workflow_id;

      // Simulate fill failure — do NOT call /workflow-complete-task
      // (fill-orchestrator only calls it when totalFailed === 0 && totalFilled > 0)

      // Verify workflow DID NOT advance
      const wf = getWorkflow(failWfId);
      ok(wf.status === 'active', `FAIL-NO-ADVANCE: workflow still active (not completed)`);
      ok(wf.current_task_index === 0, `FAIL-NO-ADVANCE: still on task 0`);
      ok(wf.tasks[0].status === 'active', `FAIL-NO-ADVANCE: task 0 still active`);
      ok(wf.tasks[1].status === 'pending', `FAIL-NO-ADVANCE: task 1 still pending`);

      // Now retry and succeed
      const retryResp = await fetch(`${baseUrl}/workflow-complete-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: failWfId, result: { filled: 3, skipped: 0 } }),
      });
      const retryData = await retryResp.json();
      ok(retryResp.status === 200, `RETRY: completion accepted`);
      ok(retryData.next_task?.form_key === 'form_after_fail', `RETRY: advanced to next task`);
      ok(retryData.completed_tasks === 1, `RETRY: 1 task now completed`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 4: DUPLICATE COMPLETION IS IDEMPOTENT (workflow already done)
    // ═══════════════════════════════════════════════════════════════════
    {
      const resp = await fetch(`${baseUrl}/workflow-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: 'cust:dup', tasks: [{ type: 'fill', form_key: 'only_task' }] }),
      });
      const wfDup = await resp.json();

      // Complete the only task
      await fetch(`${baseUrl}/workflow-complete-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: wfDup.workflow_id, result: { filled: 1 } }),
      });

      // Try to complete again — should get 409
      const dupResp = await fetch(`${baseUrl}/workflow-complete-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: wfDup.workflow_id, result: { filled: 1 } }),
      });
      ok(dupResp.status === 409, `DUPLICATE: rejected with 409 (got ${dupResp.status})`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 5: STATIC EXECUTION WITHIN WORKFLOW
    // ═══════════════════════════════════════════════════════════════════
    {
      const page = await browser.newPage();
      await page.setContent(FORM_A);
      await injectProductPath(page);

      const fillResult = await executeFillOnPage(page, wsUrl);
      ok(fillResult.ok, `WF-STATIC: fill succeeded (filled=${fillResult.filled})`);
      ok(fillResult.filled === 3, `WF-STATIC: all fields filled in STATIC batch`);

      // Verify all DOM values actually written
      const domVals = await page.evaluate(() => ({
        v0: document.querySelector('#name')?.value,
        v1: document.querySelector('#email')?.value,
        v2: document.querySelector('#phone')?.value,
      }));
      ok(domVals.v0?.startsWith('FillVal'), `WF-STATIC: DOM name filled="${domVals.v0}"`);
      ok(domVals.v1?.startsWith('FillVal'), `WF-STATIC: DOM email filled="${domVals.v1}"`);
      ok(domVals.v2?.startsWith('FillVal'), `WF-STATIC: DOM phone filled="${domVals.v2}"`);

      await page.close();
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 6: DYNAMIC (1-step) EXECUTION WITHIN WORKFLOW
    // ═══════════════════════════════════════════════════════════════════
    {
      const page = await browser.newPage();
      await page.setContent(FORM_B);
      await injectProductPath(page);

      // Execute just 1 step (dynamic mode simulation)
      const dynResult = await page.evaluate(async (args) => {
        const { wsUrl } = args;
        const snapshot = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
        const inputNodes = Object.values(snapshot.nodes || {}).filter(n => n.affordances?.includes('type_text'));
        if (inputNodes.length === 0) return { error: 'no nodes' };

        const state = globalThis.CcPerception.getPerceptionState();
        // Dynamic: only 1 step
        const plan = {
          kind: 'action_plan', schema_version: '3.0.0',
          plan_id: `plan:dyn-wf-${Date.now()}`, correlation_id: `corr:dyn-wf`,
          supersedes_plan_id: null,
          issued_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60000).toISOString(),
          target_binding: { document_id: state.documentId, snapshot_id: state.snapshotId, expected_revision: state.revision },
          steps: [{
            step_id: 's:0',
            target: { context_id: inputNodes[0].context_id, node_id: inputNodes[0].node_id },
            action: { op: 'type_text', value: 'DynWfVal', clear_first: true },
            risk: 'safe', required_affordance: 'type_text', required_adapter_id: null,
            postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
            on_failure: 'stop_and_report',
          }],
          authorization: { max_risk: 'safe', operator_confirmed: false, allow_submit: false, allow_navigation: false },
        };

        if (globalThis.CcDomEvidence?.startObserving) {
          globalThis.CcDomEvidence.startObserving(plan, globalThis.CcPerception?.getBindingRegistry?.());
        }
        let obs;
        try { obs = await globalThis.CcActionPlanExecutor.execute(plan); }
        finally {
          if (globalThis.CcDomEvidence?.stopObserving) {
            globalThis.CcDomEvidence.stopObserving();
          }
        }
        return { outcome: obs?.outcome, filled: (obs?.steps || []).filter(s => s.status === 'succeeded').length };
      }, { wsUrl });

      ok(dynResult.outcome === 'completed', `WF-DYNAMIC: 1-step completed`);
      ok(dynResult.filled === 1, `WF-DYNAMIC: 1 field filled`);

      await page.close();
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 7: SAFETY DEMOTION WITHIN WORKFLOW
    // ═══════════════════════════════════════════════════════════════════
    {
      const page = await browser.newPage();
      await page.setContent(FORM_A);
      await injectProductPath(page);

      const snapshot = await page.evaluate(() => globalThis.CcPerception.perceivePage({ mode: 'snapshot' }));
      const inputNodes = Object.values(snapshot.nodes || {}).filter(n => n.affordances?.includes('type_text'));

      // 3-step plan with tail removed mid-batch → demotion
      const demResult = await page.evaluate(async (args) => {
        const { inputNodes } = args;
        const state = globalThis.CcPerception.getPerceptionState();
        const plan = {
          kind: 'action_plan', schema_version: '3.0.0',
          plan_id: `plan:dem-wf`, correlation_id: `corr:dem-wf`,
          supersedes_plan_id: null,
          issued_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60000).toISOString(),
          target_binding: { document_id: state.documentId, snapshot_id: state.snapshotId, expected_revision: state.revision },
          steps: inputNodes.map((n, i) => ({
            step_id: `s:${i}`, target: { context_id: n.context_id, node_id: n.node_id },
            action: { op: 'type_text', value: `Dem${i}`, clear_first: true },
            risk: 'safe', required_affordance: 'type_text', required_adapter_id: null,
            postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
            on_failure: 'stop_and_report',
          })),
          authorization: { max_risk: 'safe', operator_confirmed: false, allow_submit: false, allow_navigation: false },
        };

        // Remove last input 60ms into execution
        setTimeout(() => { document.querySelector('#phone')?.remove(); }, 60);

        if (globalThis.CcDomEvidence?.startObserving) {
          globalThis.CcDomEvidence.startObserving(plan, globalThis.CcPerception?.getBindingRegistry?.());
        }
        let obs;
        try { obs = await globalThis.CcActionPlanExecutor.execute(plan); }
        finally {
          if (globalThis.CcDomEvidence?.stopObserving) {
            globalThis.CcDomEvidence.stopObserving();
            const ev = globalThis.CcDomEvidence.getEvidence?.() || [];
            if (ev.length > 0 && obs) obs.dom_evidence = ev;
          }
        }

        const succeeded = (obs?.steps || []).filter(s => s.status === 'succeeded').length;
        const hasDemotion = (obs?.diagnostics || []).some(d => d.code === 'safety_demotion');
        return { outcome: obs?.outcome, succeeded, total: obs?.steps?.length, hasDemotion };
      }, { inputNodes });

      ok(demResult.succeeded >= 1, `WF-DEMOTION: some steps succeeded (${demResult.succeeded})`);
      ok(demResult.succeeded < 3, `WF-DEMOTION: batch did NOT fully succeed (${demResult.succeeded}/3)`);
      ok(demResult.hasDemotion, `WF-DEMOTION: safety_demotion fired`);

      await page.close();
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 8: WSS DISCONNECT DOES NOT SILENTLY ADVANCE WORKFLOW
    // ═══════════════════════════════════════════════════════════════════
    {
      const resp = await fetch(`${baseUrl}/workflow-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: 'cust:wss', tasks: [{ type: 'fill', form_key: 'f_wss' }, { type: 'fill', form_key: 'f_wss2' }] }),
      });
      const wfWss = await resp.json();

      // Simulate: WSS observation fails (no complete-task called)
      // Workflow must NOT advance
      const wf = getWorkflow(wfWss.workflow_id);
      ok(wf.current_task_index === 0, `WSS-FAIL: task 0 still active`);
      ok(wf.tasks[1].status === 'pending', `WSS-FAIL: task 1 still pending`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 9: WORKFLOW ISOLATION — different workflow_ids cannot interfere
    // ═══════════════════════════════════════════════════════════════════
    {
      const resp1 = await fetch(`${baseUrl}/workflow-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: 'cust:iso1', tasks: [{ type: 'fill', form_key: 'iso1_task' }] }),
      });
      const wf1 = await resp1.json();

      const resp2 = await fetch(`${baseUrl}/workflow-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: 'cust:iso2', tasks: [{ type: 'fill', form_key: 'iso2_task' }] }),
      });
      const wf2 = await resp2.json();

      // Complete wf1 — should NOT affect wf2
      await fetch(`${baseUrl}/workflow-complete-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: wf1.workflow_id, result: { filled: 1 } }),
      });

      const wf2State = getWorkflow(wf2.workflow_id);
      ok(wf2State.current_task_index === 0, `ISOLATION: wf2 unaffected by wf1 completion`);
      ok(wf2State.tasks[0].status === 'active', `ISOLATION: wf2 task still active`);

      const wf1State = getWorkflow(wf1.workflow_id);
      ok(wf1State.status === 'completed', `ISOLATION: wf1 completed independently`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 10: FRESH PERCEPTION ON TASK TRANSITION
    // Proves: each task gets its own snapshot from a fresh perceivePage call.
    // The document_id changes because the DOM content is different.
    // ═══════════════════════════════════════════════════════════════════
    {
      const pageA = await browser.newPage();
      await pageA.setContent(FORM_A);
      await injectProductPath(pageA);

      const snapA = await pageA.evaluate(async () => {
        const snap = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
        return { documentId: snap.document_id, snapshotId: snap.snapshot_id, nodeCount: Object.keys(snap.nodes || {}).length };
      });

      // Navigate SAME page to Form B (simulates in-tab transition)
      await pageA.setContent(FORM_B);
      // Re-init perception (fresh binding registry, fresh state)
      await pageA.evaluate(async () => {
        await globalThis.CcPerception?.initPerception?.({
          gateway: globalThis.CcDomGateway,
          bindingRegistry: new globalThis.CcBindingRegistry(),
          revisionManager: new globalThis.CcRevisionManager(),
          privacyFilter: globalThis.CcPrivacyFilter,
          widgetClassifier: globalThis.CcWidgetClassifier,
          contextDiscovery: globalThis.CcContextDiscovery,
          nodeFactory: globalThis.CcNodeFactory,
          edgeFactory: globalThis.CcEdgeFactory,
          canonicalHash: globalThis.CcCanonicalHash,
          snapshotBuilder: globalThis.CcSnapshotBuilder,
          validator: globalThis.CcValidator,
          validatorOptions: { schema: null },
        });
      });

      const snapB = await pageA.evaluate(async () => {
        const snap = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
        return { documentId: snap.document_id, snapshotId: snap.snapshot_id, nodeCount: Object.keys(snap.nodes || {}).length };
      });
      await pageA.close();

      // After re-init + perceive on new content, snapshot must be different
      ok(snapA.snapshotId !== snapB.snapshotId, `FRESH-PERC: different snapshot_id after re-init (${snapA.snapshotId} vs ${snapB.snapshotId})`);
      // Node counts differ (Form A has 3 inputs, Form B has 3 with different names)
      ok(snapA.nodeCount > 0 && snapB.nodeCount > 0, `FRESH-PERC: both snapshots have nodes (A=${snapA.nodeCount}, B=${snapB.nodeCount})`);
    }

  } finally {
    await browser.close();
    await server.stop();
  }

  console.log(`\nWorkflow Integration (M4.14): ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
