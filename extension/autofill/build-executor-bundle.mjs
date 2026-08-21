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
  // ── Pure capability modules (no deps on kernel) ───────────────────────────
  'capabilities/parse-date-value.js',          // no deps
  'capabilities/cascade-field-level.js',       // no deps
  'capabilities/select-option-state.js',       // no deps
  'capabilities/confirm-field-pattern.js',     // no deps
  'capabilities/ng-option-scorer.js',          // no deps
  'capabilities/ng-session-manager.js',        // no deps
  'capabilities/build-fill-record.js',         // no deps
  'capabilities/fill-debug-emitter.js',        // no deps
  'capabilities/wait-for-options.js',          // no deps
  'capabilities/settle-after-act.js',          // needs waitForNetworkIdle (injected)
  'capabilities/resolve-cc-selector.js',       // no deps
  'capabilities/sort-fields-by-dom-order.js',  // needs resolve-cc-selector
  'capabilities/verify-fill-value.js',         // needs resolve-cc-selector
  'capabilities/detect-fill-strategy.js',      // no deps
  'capabilities/post-fill-corrections.js',     // correction observer
  'capabilities/fill-one-ng.js',               // ng-dropdown fill logic
  'capabilities/fill-one-select.js',           // native select fill logic
  'capabilities/fill-one-date.js',             // date fill logic
  'capabilities/fill-one-radio.js',            // radio/checkbox/file logic
  'capabilities/fill-one-mat.js',              // mat fill logic
  'capabilities/fill-one-text.js',             // text fill logic

  // ── Kernel wiring (install- files — depend on capabilities above) ─────────
  'capabilities/install-kernel-bind.js',
  'capabilities/install-debug.js',
  'capabilities/install-select-helpers.js',
  'capabilities/install-settle.js',
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
  'capabilities/install-sequential.js',
  'capabilities/install-post-fill-corrections.js',
  'capabilities/install-post-fill-confirm.js',
  'capabilities/install-post-fill-mirror.js',
  'capabilities/install-post-fill.js',
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
const facade = fs.readFileSync(path.join(dir, 'executor.js'), 'utf8');
parts.push(`\n/* ==== executor.js (facade) ==== */\n`);
parts.push(facade);
if (!facade.endsWith('\n')) parts.push('\n');

const out = path.join(dir, 'executor-bundle.js');
fs.writeFileSync(out, parts.join(''));
const n = parts.join('').split(/\n/).length;
console.log('Wrote', out, n, 'lines');
