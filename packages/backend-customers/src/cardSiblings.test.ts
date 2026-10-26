import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickCardSiblings, cardSideOf, type CardRow } from './cardSiblings.js';

const front = (id: string, num = '400959654314'): CardRow => ({
  id, tag: 'Aadhaar',
  suggested: {
    document_type: 'aadhaar', name: 'Aditya Raj', dob: '25/08/2007', gender: 'MALE',
    aadhaar_number: num,
  },
});
const back = (id: string, num = '400959654314'): CardRow => ({
  id, tag: 'Aadhaar',
  suggested: {
    document_type: 'aadhaar', aadhaar_number: num,
    address: 'S/O Pappu Yadav, panditpur, Rajgir', district: 'Nalanda', state: 'Bihar', pincode: '803116',
  },
});

test('sideOf detects front vs back from fields', () => {
  assert.equal(cardSideOf(front('a')), 'front');
  assert.equal(cardSideOf(back('b')), 'back');
});

test('front + back of the same card pair together', () => {
  const r = pickCardSiblings('f1', [front('f1'), back('b1')]);
  assert.equal(r.type, 'aadhaar');
  assert.equal(r.side, 'front');
  assert.deepEqual(r.orderedFileIds, ['f1', 'b1']);
});

test('opening the back pairs it with the front', () => {
  const r = pickCardSiblings('b1', [front('f1'), back('b1')]);
  assert.equal(r.side, 'back');
  assert.deepEqual(r.orderedFileIds, ['b1', 'f1']);
});

test('two FRONT copies do NOT pair (no same-side duplicate)', () => {
  const r = pickCardSiblings('f1', [front('f1'), front('f2')]);
  assert.deepEqual(r.orderedFileIds, ['f1'], 'must not print the front twice');
});

test('two BACK copies do NOT pair', () => {
  const r = pickCardSiblings('b1', [back('b1'), back('b2')]);
  assert.deepEqual(r.orderedFileIds, ['b1']);
});

test('different id-number does not pair', () => {
  const r = pickCardSiblings('f1', [front('f1', '111122223333'), back('b1', '999988887777')]);
  assert.deepEqual(r.orderedFileIds, ['f1']);
});

test('fallback by name when back has no readable number', () => {
  const backNoNum: CardRow = {
    id: 'b1', tag: 'Aadhaar',
    suggested: { document_type: 'aadhaar', name: 'Aditya Raj', address: 'S/O Pappu Yadav', district: 'Nalanda' },
  };
  const r = pickCardSiblings('f1', [front('f1'), backNoNum]);
  assert.deepEqual(r.orderedFileIds, ['f1', 'b1']);
});

test('non-card document returns just itself', () => {
  const marksheet: CardRow = { id: 'm1', tag: '10th Marksheet', suggested: { document_type: 'marksheet_10th', name: 'Aditya Raj' } };
  const r = pickCardSiblings('m1', [marksheet]);
  assert.deepEqual(r.orderedFileIds, ['m1']);
  assert.equal(r.side, null);
});

test('only one card uploaded → just that card', () => {
  const r = pickCardSiblings('f1', [front('f1')]);
  assert.deepEqual(r.orderedFileIds, ['f1']);
});
