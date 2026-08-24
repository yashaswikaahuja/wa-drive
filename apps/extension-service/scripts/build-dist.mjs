/**
 * Build a runnable dist/ for extension-service.
 *
 * Unlike the old path-rewriting approach (`../packages/svc-*`), the service
 * imports engines via package names (`@cybercontrol/svc-*`). This script:
 *   1. Copies the service entry + src + migrations
 *   2. Vendors workspace svc packages under dist/node_modules/@cybercontrol/
 * so `node dist/index.js` works without depending on monorepo folder layout
 * (same idea as publishing those packages to npm later).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRepoRoot } from '../../../tooling/find-repo-root.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = findRepoRoot(serviceRoot);
const distRoot = path.join(serviceRoot, 'dist');

const serviceDirectories = ['src', 'migrations'];
const serviceFiles = ['index.js', 'package.json'];

const packageNames = [
  'svc-ai-mapper',
  'svc-fill-planner',
  'svc-knowledge',
  'svc-learning',
  'svc-runtime',
  'svc-session',
  'svc-teach',
];

const copyFilter = (source) => {
  const name = path.basename(source);
  return name !== 'node_modules' && name !== 'dist';
};

fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(distRoot, { recursive: true });

for (const file of serviceFiles) {
  const src = path.join(serviceRoot, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distRoot, file));
  }
}
for (const directory of serviceDirectories) {
  fs.cpSync(path.join(serviceRoot, directory), path.join(distRoot, directory), {
    recursive: true,
    filter: copyFilter,
  });
}

const scopedRoot = path.join(distRoot, 'node_modules', '@cybercontrol');
fs.mkdirSync(scopedRoot, { recursive: true });

for (const packageName of packageNames) {
  const source = path.join(repositoryRoot, 'packages', packageName);
  const destination = path.join(scopedRoot, packageName);
  if (!fs.existsSync(source)) {
    throw new Error(`missing workspace package: ${source}`);
  }
  fs.cpSync(source, destination, { recursive: true, filter: copyFilter });

  // Rewrite workspace: deps inside vendored packages to sibling file: links
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

// Ensure package.json in dist declares the same workspace package names
// (resolved from the vendored node_modules above when not using pnpm).
const distPkgPath = path.join(distRoot, 'package.json');
const distPkg = JSON.parse(fs.readFileSync(distPkgPath, 'utf8'));
distPkg.dependencies = {
  ...distPkg.dependencies,
  '@cybercontrol/svc-ai-mapper': 'file:./node_modules/@cybercontrol/svc-ai-mapper',
  '@cybercontrol/svc-fill-planner': 'file:./node_modules/@cybercontrol/svc-fill-planner',
  '@cybercontrol/svc-knowledge': 'file:./node_modules/@cybercontrol/svc-knowledge',
  '@cybercontrol/svc-learning': 'file:./node_modules/@cybercontrol/svc-learning',
  '@cybercontrol/svc-runtime': 'file:./node_modules/@cybercontrol/svc-runtime',
  '@cybercontrol/svc-session': 'file:./node_modules/@cybercontrol/svc-session',
  '@cybercontrol/svc-teach': 'file:./node_modules/@cybercontrol/svc-teach',
};
// Strip workspace: protocol — not valid outside pnpm monorepo
for (const [name, version] of Object.entries(distPkg.dependencies)) {
  if (typeof version === 'string' && version.startsWith('workspace:')) {
    if (!name.startsWith('@cybercontrol/svc-')) {
      delete distPkg.dependencies[name];
    }
  }
}
fs.writeFileSync(distPkgPath, JSON.stringify(distPkg, null, 2) + '\n');

console.log(`Built extension-service dist: ${distRoot}`);
console.log(`Vendored ${packageNames.length} @cybercontrol/svc-* packages into dist/node_modules`);
