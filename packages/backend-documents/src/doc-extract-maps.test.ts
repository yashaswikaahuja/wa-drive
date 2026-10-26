import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSeedType } from './doc-extract-maps.js';

test('seed keys pass through unchanged', () => {
  for (const t of ['aadhaar', 'pan', 'voter_id', 'driving_license', 'marksheet_10th', 'bank_passbook', 'other']) {
    assert.equal(resolveSeedType(t), t);
  }
});

test('invented PAN synonyms map to pan', () => {
  assert.equal(resolveSeedType('permanent_account_number_card'), 'pan');
  assert.equal(resolveSeedType('Permanent Account Number Card'), 'pan');
  assert.equal(resolveSeedType('pan_card'), 'pan');
  assert.equal(resolveSeedType('e_pan'), 'pan');
});

test('invented Aadhaar synonyms map to aadhaar', () => {
  assert.equal(resolveSeedType('nsp_profile'), 'aadhaar');
  assert.equal(resolveSeedType('aadhar card'), 'aadhaar');
  assert.equal(resolveSeedType('UIDAI'), 'aadhaar');
  assert.equal(resolveSeedType('e-aadhaar'), 'aadhaar');
});

test('other ID synonyms map to their seed', () => {
  assert.equal(resolveSeedType('EPIC'), 'voter_id');
  assert.equal(resolveSeedType('driving licence'), 'driving_license');
  assert.equal(resolveSeedType('PM-JAY'), 'ayushman');
  assert.equal(resolveSeedType('abha card'), 'ayushman');
  assert.equal(resolveSeedType('consolidated_account_statement'), 'bank_passbook');
  assert.equal(resolveSeedType('hall_ticket'), 'admit_card');
  assert.equal(resolveSeedType('scorecard'), 'result');
});

test('compound / prefixed descriptions still resolve via substring', () => {
  assert.equal(resolveSeedType('permanent_account_number_card_front'), 'pan');
  assert.equal(resolveSeedType('aadhaar_card_back_side'), 'aadhaar');
});

test('genuinely non-seed junk → other', () => {
  for (const junk of ['engineers_day_greeting_card', 'municipal_ward_complaint', 'upi_payment_request', 'political_statement', 'courier_label', '']) {
    assert.equal(resolveSeedType(junk), 'other', `expected other for "${junk}"`);
  }
});

test('marksheet levels map correctly', () => {
  assert.equal(resolveSeedType('class_10_marksheet'), 'marksheet_10th');
  assert.equal(resolveSeedType('intermediate_marksheet'), 'marksheet_12th');
  assert.equal(resolveSeedType('degree_marksheet'), 'marksheet_graduation');
});
