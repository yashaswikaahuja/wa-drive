/**
 * CHECK-012: Discussion 11 Architecture Invariants
 *
 * Enforces the finalized Discussion 11 fill architecture:
 * 1. No framework names in knowledge/perception code (D03/D11)
 * 2. AI credentials only in apps/extension-service/ (D11 Phase 4.3)
 * 3. No planning/strategy in extension runtime (D11 Suspended Mode)
 * 4. Server planner must not use browser-private bindings (D11 ADR)
 * 5. Knowledge promotion must be multi-dimensional (D11 ADR 10)
 * 6. Field eligibility must gate AI access (D11 Phase 4.1)
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function readFile(relPath) {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}

function walkJs(dir) {
  const results = [];
  const full = join(ROOT, dir);
  if (!existsSync(full)) return results;

  function recurse(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
        recurse(path);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        results.push(path);
      }
    }
  }
  recurse(full);
  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// INVARIANT 1: No framework names in knowledge/perception code
// ═══════════════════════════════════════════════════════════════════════

console.log('\n  Invariant 1: No framework names in knowledge/perception code');

const FRAMEWORK_PATTERNS = /\b(ReactSelect|AngularMaterial|MatSelect|PrimeNG|NgDropdown|MuiAutocomplete|AntDesign|Vuetify)\b/i;
const FRAMEWORK_PATTERN_LOOSE = /(react.?select|angular.?material|mat.?select|prime.?ng|ng.?dropdown|mui.?autocomplete|ant.?design|vuetify)/i;

// These directories must be framework-free
const FRAMEWORK_FREE_DIRS = [
  // Turborepo: perception discrete tree removed; scan packages + service instead.
  'apps/extension-service',
  'packages/svc-fill-planner',
  'packages/svc-ai-mapper',
  'packages/svc-knowledge',
  'packages/cc-orchestrator',
];

// Grandfathered exceptions (existing production code)
const FRAMEWORK_GRANDFATHERED = [
  'apps/extension-service/src/http/routes/agent.js',    // Legacy selector-bearing AI (EXC-006)
  'apps/extension-service/src/http/routes/mappings.js', // Legacy mapping routes (pre-D11)
  'apps/extension-service/src/http/routes/training.js', // Legacy training routes (pre-D11)
  'apps/extension-service/dist/',                      // Build output mirrors src (skip)
  'packages/cc-orchestrator/src/script-manifests.js',  // fixture portal names, not knowledge identity
];

for (const dir of FRAMEWORK_FREE_DIRS) {
  const files = walkJs(dir);
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (FRAMEWORK_GRANDFATHERED.some(g => rel.includes(g))) continue;

    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let hasViolation = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      if (FRAMEWORK_PATTERN_LOOSE.test(line)) {
        hasViolation = true;
        console.error(`    ${rel}:${i + 1}: "${line.trim().substring(0, 80)}"`);
        break;
      }
    }
    assert(!hasViolation, `${rel} contains framework name as identity`);
  }
}

// Positive: AI mapper package owns cold-start semantics (turborepo)
assert(existsSync(join(ROOT, 'packages/svc-ai-mapper/src/semantic-mapper.js')),
  'semantic-mapper exists in packages/svc-ai-mapper');

// ═══════════════════════════════════════════════════════════════════════
// INVARIANT 2: AI credentials only in apps/extension-service/
// ═══════════════════════════════════════════════════════════════════════

console.log('\n  Invariant 2: AI credentials only in apps/extension-service/');

const AI_KEY_PATTERNS = /(groq_key|groqKey|openai_key|anthropic_key|ai_key|llm_key|GROQ_API_KEY|OPENAI_API_KEY)/i;

// Extension product surface must not reference AI key storage/retrieval
// Scan thin product sources only — generated *-bundle.js / bg-bundle may mention key *names*.
const EXTENSION_DIRS_FOR_AI_CHECK = [
  'apps/extension/application',
];

for (const dir of EXTENSION_DIRS_FOR_AI_CHECK) {
  const files = walkJs(dir);
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const content = readFileSync(file, 'utf8');
    const hasKey = AI_KEY_PATTERNS.test(content);
    assert(!hasKey, `${rel} references AI key credentials (must be server-only)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// INVARIANT 3: No planning/strategy in extension runtime
// ═══════════════════════════════════════════════════════════════════════

console.log('\n  Invariant 3: No planning/strategy in extension runtime');

const PLANNING_PATTERNS = /\b(buildFillPlan|generatePlan|planFill|interpretKnowledge|selectStrategy|chooseRecovery|autonomousFill|mapFieldsToProfile)\b/;

// Extension runtime must not contain these (popup.js/background.js are grandfathered)
const RUNTIME_DIRS = [
  'apps/extension/application',
  'packages/cc-orchestrator/src',
];

for (const dir of RUNTIME_DIRS) {
  const files = walkJs(dir);
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const content = readFileSync(file, 'utf8');
    const hasPlanning = PLANNING_PATTERNS.test(content);
    assert(!hasPlanning, `${rel} contains planning/strategy function (server-only per D11)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// INVARIANT 4: Server planner must not use browser-private bindings
// ═══════════════════════════════════════════════════════════════════════

console.log('\n  Invariant 4: Server planner must not use browser-private bindings');

const PRIVATE_BINDING_PATTERNS = /\b(querySelector|querySelectorAll|css_selector|xpath|innerHTML|outerHTML|document\.|window\.)\b/;

// These server modules must be browser-free
const SERVER_PLANNER_FILES = [
  'packages/svc-fill-planner/src/fill-planner.js',
  'packages/svc-fill-planner/src/mapping-engine.js',
  'packages/svc-fill-planner/src/plan-builder.js',
  'packages/svc-fill-planner/src/dependency-resolver.js',
  'packages/svc-ai-mapper/src/semantic-mapper.js',
  'packages/svc-fill-planner/src/derivation-engine.js',
  'packages/svc-ai-mapper/src/confidence-evaluator.js',
];

for (const file of SERVER_PLANNER_FILES) {
  const content = readFile(file);
  if (content === null) {
    // File doesn't exist yet (planned for future phases) — skip
    continue;
  }
  const rel = file;
  const hasPrivate = PRIVATE_BINDING_PATTERNS.test(content);
  assert(!hasPrivate, `${rel} uses browser-private bindings (must use Page IR node_id only)`);
}

// ═══════════════════════════════════════════════════════════════════════
// INVARIANT 5: Architecture files are consistent with D11
// ═══════════════════════════════════════════════════════════════════════

console.log('\n  Invariant 5: Architecture files consistent with D11');

// constitution.yml must have EXC-001 pointing to phase_4_3
const constitution = readFile('architecture/constitution.yml');
assert(constitution !== null, 'constitution.yml exists');
if (constitution) {
  assert(constitution.includes('removal_phase: "phase_4_3"'),
    'EXC-001 removal_phase is phase_4_3 (Cold-Start Semantic Mapping)');
  assert(constitution.includes('removal_phase: "phase_4_1"'),
    'EXC-002/003 removal_phase is phase_4_1 (Fill Planner)');
  assert(constitution.includes('removal_phase: "phase_5_1"'),
    'EXC-004 removal_phase is phase_5_1 (Behavioral Teach)');
  assert(constitution.includes('removal_phase: "phase_4_2"'),
    'EXC-005 removal_phase is phase_4_2 (Derived Values)');
}

// phases.yml must have phase_4_3 (Cold-Start)
const phases = readFile('architecture/phases.yml');
assert(phases !== null, 'phases.yml exists');
if (phases) {
  assert(phases.includes('phase_4_3:'), 'Phase 4.3 (Cold-Start Semantic Mapping) exists');
  assert(phases.includes('phase_5_1:'), 'Phase 5.1 (Behavioral Teach) exists');
  assert(phases.includes('phase_7_1:'), 'Phase 7.1 (Weak Semantic Key) exists');
  assert(!phases.includes('phase_6_1:'), 'Phase 6.1 does not exist (absorbed into 4.3)');
  // D11: Phase 5.1 must mention behavioral/affordances, not framework
  const phase51Section = phases.substring(phases.indexOf('phase_5_1:'), phases.indexOf('phase_5_2:'));
  assert(phase51Section.includes('affordances') || phase51Section.includes('behavioral'),
    'Phase 5.1 uses behavioral vocabulary (not framework names)');
  assert(!phase51Section.includes('React Select') && !phase51Section.includes('MUI'),
    'Phase 5.1 does not reference specific frameworks');
}

// boundaries.yml must have FB-010 through FB-013
const boundaries = readFile('architecture/boundaries.yml');
assert(boundaries !== null, 'boundaries.yml exists');
if (boundaries) {
  assert(boundaries.includes('FB-010'), 'FB-010 (no AI in extension) defined');
  assert(boundaries.includes('FB-011'), 'FB-011 (no framework names) defined');
  assert(boundaries.includes('FB-012'), 'FB-012 (no extension planning) defined');
  assert(boundaries.includes('FB-013'), 'FB-013 (no single-% promotion) defined');
  assert(boundaries.includes('server_boundaries'), 'Server boundaries section exists');
}

// ownership.yml must have phase_4_3 for AI reasoning
const ownership = readFile('architecture/ownership.yml');
assert(ownership !== null, 'ownership.yml exists');
if (ownership) {
  assert(ownership.includes('phase_4_3') || ownership.includes('Phase 4.3'),
    'AI reasoning migration targets Phase 4.3');
}

// ═══════════════════════════════════════════════════════════════════════
// INVARIANT 6: Knowledge store kinds align with architecture
// ═══════════════════════════════════════════════════════════════════════

console.log('\n  Invariant 6: Knowledge store alignment');

const knowledgeStore = readFile('packages/svc-knowledge/src/knowledge-store.js');
assert(knowledgeStore !== null, 'knowledge-store.js exists');
if (knowledgeStore) {
  // Must have field_mapping kind (D11 Cold-Start produces these)
  assert(knowledgeStore.includes("'field_mapping'"), 'Knowledge store supports field_mapping kind');
  // Must have component_adapter (compatibility with existing data)
  assert(knowledgeStore.includes("'component_adapter'"),
    'Knowledge store preserves component_adapter kind (compatibility)');
  // Must have derivation_rule (Phase 4.2)
  assert(knowledgeStore.includes("'derivation_rule'"), 'Knowledge store supports derivation_rule kind');
}

// ═══════════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════════

console.log(`\n─────────────────────────────────`);
console.log(`${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
