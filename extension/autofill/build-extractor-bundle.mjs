/**
 * Concatenate autofill/extractor/*.js (+ facade) into one inject file.
 * Keeps source split for editing; Chrome only injects the bundle.
 *
 * Run: node extension/autofill/build-extractor-bundle.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const extDir = path.join(dir, 'extractor');

const ORDER = [
  // ── Pure capability modules (no kernel deps) ──────────────────────────────
  'capabilities/form-context.js',          // skip context + label helpers + form guard
  'capabilities/scan-standard-fields.js',  // input/select/radio/checkbox scan
  'capabilities/scan-mat-widgets.js',      // mat-select / mat-checkbox / mat-radio
  'capabilities/scan-ng-dropdowns.js',     // ng-select / combobox / custom dropdowns
  'capabilities/sort-fields-visual.js',    // getBoundingClientRect sort
  'capabilities/fingerprint-form.js',      // formKey + semanticFormKey + pageModel
  'capabilities/correction-observer.js',   // correction + enrichment listeners
];

const parts = [];
parts.push(`/**
 * AUTO-GENERATED — do not edit.
 * Source: autofill/extractor/capabilities/*.js + extractor.js (facade)
 * Rebuild: node extension/autofill/build-extractor-bundle.mjs
 */\n`);

for (const name of ORDER) {
  const p = path.join(extDir, name);
  if (!fs.existsSync(p)) throw new Error('missing ' + name);
  const src = fs.readFileSync(p, 'utf8');
  parts.push(`\n/* ==== ${name} ==== */\n`);
  parts.push(src);
  if (!src.endsWith('\n')) parts.push('\n');
}

// Facade last — assigns globalThis.extractFormFieldsWithFingerprint + injectCorrectionObserver
const facade = fs.readFileSync(path.join(dir, 'extractor.js'), 'utf8');
parts.push(`\n/* ==== extractor.js (facade) ==== */\n`);
parts.push(facade);
if (!facade.endsWith('\n')) parts.push('\n');

const out = path.join(dir, 'extractor-bundle.js');
fs.writeFileSync(out, parts.join(''));
const n = parts.join('').split(/\n/).length;
console.log('Wrote', out, n, 'lines');
