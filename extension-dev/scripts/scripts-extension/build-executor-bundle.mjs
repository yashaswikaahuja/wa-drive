/**
 * Concatenate autofill/executor/*.js (+ facade) into one inject file.
 * Keeps source split for editing; Chrome only injects the bundle.
 *
 * Run: node extension/autofill/build-executor-bundle.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const execDir = path.join(dir, '../../../packages/cc-executor/src');

const ORDER = [
  // ── Pure capability modules (no deps on kernel) ───────────────────────────
  'parse-date-value.js',          // no deps
  'cascade-field-level.js',       // no deps
  'select-option-state.js',       // no deps
  'confirm-field-pattern.js',     // no deps
  'ng-option-scorer.js',          // no deps
  'ng-session-manager.js',        // no deps
  'build-fill-record.js',         // no deps
  'fill-debug-emitter.js',        // no deps
  'wait-for-options.js',          // no deps
  'settle-after-act.js',          // needs waitForNetworkIdle (injected)
  'resolve-cc-selector.js',       // no deps
  'sort-fields-by-dom-order.js',  // needs resolve-cc-selector
  'verify-fill-value.js',         // needs resolve-cc-selector
  'detect-fill-strategy.js',      // no deps
  'post-fill-corrections.js',     // correction observer
  'fill-one-ng.js',               // ng-dropdown fill logic
  'fill-one-select.js',           // native select fill logic
  'fill-one-date.js',             // date fill logic
  'fill-one-radio.js',            // radio/checkbox/file logic
  'fill-one-mat.js',              // mat fill logic
  'fill-one-text.js',             // text fill logic

  // ── Kernel wiring (install- files — depend on capabilities above) ─────────
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
];

const parts = [];
parts.push(`/**
 * AUTO-GENERATED — do not edit.
 * Source: autofill/executor/capabilities/*.js + executor.js
 * Rebuild: node extension/autofill/build-executor-bundle.mjs
 */
`);

for (const name of ORDER) {
  const p = path.join(execDir, name);
  if (!fs.existsSync(p)) throw new Error('missing ' + name);
  const src = fs.readFileSync(p, 'utf8');
  // Keep each file's IIFE as-is (nested IIFEs are fine in one script).
  parts.push(`\n/* ==== ${name} ==== */\n`);
  parts.push(src);
  if (!src.endsWith('\n')) parts.push('\n');
}

// Facade last — assigns globalThis.fillFormFieldsSequential
parts.push(`\n/* ==== executor.js (facade) ==== */\n`);
const out = path.join(dir, '../../../extension/autofill/executor-bundle.js');
fs.writeFileSync(out, parts.join(''));
const n = parts.join('').split(/\n/).length;
console.log('Wrote', out, n, 'lines');
