/**
 * Build a runnable dist/ for whatsapp-service.
 * Vendors @cybercontrol/wa-* into dist/node_modules so Docker can use
 * context ./whatsapp-service without the monorepo tree (same idea as extension-service).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRepoRoot } from '../../../tooling/find-repo-root.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = findRepoRoot(serviceRoot);
const distRoot = path.join(serviceRoot, 'dist');

const serviceFiles = ['index.js', 'migrate-sessions-to-db.js', 'package.json'];
const packageNames = ['wa-auth', 'wa-service'];

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
    if (typeof version === 'string' && version.startsWith('workspace:') && name.startsWith('@cybercontrol/wa-')) {
      const short = name.slice('@cybercontrol/'.length);
      nestedPkg.dependencies[name] = `file:../${short}`;
    }
  }
  fs.writeFileSync(nestedPkgPath, JSON.stringify(nestedPkg, null, 2) + '\n');
}

const distPkgPath = path.join(distRoot, 'package.json');
const distPkg = JSON.parse(fs.readFileSync(distPkgPath, 'utf8'));
distPkg.dependencies = {
  ...distPkg.dependencies,
  '@cybercontrol/wa-auth': 'file:./node_modules/@cybercontrol/wa-auth',
  '@cybercontrol/wa-service': 'file:./node_modules/@cybercontrol/wa-service',
};
for (const [name, version] of Object.entries(distPkg.dependencies)) {
  if (typeof version === 'string' && version.startsWith('workspace:')) {
    if (!name.startsWith('@cybercontrol/wa-')) {
      delete distPkg.dependencies[name];
    }
  }
}
fs.writeFileSync(distPkgPath, JSON.stringify(distPkg, null, 2) + '\n');

console.log(`Built whatsapp-service dist: ${distRoot}`);
console.log(`Vendored ${packageNames.length} @cybercontrol/wa-* packages into dist/node_modules`);
