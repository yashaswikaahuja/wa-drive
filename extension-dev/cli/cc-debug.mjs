#!/usr/bin/env node
/**
 * CyberControl product-path debug CLI
 *
 * DEBUG BRANCH ONLY (debug/cc-cli). Do NOT merge to master.
 * Offline truth gate first; live service optional.
 *
 *   node extension-dev/cli/cc-debug.mjs fill-e2e --fixture perception-native.html
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
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
  return process.env[envName] || process.env.ACCESS_TOKEN || process.env.CC_ACCESS_TOKEN || null;
}

function resolveBackend() {
  return flags.backendUrl || process.env.CC_BACKEND_URL || process.env.BACKEND_URL || null;
}

async function withBrowserPage(fn) {
  const { browser, executablePath, headed } = await launchBrowser({
    chromePath: flags.chromePath,
    headed: flags.headed,
    keepOpen: flags.keepOpen,
  });
  const page = await browser.newPage();
  try {
    const url = resolvePageUrl(flags);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: flags.timeoutMs });
    const result = await fn(page, { url, executablePath, headed });
    if (flags.keepOpen) {
      console.log('\n--keep-open: browser left open 60s (Ctrl+C to abort wait)...');
      await page.waitForTimeout(60_000);
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
      health = { url: hUrl, status: r.status, ok: r.ok, body: await r.text().then((t) => t.slice(0, 500)) };
    } catch (e) {
      health = { error: e.message };
    }
  }

  const meta = {
    tool: 'cc-debug',
    purpose: 'debug-only — never merge debug/cc-cli to master',
    branch: gitBranch(),
    gitSha: gitSha(),
    chrome: chrome || null,
    fixturesDir: FIXTURES,
    productPathScripts: scripts,
    productPathScriptsError: scriptsErr,
    backend: backend || null,
    health,
    node: process.version,
    platform: process.platform,
  };
  art.writeJson('meta.json', meta);
  art.writeText(
    'summary.txt',
    [
      'cc-debug status',
      `branch: ${meta.branch}`,
      `sha: ${meta.gitSha}`,
      `chrome: ${meta.chrome || 'NOT FOUND — set CHROME_PATH'}`,
      `PRODUCT_PATH scripts: ${scripts.length}${scriptsErr ? ` (error: ${scriptsErr})` : ''}`,
      `backend health: ${health ? JSON.stringify(health).slice(0, 200) : 'not checked'}`,
      `out: ${outDir}`,
    ].join('\n')
  );
  console.log(art.writes.includes('summary.txt') ? readFileSync(resolve(outDir, 'summary.txt'), 'utf8') : '');
  console.log(`\nArtifacts: ${outDir}`);
  if (!chrome) process.exitCode = 1;
}

async function cmdPerceive() {
  const result = await withBrowserPage(async (page, ctx) => {
    const { snapshot, stats } = await perceivePage(page);
    return { snapshot, stats, ctx };
  });
  art.writeJson('snapshot.json', result.snapshot);
  art.writeJson('meta.json', {
    command: 'perceive',
    url: result.ctx.url,
    chrome: result.ctx.executablePath,
    gitSha: gitSha(),
    branch: gitBranch(),
    stats: result.stats,
  });
  art.writeText(
    'summary.txt',
    `perceive OK\nnodes=${result.stats.nodeCount} type_text=${result.stats.typeText}\nrevision=${result.stats.revision}\nout=${outDir}`
  );
  console.log(readFileSync(resolve(outDir, 'summary.txt'), 'utf8'));
  if (!result.stats.nodeCount) process.exitCode = 1;
}

async function buildPlanFromPage(page, snapshot) {
  if (flags.plan) {
    return loadPlanFile(resolve(flags.plan), readFileSync);
  }
  if (flags.mode === 'live') {
    const profilePath = flags.profile;
    if (!profilePath) throw new Error('live mode requires --profile');
    const profile = JSON.parse(readFileSync(resolve(profilePath), 'utf8'));
    const { plan, raw } = await fetchLivePlan({
      backendUrl: resolveBackend(),
      token: resolveToken(),
      snapshot,
      profile,
      executionPreference: flags.executionPreference,
    });
    art.writeJson('fill-plan-response.json', raw);
    return plan;
  }
  return buildOfflinePlan(snapshot, { maxSteps: flags.maxSteps, stepId: flags.stepId });
}

async function cmdPlan() {
  const result = await withBrowserPage(async (page, ctx) => {
    const { snapshot, stats } = await perceivePage(page);
    const plan = await buildPlanFromPage(page, snapshot);
    return { snapshot, stats, plan, ctx };
  });
  art.writeJson('snapshot.json', result.snapshot);
  art.writeJson('plan.json', result.plan);
  art.writeJson('meta.json', {
    command: 'plan',
    mode: flags.mode,
    url: result.ctx.url,
    gitSha: gitSha(),
    steps: result.plan.steps?.length,
  });
  art.writeText(
    'summary.txt',
    `plan OK mode=${flags.mode}\nsteps=${result.plan.steps?.length}\nplan_id=${result.plan.plan_id}\nout=${outDir}`
  );
  console.log(readFileSync(resolve(outDir, 'summary.txt'), 'utf8'));
}

async function cmdExecute() {
  const result = await withBrowserPage(async (page, ctx) => {
    const { snapshot } = await perceivePage(page);
    const plan = flags.plan
      ? loadPlanFile(resolve(flags.plan), readFileSync)
      : await buildPlanFromPage(page, snapshot);
    // rebind plan to current snapshot ids if offline regenerated
    const obs = await executePlan(page, plan, { stepId: flags.stepId });
    const dom = await observeDomForPlan(page, plan);
    return { snapshot, plan, obs, dom, ctx };
  });
  art.writeJson('snapshot.json', result.snapshot);
  art.writeJson('plan.json', result.plan);
  art.writeJson('execution.json', result.obs);
  art.writeJson('dom-after.json', result.dom);
  art.writeText(
    'summary.txt',
    `execute done\noutcome=${result.obs?.outcome}\nsteps=${result.obs?.steps?.length}\nout=${outDir}`
  );
  console.log(readFileSync(resolve(outDir, 'summary.txt'), 'utf8'));
}

async function cmdObserveDom() {
  if (!flags.plan) {
    console.error('observe-dom requires --plan <file> (or use fill-e2e)');
    process.exit(1);
  }
  const plan = loadPlanFile(resolve(flags.plan), readFileSync);
  const result = await withBrowserPage(async (page, ctx) => {
    await perceivePage(page);
    const dom = await observeDomForPlan(page, plan);
    return { dom, ctx };
  });
  art.writeJson('dom-after.json', result.dom);
  art.writeText('summary.txt', `observe-dom rows=${result.dom.length}\nout=${outDir}`);
  console.log(JSON.stringify(result.dom, null, 2));
  console.log(`\nArtifacts: ${outDir}`);
}

async function cmdFillE2E() {
  const result = await withBrowserPage(async (page, ctx) => {
    const { snapshot, stats } = await perceivePage(page);
    const plan = await buildPlanFromPage(page, snapshot);
    const domBefore = await observeDomForPlan(page, plan);

    let obs;
    if (flags.forceLie) {
      // Simulate UI lie: claim filled without executing
      obs = {
        kind: 'execution_observation',
        outcome: 'completed',
        steps: (plan.steps || []).map((s) => ({
          step_id: s.step_id,
          result: 'filled',
          outcome: 'filled',
        })),
        _debug_force_lie: true,
      };
    } else {
      obs = await executePlan(page, plan, { stepId: flags.stepId });
    }

    // brief settle for sticky value
    await page.waitForTimeout(150);
    const domAfter = await observeDomForPlan(page, plan);
    const truth = buildTruthReport(plan, obs, domAfter, plan._debug_expectations || {});
    // Independent main-world scan (page document, not binding registry)
    const mainBefore = await scanMainWorldControls(page).catch(() => null);
    // re-scan after (same timing as domAfter)
    const mainAfter = await scanMainWorldControls(page);
    const mainSummary = summarizeMainWorld(mainAfter);
    const eoSucceeded = (obs?.steps || []).filter((s) => s.status === 'succeeded').length;

    // Cross-check: if EO claims successes but main world has zero nonempty fields → page_empty_lie
    let pageEmptyLie = false;
    if (!flags.forceLie && eoSucceeded > 0 && mainSummary.nonempty === 0) {
      pageEmptyLie = true;
      truth.ok = false;
      truth.violations = (truth.violations || 0) + 1;
      truth.page_empty_lie = true;
      truth.checks = truth.checks || [];
      truth.checks.push({
        step_id: '*',
        op: 'main_world_scan',
        claim: `eo_succeeded=${eoSucceeded}`,
        truth: 'violation',
        detail: 'EO claims successes but main-world inputs/selects all empty (P0 class)',
        dom: mainSummary,
      });
    }

    return {
      snapshot, stats, plan, obs, domBefore, domAfter, truth, ctx,
      mainBefore, mainAfter, mainSummary, eoSucceeded, pageEmptyLie,
    };
  });

  art.writeJson('snapshot.json', result.snapshot);
  art.writeJson('plan.json', result.plan);
  art.writeJson('execution.json', result.obs);
  art.writeJson('dom-before.json', result.domBefore);
  art.writeJson('dom-after.json', result.domAfter);
  art.writeJson('main-world-after.json', result.mainAfter);
  art.writeJson('truth.json', result.truth);
  art.writeJson('meta.json', {
    command: 'fill-e2e',
    mode: flags.mode,
    forceLie: !!flags.forceLie,
    url: result.ctx.url,
    gitSha: gitSha(),
    branch: gitBranch(),
    chrome: result.ctx.executablePath,
    stats: result.stats,
    truth_ok: result.truth.ok,
    violations: result.truth.violations,
    eoSucceeded: result.eoSucceeded,
    mainWorldNonempty: result.mainSummary.nonempty,
    pageEmptyLie: result.pageEmptyLie,
  });

  const lines = [
    'fill-e2e',
    `mode=${flags.mode}${flags.forceLie ? ' FORCE_LIE' : ''}`,
    `url=${result.ctx.url}`,
    `nodes=${result.stats.nodeCount} plan_steps=${result.plan.steps?.length}`,
    `eo_outcome=${result.obs?.outcome} eo_succeeded=${result.eoSucceeded}`,
    `main_world nonempty_controls=${result.mainSummary.nonempty}/${result.mainSummary.total}`,
    `page_empty_lie=${result.pageEmptyLie}`,
    `truth_ok=${result.truth.ok} violations=${result.truth.violations}`,
    ...result.truth.checks.map(
      (c) => `  [${c.truth}] ${c.step_id} ${c.op} claim=${c.claim} — ${c.detail}`
    ),
    `out=${outDir}`,
  ];
  art.writeText('summary.txt', lines.join('\n'));
  console.log(lines.join('\n'));

  if (!result.truth.ok) process.exitCode = 1;
}

try {
  console.log(`\ncc-debug [${flags.command}]  branch=${gitBranch()}  out=${outDir}\n`);
  switch (flags.command) {
    case 'status':
      await cmdStatus();
      break;
    case 'perceive':
      await cmdPerceive();
      break;
    case 'plan':
      await cmdPlan();
      break;
    case 'execute':
      await cmdExecute();
      break;
    case 'observe-dom':
      await cmdObserveDom();
      break;
    case 'fill-e2e':
      await cmdFillE2E();
      break;
    default:
      console.error(`Unknown command: ${flags.command}`);
      printHelp();
      process.exit(1);
  }
} catch (e) {
  console.error('\nFATAL:', e.message || e);
  try {
    art.writeText('error.txt', String(e.stack || e));
    art.writeJson('meta.json', {
      command: flags.command,
      error: String(e.message || e),
      gitSha: gitSha(),
      branch: gitBranch(),
    });
  } catch {
    /* ignore */
  }
  console.error(`Artifacts (if any): ${outDir}`);
  process.exit(1);
}
