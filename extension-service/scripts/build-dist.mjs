import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(serviceRoot, '..');
const distRoot = path.join(serviceRoot, 'dist');
const serviceDirectories = ['src', 'migrations'];
const serviceFiles = ['index.js'];
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
  fs.copyFileSync(path.join(serviceRoot, file), path.join(distRoot, file));
}
for (const directory of serviceDirectories) {
  fs.cpSync(path.join(serviceRoot, directory), path.join(distRoot, directory), { recursive: true, filter: copyFilter });
}

const distIndex = path.join(distRoot, 'index.js');
const indexSource = fs.readFileSync(distIndex, 'utf8');
fs.writeFileSync(distIndex, indexSource.replaceAll("../packages/", "./packages/"));

const enginesRoot = path.join(distRoot, 'src', 'engines');
if (fs.existsSync(enginesRoot)) {
  for (const file of fs.readdirSync(enginesRoot)) {
    const engineFile = path.join(enginesRoot, file);
    if (file.endsWith('.js')) {
      const source = fs.readFileSync(engineFile, 'utf8');
      fs.writeFileSync(engineFile, source.replaceAll('../../../packages/', '../../packages/'));
    }
  }
}

function rewritePackageImports(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) rewritePackageImports(file);
    else if (entry.name.endsWith('.js')) {
      const source = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(file, source.replaceAll('../../../../packages/', '../../../packages/'));
    }
  }
}

rewritePackageImports(path.join(distRoot, 'src'));

for (const packageName of packageNames) {
  const source = path.join(repositoryRoot, 'packages', packageName);
  const destination = path.join(distRoot, 'packages', packageName);
  fs.cpSync(source, destination, { recursive: true, filter: copyFilter });
}

console.log(`Built extension-service dist: ${distRoot}`);
