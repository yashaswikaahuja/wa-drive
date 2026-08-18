/**
 * T2/T6/T9 mapping-engine classification tests
 * Run: node extension-service/mapping-engine.t6.test.mjs
 */
import {
  classifyField,
  classifyChoiceField,
  isNodeVisibleActive,
  FieldClassification,
  resolveConditionalValue,
} from './mapping-engine.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok  ', msg);
  }
}

// T9 visibility
assert(isNodeVisibleActive({ state: { visible: false } }) === false, 'hidden not active');
assert(isNodeVisibleActive({ state: { enabled: true, visible: true } }) === true, 'visible enabled');
assert(isNodeVisibleActive({ geometry: { width: 0, height: 0 } }) === false, 'zero geometry');

// T6 radio → CONDITIONAL
const radio = {
  affordances: ['toggle'],
  widget: { role: 'radio', behavior_kind: 'choice' },
  observed: { accessible_name: 'Do you have disability?' },
  state: { enabled: true, visible: true },
};
assert(classifyChoiceField(radio) === FieldClassification.CONDITIONAL, 'disability radio conditional');
assert(classifyField(radio) === FieldClassification.CONDITIONAL, 'classifyField radio conditional');

// T6 consent
const consent = {
  affordances: ['toggle'],
  widget: { role: 'checkbox' },
  observed: { accessible_name: 'I Agree to the terms' },
  state: { enabled: true, visible: true },
};
assert(classifyField(consent) === FieldClassification.CONSENT, 'I Agree is CONSENT');

// Text still PROFILE_DATA
const text = {
  affordances: ['type_text'],
  widget: { role: 'textbox' },
  observed: { accessible_name: 'Email Address' },
  state: { enabled: true, visible: true },
};
assert(classifyField(text) === FieldClassification.PROFILE_DATA, 'email is PROFILE_DATA');

// T7 conditional value
assert(
  resolveConditionalValue(radio, { disability: 'No' }, null) === 'No'
  || resolveConditionalValue(radio, {}, null) === 'No',
  'disability defaults/resolves No'
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll T2/T6/T9 mapping tests passed');
