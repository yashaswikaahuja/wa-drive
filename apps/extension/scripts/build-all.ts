// @ts-nocheck
/**
 * Rebuild all extension inject/SW bundles from @cc/* workspace packages,
 * then emit entry .js files from .ts (background, content, popup, SW helpers, …).
 * Run: pnpm --filter cybercontrol-extension build
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

const scripts = fs
  .readdirSync(scriptsDir)
  .filter((name) => name.startsWith('build-') && name.endsWith('-bundle.mjs'))
  .sort()
  .map((name) => path.join(scriptsDir, name));

console.log(`Building ${scripts.length} extension bundles from @cc/* packages...\n`);
for (const s of scripts) {
  execSync(`node "${s}"`, { stdio: 'inherit' });
}

execSync(`node "${path.join(scriptsDir, 'build-extension-entries.ts')}"`, { stdio: 'inherit' });
console.log('\nAll extension bundles + entry .js files rebuilt.');
