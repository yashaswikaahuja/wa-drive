/**
 * build-all.mjs — rebuild all extension bundles from packages/
 * Run: pnpm build  OR  node build-all.mjs
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

// Collect all build-*.mjs scripts recursively under extension-dev/
function findBuildScripts(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findBuildScripts(full));
    else if (entry.name.startsWith('build-') && entry.name.endsWith('.mjs')) results.push(full);
  }
  return results.sort();
}

const scripts = findBuildScripts(path.join(root, 'extension-dev'));
console.log(`Building ${scripts.length} bundles...\n`);
for (const s of scripts) {
  execSync(`node "${s}"`, { stdio: 'inherit' });
}
console.log('\nAll bundles rebuilt.');
