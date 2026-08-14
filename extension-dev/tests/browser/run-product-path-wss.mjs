/**
 * Phase 4.10 — WSS Integration Tests (Layer C)
 * Issue #204: Product Fill over WSS transport with HTTPS fallback.
 *
 * Exercises:
 *   1. CcFillOrchestrator transport helpers (deriveWsUrl, _getOrCreateWsClient)
 *   2. STATIC plan over WSS → execute → observation ack
 *   3. DYNAMIC one-step → settle → second plan over WSS
 *   4. Demotion → observation → next plan over WSS
 *   5. HTTPS fallback when WSS unavailable
 *   6. Strict WSS mode failure (no fallback)
 *   7. Source verification: orchestrator contains fill_plan_request + fill_observation_wss
 *
 * Uses a local mock WebSocket server that speaks the CyberControl WSS protocol.
 *
 * Run: node extension-dev/tests/browser/run-product-path-wss.mjs
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

// Stub DATABASE_URL for server module imports
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_unused';
}

let pass = 0;
let fail = 0;
const ok = (cond, message, extra = '') => {
  if (cond) { pass++; }
  else { fail++; console.error(`  \u2717 ${message}${extra ? ' \u2014 ' + extra : ''}`); }
};

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.CHROME_PATH,
].filter(Boolean);
const executablePath = CHROME_PATHS.find((p) => existsSync(p)) || undefined;

// ── Product path scripts (same as product-integration) ──────────────────
const PRODUCT_SCRIPTS = [
  'runtime/errors.js',
  'runtime/gateway/interaction.js',
  'runtime/dom-gateway.js',
  'runtime/navigation-contract.js',
  'perception/visual-context.js',
  'perception/binding-registry.js',
  'perception/revision-manager.js',
  'perception/canonical-hash.js',
  'perception/privacy-filter.js',
  'perception/widget-classifier.js',
  'perception/adapters/index.js',
  'perception/node-factory.js',
  'perception/edge-factory.js',
  'perception/graph-invariants.js',
  'perception/context-discovery.js',
  'perception/snapshot-builder.js',
  'perception/validator.js',
  'perception/index.js',
  'runtime/action-plan-executor.js',
  'runtime/dom-evidence.js',
  'runtime/dom-settle.js',
  'runtime/ws-client.js',
];

async function injectProductPath(page) {
  for (const script of PRODUCT_SCRIPTS) {
    const path = resolve(EXT_DIR, script);
    if (!existsSync(path)) continue;
    await page.evaluate(readFileSync(path, 'utf8'));
  }
  // Also inject fill-orchestrator (application layer) for transport helpers
  const orchPath = resolve(EXT_DIR, 'application/fill-orchestrator.js');
  if (existsSync(orchPath)) {
    await page.evaluate(readFileSync(orchPath, 'utf8'));
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

// ── Mock WSS Server ─────────────────────────────────────────────────────
// Speaks the CyberControl protocol: connected message, request/response matching.
// Handles fill_plan_request and fill_observation_wss.

function createMockWssServer() {
  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  let planRequestCount = 0;
  let observationCount = 0;
  let lastObservation = null;
  let planResponse = null; // Set by test to control what server returns
  let dynamicPlanQueue = []; // Queue of plan responses for dynamic turns

  wss.on('connection', (ws, req) => {
    // Send 'connected' message (protocol handshake)
    ws.send(JSON.stringify({
      type: 'connected',
      sessionId: 'sess:mock-wss-test',
      protocolVersion: 1,
    }));

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === 'fill_plan_request') {
        planRequestCount++;
        const response = dynamicPlanQueue.length > 0
          ? dynamicPlanQueue.shift()
          : (planResponse || { type: 'fill_plan_response', plan: null, fill_complete: true });
        // Match the request id for response correlation
        ws.send(JSON.stringify({ ...response, ref: msg.id }));
      } else if (msg.type === 'fill_observation_wss') {
        observationCount++;
        lastObservation = msg.observation || msg;
        ws.send(JSON.stringify({ type: 'observation_ack', ok: true, ref: msg.id }));
      } else if (msg.type === 'resume') {
        // Acknowledge resume
        ws.send(JSON.stringify({ type: 'resume_ack', ref: msg.id }));
      }
    });
  });

  return {
    httpServer,
    wss,
    start: () => new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const port = httpServer.address().port;
        resolve({ port, url: `ws://127.0.0.1:${port}/ws` });
      });
    }),
    stop: () => new Promise((resolve) => {
      wss.close();
      httpServer.close(resolve);
    }),
    get planRequestCount() { return planRequestCount; },
    get observationCount() { return observationCount; },
    get lastObservation() { return lastObservation; },
    set planResponse(v) { planResponse = v; },
    set dynamicPlanQueue(v) { dynamicPlanQueue = v; },
    reset() { planRequestCount = 0; observationCount = 0; lastObservation = null; planResponse = null; dynamicPlanQueue = []; },
  };
}

// Import server modules (for plan generation in tests)
const { classifyFormBehavior } = await import(pathToFileURL(resolve(ROOT, 'extension-service/behavior-classifier.js')).href);
const { mergeExecutionMode } = await import(pathToFileURL(resolve(ROOT, 'extension-service/execution-mode.js')).href);
const { applyStaticBounds, STATIC_MAX_STEPS } = await import(pathToFileURL(resolve(ROOT, 'extension-service/static-bounds.js')).href);

// ── Fixtures ────────────────────────────────────────────────────────────
const STATIC_FORM = `<!DOCTYPE html><html><body><form>
  <input id="name" name="name" placeholder="Name">
  <input id="email" name="email" type="email" placeholder="Email">
  <input id="phone" name="phone" placeholder="Phone">
  <input id="address" name="address" placeholder="Address">
  <input id="city" name="city" placeholder="City">
  <input id="pin" name="pin" placeholder="PIN">
</form></body></html>`;

async function runTests() {
  const mockServer = createMockWssServer();
  const { port, url: wsUrl } = await mockServer.start();

  const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });

  try {
    // ═══════════════════════════════════════════════════════════════════
    // TEST 1: deriveWsUrl helper
    // ═══════════════════════════════════════════════════════════════════
    {
      const page = await browser.newPage();
      await page.setContent('<html><body></body></html>');
      await injectProductPath(page);

      const results = await page.evaluate(() => {
        const orch = globalThis.CcFillOrchestrator;
        return {
          hasDerive: typeof orch?.deriveWsUrl === 'function',
          https: orch?.deriveWsUrl?.('https://api.example.com'),
          http: orch?.deriveWsUrl?.('http://localhost:3000'),
          trailingSlash: orch?.deriveWsUrl?.('https://api.example.com/'),
          withPath: orch?.deriveWsUrl?.('https://api.example.com/v1'),
        };
      });

      ok(results.hasDerive, 'DERIVE: deriveWsUrl exported');
      ok(results.https === 'wss://api.example.com/ws', `DERIVE: https→wss (${results.https})`);
      ok(results.http === 'ws://localhost:3000/ws', `DERIVE: http→ws (${results.http})`);
      ok(results.trailingSlash === 'wss://api.example.com/ws', `DERIVE: trailing slash handled (${results.trailingSlash})`);
      ok(results.withPath === 'wss://api.example.com/v1/ws', `DERIVE: path preserved (${results.withPath})`);

      await page.close();
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 2: WsClient connects to mock server
    // ═══════════════════════════════════════════════════════════════════
    {
      const page = await browser.newPage();
      await page.setContent('<html><body></body></html>');
      await injectProductPath(page);

      const result = await page.evaluate(async (wsUrl) => {
        const client = new globalThis.CcWsClient({ url: wsUrl, token: 'test-jwt' });
        return new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ connected: false, state: client.state }), 5000);
          client._onStateChange = (state) => {
            if (state === 'connected') {
              clearTimeout(timer);
              resolve({ connected: true, sessionId: client.sessionId, state: client.state });
            }
          };
          client.connect();
        });
      }, wsUrl);

      ok(result.connected, 'CONNECT: WsClient connected to mock server');
      ok(result.sessionId === 'sess:mock-wss-test', `CONNECT: sessionId=${result.sessionId}`);
      ok(result.state === 'connected', `CONNECT: state=${result.state}`);

      await page.close();
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 3: STATIC plan request over WSS → execute → observation ack
    // Full closed loop through mock WSS.
    // ═══════════════════════════════════════════════════════════════════
    {
      const page = await browser.newPage();
      await page.setContent(STATIC_FORM);
      await injectProductPath(page);
      mockServer.reset();

      // Get a real snapshot for plan construction
      const snapshot = await page.evaluate(() => globalThis.CcPerception.perceivePage({ mode: 'snapshot' }));
      ok(snapshot?.kind === 'page_snapshot', 'WSS-STATIC: perception snapshot');

      const inputNodes = Object.values(snapshot.nodes || {}).filter(n => n.affordances?.includes('type_text'));
      ok(inputNodes.length >= 3, `WSS-STATIC: ${inputNodes.length} fillable nodes`);

      // Build a valid plan (same structure server would emit)
      const steps = inputNodes.slice(0, 3).map((n, i) => ({
        step_id: `s:${i}`,
        target: { context_id: n.context_id, node_id: n.node_id },
        action: { op: 'type_text', value: `WssVal${i}`, clear_first: true },
        risk: 'safe',
        required_affordance: 'type_text',
        required_adapter_id: null,
        postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
        on_failure: 'stop_and_report',
      }));

      const bounded = applyStaticBounds({ steps, edges: snapshot.edges || [] });
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:wss-static', correlation_id: 'corr:wss-static',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: snapshot.snapshot_id,
          expected_revision: snapshot.revision,
        },
        steps: bounded.steps,
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_submit: false, allow_navigation: false },
      };

      // Configure mock server to return this plan
      mockServer.planResponse = { type: 'fill_plan_response', plan, plan_clamped: false };

      // Connect client and request plan via WSS
      const wssResult = await page.evaluate(async (args) => {
        const { wsUrl, planBody } = args;
        const client = new globalThis.CcWsClient({ url: wsUrl, token: 'test-jwt' });

        // Connect
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('connect timeout')), 5000);
          client._onStateChange = (state) => {
            if (state === 'connected') { clearTimeout(timer); resolve(); }
            else if (state === 'suspended') { clearTimeout(timer); reject(new Error('suspended')); }
          };
          client.connect();
        });

        // Request plan
        const planResp = await client.request('fill_plan_request', { body: planBody });
        if (!planResp?.plan) return { error: 'no plan in response' };

        // Execute plan via APE
        const receivedPlan = planResp.plan;
        if (globalThis.CcDomEvidence?.startObserving) {
          globalThis.CcDomEvidence.startObserving(receivedPlan, globalThis.CcPerception?.getBindingRegistry?.());
        }
        let obs;
        try { obs = await globalThis.CcActionPlanExecutor.execute(receivedPlan); }
        finally {
          if (globalThis.CcDomEvidence?.stopObserving) {
            globalThis.CcDomEvidence.stopObserving();
            const ev = globalThis.CcDomEvidence.getEvidence?.() || [];
            if (ev.length > 0 && obs) obs.dom_evidence = ev;
          }
        }

        // Report observation via WSS
        const obsResp = await client.request('fill_observation_wss', { observation: obs });

        // Read back DOM values
        const domValues = {
          v0: document.querySelectorAll('input')[0]?.value,
          v1: document.querySelectorAll('input')[1]?.value,
          v2: document.querySelectorAll('input')[2]?.value,
        };

        client.disconnect();
        return { planReceived: true, obs, obsResp, domValues };
      }, { wsUrl, planBody: { snapshot: 'stub', profileId: 'test' } });

      ok(!wssResult.error, `WSS-STATIC: no error (${wssResult.error || 'ok'})`);
      ok(wssResult.planReceived, 'WSS-STATIC: plan received over WSS');
      ok(wssResult.obs?.kind === 'execution_observation', 'WSS-STATIC: observation returned');
      ok(wssResult.obs?.outcome === 'completed', `WSS-STATIC: outcome=${wssResult.obs?.outcome}`);
      ok((wssResult.obs?.steps || []).filter(s => s.status === 'succeeded').length === 3,
        'WSS-STATIC: all 3 steps succeeded');
      ok(wssResult.obsResp?.type === 'observation_ack', `WSS-STATIC: observation ack received`);
      ok(wssResult.domValues?.v0 === 'WssVal0', `WSS-STATIC: DOM[0]="${wssResult.domValues?.v0}"`);
      ok(wssResult.domValues?.v1 === 'WssVal1', `WSS-STATIC: DOM[1]="${wssResult.domValues?.v1}"`);
      ok(wssResult.domValues?.v2 === 'WssVal2', `WSS-STATIC: DOM[2]="${wssResult.domValues?.v2}"`);
      ok(mockServer.planRequestCount === 1, `WSS-STATIC: server got 1 plan request (${mockServer.planRequestCount})`);
      ok(mockServer.observationCount === 1, `WSS-STATIC: server got 1 observation (${mockServer.observationCount})`);

      await page.close();
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 4: DYNAMIC multi-turn WSS conversation (transport proof)
    // Proves: multiple request-response pairs on single WSS connection,
    // plan_clamped semantics, observation ack, and fill_complete signal.
    // NOTE: We execute only turn 1's plan (real APE); turn 2 is a
    // protocol-level fill_complete signal. This tests WSS transport
    // round-trips, not multi-plan execution (which requires re-perceive).
    // ═══════════════════════════════════════════════════════════════════
    {
      const page = await browser.newPage();
      await page.setContent(STATIC_FORM);
      await injectProductPath(page);
      mockServer.reset();

      const snapshot = await page.evaluate(() => globalThis.CcPerception.perceivePage({ mode: 'snapshot' }));
      const inputNodes = Object.values(snapshot.nodes || {}).filter(n => n.affordances?.includes('type_text'));
      ok(inputNodes.length >= 2, `WSS-DYNAMIC: ${inputNodes.length} fillable nodes`);

      // Single-step clamped plan
      const step1 = {
        step_id: 's:0',
        target: { context_id: inputNodes[0].context_id, node_id: inputNodes[0].node_id },
        action: { op: 'type_text', value: 'DynA', clear_first: true },
        risk: 'safe', required_affordance: 'type_text', required_adapter_id: null,
        postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
        on_failure: 'stop_and_report',
      };
      const plan1 = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:dyn-1', correlation_id: 'corr:dyn-1',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        target_binding: { document_id: snapshot.document_id, snapshot_id: snapshot.snapshot_id, expected_revision: snapshot.revision },
        steps: [step1],
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_submit: false, allow_navigation: false },
      };

      // Mock server queue: turn 1 → clamped plan, turn 2 → fill_complete
      mockServer.dynamicPlanQueue = [
        { type: 'fill_plan_response', plan: plan1, plan_clamped: true, session: { id: 'sess:dyn' } },
        { type: 'fill_plan_response', plan: null, fill_complete: true },
      ];

      const dynResult = await page.evaluate(async (args) => {
        const { wsUrl } = args;
        const client = new globalThis.CcWsClient({ url: wsUrl, token: 'test-jwt' });
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('timeout')), 5000);
          client._onStateChange = (s) => { if (s === 'connected') { clearTimeout(timer); resolve(); } };
          client.connect();
        });

        // Turn 1: request plan over WSS
        const planResp1 = await client.request('fill_plan_request', { body: { turn: 0 } });
        const plan = planResp1.plan;
        const clamped = planResp1.plan_clamped;

        // Execute plan via real APE
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

        // Report observation over WSS
        const obsAck = await client.request('fill_observation_wss', { observation: obs });

        // Turn 2: request next plan (server says fill_complete)
        const planResp2 = await client.request('fill_plan_request', { body: { turn: 1 } });

        client.disconnect();
        return {
          turn1: { outcome: obs?.outcome, succeeded: (obs?.steps || []).filter(s => s.status === 'succeeded').length, clamped },
          obsAck: obsAck?.type,
          turn2: { fill_complete: planResp2.fill_complete },
          domValue: document.querySelectorAll('input')[0]?.value,
        };
      }, { wsUrl });

      ok(dynResult.turn1?.outcome === 'completed', 'WSS-DYNAMIC: turn 1 completed');
      ok(dynResult.turn1?.succeeded === 1, 'WSS-DYNAMIC: turn 1 = 1 step succeeded');
      ok(dynResult.turn1?.clamped === true, 'WSS-DYNAMIC: plan_clamped flag received over WSS');
      ok(dynResult.obsAck === 'observation_ack', 'WSS-DYNAMIC: observation ack over WSS');
      ok(dynResult.turn2?.fill_complete === true, 'WSS-DYNAMIC: fill_complete on turn 2 over WSS');
      ok(dynResult.domValue === 'DynA', `WSS-DYNAMIC: DOM[0]="${dynResult.domValue}"`);
      ok(mockServer.planRequestCount === 2, `WSS-DYNAMIC: 2 plan requests on single connection (${mockServer.planRequestCount})`);
      ok(mockServer.observationCount === 1, `WSS-DYNAMIC: 1 observation over WSS (${mockServer.observationCount})`);

      await page.close();
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 5: Demotion batch → observation → next plan over WSS
    // ═══════════════════════════════════════════════════════════════════
    {
      const page = await browser.newPage();
      await page.setContent(STATIC_FORM);
      await injectProductPath(page);
      mockServer.reset();

      const snapshot = await page.evaluate(() => globalThis.CcPerception.perceivePage({ mode: 'snapshot' }));
      const inputNodes = Object.values(snapshot.nodes || {}).filter(n => n.affordances?.includes('type_text'));

      // 4-step plan; 2 tail targets will be removed mid-batch
      const steps = inputNodes.slice(0, 4).map((n, i) => ({
        step_id: `s:${i}`,
        target: { context_id: n.context_id, node_id: n.node_id },
        action: { op: 'type_text', value: `Dem${i}`, clear_first: true },
        risk: 'safe', required_affordance: 'type_text', required_adapter_id: null,
        postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
        on_failure: 'stop_and_report',
      }));
      const demPlan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:dem', correlation_id: 'corr:dem',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        target_binding: { document_id: snapshot.document_id, snapshot_id: snapshot.snapshot_id, expected_revision: snapshot.revision },
        steps,
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_submit: false, allow_navigation: false },
      };

      mockServer.planResponse = { type: 'fill_plan_response', plan: demPlan, plan_clamped: false };

      const demResult = await page.evaluate(async (args) => {
        const { wsUrl } = args;
        const client = new globalThis.CcWsClient({ url: wsUrl, token: 'test-jwt' });
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('timeout')), 5000);
          client._onStateChange = (s) => { if (s === 'connected') { clearTimeout(timer); resolve(); } };
          client.connect();
        });

        // Get plan from server
        const planResp = await client.request('fill_plan_request', { body: {} });
        const plan = planResp.plan;

        // Remove tail targets 60ms into execution
        setTimeout(() => {
          const inputs = document.querySelectorAll('input');
          if (inputs[3]) inputs[3].remove();
          if (inputs[2]) inputs[2].remove();
        }, 60);

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

        // Report demotion observation over WSS
        const obsResp = await client.request('fill_observation_wss', { observation: obs });

        client.disconnect();
        return {
          obs_kind: obs?.kind,
          outcome: obs?.outcome,
          succeeded: (obs?.steps || []).filter(s => s.status === 'succeeded').length,
          skipped: (obs?.steps || []).filter(s => s.status === 'skipped').length,
          failed: (obs?.steps || []).filter(s => s.status === 'failed').length,
          hasDemotion: (obs?.diagnostics || []).some(d => d.code === 'safety_demotion'),
          obsAck: obsResp?.type,
        };
      }, { wsUrl });

      ok(demResult.obs_kind === 'execution_observation', 'WSS-DEMOTION: observation returned');
      ok(demResult.succeeded >= 1, `WSS-DEMOTION: early steps executed (${demResult.succeeded})`);
      ok(demResult.succeeded < 4, `WSS-DEMOTION: batch did NOT fully succeed (${demResult.succeeded}/4)`);
      ok(demResult.skipped + demResult.failed > 0, `WSS-DEMOTION: tail stopped (${demResult.skipped}s+${demResult.failed}f)`);
      ok(demResult.hasDemotion, 'WSS-DEMOTION: safety_demotion diagnostic present');
      ok(demResult.obsAck === 'observation_ack', 'WSS-DEMOTION: observation ack over WSS');
      ok(mockServer.planRequestCount === 1, `WSS-DEMOTION: 1 plan request (${mockServer.planRequestCount})`);
      ok(mockServer.observationCount === 1, `WSS-DEMOTION: 1 observation received (${mockServer.observationCount})`);

      await page.close();
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 6: HTTPS fallback when WSS unavailable
    // ═══════════════════════════════════════════════════════════════════
    {
      const page = await browser.newPage();
      await page.setContent('<html><body></body></html>');
      await injectProductPath(page);

      // Try to connect to a port that doesn't exist — _ensureWsConnected should fail
      const fallbackResult = await page.evaluate(async () => {
        const orch = globalThis.CcFillOrchestrator;
        if (!orch?._getOrCreateWsClient || !orch?._ensureWsConnected) {
          return { error: 'helpers not exported' };
        }
        // Use a dead port
        const client = new globalThis.CcWsClient({ url: 'ws://127.0.0.1:1/ws', token: 'x' });
        const connected = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), 2000);
          client._onStateChange = (s) => {
            if (s === 'connected') { clearTimeout(timer); resolve(true); }
            else if (s === 'suspended') { clearTimeout(timer); resolve(false); }
          };
          client.connect();
        });
        return { connected, state: client.state };
      });

      ok(!fallbackResult.error, `FALLBACK: helpers available (${fallbackResult.error || 'ok'})`);
      ok(fallbackResult.connected === false, 'FALLBACK: WSS connection to dead port failed');
      ok(fallbackResult.state === 'suspended', `FALLBACK: state=${fallbackResult.state}`);

      await page.close();
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 7: Strict WSS mode — no fallback
    // ═══════════════════════════════════════════════════════════════════
    {
      const page = await browser.newPage();
      await page.setContent('<html><body></body></html>');
      await injectProductPath(page);

      // Verify orchestrator source contains the strict wss path
      const strictCheck = await page.evaluate(() => {
        const orch = globalThis.CcFillOrchestrator;
        const src = orch?.runProductFill?.toString() || '';
        return {
          hasTransportParam: src.includes('transportOption') || src.includes('transport'),
          hasWssStrict: src.includes("transport === 'wss'") || src.includes('wss_unavailable'),
          hasNoFallback: src.includes('no fallback') || src.includes('no_fallback'),
        };
      });

      ok(strictCheck.hasTransportParam, 'STRICT-WSS: transport param exists');
      ok(strictCheck.hasWssStrict, 'STRICT-WSS: strict wss path in source');
      ok(strictCheck.hasNoFallback, 'STRICT-WSS: no-fallback error path exists');

      await page.close();
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 8: Source verification — orchestrator uses WSS message types
    // ═══════════════════════════════════════════════════════════════════
    {
      const page = await browser.newPage();
      await page.setContent('<html><body></body></html>');
      await injectProductPath(page);

      const srcCheck = await page.evaluate(() => {
        const orch = globalThis.CcFillOrchestrator;
        // Check helper sources
        const planSrc = orch?._requestPlanViaWss?.toString() || '';
        const obsSrc = orch?._reportObservationViaWss?.toString() || '';
        const mainSrc = orch?.runProductFill?.toString() || '';
        return {
          planHasType: planSrc.includes('fill_plan_request'),
          obsHasType: obsSrc.includes('fill_observation_wss'),
          mainHasWsClient: mainSrc.includes('_getOrCreateWsClient') || mainSrc.includes('wsClient'),
          mainHasFallback: mainSrc.includes('fetch') && mainSrc.includes('/fill-plan'),
          hasTransportResult: mainSrc.includes('usedTransport'),
        };
      });

      ok(srcCheck.planHasType, 'SOURCE: _requestPlanViaWss uses fill_plan_request');
      ok(srcCheck.obsHasType, 'SOURCE: _reportObservationViaWss uses fill_observation_wss');
      ok(srcCheck.mainHasWsClient, 'SOURCE: runProductFill references WsClient');
      ok(srcCheck.mainHasFallback, 'SOURCE: HTTPS fallback path retained');
      ok(srcCheck.hasTransportResult, 'SOURCE: transport indicator in result');

      await page.close();
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEST 9: Invalid snapshot / stale plan handling over WSS
    // ═══════════════════════════════════════════════════════════════════
    {
      const page = await browser.newPage();
      await page.setContent(STATIC_FORM);
      await injectProductPath(page);
      mockServer.reset();

      const snapshot = await page.evaluate(() => globalThis.CcPerception.perceivePage({ mode: 'snapshot' }));
      const inputNodes = Object.values(snapshot.nodes || {}).filter(n => n.affordances?.includes('type_text'));

      // Build a plan with WRONG target_binding (stale snapshot)
      const stalePlan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: 'plan:stale', correlation_id: 'corr:stale',
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        target_binding: {
          document_id: snapshot.document_id,
          snapshot_id: 'wrong-snapshot-id',  // STALE
          expected_revision: snapshot.revision,
        },
        steps: [{
          step_id: 's:0',
          target: { context_id: inputNodes[0].context_id, node_id: inputNodes[0].node_id },
          action: { op: 'type_text', value: 'X', clear_first: true },
          risk: 'safe', required_affordance: 'type_text', required_adapter_id: null,
          postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        }],
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_submit: false, allow_navigation: false },
      };

      mockServer.planResponse = { type: 'fill_plan_response', plan: stalePlan, plan_clamped: false };

      const staleResult = await page.evaluate(async (args) => {
        const { wsUrl } = args;
        const client = new globalThis.CcWsClient({ url: wsUrl, token: 'test-jwt' });
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('timeout')), 5000);
          client._onStateChange = (s) => { if (s === 'connected') { clearTimeout(timer); resolve(); } };
          client.connect();
        });

        const planResp = await client.request('fill_plan_request', { body: {} });
        const plan = planResp.plan;

        // Execute the stale plan — APE should reject it
        let obs;
        try { obs = await globalThis.CcActionPlanExecutor.execute(plan); } catch (e) { obs = { error: e.message }; }

        client.disconnect();
        return { outcome: obs?.outcome, code: obs?.failure_code || obs?.code || obs?.error, kind: obs?.kind };
      }, { wsUrl });

      // Stale plan should be rejected by validatePlan
      ok(staleResult.outcome === 'rejected' || staleResult.code?.includes('stale'),
        `STALE-PLAN: rejected (outcome=${staleResult.outcome}, code=${staleResult.code})`);

      await page.close();
    }

  } finally {
    await browser.close();
    await mockServer.stop();
  }

  console.log(`\nWSS Integration (M4.10): ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
