/**
 * Candidate hand-off (#351): mapper candidates reach this request's planner
 * without becoming active knowledge, and cold-start stays confirmation-only.
 */
import assert from 'node:assert/strict';
import {
  validateCandidateMappings,
  applyEphemeralCandidates,
  toConfirmationItems,
  isAllowedProfileKey,
  CANDIDATE_CODES,
} from '../src/candidate-mappings.ts';

function snapshot(nodes: any, extra: any = {}) {
  return {
    kind: 'page_snapshot',
    document_id: 'doc-1',
    snapshot_id: extra.snapshot_id || 'snap-1',
    revision: 1,
    nodes,
    page: { origin: 'https://bpsconline.bihar.gov.in', route_key: 'reg' },
  };
}

function textNode(id: string, label: string) {
  return {
    node_id: id,
    context_id: 'ctx',
    affordances: ['type_text'],
    state: { visible: true, enabled: true, hidden: false },
    observed: { accessible_name: label, label },
    widget: { role: 'textbox', input_type: 'text' },
  };
}

const nodes = {
  n_name: textNode('n_name', 'Full Name'),
  n_mobile: textNode('n_mobile', 'Mobile Number'),
};
const page = snapshot(nodes);
const scope = { portal_id: 'bpsconline.bihar.gov.in', form_key: 'reg' };
const profile = { name: { value: 'Sudhir Prasad' }, mobile: { value: '9876543210' } };

const coldStart = {
  node_id: 'n_name',
  profile_key: 'name',
  semantic_key: 'name',
  confidence: 0.92,
  disposition: 'needs_confirmation',
  needsHumanConfirmation: true,
  knowledgeRecordId: 'draft-1',
  reasoning: 'label maps to name',
  field_label: 'Full Name',
};

const autoAccept = {
  node_id: 'n_mobile',
  profile_key: 'mobile',
  semantic_key: 'mobile',
  confidence: 0.88,
  disposition: 'auto_accept',
  needsHumanConfirmation: false,
  field_label: 'Mobile Number',
};

// Cold-start high-confidence candidate is confirmation, never a fill action
{
  const handoff = validateCandidateMappings({ snapshot: page, scope, candidates: [coldStart] });
  assert.equal(handoff.accepted.length, 0);
  assert.equal(handoff.confirmation_required.length, 1);
  assert.equal(handoff.confirmation_required[0].profile_key, 'name');
  assert.equal(toConfirmationItems(handoff.confirmation_required)[0].disposition, 'needs_confirmation');
}

// auto_accept with a profile key is consumed this request
{
  const handoff = validateCandidateMappings({ snapshot: page, scope, candidates: [autoAccept] });
  assert.equal(handoff.accepted.length, 1);
  assert.equal(handoff.accepted[0].profile_key, 'mobile');
  assert.equal(handoff.confirmation_required.length, 0);
}

// auto_accept + needsHumanConfirmation still confirms (policy)
{
  const handoff = validateCandidateMappings({
    snapshot: page,
    scope,
    candidates: [{ ...autoAccept, needsHumanConfirmation: true }],
  });
  assert.equal(handoff.accepted.length, 0);
  assert.equal(handoff.confirmation_required.length, 1);
}

// Same-request apply: unmapped mobile is filled from the accepted candidate
{
  const result = {
    mappings: [],
    unmapped: ['n_name', 'n_mobile'],
    excluded: [],
  };
  applyEphemeralCandidates(page, profile, result, [autoAccept]);
  assert.equal(result.mappings.length, 1);
  assert.equal(result.mappings[0].node_id, 'n_mobile');
  assert.equal(result.mappings[0].value, '9876543210');
  assert.equal(result.mappings[0].ephemeral, true);
  assert.equal(result.mappings[0].mapping_record.status, 'draft');
  assert.deepEqual(result.unmapped, ['n_name']);
}

// Stored knowledge wins over an ephemeral candidate for the same node
{
  const result = {
    mappings: [{ node_id: 'n_mobile', profile_key: 'phone', value: '111' }],
    unmapped: ['n_name'],
    excluded: [],
  };
  applyEphemeralCandidates(page, profile, result, [autoAccept]);
  assert.equal(result.mappings.length, 1);
  assert.equal(result.mappings[0].profile_key, 'phone');
}

// Human-confirmed candidate on a later pass enters the plan
{
  const handoff = validateCandidateMappings({
    snapshot: page,
    scope,
    candidates: [coldStart],
    confirmed: [{ node_id: 'n_name', profile_key: 'name', confidence: 0.92, knowledgeRecordId: 'draft-1' }],
  });
  assert.equal(handoff.accepted.length, 1);
  assert.equal(handoff.accepted[0].disposition, 'confirmed');
  assert.equal(handoff.confirmation_required.length, 0);
}

function rejectCode(candidate: any) {
  return validateCandidateMappings({ snapshot: page, scope, candidates: [candidate] }).rejected[0]?.code;
}

assert.equal(
  rejectCode({ node_id: 'n_name', profile_key: 'name', confidence: 0.1, disposition: 'auto_accept' }),
  CANDIDATE_CODES.LOW_CONFIDENCE,
);
assert.equal(
  rejectCode({ node_id: 'gone', profile_key: 'name', confidence: 0.9, disposition: 'auto_accept' }),
  CANDIDATE_CODES.MISSING_NODE,
);
assert.equal(
  rejectCode({ node_id: 'n_mobile', profile_key: '#mobile', confidence: 0.9, disposition: 'auto_accept' }),
  CANDIDATE_CODES.INVALID_PROFILE_KEY,
);
assert.equal(
  rejectCode({ node_id: 'n_name', profile_key: 'name', confidence: 0.9, disposition: 'reject' }),
  CANDIDATE_CODES.REJECT,
);
assert.equal(
  rejectCode({
    node_id: 'n_mobile',
    profile_key: 'mobile',
    confidence: 0.9,
    disposition: 'auto_accept',
    scope: { portal_id: 'other.example' },
  }),
  CANDIDATE_CODES.SCOPE_MISMATCH,
);
assert.equal(
  rejectCode({
    node_id: 'n_mobile',
    profile_key: 'mobile',
    confidence: 0.9,
    disposition: 'auto_accept',
    snapshot_id: 'old-snap',
  }),
  CANDIDATE_CODES.STALE_SNAPSHOT,
);

assert.equal(isAllowedProfileKey('mobile'), true);
assert.equal(isAllowedProfileKey('name_hindi'), true);
assert.equal(isAllowedProfileKey('#email'), false);
assert.equal(isAllowedProfileKey('button.ytSearch'), false);

console.log('candidate-handoff.test.ts passed');
