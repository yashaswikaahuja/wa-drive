import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.ts';
import { writeConcatBundle } from './lib/concat-bundle.ts';

await writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED
 * Source: @cc/plugins
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/plugins'),
  order: [
    'interface.ts',
    'cascade-select.ts',
    'ng-dropdown.ts',
    'button-click.ts',
    'keystroke-input.ts',
    'network-monitor.ts',
  ],
  outfile: path.join(extensionRoot, 'autofill/plugins-bundle.js'),
});
