import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const routes = readFileSync(join(srcDir, 'routes.ts'), 'utf8');
const service = readFileSync(join(srcDir, 'service.ts'), 'utf8');

function sliceBetween(text: string, start: string, end: string) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing section ${start}`);
  return text.slice(from, to);
}

test('file list is workspace rows only', () => {
  const list = sliceBetween(routes, "router.get('/files/ws'", "router.get('/download/");
  assert.match(list, /workspace_id = \$1/);
  assert.match(list, /Workspace required/);
  assert.doesNotMatch(list, /files\.list/);
  assert.doesNotMatch(list, /getDrive\(/);
  assert.doesNotMatch(list, /app_secrets/);
});

test('workspace Drive client has no shared-token fallback', () => {
  const fn = sliceBetween(service, 'export async function getDriveForWorkspace', 'export async function findOrCreateFolder');
  assert.match(fn, /workspace_secrets/);
  assert.doesNotMatch(fn, /app_secrets/);
  assert.doesNotMatch(fn, /getDrive\(/);
  assert.doesNotMatch(fn, /claimLegacy/);
  assert.match(service, /export function getDrive\(\) \{\s*return null;/);
});
