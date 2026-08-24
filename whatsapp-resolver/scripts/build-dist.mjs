/**
 * Build a runnable dist/ for whatsapp-resolver.
 * Vendors @cybercontrol/wa-resolver into dist/node_modules for Docker app-context builds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(serviceRoot, '..');
const distRoot = path.join(serviceRoot, 'dist');

const serviceFiles = ['index.js', 'package.json'];
const packageNames = ['wa-resolver'];

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
}

const distPkgPath = path.join(distRoot, 'package.json');
const distPkg = JSON.parse(fs.readFileSync(distPkgPath, 'utf8'));
distPkg.dependencies = {
  ...distPkg.dependencies,
  '@cybercontrol/wa-resolver': 'file:./node_modules/@cybercontrol/wa-resolver',
};
for (const [name, version] of Object.entries(distPkg.dependencies)) {
  if (typeof version === 'string' && version.startsWith('workspace:')) {
    if (!name.startsWith('@cybercontrol/wa-')) {
      delete distPkg.dependencies[name];
    }
  }
}
fs.writeFileSync(distPkgPath, JSON.stringify(distPkg, null, 2) + '\n');

console.log(`Built whatsapp-resolver dist: ${distRoot}`);
console.log(`Vendored ${packageNames.length} @cybercontrol/wa-* packages into dist/node_modules`);
