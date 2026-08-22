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
const extDir = path.join(dir, '../../../packages/cc-extractor/src');

const ORDER = [
  // ── Pure capability modules (no kernel deps) ──────────────────────────────
  'form-context.js',          // skip context + label helpers + form guard
  'scan-standard-fields.js',  // input/select/radio/checkbox scan
  'scan-mat-widgets.js',      // mat-select / mat-checkbox / mat-radio
  'scan-ng-dropdowns.js',     // ng-select / combobox / custom dropdowns
  'sort-fields-visual.js',    // getBoundingClientRect sort
  'fingerprint-form.js',      // formKey + semanticFormKey + pageModel
  'correction-observer.js',   // correction + enrichment listeners
  'extract-form-fields.js',  // extractFormFieldsWithFingerprint + injectCorrectionObserver
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
parts.push(`\n/* ==== extractor.js (facade) ==== */\n`);
const out = path.join(dir, '../../../extension/autofill/extractor-bundle.js');
fs.writeFileSync(out, parts.join(''));
const n = parts.join('').split(/\n/).length;
console.log('Wrote', out, n, 'lines');
