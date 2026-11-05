import assert from "node:assert/strict";
import {
  evaluatePrivacyRequest,
  isExternalPrivacyAction,
  type ConsentGrant,
  type PrivacyRequest,
} from "./engine.ts";

const now = 1_800_000_000_000;
const base: PrivacyRequest = {
  action: "send_customer_data",
  purpose: "form_assistance",
  operationId: "op-1",
  workspaceId: "workspace-1",
  userId: "operator-1",
  dataSubjectId: "profile-123",
  dataSubjectConsentConfirmed: true,
  sourceOrigin: "https://example.gov.in/path",
  recipient: { id: "openrouter", displayName: "OpenRouter", endpoint: "https://openrouter.ai/api/v1/chat/completions" },
  dataCategories: ["customer_identity", "date_of_birth"],
  fields: ["full_name", "dob"],
};

const grant: ConsentGrant = {
  id: "consent-1",
  workspaceId: "workspace-1",
  userId: "operator-1",
  dataSubjectId: "profile-123",
  dataSubjectConsentConfirmed: true,
  action: "send_customer_data",
  purpose: "form_assistance",
  recipientId: "openrouter",
  recipientEndpoint: "https://openrouter.ai/api/v1/chat/completions",
  sourceOrigin: "https://example.gov.in",
  dataCategories: ["customer_identity", "date_of_birth", "address"],
  fields: ["full_name", "dob", "address"],
  createdAt: now - 1000,
  expiresAt: now + 60_000,
  affirmative: true,
};

assert.deepEqual(evaluatePrivacyRequest(base, [grant], now), {
  decision: "allow",
  grantId: "consent-1",
  reason: "valid_scoped_consent",
});

assert.equal(evaluatePrivacyRequest(base, [], now).decision, "consent_required");
assert.equal(evaluatePrivacyRequest({ ...base, dataSubjectId: undefined }, [grant], now).reason, "missing_data_subject");
assert.equal(evaluatePrivacyRequest({ ...base, dataSubjectConsentConfirmed: false }, [grant], now).reason, "data_subject_consent_not_confirmed");
assert.equal(evaluatePrivacyRequest({ ...base, fields: [] }, [grant], now).reason, "missing_field_scope");
assert.equal(evaluatePrivacyRequest({ ...base, dataSubjectId: "profile-other" }, [grant], now).decision, "consent_required");
assert.equal(evaluatePrivacyRequest({ ...base, dataSubjectConsentConfirmed: false }, [grant], now).decision, "deny");
assert.equal(evaluatePrivacyRequest(base, [{ ...grant, affirmative: false }], now).decision, "consent_required");
assert.equal(evaluatePrivacyRequest(base, [{ ...grant, expiresAt: now }], now).decision, "consent_required");
assert.equal(evaluatePrivacyRequest(base, [{ ...grant, revokedAt: now - 1 }], now).decision, "consent_required");
assert.equal(evaluatePrivacyRequest({ ...base, userId: "other-user" }, [grant], now).decision, "consent_required");
assert.equal(evaluatePrivacyRequest({ ...base, workspaceId: "other-workspace" }, [grant], now).decision, "consent_required");
assert.equal(evaluatePrivacyRequest({ ...base, fields: ["full_name", "dob", "aadhaar_number"] }, [grant], now).decision, "consent_required");
assert.equal(evaluatePrivacyRequest({ ...base, purpose: "other_purpose" }, [grant], now).decision, "consent_required");
assert.equal(evaluatePrivacyRequest({ ...base, recipient: { ...base.recipient!, id: "other-provider" } }, [grant], now).decision, "consent_required");
assert.equal(evaluatePrivacyRequest({ ...base, dataCategories: ["customer_identity"] }, [grant], now).decision, "allow");
assert.equal(evaluatePrivacyRequest({ ...base, dataCategories: ["government_id"] }, [grant], now).decision, "consent_required");
assert.equal(evaluatePrivacyRequest({ ...base, dataCategories: ["otp"] }, [grant], now).decision, "deny");
assert.equal(evaluatePrivacyRequest({ ...base, action: "send_screenshot", dataCategories: ["screenshot"], redactionVerified: false }, [grant], now).decision, "deny");
assert.equal(evaluatePrivacyRequest({ ...base, action: "send_screenshot", dataCategories: ["screenshot"], redactionVerified: true }, [grant], now).decision, "consent_required");
assert.equal(evaluatePrivacyRequest({ ...base, sourceOrigin: "javascript:alert(1)" }, [grant], now).decision, "deny");
assert.equal(isExternalPrivacyAction("send_file"), true);
assert.equal(isExternalPrivacyAction("read_customer_profile"), false);

console.log("PRIVACY_POLICY_ENGINE_OK");
