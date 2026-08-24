import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.mjs';
import { writeConcatBundle } from './lib/concat-bundle.mjs';

writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED
 * Source: @cc/plugins
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/plugins'),
  order: [
    'interface.js',
    'cascade-select.js',
    'ng-dropdown.js',
    'button-click.js',
    'keystroke-input.js',
    'network-monitor.js',
  ],
  outfile: path.join(extensionRoot, 'autofill/plugins-bundle.js'),
});
