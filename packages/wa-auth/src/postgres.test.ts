import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLocked } from './postgres.ts';

test('signal key writes for one workspace cannot overlap', async () => {
  const order: string[] = [];
  let releaseFirst: () => void = () => undefined;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const first = runLocked('ws', async () => {
    order.push('first-start');
    await firstGate;
    order.push('first-end');
  });
  const second = runLocked('ws', async () => {
    order.push('second');
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(order, ['first-start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first-start', 'first-end', 'second']);
});

test('auth store commits signal keys in one database transaction', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'postgres.ts'), 'utf8');
  assert.match(src, /BEGIN/);
  assert.match(src, /COMMIT/);
  assert.match(src, /runLocked\(workspaceId/);
  assert.doesNotMatch(src, /Promise\.all\(ops\)/);
});
