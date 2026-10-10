#!/usr/bin/env node
/**
 * Unit tests for apps/extension/perception/widget-classifier.js
 * Includes W-P1-01..05 remediations (#136)
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const { classifyWidget, widgetAffordances, DETECTOR_PRIORITY } = require(
  resolve(ROOT, 'apps/extension/perception/widget-classifier.js')
);

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function equal(a, b, msg) {
  ok(JSON.stringify(a) === JSON.stringify(b), msg + (JSON.stringify(a) === JSON.stringify(b) ? '' : ` (got ${JSON.stringify(a)})`));
}

console.log('\n=== Widget Classifier ===');
{
  const textInput = classifyWidget({ tag: 'input', role: 'textbox', type: 'text' });
  ok(textInput !== null, 'text input classified as widget');
  equal(textInput.behavior_kind, 'text_entry', 'text input → text_entry');
  ok(textInput.confidence >= 0.9, 'text input has high confidence');
  equal(textInput.status, 'recognized', 'text input is recognized');
  ok(widgetAffordances(textInput).includes('type_text'), 'text affords type_text');
  ok(widgetAffordances(textInput).includes('clear'), 'text affords clear');

  const textarea = classifyWidget({ tag: 'textarea', role: 'textbox', type: null });
  equal(textarea.behavior_kind, 'text_entry', 'textarea → text_entry');

  const email = classifyWidget({ tag: 'input', role: 'textbox', type: 'email' });
  equal(email.behavior_kind, 'text_entry', 'email → text_entry');

  const dateInput = classifyWidget({ tag: 'input', role: null, type: 'date' });
  equal(dateInput.behavior_kind, 'date_time', 'date input → date_time');
  ok(dateInput.implementation_hint === 'native-date', 'date input hint');

  const select = classifyWidget({ tag: 'select', role: 'combobox', type: null, state: {} });
  equal(select.behavior_kind, 'selection', 'select → selection');
  equal(select.cardinality, 'one', 'single select → cardinality one');
  equal(select.interaction_mode, 'native', 'native select interaction');
  ok(widgetAffordances(select).includes('select_one'), 'single select affords select_one');
  ok(!widgetAffordances(select).includes('select_many'), 'single select does not afford select_many');

  const multi = classifyWidget({ tag: 'select', role: null, type: null, state: { multiple: true } });
  equal(multi.cardinality, 'many', 'multi select cardinality');
  ok(widgetAffordances(multi).includes('select_many'), 'W-P1-02 multi affords select_many not only select_one');

  const combobox = classifyWidget({ tag: 'div', role: 'combobox', type: null });
  equal(combobox.behavior_kind, 'selection', 'role=combobox → selection');
  equal(combobox.interaction_mode, 'overlay', 'custom combobox → overlay');
  ok(combobox.confidence < 0.95, 'custom combobox lower confidence than native');
  equal(combobox.adapter_id, null, 'generic combobox may have null adapter');

  const ngSelect = classifyWidget({ tag: 'ng-select', role: null, type: null });
  equal(ngSelect.behavior_kind, 'selection', 'ng-select → selection');
  equal(ngSelect.implementation_hint, 'ng-select', 'ng-select hint');
  ok(widgetAffordances(ngSelect).includes('expand'), 'ng-select affords expand');

  const checkbox = classifyWidget({ tag: 'input', role: 'checkbox', type: 'checkbox' });
  equal(checkbox.behavior_kind, 'toggle', 'checkbox → toggle');
  ok(widgetAffordances(checkbox).includes('toggle'), 'checkbox affords toggle');

  // W-P1-03 radio = selection / radio_group
  const radio = classifyWidget({ tag: 'input', role: 'radio', type: 'radio' });
  equal(radio.behavior_kind, 'selection', 'radio → selection (not toggle)');
  equal(radio.cardinality, 'one', 'radio → cardinality one');
  equal(radio.interaction_mode, 'composite', 'radio → composite');
  equal(radio.implementation_hint, 'radio_group', 'radio hint radio_group');
  equal(radio.adapter_id, 'native-radio', 'radio adapter native-radio');
  ok(widgetAffordances(radio).includes('select_one'), 'radio affords select_one');
  ok(!widgetAffordances(radio).includes('toggle'), 'radio does not afford toggle');

  const file = classifyWidget({ tag: 'input', role: null, type: 'file' });
  equal(file.behavior_kind, 'file_upload', 'file input → file_upload');

  const button = classifyWidget({ tag: 'button', role: 'button', type: null });
  equal(button.behavior_kind, 'action', 'button → action');

  const link = classifyWidget({ tag: 'a', role: 'link', type: null });
  equal(link.behavior_kind, 'action', 'link → action');

  const submit = classifyWidget({ tag: 'input', role: 'button', type: 'submit' });
  equal(submit.behavior_kind, 'action', 'submit → action');

  // W-P1-01 CAPTCHA unsupported, empty affordances
  const captcha = classifyWidget({ tag: 'div', role: 'captcha', type: null, accessibleName: 'CAPTCHA' });
  equal(captcha.behavior_kind, 'challenge', 'captcha → challenge');
  equal(captcha.status, 'unsupported', 'captcha status unsupported');
  equal(captcha.interaction_mode, 'delegated', 'captcha delegated');
  equal(widgetAffordances(captcha).length, 0, 'captcha has no mutating affordances');
  ok(!widgetAffordances(captcha).some((a) => ['type_text', 'select_one', 'toggle', 'upload', 'activate'].includes(a)),
    'captcha no mutate ops');

  const captchaClass = classifyWidget({ tag: 'div', role: null, type: null, className: 'g-recaptcha' });
  equal(captchaClass.status, 'unsupported', 'class captcha unsupported');
  equal(widgetAffordances(captchaClass).length, 0, 'class captcha no affordances');

  const turnstile = classifyWidget({ tag: 'div', role: null, type: null, className: 'cf-turnstile' });
  // turnstile may match captcha via class if we check turnstile - we check /turnstile/ in cls
  // class is 'cf-turnstile' which includes turnstile
  equal(turnstile?.behavior_kind, 'challenge', 'turnstile → challenge');
  equal(turnstile?.status, 'unsupported', 'turnstile unsupported');

  const dialog = classifyWidget({ tag: 'div', role: 'dialog', type: null });
  equal(dialog.behavior_kind, 'container', 'dialog → container');

  const div = classifyWidget({ tag: 'div', role: null, type: null });
  ok(div === null, 'plain div → null (not a widget)');

  const span = classifyWidget({ tag: 'span', role: null, type: null });
  ok(span === null, 'plain span → null');

  const unknown = classifyWidget({ tag: 'div', role: 'application', type: null });
  equal(unknown.behavior_kind, 'unknown', 'unknown role → unknown widget');
  ok(unknown.confidence < 0.5, 'unknown has low confidence');

  ok(widgetAffordances(button).includes('activate'), 'action affords activate');
  ok(widgetAffordances(null).length === 0, 'null widget → no affordances');

  // W-P1-02: affordances not enumerable on public widget IR
  ok(!Object.keys(textInput).includes('_affordances'), '_affordances not enumerable');
  ok(!Object.keys(textInput).includes('affordances'), 'no public affordances field on widget');
  ok(!JSON.stringify(textInput).includes('type_text'), 'JSON widget IR has no affordance list');

  // Determinism
  const a = classifyWidget({ tag: 'input', type: 'text', role: 'textbox' });
  const b = classifyWidget({ tag: 'input', type: 'text', role: 'textbox' });
  equal(a, b, 'deterministic classification');

  // First-match: captcha class wins over being a generic div
  ok(Array.isArray(DETECTOR_PRIORITY) && DETECTOR_PRIORITY.includes('captcha'), 'DETECTOR_PRIORITY exported');

  // Framework spoof: ng-select class on div still selection (first library match)
  const spoof = classifyWidget({ tag: 'div', role: null, type: null, className: 'ng-select fake' });
  equal(spoof.behavior_kind, 'selection', 'spoofed ng-select class → selection by first match');
  equal(spoof.adapter_id, 'ng-select', 'first-match adapter_id ng-select');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
