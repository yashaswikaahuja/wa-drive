// @ts-nocheck
import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.ts';
import { writeConcatBundle } from './lib/concat-bundle.ts';

await writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED — do not edit.
 * Source: @cc/orchestrator
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/orchestrator'),
  order: [
    'script-manifests.ts',
    'flatten-profile.ts',
    'mapping-relation.ts',
    'sequential-kernel-fill.ts',
    'action-plan-fill.ts',
  ],
  outfile: path.join(extensionRoot, 'application/orchestrator-bundle.js'),
});
