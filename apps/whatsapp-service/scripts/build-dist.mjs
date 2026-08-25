/**
 * Build a runnable dist/ for whatsapp-service.
 * Vendors @cybercontrol/wa-* under dist/vendor/ (not node_modules) for Docker.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRepoRoot } from '../../../tooling/find-repo-root.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = findRepoRoot(serviceRoot);
const distRoot = path.join(serviceRoot, 'dist');
const vendorRoot = path.join(distRoot, 'vendor');

const serviceFiles = ['index.js', 'migrate-sessions-to-db.js', 'package.json'];
const packageNames = ['wa-auth', 'wa-service'];

const copyFilter = (source) => {
  const name = path.basename(source);
  return name !== 'node_modules' && name !== 'dist';
};

fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(vendorRoot, { recursive: true });

for (const file of serviceFiles) {
  const src = path.join(serviceRoot, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distRoot, file));
  }
}

for (const packageName of packageNames) {
  const source = path.join(repositoryRoot, 'packages', packageName);
  const destination = path.join(vendorRoot, packageName);
  if (!fs.existsSync(source)) {
    throw new Error(`missing workspace package: ${source}`);
  }
  fs.cpSync(source, destination, { recursive: true, filter: copyFilter });

  const nestedPkgPath = path.join(destination, 'package.json');
  const nestedPkg = JSON.parse(fs.readFileSync(nestedPkgPath, 'utf8'));
  for (const [name, version] of Object.entries(nestedPkg.dependencies || {})) {
    if (typeof version === 'string' && version.startsWith('workspace:') && name.startsWith('@cybercontrol/wa-')) {
      const short = name.slice('@cybercontrol/'.length);
      nestedPkg.dependencies[name] = `file:../${short}`;
    }
  }
  fs.writeFileSync(nestedPkgPath, JSON.stringify(nestedPkg, null, 2) + '\n');
}

const distPkgPath = path.join(distRoot, 'package.json');
const distPkg = JSON.parse(fs.readFileSync(distPkgPath, 'utf8'));
const nextDeps = { ...(distPkg.dependencies || {}) };
for (const packageName of packageNames) {
  nextDeps[`@cybercontrol/${packageName}`] = `file:./vendor/${packageName}`;
}
for (const [name, version] of Object.entries(nextDeps)) {
  if (typeof version === 'string' && version.startsWith('workspace:')) {
    delete nextDeps[name];
  }
}
distPkg.dependencies = nextDeps;
fs.writeFileSync(distPkgPath, JSON.stringify(distPkg, null, 2) + '\n');

console.log(`Built whatsapp-service dist: ${distRoot}`);
console.log(`Vendored ${packageNames.length} packages into dist/vendor`);
