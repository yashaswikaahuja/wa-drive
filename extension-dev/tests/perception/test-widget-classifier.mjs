#!/usr/bin/env node
/**
 * Unit tests for extension/perception/widget-classifier.js
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const { classifyWidget, widgetAffordances } = require(resolve(ROOT, 'extension/perception/widget-classifier.js'));

let passed = 0;
let failed = 0;
function ok(cond, msg) { if (cond) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.error(`  ✗ FAIL: ${msg}`); } }
function equal(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + (JSON.stringify(a) === JSON.stringify(b) ? '' : ` (got ${JSON.stringify(a)})`)); }

console.log('\n=== Widget Classifier ===');
{
  // Text inputs
  const textInput = classifyWidget({ tag: 'input', role: 'textbox', type: 'text' });
  ok(textInput !== null, 'text input classified as widget');
  equal(textInput.behavior_kind, 'text_entry', 'text input → text_entry');
  ok(textInput.confidence >= 0.9, 'text input has high confidence');
  equal(textInput.status, 'recognized', 'text input is recognized');

  // Textarea
  const textarea = classifyWidget({ tag: 'textarea', role: 'textbox', type: null });
  equal(textarea.behavior_kind, 'text_entry', 'textarea → text_entry');

  // Email input
  const email = classifyWidget({ tag: 'input', role: 'textbox', type: 'email' });
  equal(email.behavior_kind, 'text_entry', 'email → text_entry');

  // Date input
  const dateInput = classifyWidget({ tag: 'input', role: null, type: 'date' });
  equal(dateInput.behavior_kind, 'date_time', 'date input → date_time');
  ok(dateInput.implementation_hint === 'native-date', 'date input hint');

  // Native select
  const select = classifyWidget({ tag: 'select', role: 'combobox', type: null, state: {} });
  equal(select.behavior_kind, 'selection', 'select → selection');
  equal(select.cardinality, 'one', 'single select → cardinality one');
  equal(select.interaction_mode, 'native', 'native select interaction');

  // Custom combobox
  const combobox = classifyWidget({ tag: 'div', role: 'combobox', type: null });
  equal(combobox.behavior_kind, 'selection', 'role=combobox → selection');
  equal(combobox.interaction_mode, 'overlay', 'custom combobox → overlay');
  ok(combobox.confidence < 0.95, 'custom combobox lower confidence than native');

  // ng-select
  const ngSelect = classifyWidget({ tag: 'ng-select', role: null, type: null });
  equal(ngSelect.behavior_kind, 'selection', 'ng-select → selection');
  equal(ngSelect.implementation_hint, 'ng-select', 'ng-select hint');

  // Checkbox
  const checkbox = classifyWidget({ tag: 'input', role: 'checkbox', type: 'checkbox' });
  equal(checkbox.behavior_kind, 'toggle', 'checkbox → toggle');

  // Radio
  const radio = classifyWidget({ tag: 'input', role: 'radio', type: 'radio' });
  equal(radio.behavior_kind, 'toggle', 'radio → toggle');
  equal(radio.cardinality, 'one', 'radio → cardinality one');

  // File upload
  const file = classifyWidget({ tag: 'input', role: null, type: 'file' });
  equal(file.behavior_kind, 'file_upload', 'file input → file_upload');

  // Button
  const button = classifyWidget({ tag: 'button', role: 'button', type: null });
  equal(button.behavior_kind, 'action', 'button → action');

  // Link
  const link = classifyWidget({ tag: 'a', role: 'link', type: null });
  equal(link.behavior_kind, 'action', 'link → action');

  // Submit input
  const submit = classifyWidget({ tag: 'input', role: 'button', type: 'submit' });
  equal(submit.behavior_kind, 'action', 'submit → action');

  // CAPTCHA
  const captcha = classifyWidget({ tag: 'div', role: 'captcha', type: null, accessibleName: 'CAPTCHA' });
  equal(captcha.behavior_kind, 'challenge', 'captcha → challenge');

  // Container (dialog)
  const dialog = classifyWidget({ tag: 'div', role: 'dialog', type: null });
  equal(dialog.behavior_kind, 'container', 'dialog → container');

  // Non-interactive div → null
  const div = classifyWidget({ tag: 'div', role: null, type: null });
  ok(div === null, 'plain div → null (not a widget)');

  // Non-interactive span → null
  const span = classifyWidget({ tag: 'span', role: null, type: null });
  ok(span === null, 'plain span → null');

  // Unknown (div with unexpected role)
  const unknown = classifyWidget({ tag: 'div', role: 'application', type: null });
  equal(unknown.behavior_kind, 'unknown', 'unknown role → unknown widget');
  ok(unknown.confidence < 0.5, 'unknown has low confidence');

  // widgetAffordances
  ok(widgetAffordances(textInput).includes('type_text'), 'text_entry affords type_text');
  ok(widgetAffordances(checkbox).includes('toggle'), 'toggle affords toggle');
  ok(widgetAffordances(button).includes('activate'), 'action affords activate');
  ok(widgetAffordances(null).length === 0, 'null widget → no affordances');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
