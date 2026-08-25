/**
 * Tests for resolve-cc-selector.js
 *
 * Run: node extension/autofill/executor/resolve-cc-selector.test.mjs
 *
 * Uses a minimal document mock — no jsdom, no test framework required.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '../src/resolve-cc-selector.js'), 'utf8');

// ── Minimal document mock ─────────────────────────────────────────────────────
// Simulates querySelectorAll and querySelector for testing selector logic.
// Each element is a plain object with id, type, tagName, classList.

function makeEl(attrs) {
  return {
    id: attrs.id || '',
    tagName: (attrs.tag || 'input').toUpperCase(),
    type: attrs.type || '',
    className: attrs.className || '',
    classList: {
      contains: (c) => (attrs.className || '').split(' ').includes(c),
    },
    getAttribute: (k) => attrs[k] || null,
  };
}

function makeDoc(elements) {
  // querySelectorAll — simplified: match by type attribute or tag or class
  const byId = {};
  elements.forEach(el => { if (el.id) byId[el.id] = el; });

  function matches(el, sel) {
    sel = sel.trim();
    if (sel.startsWith('#')) return el.id === sel.slice(1);
    if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
    if (sel.startsWith('[')) {
      const m = sel.match(/\[(\w+)="([^"]+)"\]/);
      if (m) return el.getAttribute(m[1]) === m[2];
      return false;
    }
    // input[type="text"] or just tag, or tag.className like div.ng-dropdown
    const tagClassMatch = sel.match(/^(\w+)\.(\S+)$/);
    if (tagClassMatch) {
      return el.tagName.toLowerCase() === tagClassMatch[1].toLowerCase()
        && el.classList.contains(tagClassMatch[2]);
    }
    const tagMatch = sel.match(/^(\w+)(?:\[type="([^"]+)"\])?$/);
    if (tagMatch) {
      const tagOk = el.tagName.toLowerCase() === tagMatch[1].toLowerCase();
      if (!tagMatch[2]) return tagOk;
      return tagOk && el.type === tagMatch[2];
    }
    // input:not([type])
    if (sel === 'input:not([type])') return el.tagName.toLowerCase() === 'input' && !el.type;
    return false;
  }

  function querySelectorAll(selector) {
    // Split compound selector by comma
    const parts = selector.split(',').map(s => s.trim());
    const seen = new Set();
    const result = [];
    for (const el of elements) {
      if (seen.has(el)) continue;
      for (const part of parts) {
        if (matches(el, part)) {
          result.push(el);
          seen.add(el);
          break;
        }
      }
    }
    // Return array-like with numeric indexing
    const nodeList = result;
    return nodeList;
  }

  function querySelector(selector) {
    if (selector.startsWith('#')) return byId[selector.slice(1)] || null;
    const result = querySelectorAll(selector);
    return result[0] || null;
  }

  return { querySelectorAll, querySelector };
}

// ── Load the IIFE ─────────────────────────────────────────────────────────────
const sandbox = {};
const fn = new Function('globalThis', src);
fn(sandbox);
const { resolveCcSelector, FORM_FIELD_QUERY } = sandbox.CcResolveCcSelector;

// ── Build test document ───────────────────────────────────────────────────────
// Ordered list of elements as they appear on the page.
// hidden input must NOT appear in form-field-N results.
const elements = [
  makeEl({ id: 'f0', tag: 'input', type: 'text' }),
  makeEl({ id: 'f1', tag: 'input', type: 'email' }),
  makeEl({ id: 'f2', tag: 'input', type: 'date' }),
  makeEl({ id: 'f3', tag: 'select' }),
  makeEl({ id: 'f4', tag: 'textarea' }),
  makeEl({ id: 'hidden1', tag: 'input', type: 'hidden' }),   // must be excluded
  makeEl({ id: 'f5', tag: 'input', type: 'radio' }),
  makeEl({ id: 'f6', tag: 'input', type: 'checkbox' }),
  makeEl({ id: 'f7', tag: 'input', type: '' }),               // input:not([type])
  makeEl({ id: 'ng0', tag: 'div', className: 'ng-dropdown' }),
  makeEl({ id: 'ng1', tag: 'div', className: 'ng-dropdown' }),
  makeEl({ id: 'f8', tag: 'input', type: 'number' }),
  makeEl({ id: 'f9', tag: 'input', type: 'tel' }),
];
const doc = makeDoc(elements);

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  if (actual === expected) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', expected); console.error('    actual:  ', actual); failed++; }
}
function assertNull(desc, actual) {
  if (actual == null) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— expected null/undefined, got', actual?.id); failed++; }
}

const resolve = (sel) => resolveCcSelector(sel, doc);

// ── form-field-N: correct elements ───────────────────────────────────────────
console.log('\nform-field-N resolution (correct elements):');
assert('form-field-0 → text input f0',    resolve('form-field-0')?.id, 'f0');
assert('form-field-1 → email input f1',   resolve('form-field-1')?.id, 'f1');
assert('form-field-2 → date input f2',    resolve('form-field-2')?.id, 'f2');
assert('form-field-3 → select f3',        resolve('form-field-3')?.id, 'f3');
assert('form-field-4 → textarea f4',      resolve('form-field-4')?.id, 'f4');
assert('form-field-5 → radio f5',         resolve('form-field-5')?.id, 'f5');
assert('form-field-6 → checkbox f6',      resolve('form-field-6')?.id, 'f6');
assert('form-field-7 → input no type f7', resolve('form-field-7')?.id, 'f7');
assert('form-field-8 → number f8',        resolve('form-field-8')?.id, 'f8');
assert('form-field-9 → tel f9',           resolve('form-field-9')?.id, 'f9');

console.log('\nform-field-N: hidden input excluded:');
// If hidden1 is in the sequence, one of f5-f9 would shift — they are correct above,
// which proves hidden1 is not included.
// Direct check: no element in 0-9 should be hidden1
const resolved = Array.from({length: 10}, (_, i) => resolve(`form-field-${i}`)?.id);
assert('hidden1 not in form-field sequence', resolved.includes('hidden1'), false);

console.log('\nform-field-N: out of bounds returns null:');
assertNull('form-field-99 → null',   resolve('form-field-99'));
assertNull('form-field-100 → null',  resolve('form-field-100'));

console.log('\nform-field-N: leading zero (parseInt radix 10):');
assert('form-field-03 same result as form-field-3',
  resolve('form-field-03')?.id, resolve('form-field-3')?.id);
assert('form-field-00 same result as form-field-0',
  resolve('form-field-00')?.id, resolve('form-field-0')?.id);

// ── ng-dropdown-N ─────────────────────────────────────────────────────────────
console.log('\nng-dropdown-N resolution:');
assert('ng-dropdown-0 → ng0', resolve('ng-dropdown-0')?.id, 'ng0');
assert('ng-dropdown-1 → ng1', resolve('ng-dropdown-1')?.id, 'ng1');
assertNull('ng-dropdown-99 → null', resolve('ng-dropdown-99'));
assertNull('ng-dropdown-2 → null (only 2 exist)', resolve('ng-dropdown-2'));

// ── CSS selector ──────────────────────────────────────────────────────────────
console.log('\nCSS selector resolution:');
assert('#f0 resolves',           resolve('#f0')?.id, 'f0');
assert('#f3 resolves',           resolve('#f3')?.id, 'f3');
assert('#ng0 resolves',          resolve('#ng0')?.id, 'ng0');
assertNull('#doesNotExist → null', resolve('#doesNotExist'));

// ── No document available ─────────────────────────────────────────────────────
console.log('\nNo document:');
assertNull('null doc → null', resolveCcSelector('form-field-0', null));
assertNull('undefined doc (no global document in this env)',
  resolveCcSelector('form-field-0', undefined));

// ── FORM_FIELD_QUERY exported ─────────────────────────────────────────────────
console.log('\nFORM_FIELD_QUERY exported:');
assert('FORM_FIELD_QUERY is a string', typeof FORM_FIELD_QUERY, 'string');
assert('FORM_FIELD_QUERY includes input[type="text"]',
  FORM_FIELD_QUERY.includes('input[type="text"]'), true);
assert('FORM_FIELD_QUERY includes select',
  FORM_FIELD_QUERY.includes('select'), true);
assert('FORM_FIELD_QUERY includes textarea',
  FORM_FIELD_QUERY.includes('textarea'), true);
assert('FORM_FIELD_QUERY does not include hidden',
  FORM_FIELD_QUERY.includes('hidden'), false);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
