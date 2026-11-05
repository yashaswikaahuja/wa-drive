# Privacy Consent Lifecycle API (Part 2)

The extension-service exposes authenticated endpoints under `/api/privacy`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/consents` | List the authenticated operator's grants in the current workspace |
| POST | `/consents` | Create a narrowly scoped affirmative grant |
| DELETE | `/consents/:id` | Revoke one grant |
| POST | `/authorizations/issue` | Issue a one-minute, operation-bound authorization if a matching grant exists |
| POST | `/authorizations/consume` | Atomically consume the authorization once |

All endpoints require the existing workspace bearer token. The service binds the authenticated workspace and user from the JWT; caller-supplied identity values are ignored.

## Grant creation

Example request:

```json
{
  "affirmative": true,
  "action": "send_customer_data",
  "purpose": "form_assistance",
  "dataSubjectId": "customer-profile-uuid",
  "dataSubjectConsentConfirmed": true,
  "sourceOrigin": "https://example.gov.in",
  "recipient": {
    "id": "openrouter",
    "displayName": "OpenRouter",
    "endpoint": "https://openrouter.ai/api/v1/chat/completions"
  },
  "dataCategories": ["customer_identity", "date_of_birth"],
  "fields": ["full_name", "dob"],
  "ttlMs": 900000
}
```

The endpoint requires `affirmative: true`. For customer-data reads, external customer-data transfers, file transfers, screenshot transfers and sensitive-trace persistence, the grant must also identify the customer/profile and carry `dataSubjectConsentConfirmed: true`.

**Important limitation:** `dataSubjectConsentConfirmed` is an operator attestation recorded with the authenticated user ID. This backend cannot independently prove that a customer was informed or agreed. The operator-facing disclosure and evidence capture must be implemented before treating this as verified customer consent. The attestation is not a substitute for legal review or a data-subject consent workflow.

Consent TTL defaults to 15 minutes and is capped at 24 hours. Authorization tickets expire after 60 seconds. Raw authorization tokens are returned once; only SHA-256 hashes are stored.

## Operation authorization

Issue requests contain only policy metadata. The server deliberately whitelists fields and recipient metadata; arbitrary caller payload properties are not copied into the stored request.

Example:

```json
{
  "action": "send_customer_data",
  "purpose": "form_assistance",
  "operationId": "fill-plan-uuid-step-4",
  "dataSubjectId": "customer-profile-uuid",
  "dataSubjectConsentConfirmed": true,
  "sourceOrigin": "https://example.gov.in",
  "recipient": {
    "id": "openrouter",
    "displayName": "OpenRouter",
    "endpoint": "https://openrouter.ai/api/v1/chat/completions"
  },
  "dataCategories": ["customer_identity", "date_of_birth"],
  "fields": ["full_name", "dob"]
}
```

The ticket is bound to workspace, user, operation ID, consent scope and exact recipient. Consumption is one atomic SQL update, so concurrent attempts cannot both succeed. Consumption also checks that the underlying consent has not expired or been revoked.

## Deployment

The service calls `ensurePrivacySchema()` at startup. The matching SQL migration is `apps/extension-service/migrations/004_privacy_consent.sql`. Both schema definitions must be kept aligned.

## Scope boundary

This lifecycle API does not by itself protect MCP, Agent, Teach, screenshot, transliteration or trace code paths. Each caller must issue and consume an authorization immediately before the sensitive read/transfer/persistence operation. Until those integrations land, those existing paths remain unresolved.
