#!/usr/bin/env node
/**
 * W-P1-04 — Classifier ↔ adapter registry CI matrix (#136)
 *
 * Fail closed when a non-null public adapter_id from the classifier is not
 * present in the browser-local adapter registry. Registry detection recipes
 * must not appear as public IR requirements.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const { classifyWidget } = require(resolve(ROOT, 'apps/extension/perception/widget-classifier.js'));
const {
  ADAPTER_CONTRACTS,
  getAdapterContract,
  getAllAdapterIds,
} = require(resolve(ROOT, 'apps/extension/perception/adapters/index.js'));

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

console.log('\n=== Classifier ↔ Registry Matrix (W-P1-04) ===');

const registryIds = new Set(getAllAdapterIds());
ok(registryIds.size >= 15, `registry has >= 15 adapters (${registryIds.size})`);

// Representative fact fixtures covering detector families
const FIXTURES = [
  { tag: 'input', type: 'text', role: 'textbox' },
  { tag: 'textarea', type: null, role: 'textbox' },
  { tag: 'input', type: 'number', role: null },
  { tag: 'input', type: 'date', role: null },
  { tag: 'input', type: 'datetime-local', role: null },
  { tag: 'input', type: 'month', role: null },
  { tag: 'input', type: 'week', role: null },
  { tag: 'input', type: 'time', role: null },
  { tag: 'select', type: null, role: null, state: {} },
  { tag: 'select', type: null, role: null, state: { multiple: true } },
  { tag: 'input', type: 'checkbox', role: 'checkbox' },
  { tag: 'input', type: 'radio', role: 'radio' },
  { tag: 'input', type: 'file', role: null },
  { tag: 'button', type: null, role: 'button' },
  { tag: 'div', role: 'captcha', accessibleName: 'CAPTCHA' },
  { tag: 'div', className: 'g-recaptcha', role: null, type: null },
  { tag: 'input', type: 'text', autocomplete: 'one-time-code', role: null },
  { tag: 'ng-select', type: null, role: null },
  { tag: 'div', className: 'ng-dropdown', role: null, type: null },
  { tag: 'mat-select', type: null, role: null },
  { tag: 'div', className: 'select2-container', role: null, type: null },
  { tag: 'div', className: 'choices', role: null, type: null },
  { tag: 'div', className: 'react-select', role: null, type: null },
  { tag: 'v-select', type: null, role: null },
  { tag: 'div', className: 'bootstrap-select', role: null, type: null },
  { tag: 'input', type: 'text', className: 'flatpickr-input', role: null },
  { tag: 'input', type: 'text', className: 'hasDatepicker', role: null },
  { tag: 'input', type: 'text', className: 'mat-datepicker-input', matdatepicker: '', role: null },
  { tag: 'input', type: 'text', id: 'date_day', role: null },
  { tag: 'div', className: 'cdk-virtual-scroll', role: 'listbox', type: null },
  { tag: 'div', role: 'combobox', type: null },
  { tag: 'div', role: 'switch', type: null },
  { tag: 'div', role: 'dialog', type: null },
  { tag: 'div', role: 'application', type: null },
];

const seenAdapters = new Set();
const missing = [];
const nullOk = [];

for (const facts of FIXTURES) {
  const w = classifyWidget(facts);
  if (!w) continue;
  if (w.adapter_id == null) {
    nullOk.push(`${facts.tag}/${facts.role || facts.type || facts.className || 'x'}`);
    continue;
  }
  seenAdapters.add(w.adapter_id);
  if (!getAdapterContract(w.adapter_id)) {
    missing.push(w.adapter_id);
  }
}

ok(missing.length === 0, `every non-null classifier adapter_id is in registry (missing: ${missing.join(', ') || 'none'})`);
ok(nullOk.length >= 1, `null adapter_id allowed for generic/unknown (${nullOk.length} fixtures)`);

// Captcha registry envelope has empty affordances
const captcha = getAdapterContract('captcha');
ok(captcha && Array.isArray(captcha.affordances) && captcha.affordances.length === 0, 'captcha registry affordances empty');
ok(captcha?.status === 'unsupported' || captcha?.limitations?.length > 0, 'captcha marked unsupported/limited');

// Radio registry is selection not toggle
const radio = getAdapterContract('native-radio');
ok(radio && radio.behavior_kind === 'selection', 'native-radio is selection');
ok(radio.affordances.includes('select_one'), 'native-radio affords select_one');

// Registry contracts never require selector fields in public sense
for (const c of ADAPTER_CONTRACTS) {
  const blob = JSON.stringify(c.detection || {});
  // detection may list class_fragments for browser-local use — ensure no XPath/css selector keys as required public recipe
  ok(!('trigger_selector' in (c.detection || {})), `${c.id}: no trigger_selector in detection`);
  ok(!('xpath' in (c.detection || {})), `${c.id}: no xpath in detection`);
}

// Taxonomy documents first-match
const tax = readFileSync(resolve(ROOT, 'architecture/widget-taxonomy.yml'), 'utf8');
ok(tax.includes('ambiguity_policy'), 'taxonomy has ambiguity_policy');
ok(tax.includes('first_match_wins') || tax.includes('first-match'), 'taxonomy documents first-match');
ok(tax.includes('Never invent') || tax.includes('never invent') || tax.includes('MUST NOT invent'), 'taxonomy no invent multi-adapter');

// Fail-closed demo: inventing a phantom adapter_id is detectable
ok(!getAdapterContract('phantom-adapter-xyz'), 'unknown adapter_id not in registry');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
