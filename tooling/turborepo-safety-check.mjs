#!/usr/bin/env node
/**
 * Turborepo safety guards — fail CI (and local preflight) when the monorepo
 * drifts back toward the pre-apps/ layout or CI-only discrete file restores.
 *
 * Run: node tooling/turborepo-safety-check.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

let failed = 0;
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function walkFiles(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === '.turbo') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, pred, acc);
    else if (pred(p)) acc.push(p);
  }
  return acc;
}

console.log('\n=== Turborepo safety ===\n');

// ── 1. Required workspace files ────────────────────────────────────────────
console.log('Workspace manifest');
ok(existsSync(join(ROOT, 'pnpm-workspace.yaml')), 'pnpm-workspace.yaml exists');
ok(existsSync(join(ROOT, 'turbo.json')), 'turbo.json exists');
ok(existsSync(join(ROOT, 'package.json')), 'root package.json exists');

const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
ok(typeof rootPkg.packageManager === 'string' && rootPkg.packageManager.startsWith('pnpm@'), 'packageManager is pnpm@…');
ok(rootPkg.scripts?.build?.includes('turbo'), 'root build script uses turbo');

const ws = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
ok(ws.includes("apps/*") || ws.includes("'apps/*'") || ws.includes('"apps/*"'), 'workspace includes apps/*');
ok(ws.includes("packages/*") || ws.includes("'packages/*'") || ws.includes('"packages/*"'), 'workspace includes packages/*');

// ── 2. Required apps / packages ────────────────────────────────────────────
console.log('\nProduct surfaces');
const requiredApps = [
  'backend',
  'extension',
  'extension-service',
  'frontend',
  'whatsapp-service',
  'whatsapp-resolver',
];
for (const app of requiredApps) {
  ok(existsSync(join(ROOT, 'apps', app, 'package.json')), `apps/${app}/package.json exists`);
}

const requiredPackages = [
  'cc-shared',
  'cc-background',
  'backend-core',
  'svc-fill-planner',
  'wa-service',
];
for (const pkg of requiredPackages) {
  ok(existsSync(join(ROOT, 'packages', pkg, 'package.json')), `packages/${pkg}/package.json exists`);
}

// ── 3. Forbidden legacy root layout ────────────────────────────────────────
console.log('\nForbidden legacy root dirs (moved into apps/)');
const forbiddenRootDirs = [
  'backend',
  'frontend',
  'extension',
  'extension-service',
  'whatsapp-service',
  'whatsapp-resolver',
  'owner-panel',
  'landing',
];
for (const dir of forbiddenRootDirs) {
  ok(!existsSync(join(ROOT, dir)), `root ${dir}/ must not exist (use apps/${dir}/)`);
}

// ── 4. Forbidden discrete restores under apps/extension ────────────────────
console.log('\nForbidden discrete trees under apps/extension (packages/cc-* is source of truth)');
const forbiddenExtTrees = [
  'perception',
  'runtime',
  'shared',
  'drivers',
  'capabilities',
  'models',
];
for (const dir of forbiddenExtTrees) {
  ok(!existsSync(join(ROOT, 'apps/extension', dir)), `apps/extension/${dir}/ must not be restored — use packages/cc-* + bundles`);
}

const forbiddenExtFiles = [
  'autofill/executor.js',
  'autofill/extractor.js',
  'autofill/mapper.js',
];
for (const rel of forbiddenExtFiles) {
  ok(!existsSync(join(ROOT, 'apps/extension', rel)), `apps/extension/${rel} must not be a discrete file (bundle/package only)`);
}

// Bundles / thin entrypoints that SHOULD exist
console.log('\nExpected extension product surface');
for (const rel of [
  'package.json',
  'background.js',
  'content.js',
  'popup.js',
  'shared-bundle.js',
  'drivers-bundle.js',
  'sw/bg-bundle.js',
  'application/fill-orchestrator.js',
]) {
  ok(existsSync(join(ROOT, 'apps/extension', rel)), `apps/extension/${rel} exists`);
}

// ── 5. Workflow path guards ────────────────────────────────────────────────
console.log('\nGitHub workflow path guards');
const workflowDir = join(ROOT, '.github/workflows');
const workflowFiles = existsSync(workflowDir)
  ? readdirSync(workflowDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  : [];

ok(workflowFiles.length > 0, '.github/workflows has YAML files');

const stalePatterns = [
  { re: /context:\s*\.\/backend\b/, label: 'docker context ./backend (use apps/backend or monorepo root)' },
  { re: /context:\s*\.\/extension-service\b/, label: 'docker context ./extension-service' },
  { re: /working-directory:\s*frontend\b/, label: 'working-directory: frontend (use apps/frontend)' },
  { re: /working-directory:\s*backend\b/, label: 'working-directory: backend (use apps/backend)' },
  { re: /node extension-dev\/tests\/test-[a-z0-9-]+\.mjs/, label: 'flat extension-dev/tests/test-*.mjs (use unit/)' },
];

for (const file of workflowFiles) {
  const text = readFileSync(join(workflowDir, file), 'utf8');
  for (const { re, label } of stalePatterns) {
    if (re.test(text)) {
      ok(false, `${file}: stale path — ${label}`);
    }
  }
}
ok(true, `scanned ${workflowFiles.length} workflow file(s) for stale pre-apps paths`);

// Publish workflows must mention apps/ for product images
for (const name of [
  'docker-publish.yml',
  'docker-publish-extension.yml',
  'docker-publish-whatsapp.yml',
]) {
  const p = join(workflowDir, name);
  if (!existsSync(p)) {
    ok(false, `${name} missing`);
    continue;
  }
  const text = readFileSync(p, 'utf8');
  ok(/apps\//.test(text), `${name} references apps/`);
}

console.log(`\n${failed === 0 ? '✅ Turborepo safety OK' : `❌ ${failed} turborepo safety violation(s)`}`);
process.exit(failed === 0 ? 0 : 1);
