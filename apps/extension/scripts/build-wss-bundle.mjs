import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.mjs';
import { writeConcatBundle } from './lib/concat-bundle.mjs';

await writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED
 * Source: @cc/wss
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/wss'),
  order: ['reconnect-manager.ts', 'ws-client.ts', 'wss-session.ts'],
  outfile: path.join(extensionRoot, 'sw/wss-bundle.js'),
});
