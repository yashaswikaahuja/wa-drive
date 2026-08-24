import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.mjs';
import { writeConcatBundle } from './lib/concat-bundle.mjs';

writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED — do not edit.
 * Source: @cc/executor
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/executor'),
  order: [
    'parse-date-value.js',
    'cascade-field-level.js',
    'select-option-state.js',
    'confirm-field-pattern.js',
    'ng-option-scorer.js',
    'ng-session-manager.js',
    'build-fill-record.js',
    'fill-debug-emitter.js',
    'wait-for-options.js',
    'settle-after-act.js',
    'resolve-cc-selector.js',
    'sort-fields-by-dom-order.js',
    'verify-fill-value.js',
    'detect-fill-strategy.js',
    'post-fill-corrections.js',
    'fill-one-ng.js',
    'fill-one-select.js',
    'fill-one-date.js',
    'fill-one-radio.js',
    'fill-one-mat.js',
    'fill-one-text.js',
    'install-kernel-bind.js',
    'install-debug.js',
    'install-select-helpers.js',
    'install-settle.js',
    'install-dom-order.js',
    'install-strategy.js',
    'install-fill-one-ng-helpers.js',
    'install-fill-one-ng.js',
    'install-fill-one-mat.js',
    'install-fill-one-radio-planned.js',
    'install-fill-one-select.js',
    'install-fill-one-choice-dom.js',
    'install-fill-one-date.js',
    'install-fill-one-text.js',
    'install-fill-one.js',
    'install-sequential.js',
    'install-post-fill-corrections.js',
    'install-post-fill-confirm.js',
    'install-post-fill-mirror.js',
    'install-post-fill.js',
    'fill-form-fields-sequential.js',
  ],
  outfile: path.join(extensionRoot, 'autofill/executor-bundle.js'),
});
