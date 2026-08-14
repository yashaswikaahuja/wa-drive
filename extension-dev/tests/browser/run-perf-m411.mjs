/**
 * Phase 4.11 — Adaptive STATIC/DYNAMIC Fill Performance Benchmark
 * Issue #205: Evidence-based performance measurement.
 *
 * Measures the FULL product Fill path in Chromium:
 *   Perception → WSS plan request → ActionPlanExecutor → DOM evidence → settle → re-perceive
 *
 * Fixtures: 10, 20, 50 fields + cascade (DOM mutation between turns).
 * Modes: STATIC (bounded multi-action), DYNAMIC (one action per turn).
 * Transport: WSS via mock server with timing instrumentation.
 *
 * Outputs: machine-readable JSON with median, p95, sample count per metric.
 *
 * Run: node extension-dev/tests/perf/run-adaptive-fill-benchmark.mjs
 */
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
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

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.CHROME_PATH,
].filter(Boolean);
const executablePath = CHROME_PATHS.find((p) => existsSync(p)) || undefined;

// ── Configuration ──────────────────────────────────────────────────────
const WARMUP_RUNS = 3;
const MEASURED_RUNS = 30;
const FIELD_COUNTS = [10, 20, 50];
const MODES = ['static', 'dynamic'];

// ── Fixtures ───────────────────────────────────────────────────────────
function generateForm(fieldCount) {
  const fields = Array.from({ length: fieldCount }, (_, i) =>
    `<input id="f${i}" name="field_${i}" placeholder="Field ${i}">`
  ).join('\n  ');
  return `<!DOCTYPE html><html><body><form>\n  ${fields}\n</form></body></html>`;
}

const CASCADE_FORM = `<!DOCTYPE html><html><body><form>
  <input id="f0" name="name" placeholder="Name">
  <select id="f1" name="state" onchange="setTimeout(()=>{
    document.getElementById('f2').innerHTML='<option>--</option><option value=v1>City1</option><option value=v2>City2</option>';
    const extra = document.createElement('input');
    extra.id='f3'; extra.name='extra'; extra.placeholder='Extra';
    document.querySelector('form').appendChild(extra);
  },30)">
    <option value="">--</option><option value="s1">State1</option>
  </select>
  <select id="f2" name="city"><option value="">--</option></select>
</form></body></html>`;

// ── Product path scripts ───────────────────────────────────────────────
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
    const path = resolve(EXT_DIR, script);
    if (!existsSync(path)) continue;
    await page.evaluate(readFileSync(path, 'utf8'));
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

// ── Server modules ─────────────────────────────────────────────────────
const { classifyFormBehavior } = await import(pathToFileURL(resolve(ROOT, 'extension-service/behavior-classifier.js')).href);
const { mergeExecutionMode } = await import(pathToFileURL(resolve(ROOT, 'extension-service/execution-mode.js')).href);
const { applyStaticBounds, STATIC_MAX_STEPS } = await import(pathToFileURL(resolve(ROOT, 'extension-service/static-bounds.js')).href);

// ── Mock WSS Server with timing ────────────────────────────────────────
function createTimedMockServer() {
  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const timings = { planRequests: [], observationRequests: [] };

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'connected', sessionId: 'sess:perf', protocolVersion: 1 }));
    ws.on('message', (data) => {
      const start = performance.now();
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === 'fill_plan_request') {
        // Simulate minimal server planning latency (just protocol overhead)
        const elapsed = performance.now() - start;
        timings.planRequests.push(elapsed);
        // Return fill_complete — the actual plan is built client-side for benchmarking
        ws.send(JSON.stringify({ type: 'fill_plan_response', plan: null, fill_complete: true, ref: msg.id }));
      } else if (msg.type === 'fill_observation_wss') {
        const elapsed = performance.now() - start;
        timings.observationRequests.push(elapsed);
        ws.send(JSON.stringify({ type: 'fill_observation_ack', plan_id: msg.observation?.plan_id, ref: msg.id }));
      }
    });
  });

  return {
    httpServer, wss, timings,
    start: () => new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve({ port: httpServer.address().port, url: `ws://127.0.0.1:${httpServer.address().port}/ws` }));
    }),
    stop: () => new Promise((resolve) => { wss.close(); httpServer.close(resolve); }),
    reset() { timings.planRequests = []; timings.observationRequests = []; },
  };
}

// ── Statistics ──────────────────────────────────────────────────────────
function computeStats(arr) {
  if (arr.length === 0) return { median: 0, p95: 0, min: 0, max: 0, count: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return { median: Math.round(median * 100) / 100, p95: Math.round(p95 * 100) / 100, min: Math.round(sorted[0] * 100) / 100, max: Math.round(sorted[sorted.length - 1] * 100) / 100, count: arr.length };
}

// ── Benchmark runner ───────────────────────────────────────────────────
async function benchmarkFill(page, wsUrl, fieldCount, mode, snapshot, inputNodes) {
  // Build plan for this run
  const maxSteps = mode === 'static' ? Math.min(inputNodes.length, STATIC_MAX_STEPS) : 1;
  const totalFields = inputNodes.length;

  const timings = {
    perception: [], plan: [], execute: [], settle: [], wssRtt: [], total: [],
    plans: 0, actions: 0, perceptions: 0, settles: 0, wssRtts: 0,
  };

  // Single full fill measurement
  const result = await page.evaluate(async (args) => {
    const { wsUrl, mode, inputNodes: origNodes, maxSteps, totalFields } = args;
    const t = { perception: [], plan: [], execute: [], settle: [], wssRtt: [], total: [] };
    let plans = 0, actions = 0, perceptions = 0, settles = 0, wssRtts = 0;

    const totalStart = performance.now();

    // Connect WSS
    const client = new globalThis.CcWsClient({ url: wsUrl, token: 'perf-test' });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('connect timeout')), 5000);
      client._onStateChange = (s) => { if (s === 'connected') { clearTimeout(timer); resolve(); } };
      client.connect();
    });

    let filledCount = 0;
    let turnCount = 0;
    const MAX_TURNS = mode === 'dynamic' ? totalFields + 5 : Math.ceil(totalFields / maxSteps) + 2;

    while (filledCount < totalFields && turnCount < MAX_TURNS) {
      turnCount++;

      // Re-perceive each turn (except first — already perceived by harness)
      let currentNodes;
      if (turnCount > 1) {
        const settleStart = performance.now();
        if (globalThis.CcDomSettle?.waitForSettle) {
          await globalThis.CcDomSettle.waitForSettle();
        } else {
          await new Promise(r => setTimeout(r, 50));
        }
        t.settle.push(performance.now() - settleStart);
        settles++;

        const percStart = performance.now();
        const newSnap = await globalThis.CcPerception.perceivePage({ mode: 'snapshot' });
        t.perception.push(performance.now() - percStart);
        perceptions++;

        // Get unfilled nodes from fresh snapshot
        currentNodes = Object.values(newSnap.nodes || {}).filter(n =>
          n.affordances?.includes('type_text') && !n.value_state?.includes('nonempty')
        );
        if (currentNodes.length === 0) break; // All filled
      } else {
        currentNodes = origNodes;
      }

      // Build plan from current nodes
      const planStart = performance.now();
      const stepsThisTurn = currentNodes.slice(0, maxSteps);
      const state = globalThis.CcPerception.getPerceptionState();
      const plan = {
        kind: 'action_plan', schema_version: '3.0.0',
        plan_id: `plan:perf-${turnCount}`, correlation_id: `corr:perf-${turnCount}`,
        supersedes_plan_id: null,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        target_binding: { document_id: state.documentId, snapshot_id: state.snapshotId, expected_revision: state.revision },
        steps: stepsThisTurn.map((n, i) => ({
          step_id: `s:${turnCount}:${i}`,
          target: { context_id: n.context_id, node_id: n.node_id },
          action: { op: 'type_text', value: `V${turnCount}_${i}`, clear_first: true },
          risk: 'safe', required_affordance: 'type_text', required_adapter_id: null,
          postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
          on_failure: 'stop_and_report',
        })),
        authorization: { max_risk: 'safe', operator_confirmed: false, allow_submit: false, allow_navigation: false },
      };
      t.plan.push(performance.now() - planStart);
      plans++;

      // WSS round-trip: send plan request + receive ack (timing the protocol overhead)
      const wssStart = performance.now();
      await client.request('fill_plan_request', { snapshot: 'perf', profile: {} });
      t.wssRtt.push(performance.now() - wssStart);
      wssRtts++;

      // Execute plan
      const execStart = performance.now();
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
      t.execute.push(performance.now() - execStart);

      const succeeded = (obs?.steps || []).filter(s => s.status === 'succeeded').length;
      actions += succeeded;
      filledCount += succeeded;

      // Report observation via WSS
      const obsWssStart = performance.now();
      await client.request('fill_observation_wss', { observation: obs, session_id: '' });
      t.wssRtt.push(performance.now() - obsWssStart);
      wssRtts++;

      // If steps failed and none succeeded, break (safety)
      if (succeeded === 0) break;
    }

    const totalMs = performance.now() - totalStart;
    t.total.push(totalMs);
    client.disconnect();

    return { t, plans, actions, perceptions: perceptions + 1, settles, wssRtts, filledCount };
  }, { wsUrl, mode, inputNodes, maxSteps, totalFields });

  return result;
}

async function runBenchmark() {
  const mockServer = createTimedMockServer();
  const { url: wsUrl } = await mockServer.start();
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });

  const allResults = [];

  try {
    for (const fieldCount of FIELD_COUNTS) {
      for (const mode of MODES) {
        const html = generateForm(fieldCount);
        const runTimings = {
          perception: [], plan: [], execute: [], settle: [], wssRtt: [], total: [],
          plans: 0, actions: 0, perceptions: 0, settles: 0, wssRtts: 0,
        };

        process.stdout.write(`  ${fieldCount} fields / ${mode}: `);

        for (let run = 0; run < WARMUP_RUNS + MEASURED_RUNS; run++) {
          const page = await browser.newPage();
          await page.setContent(html);
          await injectProductPath(page);

          // Initial perception
          const percStart = performance.now();
          const snapshot = await page.evaluate(() => globalThis.CcPerception.perceivePage({ mode: 'snapshot' }));
          const percTime = performance.now() - percStart;

          const inputNodes = Object.values(snapshot.nodes || {}).filter(n => n.affordances?.includes('type_text'));

          const result = await benchmarkFill(page, wsUrl, fieldCount, mode, snapshot, inputNodes);
          await page.close();

          // Discard warmup
          if (run < WARMUP_RUNS) continue;

          // Accumulate
          runTimings.perception.push(percTime, ...result.t.perception);
          runTimings.plan.push(...result.t.plan);
          runTimings.execute.push(...result.t.execute);
          runTimings.settle.push(...result.t.settle);
          runTimings.wssRtt.push(...result.t.wssRtt);
          runTimings.total.push(...result.t.total);
          runTimings.plans += result.plans;
          runTimings.actions += result.actions;
          runTimings.perceptions += result.perceptions;
          runTimings.settles += result.settles;
          runTimings.wssRtts += result.wssRtts;
        }

        const entry = {
          mode,
          fields: fieldCount,
          runs: MEASURED_RUNS,
          median_ms: computeStats(runTimings.total).median,
          p95_ms: computeStats(runTimings.total).p95,
          perception_ms: computeStats(runTimings.perception),
          plan_ms: computeStats(runTimings.plan),
          execute_ms: computeStats(runTimings.execute),
          settle_ms: computeStats(runTimings.settle),
          wss_rtt_ms: computeStats(runTimings.wssRtt),
          total_ms: computeStats(runTimings.total),
          plans: Math.round(runTimings.plans / MEASURED_RUNS),
          actions: Math.round(runTimings.actions / MEASURED_RUNS),
          perceptions: Math.round(runTimings.perceptions / MEASURED_RUNS),
          settles: Math.round(runTimings.settles / MEASURED_RUNS),
          wss_rtts: Math.round(runTimings.wssRtts / MEASURED_RUNS),
        };
        allResults.push(entry);
        process.stdout.write(`median=${entry.median_ms}ms p95=${entry.p95_ms}ms\n`);
      }
    }

    // CASCADE fixture (DYNAMIC only — DOM mutation between turns)
    {
      const mode = 'dynamic';
      const runTimings = { perception: [], plan: [], execute: [], settle: [], wssRtt: [], total: [], plans: 0, actions: 0, perceptions: 0, settles: 0, wssRtts: 0 };
      process.stdout.write(`  cascade / ${mode}: `);

      for (let run = 0; run < WARMUP_RUNS + MEASURED_RUNS; run++) {
        const page = await browser.newPage();
        await page.setContent(CASCADE_FORM);
        await injectProductPath(page);

        const percStart = performance.now();
        const snapshot = await page.evaluate(() => globalThis.CcPerception.perceivePage({ mode: 'snapshot' }));
        const percTime = performance.now() - percStart;

        const inputNodes = Object.values(snapshot.nodes || {}).filter(n =>
          n.affordances?.includes('type_text') || n.affordances?.includes('select_option')
        );

        const result = await benchmarkFill(page, wsUrl, inputNodes.length, mode, snapshot, inputNodes);
        await page.close();

        if (run < WARMUP_RUNS) continue;
        runTimings.perception.push(percTime, ...result.t.perception);
        runTimings.plan.push(...result.t.plan);
        runTimings.execute.push(...result.t.execute);
        runTimings.settle.push(...result.t.settle);
        runTimings.wssRtt.push(...result.t.wssRtt);
        runTimings.total.push(...result.t.total);
        runTimings.plans += result.plans;
        runTimings.actions += result.actions;
        runTimings.perceptions += result.perceptions;
        runTimings.settles += result.settles;
        runTimings.wssRtts += result.wssRtts;
      }

      const entry = {
        mode: 'dynamic-cascade',
        fields: 'cascade',
        runs: MEASURED_RUNS,
        median_ms: computeStats(runTimings.total).median,
        p95_ms: computeStats(runTimings.total).p95,
        perception_ms: computeStats(runTimings.perception),
        plan_ms: computeStats(runTimings.plan),
        execute_ms: computeStats(runTimings.execute),
        settle_ms: computeStats(runTimings.settle),
        wss_rtt_ms: computeStats(runTimings.wssRtt),
        total_ms: computeStats(runTimings.total),
        plans: Math.round(runTimings.plans / MEASURED_RUNS),
        actions: Math.round(runTimings.actions / MEASURED_RUNS),
        perceptions: Math.round(runTimings.perceptions / MEASURED_RUNS),
        settles: Math.round(runTimings.settles / MEASURED_RUNS),
        wss_rtts: Math.round(runTimings.wssRtts / MEASURED_RUNS),
      };
      allResults.push(entry);
      process.stdout.write(`median=${entry.median_ms}ms p95=${entry.p95_ms}ms\n`);
    }

    // Resource sampling (JS heap if available)
    {
      const page = await browser.newPage();
      await page.setContent(generateForm(50));
      await injectProductPath(page);
      const heapInfo = await page.evaluate(() => {
        if (performance.memory) {
          return { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize };
        }
        return null;
      });
      if (heapInfo) {
        allResults.push({ _resource: 'js_heap_50_fields', usedMB: Math.round(heapInfo.usedJSHeapSize / 1024 / 1024 * 100) / 100, totalMB: Math.round(heapInfo.totalJSHeapSize / 1024 / 1024 * 100) / 100 });
      }
      await page.close();
    }

  } finally {
    await browser.close();
    await mockServer.stop();
  }

  // Output JSON
  const outputPath = resolve(__dirname, 'benchmark-results.json');
  writeFileSync(outputPath, JSON.stringify(allResults, null, 2));

  // Print comparison table
  console.log('\n═══ M4.11 Performance Benchmark Results ═══\n');
  console.log('| Fields | Mode | Median (ms) | P95 (ms) | Plans | Perceptions | WSS RTTs | Settles |');
  console.log('|--------|------|-------------|----------|-------|-------------|----------|---------|');
  for (const r of allResults) {
    if (r._resource) continue;
    console.log(`| ${String(r.fields).padEnd(6)} | ${r.mode.padEnd(4)} | ${String(r.median_ms).padEnd(11)} | ${String(r.p95_ms).padEnd(8)} | ${String(r.plans).padEnd(5)} | ${String(r.perceptions).padEnd(11)} | ${String(r.wss_rtts).padEnd(8)} | ${String(r.settles).padEnd(7)} |`);
  }

  // Print breakdown
  console.log('\n═══ Per-metric breakdown (median ms) ═══\n');
  console.log('| Fields | Mode | Perception | Plan | Execute | Settle | WSS RTT |');
  console.log('|--------|------|------------|------|---------|--------|---------|');
  for (const r of allResults) {
    if (r._resource) continue;
    console.log(`| ${String(r.fields).padEnd(6)} | ${r.mode.padEnd(4)} | ${String(r.perception_ms.median).padEnd(10)} | ${String(r.plan_ms.median).padEnd(4)} | ${String(r.execute_ms.median).padEnd(7)} | ${String(r.settle_ms.median).padEnd(6)} | ${String(r.wss_rtt_ms.median).padEnd(7)} |`);
  }

  console.log(`\nResults saved to: ${outputPath}`);
  console.log(`\nMethodology: ${WARMUP_RUNS} warmup + ${MEASURED_RUNS} measured runs per cell`);
  console.log('Transport: WSS (mock server, localhost, protocol overhead only)');
  console.log('Environment: Headless Chromium, same-machine WSS, no network latency');
}

runBenchmark().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
