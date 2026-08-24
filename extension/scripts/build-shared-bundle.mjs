import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.mjs';
import { writeConcatBundle } from './lib/concat-bundle.mjs';

writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED
 * Source: @cc/shared
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/shared'),
  order: [
    'network-idle.js',
    'dom-utils.js',
    'label-utils.js',
    'option-match.js',
    'select-apply.js',
    'llm-client.js',
    'semantic-aliases.js',
    'legacy-fill-gate.js',
  ],
  outfile: path.join(extensionRoot, 'shared-bundle.js'),
});
