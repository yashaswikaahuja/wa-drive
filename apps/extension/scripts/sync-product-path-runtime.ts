/**
 * Copy ActionPlan / perception product-path scripts from extension-legacy-best
 * into apps/extension so chrome.scripting.executeScript({ files }) can load them.
 *
 * Run as part of: pnpm --filter cybercontrol-extension build
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(scriptsDir, '..');
const repoRoot = path.resolve(extRoot, '../..');
const legacyRoot = path.join(repoRoot, 'extension-legacy-best');

const COPIES: Array<{ from: string; to: string }> = [
  { from: 'runtime/gateway/interaction.js', to: 'runtime/gateway/interaction.js' },
  { from: 'runtime/dom-gateway.js', to: 'runtime/dom-gateway.js' },
  { from: 'runtime/dom-settle.js', to: 'runtime/dom-settle.js' },
  { from: 'runtime/dom-evidence.js', to: 'runtime/dom-evidence.js' },
  { from: 'runtime/errors.js', to: 'runtime/errors.js' },
  { from: 'runtime/navigation-contract.js', to: 'runtime/navigation-contract.js' },
  { from: 'runtime/action-plan-executor.js', to: 'runtime/action-plan-executor.js' },
  { from: 'perception', to: 'perception' },
];

function copyPath(fromRel: string, toRel: string) {
  const src = path.join(legacyRoot, fromRel);
  const dest = path.join(extRoot, toRel);
  if (!fs.existsSync(src)) {
    throw new Error(`[sync-product-path] missing source: ${src}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`  synced ${toRel}`);
}

console.log('Syncing product-path runtime/perception from extension-legacy-best...');
for (const { from, to } of COPIES) copyPath(from, to);
console.log('Product-path sync done.');
