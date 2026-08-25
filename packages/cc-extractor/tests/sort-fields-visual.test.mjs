/**
 * sort-fields-visual.test.mjs — plain Node tests, no framework, no jsdom
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '../src/sort-fields-visual.js'), 'utf8');
const root = {};
new Function('globalThis', src)(root);
const { sort, ROW_BAND } = root.CcSortFieldsVisual;

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

function makeField(label, top, left) {
  return {
    label,
    _el: {
      getBoundingClientRect: () => ({ top, left, width: 100, height: 30 }),
    },
  };
}

function makeHiddenField(label) {
  return {
    label,
    _el: {
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
    },
  };
}

function makeNoElField(label) {
  return { label, _el: null };
}

// ── ROW_BAND constant ─────────────────────────────────────────────────────────
console.log('\nROW_BAND');
assert('ROW_BAND = 8', ROW_BAND, 8);

// ── Basic top-to-bottom sort ──────────────────────────────────────────────────
console.log('\nTop-to-bottom sort');
{
  const fields = [makeField('B', 200, 0), makeField('A', 100, 0)];
  sort(fields);
  assert('A before B', fields.map(f => f.label).join(','), 'A,B');
  assert('index reassigned', fields[0].index, 0);
  assert('_pos cleaned up', fields[0]._pos, undefined);
}

// ── Same row: left-to-right ───────────────────────────────────────────────────
console.log('\nSame-row left-to-right');
{
  // Within ROW_BAND (8px), treated as same row
  const fields = [makeField('Right', 100, 400), makeField('Left', 100, 50)];
  sort(fields);
  assert('Left before Right in same row', fields.map(f => f.label).join(','), 'Left,Right');
}

// ── Within ROW_BAND treated as same row ──────────────────────────────────────
{
  // top=100 and top=106 → same row bucket (both round to same /8 row)
  const f1 = makeField('F1', 100, 400);
  const f2 = makeField('F2', 104, 50); // within 8px → same row
  sort([f1, f2]);
  assert('fields within ROW_BAND treated as same row (F2 left → first)', [f1,f2].find(f=>f.label==='F2').index < [f1,f2].find(f=>f.label==='F1').index, true);
}

// ── Unrendered fields go to end ───────────────────────────────────────────────
console.log('\nUnrendered fields');
{
  const fields = [makeHiddenField('Hidden'), makeField('Visible', 100, 0)];
  sort(fields);
  assert('visible before hidden', fields[0].label, 'Visible');
  assert('hidden at end', fields[1].label, 'Hidden');
}

// ── null _el goes to end ──────────────────────────────────────────────────────
{
  const fields = [makeNoElField('NoEl'), makeField('Real', 100, 0)];
  sort(fields);
  assert('real field before no-el field', fields[0].label, 'Real');
}

// ── Mutates in-place ──────────────────────────────────────────────────────────
{
  const fields = [makeField('B', 200, 0), makeField('A', 100, 0)];
  const ref = fields;
  const result = sort(fields);
  assert('returns same array reference', result === ref, true);
}

// ── Multi-column layout ───────────────────────────────────────────────────────
console.log('\nMulti-column layout');
{
  // Row 1: col1=Name(left=0), col2=Email(left=300)
  // Row 2: col1=Phone(left=0), col2=City(left=300)
  const fields = [
    makeField('City',  200, 300),
    makeField('Phone', 200, 0),
    makeField('Email', 100, 300),
    makeField('Name',  100, 0),
  ];
  sort(fields);
  const labels = fields.map(f => f.label).join(',');
  assert('Name,Email,Phone,City order', labels, 'Name,Email,Phone,City');
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
