/**
 * Resolve @cc/* package roots via Node package names (not ../../packages/…).
 * Same location-independence idea as extension-service → @cybercontrol/svc-*.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(extensionRoot, 'package.json'));

function packageJsonPathFromNodeModules(name) {
  const parts = name.startsWith('@') ? name.split('/') : [name];
  return path.join(extensionRoot, 'node_modules', ...parts, 'package.json');
}

/** Absolute path to an installed workspace package root. */
export function packageRoot(name) {
  const linked = packageJsonPathFromNodeModules(name);
  if (fs.existsSync(linked)) {
    return path.dirname(linked);
  }

  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch {
    // Walk up from a resolvable export when package.json is blocked by "exports"
    let entry;
    try {
      entry = require.resolve(name);
    } catch (err) {
      throw new Error(
        `Cannot resolve workspace package ${name}. Run pnpm install from the monorepo root.`,
        { cause: err },
      );
    }
    let dir = path.dirname(entry);
    for (;;) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === name) return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    throw new Error(`Cannot find package root for ${name} (started from ${entry})`);
  }
}

/** Absolute path to `<package>/<sub>` (default `src`). */
export function packageSrc(name, sub = 'src') {
  return path.join(packageRoot(name), sub);
}

export { extensionRoot };
