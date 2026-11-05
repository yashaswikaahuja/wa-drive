/**
 * Server-side privacy policy evaluator.
 *
 * This module is intentionally pure: it does not display consent UI, persist
 * grants, or perform transfers. Callers must obtain an affirmative consent
 * grant through the server-owned consent workflow and evaluate it here before
 * performing the protected operation.
 *
 * IMPORTANT: A Chrome host permission or authenticated MCP connection is not
 * a consent grant. Missing, expired, revoked, or mismatched grants fail closed.
 */

export type PrivacyAction =
  | "read_page_content"
  | "read_customer_profile"
  | "capture_screenshot"
  | "send_screenshot"
  | "send_page_content"
  | "send_customer_data"
  | "send_file"
  | "persist_sensitive_trace";

export type DataCategory =
  | "page_content"
  | "screenshot"
  | "customer_identity"
  | "contact_details"
  | "government_id"
  | "date_of_birth"
  | "address"
  | "financial"
  | "education"
  | "uploaded_file"
  | "form_values"
  | "otp"
  | "password"
  | "captcha"
  | "payment_credential";

export interface PrivacyRecipient {
  /** Stable identifier, e.g. openrouter, google-input-tools, mcp-client:<id>. */
  id: string;
  /** Human-readable name shown in the disclosure UI. */
  displayName: string;
  /** Exact endpoint when the transfer is endpoint-specific. */
  endpoint?: string;
}

export interface PrivacyRequest {
  action: PrivacyAction;
  /** Stable, user-understandable purpose identifier; do not pass arbitrary UI copy. */
  purpose: string;
  operationId: string;
  workspaceId: string;
  userId: string;
  /** Stable customer/profile subject; required for customer-data access and disclosure. */
  dataSubjectId?: string;
  /** Operator attestation that the data subject was informed and agreed. */
  dataSubjectConsentConfirmed?: boolean;
  sourceOrigin?: string;
  recipient?: PrivacyRecipient;
  dataCategories: DataCategory[];
  /** Optional field names for field-level minimization. Never put field values here. */
  fields?: string[];
  /** True only when a trusted redaction stage has completed and verified. */
  redactionVerified?: boolean;
}

export interface ConsentGrant {
  id: string;
  workspaceId: string;
  userId: string;
  dataSubjectId?: string;
  dataSubjectConsentConfirmed?: boolean;
  action: PrivacyAction;
  purpose: string;
  recipientId?: string;
  recipientEndpoint?: string;
  sourceOrigin?: string;
  dataCategories: DataCategory[];
  fields?: string[];
  createdAt: number;
  expiresAt: number;
  revokedAt?: number | null;
  /** Must be true only after an explicit affirmative user decision. */
  affirmative: boolean;
}

export type PrivacyDecision =
  | { decision: "allow"; grantId: string; reason: "valid_scoped_consent" }
  | { decision: "consent_required"; reason: string }
  | { decision: "deny"; reason: string };

const EXTERNAL_ACTIONS = new Set<PrivacyAction>([
  "send_screenshot",
  "send_page_content",
  "send_customer_data",
  "send_file",
]);

const CUSTOMER_DATA_ACTIONS = new Set<PrivacyAction>(["read_customer_profile", "capture_screenshot", "send_screenshot", "send_page_content", "send_customer_data", "send_file", "persist_sensitive_trace"]);

const SECRET_CATEGORIES = new Set<DataCategory>([
  "otp",
  "password",
  "captcha",
  "payment_credential",
]);

const VALID_ACTIONS = new Set<PrivacyAction>([
  "read_page_content",
  "read_customer_profile",
  "capture_screenshot",
  "send_screenshot",
  "send_page_content",
  "send_customer_data",
  "send_file",
  "persist_sensitive_trace",
]);

const VALID_CATEGORIES = new Set<DataCategory>([
  "page_content",
  "screenshot",
  "customer_identity",
  "contact_details",
  "government_id",
  "date_of_birth",
  "address",
  "financial",
  "education",
  "uploaded_file",
  "form_values",
  "otp",
  "password",
  "captcha",
  "payment_credential",
]);

function normalizeOrigin(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.origin.toLowerCase();
  } catch {
    return undefined;
  }
}

function hasExactSetCoverage(grantValues: string[] | undefined, requestValues: string[]): boolean {
  if (!requestValues.length) return false;
  if (!grantValues || !grantValues.length) return false;
  const allowed = new Set(grantValues);
  return requestValues.every((value) => allowed.has(value));
}

function validateRequest(request: PrivacyRequest): string | null {
  if (!request || !VALID_ACTIONS.has(request.action)) return "invalid_action";
  if (typeof request.operationId !== "string" || !request.operationId.trim()) return "missing_operation_id";
  if (typeof request.workspaceId !== "string" || !request.workspaceId.trim()) return "missing_workspace_id";
  if (typeof request.userId !== "string" || !request.userId.trim()) return "missing_user_id";
  if (CUSTOMER_DATA_ACTIONS.has(request.action)) {
    if (typeof request.dataSubjectId !== "string" || !request.dataSubjectId.trim()) return "missing_data_subject";
    if (request.dataSubjectConsentConfirmed !== true) return "data_subject_consent_not_confirmed";
    if (request.action !== "capture_screenshot" && request.action !== "send_screenshot" && (!Array.isArray(request.fields) || request.fields.length === 0)) return "missing_field_scope";
  }
  if (typeof request.purpose !== "string" || !/^[a-z][a-z0-9_.-]{1,79}$/.test(request.purpose)) return "invalid_purpose";
  if (!Array.isArray(request.dataCategories) || request.dataCategories.length === 0) return "missing_data_categories";
  if (request.dataCategories.some((item) => !VALID_CATEGORIES.has(item))) return "invalid_data_category";
  if (new Set(request.dataCategories).size !== request.dataCategories.length) return "duplicate_data_category";
  if (request.fields && (!Array.isArray(request.fields) || request.fields.some((field) => typeof field !== "string" || !field.trim()))) {
    return "invalid_field_scope";
  }
  if (request.sourceOrigin !== undefined && !normalizeOrigin(request.sourceOrigin)) return "invalid_source_origin";
  if (EXTERNAL_ACTIONS.has(request.action)) {
    if (!request.recipient || typeof request.recipient.id !== "string" || !request.recipient.id.trim() || typeof request.recipient.displayName !== "string" || !request.recipient.displayName.trim()) {
      return "missing_transfer_recipient";
    }
    if (request.recipient.endpoint !== undefined && request.recipient.endpoint !== "") {
      try {
        const endpoint = new URL(request.recipient.endpoint);
        if (endpoint.protocol !== "https:") return "insecure_recipient_endpoint";
      } catch {
        return "invalid_recipient_endpoint";
      }
    }
  }
  return null;
}

/**
 * Evaluate whether a request is covered by an existing affirmative consent.
 * This function never creates consent and never interprets authentication or
 * browser permissions as consent.
 */
export function evaluatePrivacyRequest(
  request: PrivacyRequest,
  grants: ConsentGrant[],
  now: number = Date.now(),
): PrivacyDecision {
  const invalid = validateRequest(request);
  if (invalid) return { decision: "deny", reason: invalid };

  // These values must never be observed, transmitted, or persisted by the
  // privacy engine. A separate approved design would be required to change it.
  if (request.dataCategories.some((category) => SECRET_CATEGORIES.has(category))) {
    return { decision: "deny", reason: "secret_data_category_prohibited" };
  }

  // Screenshot bytes must be redacted before they cross any process/network
  // boundary. Server-side redaction after receipt is explicitly insufficient.
  if (request.action === "send_screenshot" && request.redactionVerified !== true) {
    return { decision: "deny", reason: "screenshot_redaction_not_verified" };
  }

  const requestOrigin = request.sourceOrigin ? normalizeOrigin(request.sourceOrigin) : undefined;
  const requestRecipientId = request.recipient?.id;
  const requestEndpoint = request.recipient?.endpoint;

  const matching = (Array.isArray(grants) ? grants : []).find((grant) => {
    if (!grant || grant.affirmative !== true) return false;
    if (grant.revokedAt != null) return false;
    if (!Number.isFinite(grant.createdAt) || grant.createdAt > now) return false;
    if (!Number.isFinite(grant.expiresAt) || grant.expiresAt <= now || grant.expiresAt <= grant.createdAt) return false;
    if (!grant.id || grant.workspaceId !== request.workspaceId || grant.userId !== request.userId) return false;
    if (grant.action !== request.action || grant.purpose !== request.purpose) return false;
    if ((grant.dataSubjectId || undefined) !== (request.dataSubjectId || undefined)) return false;
    if (grant.dataSubjectConsentConfirmed !== request.dataSubjectConsentConfirmed) return false;
    if ((grant.recipientId || undefined) !== requestRecipientId) return false;
    if ((grant.recipientEndpoint || undefined) !== requestEndpoint) return false;
    const grantOrigin = grant.sourceOrigin ? normalizeOrigin(grant.sourceOrigin) : undefined;
    if (grant.sourceOrigin && !grantOrigin) return false;
    if (grantOrigin !== requestOrigin) return false;
    if (!hasExactSetCoverage(grant.dataCategories, request.dataCategories)) return false;
    if (request.fields?.length && !hasExactSetCoverage(grant.fields, request.fields)) return false;
    return true;
  });

  if (!matching) {
    return { decision: "consent_required", reason: "no_matching_affirmative_consent" };
  }

  return { decision: "allow", grantId: matching.id, reason: "valid_scoped_consent" };
}

/** Utility for callers to classify an action without duplicating policy lists. */
export function isExternalPrivacyAction(action: PrivacyAction): boolean {
  return EXTERNAL_ACTIONS.has(action);
}
