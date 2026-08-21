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
  'capabilities/install-kernel-bind.js',
  'capabilities/install-debug.js',
  'capabilities/parse-date-value.js',      // date string parser — no deps
  'capabilities/cascade-field-level.js',   // cascade geography — no deps, loaded first
  'capabilities/select-option-state.js',   // select state readers — no deps
  'capabilities/install-select-helpers.js',
  'capabilities/install-settle.js',
  'capabilities/post-fill-corrections.js', // correction observer — browser only
  'capabilities/fill-one-ng.js',           // ng-dropdown fill handler — browser only
  'capabilities/fill-one-select.js',       // native select fill handler — browser only
  'capabilities/fill-one-date.js',         // date fill handler — browser only
  'capabilities/fill-one-radio.js',        // radio/checkbox/file handler — browser only
  'capabilities/fill-one-mat.js',          // mat fill handler — browser only
  'capabilities/fill-one-text.js',         // text fill handler — browser only
  'capabilities/settle-after-act.js',      // post-action settle engine — no DOM
  'capabilities/wait-for-options.js',      // select option poller — no deps
  'capabilities/ng-session-manager.js',    // ng session lifecycle — no deps
  'capabilities/ng-option-scorer.js',      // ng option scorer — no deps
  'capabilities/build-fill-record.js',     // fill record assembler — no deps
  'capabilities/fill-debug-emitter.js',    // debug event queue — no deps
  'capabilities/verify-fill-value.js',     // fill value verifier — needs resolveEl
  'capabilities/detect-fill-strategy.js',  // strategy detection — no deps
  'capabilities/resolve-cc-selector.js',   // selector resolution — no deps
  'capabilities/sort-fields-by-dom-order.js', // DOM order sort — depends on resolver only
  'capabilities/install-dom-order.js',
  'capabilities/install-strategy.js',
  'capabilities/install-fill-one-ng-helpers.js',
  'capabilities/install-fill-one-ng.js',
  'capabilities/install-fill-one-mat.js',
  'capabilities/install-fill-one-radio-planned.js',
  'capabilities/install-fill-one-select.js',
  'capabilities/install-fill-one-choice-dom.js',
  'capabilities/install-fill-one-date.js',
  'capabilities/install-fill-one-text.js',
  'capabilities/install-fill-one.js',
  // solid sequential (real closure) — chunk-*.js are legacy, not injected
  'capabilities/install-sequential.js',
  'capabilities/confirm-field-pattern.js', // confirm field pattern — no deps
  'capabilities/install-post-fill-corrections.js',
  'capabilities/install-post-fill-confirm.js',
  'capabilities/install-post-fill-mirror.js',
  'capabilities/install-post-fill.js',
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
