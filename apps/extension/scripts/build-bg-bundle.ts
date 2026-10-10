import path from 'node:path';
import { extensionRoot, packageRoot } from './lib/resolve.ts';
import { writeConcatBundle } from './lib/concat-bundle.ts';

await writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED — do not edit.
 * Source: @cc/background
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageRoot('@cc/background'),
  order: [
    'auth/src/auth.ts',
    'label-utils/src/label-utils.ts',
    'wss-manager/src/wss-manager.ts',
    'bridge/src/bridge.ts',
    'job-dispatch/src/job-dispatch.ts',
    'teach/src/teach.ts',
    'composer/src/composer.ts',
  ],
  outfile: path.join(extensionRoot, 'sw/bg-bundle.js'),
  // Prevent "Identifier has already been declared" (Chrome SW status 15) when
  // importScripts re-evaluates this file in the same service-worker global.
  idempotentKey: '__CC_BG_BUNDLE_LOADED',
});
