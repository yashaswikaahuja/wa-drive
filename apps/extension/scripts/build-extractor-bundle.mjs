import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.mjs';
import { writeConcatBundle } from './lib/concat-bundle.mjs';

writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED — do not edit.
 * Source: @cc/extractor
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/extractor'),
  order: [
    'form-context.js',
    'scan-standard-fields.js',
    'scan-mat-widgets.js',
    'scan-ng-dropdowns.js',
    'sort-fields-visual.js',
    'fingerprint-form.js',
    'correction-observer.js',
    'extract-form-fields.js',
  ],
  outfile: path.join(extensionRoot, 'autofill/extractor-bundle.js'),
});
