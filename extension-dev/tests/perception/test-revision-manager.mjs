#!/usr/bin/env node
/**
 * Unit tests for extension/perception/revision-manager.js
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const { RevisionManager, generateId } = require(resolve(ROOT, 'extension/perception/revision-manager.js'));

let passed = 0;
let failed = 0;
function ok(cond, msg) { if (cond) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.error(`  ✗ FAIL: ${msg}`); } }

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;

console.log('\n=== Revision Manager ===');
{
  const rm = new RevisionManager();

  // Initial state
  ok(rm.currentDocumentId() === null, 'initial documentId is null');
  ok(rm.currentRevision() === -1, 'initial revision is -1');

  // newDocument
  const doc1 = rm.newDocument();
  ok(ID_PATTERN.test(doc1), 'documentId matches Identifier pattern');
  ok(rm.currentRevision() === 0, 'revision resets to 0 after newDocument');
  ok(rm.currentDocumentId() === doc1, 'currentDocumentId returns the new id');

  // nextRevision is monotonic
  ok(rm.nextRevision() === 1, 'first nextRevision is 1');
  ok(rm.nextRevision() === 2, 'second nextRevision is 2');
  ok(rm.nextRevision() === 3, 'third nextRevision is 3');
  ok(rm.currentRevision() === 3, 'currentRevision tracks latest');

  // newDocument resets
  const doc2 = rm.newDocument();
  ok(doc2 !== doc1, 'new document_id is different');
  ok(rm.currentRevision() === 0, 'revision resets on new document');

  // nextRevision before newDocument throws
  const rm2 = new RevisionManager();
  let threw = false;
  try { rm2.nextRevision(); } catch { threw = true; }
  ok(threw, 'nextRevision before newDocument throws');

  // Snapshot IDs are unique
  const rm3 = new RevisionManager();
  const ids = new Set();
  for (let i = 0; i < 100; i++) ids.add(rm3.newSnapshotId());
  ok(ids.size === 100, 'snapshot IDs are unique across 100 calls');
  ok([...ids].every((id) => ID_PATTERN.test(id)), 'all snapshot IDs match Identifier pattern');

  // onFullNavigation
  rm.newDocument();
  rm.nextRevision();
  rm.nextRevision();
  const nav = rm.onFullNavigation();
  ok(nav.documentId !== doc2, 'onFullNavigation creates new documentId');
  ok(nav.revision === 0, 'onFullNavigation resets revision to 0');

  // onSameDocumentNavigation
  const spa = rm.onSameDocumentNavigation();
  ok(spa.documentId === nav.documentId, 'SPA navigation retains documentId');
  ok(spa.revision === 1, 'SPA navigation increments revision');

  // onFrameNavigation
  const frameDoc = rm.onFrameNavigation('frame-ctx-1');
  ok(ID_PATTERN.test(frameDoc), 'frame document_id matches pattern');
  ok(rm.getContextDocumentId('frame-ctx-1') === frameDoc, 'getContextDocumentId returns frame doc');
  ok(rm.getContextDocumentId('unknown-ctx') === null, 'unknown context returns null');

  // isRevisionCurrent
  ok(rm.isRevisionCurrent(1) === true, 'isRevisionCurrent with correct revision');
  ok(rm.isRevisionCurrent(0) === false, 'isRevisionCurrent with stale revision');

  // generateId conforms to pattern
  for (const prefix of ['doc', 'snap', 'ctx', 'node', 'edge']) {
    const id = generateId(prefix);
    ok(ID_PATTERN.test(id), `generateId('${prefix}') matches Identifier: ${id}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
