/**
 * Phase 4.1 CI guard — forbidden legacy brain modules must not exist as
 * discrete files under the turborepo apps/extension product surface.
 * Source of truth for shared utils is packages/cc-*; apps/extension ships bundles.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const EXT = resolve(ROOT, 'apps/extension');

let passed = 0;
let failed = 0;
function ok(c, m) {
  if (c) { passed++; console.log('  ✓', m); }
  else { failed++; console.error('  ✗ FAIL:', m); }
}

console.log('\n=== Phase 4.1: No Legacy Brain Modules in Extension (turborepo) ===\n');

// Forbidden discrete modules under apps/extension (must stay in packages or gone)
const FORBIDDEN = [
  'autofill/ai-resolve.js',
  'autofill/derive.js',
  'autofill/mapper.js',
  'autofill/rule-engine.js',
  'shared/llm-client.js',
  'autofill/executor.js',
  'autofill/extractor.js',
];

for (const rel of FORBIDDEN) {
  ok(!existsSync(resolve(EXT, rel)), `${rel} is not a discrete apps/extension file`);
}

// Product path must not reference legacy brain
const fillOrch = resolve(EXT, 'application/fill-orchestrator.js');
if (existsSync(fillOrch)) {
  const content = readFileSync(fillOrch, 'utf8');
  ok(!content.includes('autofill/mapper'), 'fill-orchestrator does not reference mapper');
  ok(!content.includes('autofill/ai-resolve'), 'fill-orchestrator does not reference ai-resolve');
  ok(!content.includes('llm-client'), 'fill-orchestrator does not reference llm-client');
  ok(!content.includes('rule-engine'), 'fill-orchestrator does not reference rule-engine');
} else {
  ok(false, 'application/fill-orchestrator.js exists');
}

// Legacy gate lives in packages/cc-shared (turborepo), always closed
const gatePath = resolve(ROOT, 'packages/cc-shared/src/legacy-fill-gate.js');
ok(existsSync(gatePath), 'packages/cc-shared/src/legacy-fill-gate.js exists');
if (existsSync(gatePath)) {
  const gate = readFileSync(gatePath, 'utf8');
  ok(gate.includes('return false'), 'legacy-fill-gate always returns false');
  ok(!gate.includes('allowLegacyClientFill: true'), 'gate docs do not mention enabling via storage');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
