import path from 'node:path';
import { extensionRoot, packageRoot } from './lib/resolve.mjs';
import { writeConcatBundle } from './lib/concat-bundle.mjs';

writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED — do not edit.
 * Source: @cc/background
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageRoot('@cc/background'),
  order: [
    'auth/src/auth.js',
    'label-utils/src/label-utils.js',
    'wss-manager/src/wss-manager.js',
    'bridge/src/bridge.js',
    'job-dispatch/src/job-dispatch.js',
    'teach/src/teach.js',
    'composer/src/composer.js',
  ],
  outfile: path.join(extensionRoot, 'sw/bg-bundle.js'),
  // Prevent "Identifier has already been declared" (Chrome SW status 15) when
  // importScripts re-evaluates this file in the same service-worker global.
  idempotentKey: '__CC_BG_BUNDLE_LOADED',
});
