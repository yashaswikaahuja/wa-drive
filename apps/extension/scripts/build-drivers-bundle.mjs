import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.mjs';
import { writeConcatBundle } from './lib/concat-bundle.mjs';

writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED
 * Source: @cc/drivers
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/drivers'),
  order: ['dispatch.js', 'dom.js', 'input.js', 'select.js', 'interaction.js'],
  outfile: path.join(extensionRoot, 'drivers-bundle.js'),
});
