import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.mjs';
import { writeConcatBundle } from './lib/concat-bundle.mjs';

await writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED
 * Source: @cc/drivers
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/drivers'),
  order: ['dispatch.ts', 'dom.ts', 'input.ts', 'select.ts', 'interaction.ts'],
  outfile: path.join(extensionRoot, 'drivers-bundle.js'),
});
