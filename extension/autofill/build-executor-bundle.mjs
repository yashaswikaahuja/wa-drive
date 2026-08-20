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
const execDir = path.join(dir, 'executor');

const ORDER = [
  'kernel-bind.js',
  'debug.js',
  'capabilities/parse-date-value.js',      // date string parser — no deps
  'capabilities/cascade-field-level.js',   // cascade geography — no deps, loaded first
  'capabilities/select-option-state.js',   // select state readers — no deps
  'select-helpers.js',
  'settle.js',
  'capabilities/fill-debug-emitter.js',    // debug event queue — no deps
  'capabilities/verify-fill-value.js',     // fill value verifier — needs resolveEl
  'capabilities/detect-fill-strategy.js',  // strategy detection — no deps
  'capabilities/resolve-cc-selector.js',   // selector resolution — no deps
  'capabilities/sort-fields-by-dom-order.js', // DOM order sort — depends on resolver only
  'dom-order.js',
  'strategy.js',
  'fill-one-ng-helpers.js',
  'fill-one-ng.js',
  'fill-one-mat.js',
  'fill-one-radio-planned.js',
  'fill-one-select.js',
  'fill-one-choice-dom.js',
  'fill-one-date.js',
  'fill-one-text.js',
  'fill-one.js',
  // solid sequential (real closure) — chunk-*.js are legacy, not injected
  'sequential.js',
  'capabilities/confirm-field-pattern.js', // confirm field pattern — no deps
  'post-fill-corrections.js',
  'post-fill-confirm.js',
  'post-fill-mirror.js',
  'post-fill.js',
];

const parts = [];
parts.push(`/**
 * AUTO-GENERATED — do not edit.
 * Source: autofill/executor/*.js + executor.js
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
const facade = fs.readFileSync(path.join(dir, 'executor.js'), 'utf8');
parts.push(`\n/* ==== executor.js (facade) ==== */\n`);
parts.push(facade);
if (!facade.endsWith('\n')) parts.push('\n');

const out = path.join(dir, 'executor-bundle.js');
fs.writeFileSync(out, parts.join(''));
const n = parts.join('').split(/\n/).length;
console.log('Wrote', out, n, 'lines');
