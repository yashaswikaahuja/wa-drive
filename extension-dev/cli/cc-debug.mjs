#!/usr/bin/env node
/**
 * CyberControl debug CLI — fill REAL forms and report results
 *
 * DEBUG BRANCH ONLY (debug/cc-cli). Do NOT merge to master.
 *
 *   node extension-dev/cli/cc-debug.mjs fill --url "https://..." --profile p.json
 */
import { readFileSync } from 'node:fs';
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
import { loadProfile } from './lib/profile.mjs';
import { buildFillReport } from './lib/fill-report.mjs';

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

// ── PRIMARY: fill real form ─────────────────────────────────────────
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

  const pack = await withBrowserPage(
    async (page, ctx) => {
      console.log(`Opening ${ctx.url}`);
      console.log('Perceiving…');
      const { snapshot, stats } = await perceivePage(page);
      console.log(`  nodes=${stats.nodeCount} revision=${stats.revision}`);

      let plan;
      let planMeta = {};
      if (flags.plan) {
        plan = loadPlanFile(resolve(flags.plan), readFileSync);
        console.log(`Plan loaded from file (${plan.steps?.length} steps)`);
      } else if (mode === 'live') {
        console.log('Requesting fill-plan from server…');
        const { plan: p, raw } = await fetchLivePlan({
          backendUrl: resolveBackend(),
          token: resolveToken(),
          snapshot,
          profile: profile.flat,
          profileId: flags.profileId || profile.id,
          executionPreference: flags.executionPreference || 'AUTO',
        });
        plan = p;
        planMeta = {
          classification: raw?.classification || raw?.diagnostics?.system_classification,
          diagnostics: raw?.diagnostics || null,
          rawKeys: Object.keys(raw || {}),
        };
        art.writeJson('fill-plan-response.json', raw);
        console.log(`  plan steps=${plan.steps?.length} plan_id=${plan.plan_id}`);
      } else {
        console.log('Offline lab plan…');
        plan = buildOfflinePlan(snapshot, { maxSteps: flags.maxSteps });
      }

      if (!plan.steps?.length) {
        throw new Error('Plan has zero steps — nothing to fill (mapping empty?)');
      }

      console.log('Executing ActionPlan…');
      const observation = await executePlan(page, plan, { stepId: flags.stepId });
      await page.waitForTimeout(200);
      const domAfter = await observeDomForPlan(page, plan);
      const mainAfter = await scanMainWorldControls(page);
      const mainSummary = summarizeMainWorld(mainAfter);

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
