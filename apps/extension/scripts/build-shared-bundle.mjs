import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.mjs';
import { writeConcatBundle } from './lib/concat-bundle.mjs';

await writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED
 * Source: @cc/shared
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/shared'),
  order: [
    'network-idle.ts',
    'dom-utils.ts',
    'label-utils.ts',
    'option-match.ts',
    'select-apply.ts',
    'llm-client.ts',
    'semantic-aliases.ts',
    'legacy-fill-gate.ts',
  ],
  outfile: path.join(extensionRoot, 'shared-bundle.js'),
});
