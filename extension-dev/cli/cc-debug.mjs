#!/usr/bin/env node
/**
 * CyberControl debug CLI — LIVE operator fill reports (no extension patches)
 *
 * DEBUG BRANCH ONLY (debug/cc-cli). Do NOT merge to master.
 * Product code under extension/ must stay at product tip.
 *
 *   node extension-dev/cli/cc-debug.mjs live
 *   node extension-dev/cli/cc-debug.mjs sessions
 *   node extension-dev/cli/cc-debug.mjs session --id <uuid>
 */
import { readFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { parseArgs, printHelp } from './lib/args.mjs';
import { launchBrowser, resolveChromePath, ROOT } from './lib/chrome.mjs';
import { createArtifacts, defaultOutDir, makeRunId } from './lib/artifacts.mjs';
import { listProductPathScripts } from './lib/product-inject.mjs';
import { resolvePageUrl, FIXTURES } from './lib/page-target.mjs';
import { perceivePage } from './lib/perceive.mjs';
import { buildOfflinePlan, loadPlanFile } from './lib/plan-offline.mjs';
import { executePlan } from './lib/execute.mjs';
import { observeDomForPlan, buildTruthReport } from './lib/dom-truth.mjs';
import { scanMainWorldControls, summarizeMainWorld } from './lib/main-world-scan.mjs';
import { fetchLivePlan } from './lib/plan-live.mjs';
import { loadProfile } from './lib/profile.mjs';
import { buildFillReport } from './lib/fill-report.mjs';
import { reportFromTrace } from './lib/report-from-trace.mjs';
import {
  listSessions,
  getSession,
  reportFromSession,
  authMe,
  extensionVersionOf,
  pathHintFromRecords,
  analyzeRecordTimings,
} from './lib/live-api.mjs';
import { createPhaseClock } from './lib/timing.mjs';

const flags = parseArgs(process.argv);

if (flags.help || !flags.command) {
  printHelp();
  process.exit(flags.help ? 0 : 1);
}

const runId = makeRunId();
const outDir = flags.out ? resolve(flags.out) : defaultOutDir(runId);
const art = createArtifacts(outDir);

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function gitBranch() {
  try {
    return execSync('git branch --show-current', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function resolveToken() {
  if (flags.token) return flags.token;
  const envName = flags.tokenEnv || 'CC_ACCESS_TOKEN';
  const fromEnv = process.env[envName] || process.env.ACCESS_TOKEN || process.env.CC_ACCESS_TOKEN || null;
  if (fromEnv) return fromEnv.trim();
  // Convenience: local debug JWT from earlier gcloud mint (gitignored)
  const jwtPath = resolve(ROOT, 'extension-dev/cli/out/ramishwar-access.jwt');
  try {
    if (existsSync(jwtPath)) {
      const t = readFileSync(jwtPath, 'utf8').trim();
      if (t) return t;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function resolveBackend() {
  const domain = (process.env.PUBLIC_DOMAIN || 'cybercontrol.fun').replace(/^\./, '');
  return (
    flags.backendUrl ||
    process.env.CC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    `https://api.${domain}/api`
  );
}

function requireLiveAuth() {
  const backend = resolveBackend();
  const token = resolveToken();
  if (!token) {
    throw new Error(
      'No access token.\n' +
        '  Set:  $env:CC_ACCESS_TOKEN = (Get-Content extension-dev\\cli\\out\\ramishwar-access.jwt -Raw).Trim()\n' +
        '  Or:   $env:CC_ACCESS_TOKEN = \"your-jwt\"\n' +
        '  File also auto-loaded if present: extension-dev/cli/out/ramishwar-access.jwt'
    );
  }
  return { backend, token };
}

async function withBrowserPage(fn, { headedDefault = false } = {}) {
  const headed =
    flags.headed != null ? flags.headed : headedDefault || !!flags.keepOpen;
  const { browser, executablePath } = await launchBrowser({
    chromePath: flags.chromePath,
    headed,
    keepOpen: flags.keepOpen,
  });
  const page = await browser.newPage();
  try {
    if (!flags.url && !flags.fixture) {
      throw new Error('Provide --url <real form URL> (or --fixture for lab only)');
    }
    const url = resolvePageUrl(flags);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: flags.timeoutMs || 90000 });
    // Real portals often need network settle
    await page.waitForTimeout(500).catch(() => {});
    const result = await fn(page, { url, executablePath, headed });
    if (flags.keepOpen) {
      console.log('\n--keep-open: browser open 90s...');
      await page.waitForTimeout(90_000);
    }
    return result;
  } finally {
    if (!flags.keepOpen) {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    } else {
      await browser.close().catch(() => {});
    }
  }
}

// ── status ──────────────────────────────────────────────────────────
async function cmdStatus() {
  const chrome = resolveChromePath(flags.chromePath);
  let scripts = [];
  let scriptsErr = null;
  try {
    scripts = listProductPathScripts();
  } catch (e) {
    scriptsErr = e.message;
  }
  let health = null;
  const backend = resolveBackend();
  if (backend) {
    try {
      const hUrl = `${String(backend).replace(/\/$/, '')}/extension/health`;
      const r = await fetch(hUrl);
      health = { url: hUrl, status: r.status, ok: r.ok, body: (await r.text()).slice(0, 400) };
    } catch (e) {
      health = { error: e.message };
    }
  }
  const meta = {
    tool: 'cc-debug',
    purpose: 'Real-form fill report (debug branch only — never merge to master)',
    branch: gitBranch(),
    gitSha: gitSha(),
    chrome: chrome || null,
    backend: backend || null,
    tokenPresent: !!resolveToken(),
    productPathScripts: scripts.length,
    productPathScriptsError: scriptsErr,
    health,
  };
  art.writeJson('meta.json', meta);
  const lines = [
    'cc-debug status',
    `branch: ${meta.branch}`,
    `sha: ${meta.gitSha}`,
    `chrome: ${meta.chrome || 'NOT FOUND'}`,
    `backend: ${meta.backend || '(set CC_BACKEND_URL or --backend-url)'}`,
    `token: ${meta.tokenPresent ? 'present' : 'missing (need --token or CC_ACCESS_TOKEN)'}`,
    `PRODUCT_PATH scripts: ${scripts.length}`,
    health ? `health: ${JSON.stringify(health).slice(0, 200)}` : 'health: not checked',
    `out: ${outDir}`,
  ];
  art.writeText('summary.txt', lines.join('\n'));
  console.log(lines.join('\n'));
}

// ── PRIMARY: live sessions from production API ──────────────────────
async function cmdSessions() {
  const { backend, token } = requireLiveAuth();
  console.log(`backend=${backend}  token=${token.slice(0, 12)}…\n`);
  const limit = flags.limit || 20;
  const rows = await listSessions(backend, token, { limit });
  // Enrich with full session when list omits version (usually present) + path hint from records
  const enriched = [];
  for (const s of rows) {
    let full = s;
    if (!extensionVersionOf(s) || !s.records) {
      try {
        full = await getSession(backend, token, s.id);
      } catch {
        full = s;
      }
    }
    const ver = extensionVersionOf(full) || '?';
    const records = Array.isArray(full.records) ? full.records : [];
    const hint = pathHintFromRecords(records);
    const timing = analyzeRecordTimings(records);
    enriched.push({ ...full, _ver: ver, _hint: hint, _timing: timing });
    const timeBit = timing.timedCount
      ? `  step_sum=${timing.sumMs}ms avg=${timing.avgMs}ms` +
        (timing.wallFromTsMs != null ? ` wall=${timing.wallFromTsMs}ms` : '') +
        (timing.maxMs != null ? ` slowest=${timing.maxMs}ms` : '')
      : '  step_sum=n/a';
    console.log(
      `${full.id}\n` +
        `  extension=${ver}  filled=${full.totalFilled ?? full.total_filled}  failed=${full.totalFailed ?? full.total_failed}\n` +
        `  host=${full.hostname || '(empty)'}  at=${full.receivedAt || full.created_at || '?'}\n` +
        `  path=${hint}  records=${records.length}${timeBit}`
    );
  }
  art.writeJson('sessions.json', enriched);
  console.log(`\nDetail: node extension-dev/cli/cc-debug.mjs session --id <id>`);
  console.log(`out: ${outDir}`);
}

async function cmdSession() {
  const { backend, token } = requireLiveAuth();
  const id = flags.id;
  if (!id) throw new Error('session requires --id <session-uuid>');
  const session = await getSession(backend, token, id);
  art.writeJson('session.json', session);
  const { lines, summary } = reportFromSession(session);
  const text = lines.join('\n') + `\nout=${outDir}\n`;
  art.writeText('report.txt', text);
  art.writeJson('report-summary.json', summary);
  console.log(text);
}

async function cmdLive() {
  const { backend, token } = requireLiveAuth();
  const pollMs = flags.pollMs || 3000;
  console.log(`
═══════════════════════════════════════════════════════════
  LIVE WATCH — server sessions (no extension code changes)
═══════════════════════════════════════════════════════════
  Backend  ${backend}
  Poll     every ${pollMs}ms
  Action   Operator fills with the REAL extension
  Output   New sessions print here + extension-dev/cli/out/
  Stop     Ctrl+C
═══════════════════════════════════════════════════════════
`);
  try {
    const me = await authMe(backend, token);
    console.log(`Auth OK: ${me.email || me.name || me.id} workspace=${me.workspace_id || me.workspaceId || '?'}\n`);
  } catch (e) {
    console.warn(`Auth me check failed (continuing): ${e.message}\n`);
  }

  const seen = new Set();
  // seed with current ids so we only report NEW fills
  try {
    const existing = await listSessions(backend, token, { limit: 50 });
    for (const s of existing) seen.add(s.id);
    console.log(`Seeded ${seen.size} existing sessions — waiting for NEW operator fills…\n`);
  } catch (e) {
    console.warn(`List seed failed: ${e.message}`);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const rows = await listSessions(backend, token, { limit: 15 });
      for (const s of [...rows].reverse()) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        console.log(
          `\n>>> NEW SESSION ${s.id} host=${s.hostname || '(empty)'} filled=${s.totalFilled} failed=${s.totalFailed}`
        );
        try {
          const full = await getSession(backend, token, s.id);
          const ver = extensionVersionOf(full) || '?';
          const records = Array.isArray(full.records) ? full.records : [];
          const timing = analyzeRecordTimings(records);
          console.log(`    extension version: ${ver}`);
          if (timing.timedCount) {
            console.log(
              `    timing: step_sum=${timing.sumMs}ms avg=${timing.avgMs}ms p95=${timing.p95Ms}ms` +
                (timing.wallFromTsMs != null ? ` wall=${timing.wallFromTsMs}ms` : '')
            );
          }
          const dir = resolve(ROOT, 'extension-dev/cli/out', `live-session-${s.id}`);
          const { createArtifacts: ca } = await import('./lib/artifacts.mjs');
          const a = ca(dir);
          a.writeJson('session.json', full);
          const { lines, summary } = reportFromSession(full);
          const text = lines.join('\n');
          a.writeText('report.txt', text);
          a.writeJson('report-summary.json', summary);
          console.log(text);
          console.log(`Saved: ${dir}\\report.txt`);
        } catch (e) {
          console.error(`Failed to load session ${s.id}: ${e.message}`);
        }
      }
    } catch (e) {
      console.warn(`[poll] ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

// ── optional: local file trace (legacy) ─────────────────────────────
async function cmdReport() {
  let file = flags.file;
  if (!file) {
    // Try newest cc-fill-trace-*.json in Downloads
    const dl = resolve(homedir(), 'Downloads');
    if (existsSync(dl)) {
      const { readdirSync, statSync } = await import('node:fs');
      const files = readdirSync(dl)
        .filter((f) => f.startsWith('cc-fill-trace-') && f.endsWith('.json'))
        .map((f) => ({ f, t: statSync(resolve(dl, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      if (files[0]) file = resolve(dl, files[0].f);
    }
  }
  if (!file) {
    throw new Error(
      'report requires --file <cc-fill-trace-....json>\n' +
        'After operator Fill, the side panel downloads this file automatically.\n' +
        'Or omit --file to use the newest cc-fill-trace-*.json in Downloads.'
    );
  }
  const abs = resolve(file);
  if (!existsSync(abs)) throw new Error(`Trace file not found: ${abs}`);

  const trace = JSON.parse(readFileSync(abs, 'utf8'));
  if (trace.schema !== 'cc-fill-trace/v1' && !trace.step_truth && !trace.plan) {
    throw new Error('Not a cc-fill-trace/v1 file (missing schema/step_truth/plan)');
  }

  const { lines, summary } = reportFromTrace(trace);
  const text = lines.join('\n') + `\nsource=${abs}\nout=${outDir}\n`;

  // Copy full trace into out for this analysis run
  try {
    copyFileSync(abs, resolve(outDir, 'fill-trace.json'));
  } catch {
    /* ignore */
  }
  art.writeText('report.txt', text);
  art.writeJson('report-summary.json', summary);
  art.writeJson('meta.json', {
    command: 'report',
    source: abs,
    gitSha: gitSha(),
    branch: gitBranch(),
    summary,
  });

  console.log(text);
  if (!summary.honest) process.exitCode = 1;
}

// ── LAB: CLI-driven fill (secondary) ────────────────────────────────
async function cmdFill() {
  const mode = flags.mode || 'live';
  if (mode !== 'live' && mode !== 'offline') {
    throw new Error('--mode must be live (default) or offline (lab only)');
  }
  if (mode === 'live') {
    if (!flags.url && !flags.fixture) {
      throw new Error('fill requires --url for a real form (or --fixture for lab)');
    }
    if (!flags.profile) throw new Error('fill --mode live requires --profile <json-file>');
    if (!resolveBackend()) {
      throw new Error('fill requires --backend-url or CC_BACKEND_URL');
    }
    if (!resolveToken()) {
      throw new Error('fill requires --token or CC_ACCESS_TOKEN / ACCESS_TOKEN');
    }
  }

  const profile = flags.profile ? loadProfile(flags.profile) : null;
  // Default progressive so operator can watch field-by-field + per-step ms.
  // --batch matches product one-shot APE (fill all, then return).
  const progressive = flags.progressive !== false;

  const pack = await withBrowserPage(
    async (page, ctx) => {
      const clock = createPhaseClock('fill');
      console.log(`Opening ${ctx.url}`);
      clock.mark('page_open');
      console.log('Perceiving…');
      const { snapshot, stats } = await perceivePage(page);
      clock.mark('perceive');
      console.log(`  nodes=${stats.nodeCount} revision=${stats.revision}`);

      let plan;
      let planMeta = {};
      if (flags.plan) {
        plan = loadPlanFile(resolve(flags.plan), readFileSync);
        clock.mark('plan_file');
        console.log(`Plan loaded from file (${plan.steps?.length} steps)`);
      } else if (mode === 'live') {
        console.log('Requesting fill-plan from server…');
        let p;
        let raw;
        try {
          ({ plan: p, raw } = await fetchLivePlan({
            backendUrl: resolveBackend(),
            token: resolveToken(),
            snapshot,
            profile: profile.flat,
            profileId: flags.profileId || profile.id,
            executionPreference: flags.executionPreference || 'AUTO',
          }));
        } catch (e) {
          if (e.raw) art.writeJson('fill-plan-response.json', e.raw);
          art.writeJson('snapshot.json', snapshot);
          throw e;
        }
        plan = p;
        clock.mark('fill_plan_http');
        planMeta = {
          classification: raw?.classification || raw?.diagnostics?.system_classification,
          diagnostics: raw?.diagnostics || null,
          message: raw?.message || null,
          rawKeys: Object.keys(raw || {}),
        };
        art.writeJson('fill-plan-response.json', raw);
        console.log(`  plan steps=${plan.steps?.length} plan_id=${plan.plan_id}`);
        if (raw?.classification) {
          console.log(
            `  classification=${raw.classification.system_classification || '?'} ` +
              `mode=${raw.classification.effective_execution_mode || '?'}`
          );
        }
      } else {
        console.log('Offline lab plan…');
        plan = buildOfflinePlan(snapshot, { maxSteps: flags.maxSteps });
        clock.mark('plan_offline');
      }

      if (!plan.steps?.length) {
        throw new Error('Plan has zero steps — nothing to fill (mapping empty?)');
      }

      console.log(
        progressive
          ? 'Executing ActionPlan (progressive — live per-step ms)…'
          : 'Executing ActionPlan (batch — product-like one shot)…'
      );
      const observation = await executePlan(page, plan, {
        stepId: flags.stepId,
        progressive,
      });
      clock.mark('execute');
      await page.waitForTimeout(200);
      const domAfter = await observeDomForPlan(page, plan);
      const mainAfter = await scanMainWorldControls(page);
      const mainSummary = summarizeMainWorld(mainAfter);
      clock.mark('dom_observe');
      planMeta.phaseClock = clock.phases;
      planMeta.progressive = progressive;
      console.log(clock.summaryLines().join('\n'));

      return {
        ctx,
        snapshot,
        stats,
        plan,
        planMeta,
        observation,
        domAfter,
        mainAfter,
        mainSummary,
      };
    },
    { headedDefault: true }
  );

  const report = buildFillReport({
    url: pack.ctx.url,
    mode,
    runtime: 'page-inject (product scripts)',
    snapshot: pack.snapshot,
    plan: pack.plan,
    observation: pack.observation,
    domAfter: pack.domAfter,
    mainSummary: pack.mainSummary,
    planMeta: pack.planMeta,
  });

  // Also keep structured truth
  const truth = buildTruthReport(
    pack.plan,
    pack.observation,
    pack.domAfter,
    pack.plan._debug_expectations || {}
  );
  if (report.summary.pageEmptyLie) {
    truth.ok = false;
    truth.violations = (truth.violations || 0) + 1;
    truth.page_empty_lie = true;
  }

  art.writeJson('snapshot.json', pack.snapshot);
  art.writeJson('plan.json', pack.plan);
  art.writeJson('execution.json', pack.observation);
  art.writeJson('dom-after.json', pack.domAfter);
  art.writeJson('main-world-after.json', pack.mainAfter);
  art.writeJson('truth.json', truth);
  art.writeJson('report.json', { summary: report.summary, rows: report.rows });
  art.writeText('report.txt', report.lines.join('\n') + `\nout=${outDir}\n`);
  art.writeJson('meta.json', {
    command: 'fill',
    mode,
    url: pack.ctx.url,
    gitSha: gitSha(),
    branch: gitBranch(),
    chrome: pack.ctx.executablePath,
    summary: report.summary,
  });

  console.log('\n' + report.lines.join('\n'));
  console.log(`\nFull report: ${resolve(outDir, 'report.txt')}`);
  console.log(`Artifacts:   ${outDir}`);

  if (!report.summary.honest || report.summary.lies > 0) process.exitCode = 1;
  if (report.summary.fail > 0) process.exitCode = 1;
}

// ── lab secondary commands (kept for stage debugging) ───────────────
async function cmdPerceive() {
  const result = await withBrowserPage(async (page, ctx) => {
    const { snapshot, stats } = await perceivePage(page);
    return { snapshot, stats, ctx };
  });
  art.writeJson('snapshot.json', result.snapshot);
  art.writeText(
    'summary.txt',
    `perceive nodes=${result.stats.nodeCount} revision=${result.stats.revision}\n${result.ctx.url}`
  );
  console.log(readFileSync(resolve(outDir, 'summary.txt'), 'utf8'));
}

async function cmdFillE2ELab() {
  // thin wrapper: offline fixture harness (not primary product use)
  flags.mode = flags.mode || 'offline';
  if (!flags.fixture && !flags.url) flags.fixture = 'perception-native.html';
  console.log('(lab) fill-e2e offline harness — for real forms use: fill --url ... --profile ...\n');
  // reuse fill offline path
  const pack = await withBrowserPage(async (page, ctx) => {
    const { snapshot, stats } = await perceivePage(page);
    const plan = flags.plan
      ? loadPlanFile(resolve(flags.plan), readFileSync)
      : buildOfflinePlan(snapshot, { maxSteps: flags.maxSteps });
    let observation;
    if (flags.forceLie) {
      observation = {
        kind: 'execution_observation',
        outcome: 'completed',
        steps: (plan.steps || []).map((s) => ({ step_id: s.step_id, status: 'succeeded' })),
      };
    } else {
      observation = await executePlan(page, plan);
    }
    await page.waitForTimeout(150);
    const domAfter = await observeDomForPlan(page, plan);
    const mainAfter = await scanMainWorldControls(page);
    const mainSummary = summarizeMainWorld(mainAfter);
    const report = buildFillReport({
      url: ctx.url,
      mode: 'offline-lab',
      runtime: 'page-inject',
      snapshot,
      plan,
      observation,
      domAfter,
      mainSummary,
    });
    return { report, snapshot, plan, observation, domAfter, mainAfter, mainSummary, ctx };
  });
  art.writeText('report.txt', pack.report.lines.join('\n'));
  art.writeJson('plan.json', pack.plan);
  art.writeJson('execution.json', pack.observation);
  art.writeJson('main-world-after.json', pack.mainAfter);
  console.log(pack.report.lines.join('\n'));
  if (pack.report.summary.lies > 0 || pack.report.summary.fail > 0) process.exitCode = 1;
}

try {
  console.log(`\ncc-debug [${flags.command}]  branch=${gitBranch()}  out=${outDir}\n`);
  switch (flags.command) {
    case 'status':
      await cmdStatus();
      break;
    case 'live':
      await cmdLive();
      break;
    case 'sessions':
      await cmdSessions();
      break;
    case 'session':
      await cmdSession();
      break;
    case 'report':
      await cmdReport();
      break;
    case 'fill':
      await cmdFill();
      break;
    case 'perceive':
      await cmdPerceive();
      break;
    case 'fill-e2e':
      await cmdFillE2ELab();
      break;
    case 'plan':
    case 'execute':
    case 'observe-dom':
      console.error(
        `Command "${flags.command}" is a lab stage tool.\n` +
          `For real forms use:\n` +
          `  node extension-dev/cli/cc-debug.mjs fill --url "..." --profile p.json --backend-url ... --token ...\n`
      );
      process.exit(1);
      break;
    default:
      console.error(`Unknown command: ${flags.command}`);
      printHelp();
      process.exit(1);
  }
} catch (e) {
  const msg = e?.message || String(e);
  const cause = e?.cause?.message || e?.cause || null;
  console.error('\nFATAL:', msg);
  if (cause) console.error('  cause:', cause);
  if (msg === 'fetch failed' || /fetch failed/i.test(msg)) {
    console.error(
      '  Hint: network/TLS failure talking to the API.\n' +
        '  Try:  node extension-dev/cli/cc-debug.mjs status\n' +
        '  Ensure token file exists or set CC_ACCESS_TOKEN; backend defaults to https://api.cybercontrol.fun/api'
    );
  }
  try {
    art.writeText('error.txt', String(e.stack || e) + (cause ? `\ncause: ${cause}` : ''));
    art.writeJson('meta.json', {
      command: flags.command,
      error: msg,
      cause: cause ? String(cause) : null,
      gitSha: gitSha(),
      branch: gitBranch(),
    });
  } catch {
    /* ignore */
  }
  console.error(`Artifacts (if any): ${outDir}`);
  process.exit(1);
}
