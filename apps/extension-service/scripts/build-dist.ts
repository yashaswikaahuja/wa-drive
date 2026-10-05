// @ts-nocheck
/**
 * Build a runnable dist/ for extension-service.
 *
 * 1. Compiles TypeScript sources (tsc → .tsbuild/)
 * 2. Vendors @cybercontrol/svc-* under dist/vendor/ (NOT dist/node_modules) so
 *    Docker COPY is not stripped by .dockerignore node_modules rules.
 * package.json uses file:./vendor/<pkg> so `npm install` in the image resolves.
 *
 * TS packages must ship compiled dist/ — Docker runs plain Node 20.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findRepoRoot } from '../../../tooling/find-repo-root.ts';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = findRepoRoot(serviceRoot);
const distRoot = path.join(serviceRoot, 'dist');
const vendorRoot = path.join(distRoot, 'vendor');
const tsbuildRoot = path.join(serviceRoot, '.tsbuild');

// Dependency order so sibling imports resolve during tsc emit.
const packageNames = [
  'svc-shared',
  'svc-knowledge',
  'svc-learning',
  'svc-session',
  'svc-fill-planner',
  'svc-ai-mapper',
  'svc-teach',
  'svc-runtime',
];

// Plain-JS @cc packages needed at runtime (date splitter for WSS fill).
const ccPackageNames = ['cc-mapper'];

// Include package dist/ (compiled TS). Only skip nested node_modules.
const copyFilter = (source) => path.basename(source) !== 'node_modules';

function buildPackage(packageName) {
  const source = path.join(repositoryRoot, 'packages', packageName);
  const pkgJson = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  const main = String(pkgJson.main || '');
  if (!main.startsWith('dist/')) return;
  if (fs.existsSync(path.join(source, 'dist', 'index.js'))) return;
  console.log(`Building @cybercontrol/${packageName}…`);
  const result = spawnSync('pnpm', ['--filter', `@cybercontrol/${packageName}`, 'build'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`failed to build @cybercontrol/${packageName}`);
  }
  if (!fs.existsSync(path.join(source, 'dist'))) {
    throw new Error(`package ${packageName} main=${main} but dist/ is missing after build`);
  }
}

for (const packageName of packageNames) {
  buildPackage(packageName);
}

// Compile this service's TypeScript → .tsbuild/
console.log('Compiling extension-service TypeScript…');
const tscResult = spawnSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], {
  cwd: serviceRoot,
  stdio: 'inherit',
  shell: true,
});
if (tscResult.status !== 0) {
  throw new Error('extension-service tsc failed');
}
if (!fs.existsSync(path.join(tsbuildRoot, 'index.js'))) {
  throw new Error('tsc did not emit .tsbuild/index.js');
}

fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(vendorRoot, { recursive: true });

// Emitted JS: index.js + src/** + scripts/**
fs.copyFileSync(path.join(tsbuildRoot, 'index.js'), path.join(distRoot, 'index.js'));
const indexMap = path.join(tsbuildRoot, 'index.js.map');
if (fs.existsSync(indexMap)) {
  fs.copyFileSync(indexMap, path.join(distRoot, 'index.js.map'));
}
fs.cpSync(path.join(tsbuildRoot, 'src'), path.join(distRoot, 'src'), {
  recursive: true,
  filter: copyFilter,
});
const scriptsBuild = path.join(tsbuildRoot, 'scripts');
if (fs.existsSync(scriptsBuild)) {
  fs.cpSync(scriptsBuild, path.join(distRoot, 'scripts'), {
    recursive: true,
    filter: copyFilter,
  });
}

// Non-TS assets
fs.copyFileSync(path.join(serviceRoot, 'package.json'), path.join(distRoot, 'package.json'));
fs.cpSync(path.join(serviceRoot, 'migrations'), path.join(distRoot, 'migrations'), {
  recursive: true,
  filter: copyFilter,
});

for (const packageName of packageNames) {
  const source = path.join(repositoryRoot, 'packages', packageName);
  const destination = path.join(vendorRoot, packageName);
  if (!fs.existsSync(source)) {
    throw new Error(`missing workspace package: ${source}`);
  }
  const pkgJson = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  const main = String(pkgJson.main || '');
  if (main.startsWith('dist/') && !fs.existsSync(path.join(source, 'dist'))) {
    throw new Error(`package ${packageName} main=${main} but dist/ is missing — run its build first`);
  }
  fs.cpSync(source, destination, { recursive: true, filter: copyFilter });

  // Sibling file: links inside vendor/
  const nestedPkgPath = path.join(destination, 'package.json');
  const nestedPkg = JSON.parse(fs.readFileSync(nestedPkgPath, 'utf8'));
  for (const [name, version] of Object.entries(nestedPkg.dependencies || {})) {
    if (
      typeof version === 'string' &&
      version.startsWith('workspace:') &&
      name.startsWith('@cybercontrol/svc-')
    ) {
      const short = name.slice('@cybercontrol/'.length);
      nestedPkg.dependencies[name] = `file:../${short}`;
    }
  }
  fs.writeFileSync(nestedPkgPath, JSON.stringify(nestedPkg, null, 2) + '\n');
}

for (const packageName of ccPackageNames) {
  const source = path.join(repositoryRoot, 'packages', packageName);
  const destination = path.join(vendorRoot, packageName);
  if (!fs.existsSync(source)) {
    throw new Error(`missing workspace package: ${source}`);
  }
  // @cc/mapper split-dob / mapping-relation ship Node ESM under dist/ for Docker Node 20.
  if (packageName === 'cc-mapper') {
    const nodeEntry = path.join(source, 'dist', 'split-dob.js');
    if (!fs.existsSync(nodeEntry)) {
      console.log('Building @cc/mapper Node ESM (split-dob / mapping-relation)…');
      const result = spawnSync('pnpm', ['--filter', '@cc/mapper', 'build:node'], {
        cwd: repositoryRoot,
        stdio: 'inherit',
        shell: true,
      });
      if (result.status !== 0) {
        throw new Error('failed to build @cc/mapper Node ESM');
      }
    }
    if (!fs.existsSync(nodeEntry)) {
      throw new Error('package cc-mapper is missing dist/split-dob.js after build:node');
    }
  }
  fs.cpSync(source, destination, { recursive: true, filter: copyFilter });
}

const distPkgPath = path.join(distRoot, 'package.json');
const distPkg = JSON.parse(fs.readFileSync(distPkgPath, 'utf8'));
const nextDeps = { ...(distPkg.dependencies || {}) };
for (const packageName of packageNames) {
  nextDeps[`@cybercontrol/${packageName}`] = `file:./vendor/${packageName}`;
}
for (const packageName of ccPackageNames) {
  // @cc/mapper lives at packages/cc-mapper
  const scopeName = packageName === 'cc-mapper' ? '@cc/mapper' : `@cc/${packageName.replace(/^cc-/, '')}`;
  nextDeps[scopeName] = `file:./vendor/${packageName}`;
}
for (const [name, version] of Object.entries(nextDeps)) {
  if (typeof version === 'string' && version.startsWith('workspace:')) {
    delete nextDeps[name];
  }
}
// Drop typescript-only tooling from the Docker image package.json.
delete distPkg.devDependencies;
distPkg.main = 'index.js';
distPkg.scripts = {
  start: 'node index.js',
};
distPkg.dependencies = nextDeps;
fs.writeFileSync(distPkgPath, JSON.stringify(distPkg, null, 2) + '\n');

console.log(`Built extension-service dist: ${distRoot}`);
console.log(`Vendored ${packageNames.length + ccPackageNames.length} packages into dist/vendor`);
