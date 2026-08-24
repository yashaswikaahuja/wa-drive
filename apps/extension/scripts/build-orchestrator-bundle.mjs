import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.mjs';
import { writeConcatBundle } from './lib/concat-bundle.mjs';

writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED — do not edit.
 * Source: @cc/orchestrator
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/orchestrator'),
  order: [
    'script-manifests.js',
    'flatten-profile.js',
    'sequential-kernel-fill.js',
    'action-plan-fill.js',
  ],
  outfile: path.join(extensionRoot, 'application/orchestrator-bundle.js'),
});
