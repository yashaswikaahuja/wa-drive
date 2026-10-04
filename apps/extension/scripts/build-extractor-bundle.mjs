import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.mjs';
import { writeConcatBundle } from './lib/concat-bundle.mjs';

await writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED — do not edit.
 * Source: @cc/extractor
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/extractor'),
  order: [
    'form-context.ts',
    'scan-standard-fields.ts',
    'scan-mat-widgets.ts',
    'scan-ng-dropdowns.ts',
    'sort-fields-visual.ts',
    'fingerprint-form.ts',
    'correction-observer.ts',
    'extract-form-fields.ts',
  ],
  outfile: path.join(extensionRoot, 'autofill/extractor-bundle.js'),
});
