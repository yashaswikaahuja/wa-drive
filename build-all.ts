// @ts-nocheck
/**
 * build-all.ts — rebuild all extension bundles from @cc/* packages.
 * Prefer: pnpm --filter cybercontrol-extension build
 * Run:    pnpm build:bundles  OR  node build-all.ts
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const extensionBuild = path.join(root, 'apps/extension/scripts/build-all.ts');

console.log('Delegating to cybercontrol-extension package build (resolves @cc/* by name)...\n');
execSync(`node "${extensionBuild}"`, { stdio: 'inherit', cwd: root });
