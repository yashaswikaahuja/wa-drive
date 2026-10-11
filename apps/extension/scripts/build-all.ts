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
const nodeTs = 'node --experimental-strip-types';

// Bundle builders were renamed .mjs → .ts in the JS→TS migration; discover both.
const scripts = fs
  .readdirSync(scriptsDir)
  .filter(
    (name) =>
      name.startsWith('build-') &&
      (name.endsWith('-bundle.ts') || name.endsWith('-bundle.mjs')),
  )
  .sort()
  .map((name) => path.join(scriptsDir, name));

if (scripts.length === 0) {
  throw new Error(
    `No build-*-bundle.{ts,mjs} scripts found in ${scriptsDir} — extension fill/SW bundles would be stale.`,
  );
}

console.log(`Building ${scripts.length} extension bundles from @cc/* packages...\n`);
for (const s of scripts) {
  const cmd = s.endsWith('.ts') ? `${nodeTs} "${s}"` : `node "${s}"`;
  execSync(cmd, { stdio: 'inherit' });
}

execSync(`${nodeTs} "${path.join(scriptsDir, 'sync-product-path-runtime.ts')}"`, {
  stdio: 'inherit',
});

execSync(`${nodeTs} "${path.join(scriptsDir, 'build-extension-entries.ts')}"`, {
  stdio: 'inherit',
});
console.log('\nAll extension bundles + entry .js files rebuilt.');
