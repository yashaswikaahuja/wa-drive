/**
 * Walk upward from startDir until a directory containing packages/ is found.
 * Used by app build-dist scripts after the Turborepo apps/ layout move.
 */
import fs from 'node:fs';
import path from 'node:path';

export function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'packages')) && fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Cannot find monorepo root (packages/ + pnpm-workspace.yaml) from ${startDir}`);
    }
    dir = parent;
  }
}
