#!/usr/bin/env node
/**
 * Unit tests for extension/perception/privacy-filter.js
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const { classifyNode, applyPrivacyRules, MAX_ACCESSIBLE_NAME, MAX_SANITIZED_TEXT } = require(resolve(ROOT, 'extension/perception/privacy-filter.js'));

let passed = 0;
let failed = 0;
function ok(cond, msg) { if (cond) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.error(`  ✗ FAIL: ${msg}`); } }
function equal(a, b, msg) { ok(a === b, msg + (a === b ? '' : ` (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`)); }

console.log('\n=== Privacy Filter: classifyNode ===');
{
  equal(classifyNode({ role: null, accessible_name: 'Password' }, 'control', { type: 'password', autocomplete: '' }), 'secret', 'password input → secret');
  equal(classifyNode({ role: null, accessible_name: 'OTP Code' }, 'control', { type: 'text', autocomplete: 'one-time-code' }), 'secret', 'OTP autocomplete → secret');
  equal(classifyNode({ role: null, accessible_name: 'Enter verification code' }, 'control', {}), 'secret', 'verification code label → secret');
  equal(classifyNode({ role: 'captcha', accessible_name: 'CAPTCHA' }, 'widget', {}), 'secret', 'captcha role → secret');
  equal(classifyNode({ role: null, accessible_name: 'Aadhaar Number' }, 'control', {}), 'sensitive', 'aadhaar → sensitive');
  equal(classifyNode({ role: null, accessible_name: 'PAN Card No.' }, 'control', {}), 'sensitive', 'PAN → sensitive');
  equal(classifyNode({ role: null, accessible_name: 'Full Name' }, 'control', {}), 'personal', 'name → personal');
  equal(classifyNode({ role: null, accessible_name: 'Email Address' }, 'control', { type: 'email', autocomplete: '' }), 'personal', 'email → personal');
  equal(classifyNode({ role: null, accessible_name: 'Date of Birth' }, 'control', {}), 'personal', 'DOB → personal');
  equal(classifyNode({ role: null, accessible_name: '' }, 'page', {}), 'public', 'page node → public');
  equal(classifyNode({ role: null, accessible_name: '' }, 'navigation', {}), 'public', 'navigation → public');
  equal(classifyNode({ role: null, accessible_name: 'Category' }, 'control', {}), 'ordinary', 'generic control → ordinary');
  equal(classifyNode({ role: null, accessible_name: '' }, 'validation_message', {}), 'unknown', 'unknown kind → unknown');
}

console.log('\n=== Privacy Filter: applyPrivacyRules ===');
{
  // Secret node gets redacted
  const secretNode = {
    kind: 'control',
    observed: { role: null, accessible_name: 'Password', sanitized_text: 'hunter2', value_state: 'nonempty', language: 'en', description: null },
    privacy: {},
  };
  applyPrivacyRules(secretNode, { type: 'password', autocomplete: '' });
  equal(secretNode.privacy.classification, 'secret', 'secret classification applied');
  equal(secretNode.privacy.redacted, true, 'secret node is redacted');
  equal(secretNode.observed.sanitized_text, null, 'sanitized_text nulled for secret');
  ok(['masked', 'unavailable', 'not_applicable'].includes(secretNode.observed.value_state), 'value_state forced to masked/unavailable/not_applicable');

  // Ordinary node is not redacted
  const ordNode = {
    kind: 'control',
    observed: { role: null, accessible_name: 'Category', sanitized_text: 'General', value_state: 'nonempty', language: null, description: null },
    privacy: {},
  };
  applyPrivacyRules(ordNode, { type: 'text', autocomplete: '' });
  equal(ordNode.privacy.redacted, false, 'ordinary node not redacted');
  equal(ordNode.observed.sanitized_text, 'General', 'sanitized_text preserved for ordinary');

  // Long text truncation
  const longNode = {
    kind: 'content',
    observed: { role: null, accessible_name: 'x'.repeat(200), sanitized_text: 'y'.repeat(400), value_state: 'nonempty', language: null, description: null },
    privacy: {},
  };
  applyPrivacyRules(longNode, {});
  ok(longNode.observed.accessible_name.length === MAX_ACCESSIBLE_NAME, `accessible_name truncated to ${MAX_ACCESSIBLE_NAME}`);
  ok(longNode.observed.sanitized_text.length === MAX_SANITIZED_TEXT, `sanitized_text truncated to ${MAX_SANITIZED_TEXT}`);
  ok(longNode.privacy.reason.includes('truncated'), 'truncation noted in privacy.reason');

  // Unknown classification treated as sensitive → redacted
  const unknownNode = {
    kind: 'validation_message',
    observed: { role: null, accessible_name: '', sanitized_text: 'error text', value_state: 'nonempty', language: null, description: null },
    privacy: {},
  };
  applyPrivacyRules(unknownNode, {});
  equal(unknownNode.privacy.classification, 'unknown', 'unknown classification preserved');
  // unknown → treated as sensitive → redacted=true
  equal(unknownNode.privacy.redacted, true, 'unknown classified node is redacted (fail closed)');

  // null privacy.reason when no issues
  const cleanNode = {
    kind: 'control',
    observed: { role: 'textbox', accessible_name: 'State', sanitized_text: null, value_state: 'empty', language: null, description: null },
    privacy: {},
  };
  applyPrivacyRules(cleanNode, {});
  equal(cleanNode.privacy.reason, null, 'clean node has null reason');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
