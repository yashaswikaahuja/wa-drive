#!/usr/bin/env node
/**
 * CHECK-009: reject structural DOM APIs added outside the Phase 3 gateway.
 * Existing code is intentionally grandfathered; this examines added lines only.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const workingTree = args.includes('--working-tree');

let gitArgs;
const diffArgs = ['diff', '--ignore-space-at-eol', '--unified=0', '--no-ext-diff'];
if (workingTree) {
  gitArgs = [...diffArgs, 'HEAD', '--', 'extension'];
} else if (baseIndex >= 0 && args[baseIndex + 1]) {
  gitArgs = [...diffArgs, `${args[baseIndex + 1]}...HEAD`, '--', 'extension'];
} else {
  gitArgs = [...diffArgs, 'HEAD~1...HEAD', '--', 'extension'];
}

let diff = '';
try {
  diff = execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  console.error(`[dom-boundary] unable to read git diff: ${error.message}`);
  process.exit(1);
}

const allowed = [
  'extension/runtime/dom-gateway.js',
  'extension/runtime/teach-client.js',
  'extension/perception/',
];
const patterns = [
  /\bdocument\.querySelector(?:All)?\s*\(/,
  /\.closest\s*\(/,
  /\.matches\s*\(/,
  /\.getBoundingClientRect\s*\(/,
  /\bgetComputedStyle\s*\(/,
  /\bnew\s+MutationObserver\s*\(/,
];

let file = null;
const violations = [];
for (const line of diff.split(/\r?\n/)) {
  if (line.startsWith('+++ b/')) {
    file = line.slice(6);
    continue;
  }
  if (!file || !file.endsWith('.js') || !line.startsWith('+') || line.startsWith('+++')) continue;
  if (allowed.some((entry) => entry.endsWith('/') ? file.startsWith(entry) : file === entry)) continue;
  const code = line.slice(1);
  if (patterns.some((pattern) => pattern.test(code))) violations.push({ file, code: code.trim() });
}

if (violations.length) {
  console.error('[dom-boundary] New structural DOM access must use extension/runtime/dom-gateway.js:');
  for (const violation of violations) console.error(`  ${violation.file}: ${violation.code}`);
  console.error('\nSee architecture/dom-access-policy.yml (CHECK-009).');
  process.exit(1);
}

console.log('[dom-boundary] PASS — no new structural DOM access outside the Phase 3 gateway/perception boundary');
