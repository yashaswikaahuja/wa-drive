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

// ── 3b. No new applications / packages outside apps/ + packages/ ───────────
// If someone scaffolds a new app at the repo root (or anywhere except apps/),
// this gate must fail. Libraries belong in packages/.
console.log('\nApplications must live under apps/ (libraries under packages/)');

/** Root dirs allowed to contain their own package.json (non-product). */
const ALLOWED_ROOT_PACKAGE_DIRS = new Set([
  'corpus', // fixture snapshots only — not a product app
]);

/** Nested tooling trees that may contain package.json (test harnesses, etc.). */
const ALLOWED_NESTED_PKG_PREFIXES = [
  'extension-dev/tests/',
  'tools/',
  'tooling/',
  'scripts/',
  'deploy/',
];

function readPkg(pkgPath) {
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

function looksLikeApplication(pkg, dirPath) {
  if (!pkg || typeof pkg !== 'object') return false;
  const scripts = pkg.scripts || {};
  if (scripts.dev || scripts.start || scripts.serve || scripts.preview) return true;
  if (existsSync(join(dirPath, 'Dockerfile')) || existsSync(join(dirPath, 'Dockerfile.monorepo'))) return true;
  if (existsSync(join(dirPath, 'index.html')) || existsSync(join(dirPath, 'public'))) return true;
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps.vite || deps.next || deps['react-scripts'] || deps['@angular/core'] || deps.express) {
    // express alone is weak; require app scripts or Dockerfile already covered.
    // Treat vite/next/CRA/angular as app frameworks.
    if (deps.vite || deps.next || deps['react-scripts'] || deps['@angular/core']) return true;
  }
  return false;
}

function looksLikeLibrary(pkg) {
  if (!pkg || typeof pkg !== 'object') return false;
  const name = String(pkg.name || '');
  // Scoped workspace libs
  if (name.startsWith('@cc/') || name.startsWith('@cybercontrol/')) return true;
  const scripts = pkg.scripts || {};
  // Lib-only packages typically lack app runners
  if (!scripts.dev && !scripts.start && !scripts.serve && !scripts.preview) return true;
  return false;
}

// (a) Any depth-1 directory with package.json must be allowlisted or moved
const rootDirs = readdirSync(ROOT).filter((name) => {
  if (name.startsWith('.')) return false;
  try {
    return statSync(join(ROOT, name)).isDirectory();
  } catch {
    return false;
  }
});

for (const name of rootDirs) {
  if (name === 'apps' || name === 'packages' || name === 'node_modules') continue;
  const dirPath = join(ROOT, name);
  const pkgPath = join(dirPath, 'package.json');
  if (!existsSync(pkgPath)) continue;

  if (ALLOWED_ROOT_PACKAGE_DIRS.has(name)) {
    ok(true, `root ${name}/package.json allowlisted (non-product)`);
    continue;
  }

  const pkg = readPkg(pkgPath);
  if (looksLikeApplication(pkg, dirPath)) {
    ok(false, `root ${name}/ looks like an APPLICATION — move it to apps/${name}/`);
  } else if (looksLikeLibrary(pkg)) {
    ok(false, `root ${name}/ looks like a LIBRARY — move it to packages/${name}/`);
  } else {
    ok(false, `root ${name}/ has package.json outside apps/|packages/ — move it under apps/ or packages/`);
  }
}

// (b) Any package.json anywhere outside apps/, packages/, and allowlisted tooling
const strayPkgs = walkFiles(ROOT, (p) => /[\\/]package\.json$/.test(p) || /(^|[\\/])package\.json$/.test(p)).filter((abs) => {
  const rel = relative(ROOT, abs).replace(/\\/g, '/');
  if (rel === 'package.json') return false; // workspace root
  if (rel.startsWith('apps/')) return false;
  if (rel.startsWith('packages/')) return false;
  if (rel.includes('/node_modules/')) return false;
  if (ALLOWED_NESTED_PKG_PREFIXES.some((prefix) => rel.startsWith(prefix))) return false;
  // allowlisted root package dirs (e.g. corpus/package.json)
  const top = rel.split('/')[0];
  if (ALLOWED_ROOT_PACKAGE_DIRS.has(top) && rel === `${top}/package.json`) return false;
  return true;
});

if (strayPkgs.length === 0) {
  ok(true, 'no stray package.json outside apps/|packages/|allowlisted tooling');
} else {
  for (const abs of strayPkgs) {
    const rel = relative(ROOT, abs).replace(/\\/g, '/');
    const dirPath = join(abs, '..');
    const pkg = readPkg(abs);
    if (looksLikeApplication(pkg, dirPath)) {
      ok(false, `stray APPLICATION package at ${rel} — move under apps/`);
    } else {
      ok(false, `stray package.json at ${rel} — move under apps/ or packages/ (or allowlist if tooling)`);
    }
  }
}

// (c) pnpm-workspace must not silently add non-apps/packages globs for product code
const wsLines = ws
  .split(/\r?\n/)
  .map((l) => l.replace(/#.*/, '').trim())
  .filter(Boolean);
const packageGlobs = [];
let inPackages = false;
for (const line of wsLines) {
  if (line.startsWith('packages:')) {
    inPackages = true;
    continue;
  }
  if (inPackages && /^[a-zA-Z]/.test(line) && !line.startsWith('-')) {
    inPackages = false;
  }
  if (inPackages && line.startsWith('-')) {
    packageGlobs.push(line.replace(/^-+\s*/, '').replace(/['"]/g, ''));
  }
}
const allowedGlobs = new Set(['apps/*', 'packages/*', 'packages/*/*']);
for (const g of packageGlobs) {
  if (allowedGlobs.has(g) || g === 'apps/*' || g === 'packages/*') {
    ok(true, `workspace glob ok: ${g}`);
  } else if (g.startsWith('apps/') || g.startsWith('packages/')) {
    ok(true, `workspace glob ok (scoped): ${g}`);
  } else {
    ok(false, `workspace glob "${g}" is outside apps/*|packages/* — product code must not register here`);
  }
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
