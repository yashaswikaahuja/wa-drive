// @ts-nocheck
import path from 'node:path';
import { extensionRoot, packageSrc } from './lib/resolve.ts';
import { writeConcatBundle } from './lib/concat-bundle.ts';

await writeConcatBundle({
  banner: `/**
 * AUTO-GENERATED — do not edit.
 * Source: @cc/executor
 * Rebuild: pnpm --filter cybercontrol-extension build
 */`,
  srcDir: packageSrc('@cc/executor'),
  order: [
    'parse-date-value.ts',
    'cascade-field-level.ts',
    'select-option-state.ts',
    'confirm-field-pattern.ts',
    'ng-option-scorer.ts',
    'ng-session-manager.ts',
    'build-fill-record.ts',
    'fill-debug-emitter.ts',
    'wait-for-options.ts',
    'settle-after-act.ts',
    'resolve-cc-selector.ts',
    'sort-fields-by-dom-order.ts',
    'verify-fill-value.ts',
    'detect-fill-strategy.ts',
    'post-fill-corrections.ts',
    'fill-one-ng.ts',
    'fill-one-select.ts',
    'fill-one-date.ts',
    'fill-one-radio.ts',
    'fill-one-mat.ts',
    'fill-one-text.ts',
    'install-kernel-bind.ts',
    'install-debug.ts',
    'install-select-helpers.ts',
    'install-settle.ts',
    'install-dom-order.ts',
    'install-strategy.ts',
    'install-fill-one-ng-helpers.ts',
    'install-fill-one-ng.ts',
    'install-fill-one-mat.ts',
    'install-fill-one-radio-planned.ts',
    'install-fill-one-select.ts',
    'install-fill-one-choice-dom.ts',
    'install-fill-one-date.ts',
    'install-fill-one-text.ts',
    'install-fill-one.ts',
    'install-sequential.ts',
    'install-post-fill-corrections.ts',
    'install-post-fill-confirm.ts',
    'install-post-fill-mirror.ts',
    'install-post-fill.ts',
    'fill-form-fields-sequential.ts',
  ],
  outfile: path.join(extensionRoot, 'autofill/executor-bundle.js'),
});
