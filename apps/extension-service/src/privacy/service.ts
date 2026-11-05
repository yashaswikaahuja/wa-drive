import { randomBytes, randomUUID } from "node:crypto";
import { hashAuthorizationToken } from "./token.js";
import { pool } from "../db/db.js";
import {
  evaluatePrivacyRequest,
  type ConsentGrant,
  type PrivacyRequest,
} from "./engine.js";

const DEFAULT_CONSENT_TTL_MS = 15 * 60 * 1000;
const MAX_CONSENT_TTL_MS = 24 * 60 * 60 * 1000;
const AUTHORIZATION_TTL_MS = 60 * 1000;

export async function ensurePrivacySchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS privacy_consents (
      id uuid PRIMARY KEY,
      workspace_id text NOT NULL,
      user_id text NOT NULL,
      data_subject_id text,
      data_subject_consent_confirmed boolean NOT NULL DEFAULT false,
      action text NOT NULL,
      purpose text NOT NULL,
      recipient_id text,
      recipient_endpoint text,
      source_origin text,
      data_categories jsonb NOT NULL,
      fields jsonb,
      affirmative boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      CHECK (expires_at > created_at)
    );
    CREATE INDEX IF NOT EXISTS idx_privacy_consents_scope
      ON privacy_consents (workspace_id, user_id, action, purpose, expires_at)
      WHERE revoked_at IS NULL;

    CREATE TABLE IF NOT EXISTS privacy_authorizations (
      id uuid PRIMARY KEY,
      workspace_id text NOT NULL,
      user_id text NOT NULL,
      operation_id text NOT NULL,
      token_hash char(64) NOT NULL UNIQUE,
      request_json jsonb NOT NULL,
      consent_id uuid NOT NULL REFERENCES privacy_consents(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      UNIQUE (workspace_id, user_id, operation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_privacy_authorizations_expiry
      ON privacy_authorizations (expires_at)
      WHERE consumed_at IS NULL;

    CREATE TABLE IF NOT EXISTS privacy_audit_events (
      id bigserial PRIMARY KEY,
      workspace_id text NOT NULL,
      user_id text NOT NULL,
      data_subject_id text,
      event_type text NOT NULL,
      operation_id text,
      consent_id uuid,
      action text,
      purpose text,
      recipient_id text,
      source_origin text,
      data_categories jsonb,
      decision text NOT NULL,
      reason text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_privacy_audit_scope
      ON privacy_audit_events (workspace_id, created_at DESC);
  `);
}

function toGrant(row: any): ConsentGrant {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    dataSubjectId: row.data_subject_id || undefined,
    dataSubjectConsentConfirmed: row.data_subject_consent_confirmed === true,
    action: row.action,
    purpose: row.purpose,
    recipientId: row.recipient_id || undefined,
    recipientEndpoint: row.recipient_endpoint || undefined,
    sourceOrigin: row.source_origin || undefined,
    dataCategories: row.data_categories,
    fields: row.fields || undefined,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).getTime() : null,
    affirmative: row.affirmative === true,
  };
}

function publicConsent(row: any) {
  return {
    id: row.id,
    action: row.action,
    purpose: row.purpose,
    recipientId: row.recipient_id || null,
    recipientEndpoint: row.recipient_endpoint || null,
    sourceOrigin: row.source_origin || null,
    dataSubjectId: row.data_subject_id || null,
    dataSubjectConsentConfirmed: row.data_subject_consent_confirmed === true,
    dataCategories: row.data_categories,
    fields: row.fields,
    affirmative: row.affirmative,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

async function audit(input: {
  workspaceId: string; userId: string; eventType: string; operationId?: string;
  consentId?: string; request?: PrivacyRequest; decision: string; reason?: string;
}) {
  const { workspaceId, userId, eventType, operationId, consentId, request, decision, reason } = input;
  await pool.query(`
    INSERT INTO privacy_audit_events
      (workspace_id, user_id, data_subject_id, event_type, operation_id, consent_id, action, purpose,
       recipient_id, source_origin, data_categories, decision, reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
  `, [
    workspaceId, userId, request?.dataSubjectId || null, eventType, operationId || null, consentId || null,
    request?.action || null, request?.purpose || null, request?.recipient?.id || null,
    request?.sourceOrigin || null, request ? JSON.stringify(request.dataCategories) : null,
    decision, reason || null,
  ]);
}

export async function createConsent(input: {
  workspaceId: string; userId: string; body: any;
}) {
  const { workspaceId, userId, body } = input;
  if (body?.affirmative !== true) {
    return { ok: false as const, status: 400, error: "explicit_affirmative_consent_required" };
  }
  const ttl = body.ttlMs == null ? DEFAULT_CONSENT_TTL_MS : Number(body.ttlMs);
  if (!Number.isInteger(ttl) || ttl < 60_000 || ttl > MAX_CONSENT_TTL_MS) {
    return { ok: false as const, status: 400, error: "consent_ttl_out_of_range" };
  }

  const now = Date.now();
  const request: PrivacyRequest = {
    action: body.action,
    purpose: body.purpose,
    operationId: `consent-approval:${randomUUID()}`,
    workspaceId,
    userId,
    dataSubjectId: body.dataSubjectId,
    dataSubjectConsentConfirmed: body.dataSubjectConsentConfirmed,
    sourceOrigin: body.sourceOrigin,
    recipient: body.recipient,
    dataCategories: body.dataCategories,
    fields: body.fields,
    redactionVerified: body.redactionVerified,
  };
  const id = randomUUID();
  const candidate: ConsentGrant = {
    id, workspaceId, userId, dataSubjectId: request.dataSubjectId,
    dataSubjectConsentConfirmed: request.dataSubjectConsentConfirmed,
    action: request.action, purpose: request.purpose,
    recipientId: request.recipient?.id, recipientEndpoint: request.recipient?.endpoint,
    sourceOrigin: request.sourceOrigin, dataCategories: request.dataCategories,
    fields: request.fields, createdAt: now, expiresAt: now + ttl,
    affirmative: true,
  };
  const decision = evaluatePrivacyRequest(request, [candidate], now);
  if (decision.decision !== "allow") {
    return { ok: false as const, status: 400, error: decision.reason };
  }

  const { rows } = await pool.query(`
    INSERT INTO privacy_consents
      (id, workspace_id, user_id, data_subject_id, data_subject_consent_confirmed,
       action, purpose, recipient_id, recipient_endpoint, source_origin, data_categories,
       fields, affirmative, created_at, expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,true,
            to_timestamp($13 / 1000.0),to_timestamp($14 / 1000.0))
    RETURNING *
  `, [
    id, workspaceId, userId, request.dataSubjectId || null,
    request.dataSubjectConsentConfirmed === true, request.action, request.purpose,
    request.recipient?.id || null, request.recipient?.endpoint || null,
    request.sourceOrigin || null, JSON.stringify(request.dataCategories),
    request.fields ? JSON.stringify(request.fields) : null, now, now + ttl,
  ]);
  await audit({
    workspaceId, userId, eventType: "consent_created", consentId: id,
    request, decision: "allow", reason: "explicit_affirmative_consent",
  });
  return { ok: true as const, consent: publicConsent(rows[0]) };
}

export async function listConsents(workspaceId: string, userId: string) {
  const { rows } = await pool.query(`
    SELECT * FROM privacy_consents
    WHERE workspace_id = $1 AND user_id = $2
    ORDER BY created_at DESC LIMIT 100
  `, [workspaceId, userId]);
  return rows.map(publicConsent);
}

export async function revokeConsent(workspaceId: string, userId: string, consentId: string) {
  const { rows } = await pool.query(`
    UPDATE privacy_consents SET revoked_at = now()
    WHERE id = $1 AND workspace_id = $2 AND user_id = $3 AND revoked_at IS NULL
    RETURNING *
  `, [consentId, workspaceId, userId]);
  if (!rows.length) return null;
  await audit({
    workspaceId, userId, eventType: "consent_revoked", consentId,
    decision: "allow", reason: "operator_revoked",
  });
  return publicConsent(rows[0]);
}

export async function issueAuthorization(input: {
  workspaceId: string; userId: string; body: any;
}) {
  const { workspaceId, userId, body } = input;
  const request: PrivacyRequest = {
    ...body,
    workspaceId,
    userId,
  };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`
      SELECT * FROM privacy_consents
      WHERE workspace_id = $1 AND user_id = $2 AND revoked_at IS NULL
        AND affirmative = true AND expires_at > now()
      ORDER BY created_at DESC
      FOR SHARE
    `, [workspaceId, userId]);
    const grants = rows.map(toGrant);
    const decision = evaluatePrivacyRequest(request, grants);
    if (decision.decision !== "allow") {
      await client.query("ROLLBACK");
      await audit({
        workspaceId, userId, eventType: "authorization_denied",
        operationId: request.operationId, request,
        decision: decision.decision, reason: decision.reason,
      });
      return { ok: false as const, status: 403, error: decision.reason };
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashAuthorizationToken(token);
    const authorizationId = randomUUID();
    const expiresAt = new Date(Date.now() + AUTHORIZATION_TTL_MS);
    await client.query(`
      INSERT INTO privacy_authorizations
        (id, workspace_id, user_id, operation_id, token_hash, request_json, consent_id, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
    `, [
      authorizationId, workspaceId, userId, request.operationId,
      tokenHash, JSON.stringify(request), decision.grantId, expiresAt,
    ]);
    await client.query("COMMIT");
    await audit({
      workspaceId, userId, eventType: "authorization_issued",
      operationId: request.operationId, consentId: decision.grantId,
      request, decision: "allow", reason: "single_use_authorization_issued",
    });
    // Raw token is returned once. Only its SHA-256 hash is stored.
    return { ok: true as const, authorization: { token, operationId: request.operationId, expiresAt: expiresAt.toISOString() } };
  } catch (error: any) {
    try { await client.query("ROLLBACK"); } catch {}
    if (error?.code === "23505") {
      return { ok: false as const, status: 409, error: "operation_authorization_already_issued" };
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function consumeAuthorization(input: {
  workspaceId: string; userId: string; token: string; operationId: string;
}) {
  const { workspaceId, userId, token, operationId } = input;
  if (typeof token !== "string" || token.length < 40 || token.length > 100 ||
      typeof operationId !== "string" || !operationId.trim()) return null;
  const tokenHash = hashAuthorizationToken(token);
  const { rows } = await pool.query(`
    UPDATE privacy_authorizations
    SET consumed_at = now()
    WHERE token_hash = $1 AND workspace_id = $2 AND user_id = $3
      AND operation_id = $4 AND consumed_at IS NULL AND expires_at > now()
      AND EXISTS (
        SELECT 1 FROM privacy_consents c
        WHERE c.id = privacy_authorizations.consent_id
          AND c.revoked_at IS NULL AND c.affirmative = true AND c.expires_at > now()
      )
    RETURNING id, request_json, consent_id
  `, [tokenHash, workspaceId, userId, operationId]);
  if (!rows.length) {
    await audit({
      workspaceId, userId, eventType: "authorization_consume_denied",
      operationId, decision: "deny", reason: "missing_expired_or_already_consumed",
    });
    return null;
  }
  const result = rows[0];
  await audit({
    workspaceId, userId, eventType: "authorization_consumed",
    operationId, consentId: result.consent_id, request: result.request_json,
    decision: "allow", reason: "single_use_authorization_consumed",
  });
  return { authorizationId: result.id, request: result.request_json };
}
