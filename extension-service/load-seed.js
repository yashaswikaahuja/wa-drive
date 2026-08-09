// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Knowledge Seed Loader — extension-service/load-seed.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Loads the generated seed records (seed-knowledge.js) into the
// knowledge_records table. Idempotent: skips records that already exist
// (matched by kind + scope + semantic identity) so it is safe to re-run.
//
// Run:  node load-seed.js
//
// This is the empty-plan / cold-start fix: without these records the
// fill-planner has no field_mapping knowledge and returns an empty plan.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { records as seedRecords } from './seed-knowledge.js';
import * as knowledgeStore from './knowledge-store.js';

/**
 * Compute a stable semantic identity for a record so re-runs can dedupe.
 * @param {object} rec
 * @returns {string}
 */
function semanticKey(rec) {
  const p = rec.payload || {};
  const id =
    p.semantic_key ||
    p.canonical ||
    p.capability_name ||
    p.component_class ||
    p.output_key ||
    p.target_semantic_key ||
    p.hostname ||
    JSON.stringify(p).slice(0, 80);
  const scope = rec.scope || {};
  return `${rec.kind}|${scope.level}|${scope.portal_id || ''}|${scope.form_key || ''}|${scope.country || ''}|${id}`;
}

async function main() {
  await knowledgeStore.ensureKnowledgeSchema();

  // Build a set of already-present semantic identities (one query per kind).
  const kinds = [...new Set(seedRecords.map(r => r.kind))];
  const present = new Set();
  for (const kind of kinds) {
    const existing = await knowledgeStore.query({ kind, status: 'active', limit: 1000 });
    for (const e of existing) present.add(semanticKey(e));
    // Also count validated
    const validated = await knowledgeStore.query({ kind, status: 'validated', limit: 1000 });
    for (const e of validated) present.add(semanticKey(e));
  }

  let created = 0, skipped = 0, failed = 0;
  const failures = [];

  for (const rec of seedRecords) {
    const key = semanticKey(rec);
    if (present.has(key)) { skipped++; continue; }
    try {
      await knowledgeStore.create(rec);
      present.add(key);
      created++;
    } catch (e) {
      failed++;
      failures.push(`${rec.kind} (${key.slice(0, 60)}): ${e.message}`);
    }
  }

  console.log(`SEED LOAD DONE: created=${created} skipped=${skipped} failed=${failed} total=${seedRecords.length}`);
  if (failures.length) {
    console.log('--- FAILURES (first 15) ---');
    failures.slice(0, 15).forEach(f => console.log('  ' + f));
  }
  process.exit(failed > 0 && created === 0 ? 1 : 0);
}

main().catch(e => { console.error('LOADER FATAL:', e.message); process.exit(1); });
