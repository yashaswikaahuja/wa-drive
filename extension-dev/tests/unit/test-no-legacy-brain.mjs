/**
 * Phase 4.1 CI guard — forbidden legacy brain modules must not exist in production.
 * Fails if any client-side planning/mapping/AI module remains in the extension tree.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const EXT = resolve(ROOT, 'extension');

let passed = 0;
let failed = 0;
function ok(c, m) {
  if (c) { passed++; console.log('  ✓', m); }
  else { failed++; console.error('  ✗ FAIL:', m); }
}

console.log('\n=== Phase 4.1: No Legacy Brain Modules in Extension ===\n');

// Forbidden modules — client-side planning/mapping/AI that violate "Extension = Eyes + Hands"
const FORBIDDEN = [
  'autofill/ai-resolve.js',
  'autofill/derive.js',
  'autofill/mapper.js',
  'autofill/rule-engine.js',
  'shared/llm-client.js',
];

for (const rel of FORBIDDEN) {
  ok(!existsSync(resolve(EXT, rel)), `${rel} is removed from extension tree`);
}

// Allowed legacy files (still needed for executor/extractor backward compat until Phase 6)
const ALLOWED_LEGACY = [
  'autofill/executor.js',   // legacy executor — gated, retained for DISPATCH_JOB compat
  'autofill/extractor.js',  // legacy extractor — observational reference only
];

for (const rel of ALLOWED_LEGACY) {
  // These are allowed to exist but must not be in product inject list
  const orchestrator = resolve(EXT, 'application/fill-orchestrator.js');
  if (existsSync(orchestrator)) {
    const content = (await import('node:fs')).readFileSync(orchestrator, 'utf8');
    ok(!content.includes(rel), `${rel} is NOT in product PRODUCT_PATH_SCRIPTS`);
  }
}

// Product path must not reference legacy brain
const fillOrch = resolve(EXT, 'application/fill-orchestrator.js');
if (existsSync(fillOrch)) {
  const content = (await import('node:fs')).readFileSync(fillOrch, 'utf8');
  ok(!content.includes('autofill/mapper'), 'fill-orchestrator does not reference mapper');
  ok(!content.includes('autofill/ai-resolve'), 'fill-orchestrator does not reference ai-resolve');
  ok(!content.includes('llm-client'), 'fill-orchestrator does not reference llm-client');
  ok(!content.includes('rule-engine'), 'fill-orchestrator does not reference rule-engine');
}

// Legacy gate must be permanently closed
const gate = (await import('node:fs')).readFileSync(resolve(EXT, 'shared/legacy-fill-gate.js'), 'utf8');
ok(gate.includes('return false'), 'legacy-fill-gate always returns false');
ok(!gate.includes('allowLegacyClientFill: true'), 'gate docs do not mention enabling via storage');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
