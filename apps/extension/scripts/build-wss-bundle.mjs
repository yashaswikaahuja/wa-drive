import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.mjs';
import { writeConcatBundle } from './lib/concat-bundle.mjs';

writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED
 * Source: @cc/wss
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/wss'),
  order: ['reconnect-manager.js', 'ws-client.js', 'wss-session.js'],
  outfile: path.join(extensionRoot, 'sw/wss-bundle.js'),
});
