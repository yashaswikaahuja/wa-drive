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

function requestFromBody(body: any, workspaceId: string, userId: string): PrivacyRequest {
  const recipient = body?.recipient && typeof body.recipient === "object"
    ? {
        id: body.recipient.id,
        displayName: body.recipient.displayName,
        endpoint: body.recipient.endpoint,
      }
    : undefined;
  return {
    action: body?.action,
    purpose: body?.purpose,
    operationId: body?.operationId,
    workspaceId,
    userId,
    dataSubjectId: body?.dataSubjectId,
    dataSubjectConsentConfirmed: body?.dataSubjectConsentConfirmed,
    sourceOrigin: body?.sourceOrigin,
    recipient,
    dataCategories: body?.dataCategories,
    fields: body?.fields,
    redactionVerified: body?.redactionVerified,
  } as PrivacyRequest;
}

let privacySchemaReady: Promise<void> | null = null;

export function ensurePrivacySchema() {
  if (privacySchemaReady) return privacySchemaReady;
  privacySchemaReady = pool.query(`
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
    ALTER TABLE privacy_consents
      ADD COLUMN IF NOT EXISTS data_subject_id text,
      ADD COLUMN IF NOT EXISTS data_subject_consent_confirmed boolean NOT NULL DEFAULT false;
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
      recipient_endpoint text,
      source_origin text,
      data_categories jsonb,
      decision text NOT NULL,
      reason text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE privacy_audit_events
      ADD COLUMN IF NOT EXISTS data_subject_id text,
      ADD COLUMN IF NOT EXISTS recipient_endpoint text;

    CREATE INDEX IF NOT EXISTS idx_privacy_audit_scope
      ON privacy_audit_events (workspace_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS mcp_oauth_sessions (
      session_id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      client_name TEXT NOT NULL,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      role TEXT,
      refresh_token_hash TEXT UNIQUE,
      profile_access_enabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days'
    );

    CREATE TABLE IF NOT EXISTS workspace_privacy_policies (
      workspace_id text PRIMARY KEY,
      allow_mcp_profile_read boolean NOT NULL DEFAULT false,
      updated_by text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS privacy_profile_read_requests (
      id uuid PRIMARY KEY,
      workspace_id text NOT NULL,
      user_id text NOT NULL,
      mcp_session_id text NOT NULL,
      mcp_client_id text NOT NULL,
      mcp_client_name text NOT NULL,
      data_subject_id text NOT NULL,
      profile_label text NOT NULL,
      fields jsonb NOT NULL,
      data_categories jsonb NOT NULL,
      purpose text NOT NULL DEFAULT 'form_filling',
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      decided_at timestamptz,
      CHECK (status IN ('pending','approved','rejected','expired'))
    );
    CREATE INDEX IF NOT EXISTS idx_profile_read_requests_pending
      ON privacy_profile_read_requests (workspace_id, user_id, expires_at)
      WHERE status = 'pending';
  `).then(() => undefined).catch((error) => {
    privacySchemaReady = null;
    throw error;
  });
  return privacySchemaReady;
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
       recipient_id, recipient_endpoint, source_origin, data_categories, decision, reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)
  `, [
    workspaceId, userId, request?.dataSubjectId || null, eventType, operationId || null, consentId || null,
    request?.action || null, request?.purpose || null, request?.recipient?.id || null,
    request?.recipient?.endpoint || null, request?.sourceOrigin || null,
    request ? JSON.stringify(request.dataCategories) : null, decision, reason || null,
  ]);
}

export async function createConsent(input: {
  workspaceId: string; userId: string; body: any;
}) {
  await ensurePrivacySchema();
  const { workspaceId, userId, body } = input;
  if (body?.affirmative !== true) {
    return { ok: false as const, status: 400, error: "explicit_affirmative_consent_required" };
  }
  const ttl = body.ttlMs == null ? DEFAULT_CONSENT_TTL_MS : Number(body.ttlMs);
  if (!Number.isInteger(ttl) || ttl < 60_000 || ttl > MAX_CONSENT_TTL_MS) {
    return { ok: false as const, status: 400, error: "consent_ttl_out_of_range" };
  }

  const now = Date.now();
  const request = requestFromBody({
    ...body,
    operationId: `consent-approval:${randomUUID()}`,
  }, workspaceId, userId);
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
  await ensurePrivacySchema();
  const { rows } = await pool.query(`
    SELECT * FROM privacy_consents
    WHERE workspace_id = $1 AND user_id = $2
    ORDER BY created_at DESC LIMIT 100
  `, [workspaceId, userId]);
  return rows.map(publicConsent);
}

export async function revokeConsent(workspaceId: string, userId: string, consentId: string) {
  await ensurePrivacySchema();
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
  await ensurePrivacySchema();
  const { workspaceId, userId, body } = input;
  const request = requestFromBody(body, workspaceId, userId);
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
  await ensurePrivacySchema();
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


export async function getWorkspaceProfilePolicy(workspaceId: string) {
  await ensurePrivacySchema();
  await pool.query(
    `INSERT INTO workspace_privacy_policies (workspace_id, allow_mcp_profile_read)
     VALUES ($1, false) ON CONFLICT (workspace_id) DO NOTHING`,
    [workspaceId],
  );
  const { rows } = await pool.query(
    'SELECT allow_mcp_profile_read AS "allowMcpProfileRead", updated_at AS "updatedAt" FROM workspace_privacy_policies WHERE workspace_id = $1',
    [workspaceId],
  );
  return rows[0] || { allowMcpProfileRead: false, updatedAt: null };
}

export async function setWorkspaceProfilePolicy(workspaceId: string, userId: string, enabled: boolean) {
  await ensurePrivacySchema();
  const { rows } = await pool.query(
    `INSERT INTO workspace_privacy_policies (workspace_id, allow_mcp_profile_read, updated_by, updated_at)
     VALUES ($1,$2,$3,now())
     ON CONFLICT (workspace_id) DO UPDATE
       SET allow_mcp_profile_read = EXCLUDED.allow_mcp_profile_read,
           updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING allow_mcp_profile_read AS "allowMcpProfileRead", updated_at AS "updatedAt"`,
    [workspaceId, userId, enabled],
  );
  if (!enabled) {
    await pool.query(
      `UPDATE privacy_consents SET revoked_at = now()
       WHERE workspace_id = $1 AND action = 'read_customer_profile'
         AND recipient_endpoint LIKE 'mcp-session:%' AND revoked_at IS NULL`,
      [workspaceId],
    );
    await pool.query(
      `UPDATE privacy_profile_read_requests SET status = 'rejected', decided_at = now()
       WHERE workspace_id = $1 AND status = 'pending'`,
      [workspaceId],
    );
  }
  await audit({
    workspaceId, userId, eventType: "workspace_profile_policy_changed",
    decision: enabled ? "allow" : "deny",
    reason: enabled ? "workspace_admin_enabled_mcp_profile_read" : "workspace_admin_disabled_mcp_profile_read",
  });
  return rows[0];
}

export async function listMcpProfileSessions(workspaceId: string, userId: string) {
  await ensurePrivacySchema();
  const { rows } = await pool.query(
    `SELECT session_id AS "sessionId", client_id AS "clientId", client_name AS "clientName",
            profile_access_enabled AS "profileAccessEnabled", expires_at AS "expiresAt"
     FROM mcp_oauth_sessions
     WHERE workspace_id = $1 AND user_id = $2 AND expires_at > now()
     ORDER BY created_at DESC LIMIT 50`,
    [workspaceId, userId],
  );
  return rows;
}

export async function setMcpProfileSessionPermission(
  workspaceId: string, userId: string, sessionId: string, enabled: boolean,
) {
  await ensurePrivacySchema();
  const { rows } = await pool.query(
    `UPDATE mcp_oauth_sessions SET profile_access_enabled = $1
     WHERE session_id = $2 AND workspace_id = $3 AND user_id = $4 AND expires_at > now()
     RETURNING session_id AS "sessionId", client_name AS "clientName",
               profile_access_enabled AS "profileAccessEnabled", expires_at AS "expiresAt"`,
    [enabled, sessionId, workspaceId, userId],
  );
  if (rows.length && !enabled) {
    await pool.query(
      `UPDATE privacy_consents SET revoked_at = now()
       WHERE workspace_id = $1 AND user_id = $2
         AND recipient_endpoint = $3 AND action = 'read_customer_profile' AND revoked_at IS NULL`,
      [workspaceId, userId, `mcp-session:${sessionId}`],
    );
    await pool.query(
      `UPDATE privacy_profile_read_requests SET status = 'rejected', decided_at = now()
       WHERE workspace_id = $1 AND user_id = $2 AND mcp_session_id = $3 AND status = 'pending'`,
      [workspaceId, userId, sessionId],
    );
  }
  if (rows.length) {
    await audit({
      workspaceId, userId, eventType: "mcp_profile_session_permission_changed",
      decision: enabled ? "allow" : "deny",
      reason: enabled ? "operator_enabled_mcp_profile_read_for_session" : "operator_disabled_mcp_profile_read_for_session",
    });
  }
  return rows[0] || null;
}

export async function createProfileReadRequest(input: {
  workspaceId: string; userId: string; sessionId: string; clientId: string; clientName: string;
  profileId: string; profileLabel: string; fields: string[]; dataCategories: string[];
}) {
  await ensurePrivacySchema();
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO privacy_profile_read_requests
      (id, workspace_id, user_id, mcp_session_id, mcp_client_id, mcp_client_name,
       data_subject_id, profile_label, fields, data_categories, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,now() + interval '5 minutes')
     RETURNING id, profile_label AS "profileLabel", fields, data_categories AS "dataCategories", expires_at AS "expiresAt"`,
    [id, input.workspaceId, input.userId, input.sessionId, input.clientId, input.clientName,
      input.profileId, input.profileLabel, JSON.stringify(input.fields), JSON.stringify(input.dataCategories)],
  );
  await audit({
    workspaceId: input.workspaceId, userId: input.userId, eventType: "profile_read_approval_requested",
    operationId: id, request: {
      action: "read_customer_profile", purpose: "form_filling", operationId: id,
      workspaceId: input.workspaceId, userId: input.userId, dataSubjectId: input.profileId,
      dataSubjectConsentConfirmed: false, recipient: { id: input.clientId, displayName: input.clientName, endpoint: `mcp-session:${input.sessionId}` },
      dataCategories: input.dataCategories, fields: input.fields,
    } as PrivacyRequest, decision: "consent_required", reason: "just_in_time_approval_required",
  });
  return rows[0];
}

export async function listProfileReadRequests(workspaceId: string, userId: string) {
  await ensurePrivacySchema();
  await pool.query(
    `UPDATE privacy_profile_read_requests SET status = 'expired'
     WHERE workspace_id = $1 AND user_id = $2 AND status = 'pending' AND expires_at <= now()`,
    [workspaceId, userId],
  );
  const { rows } = await pool.query(
    `SELECT id, mcp_client_name AS "clientName", data_subject_id AS "profileId",
            profile_label AS "profileLabel", fields, data_categories AS "dataCategories",
            created_at AS "createdAt", expires_at AS "expiresAt"
     FROM privacy_profile_read_requests
     WHERE workspace_id = $1 AND user_id = $2 AND status = 'pending' AND expires_at > now()
     ORDER BY created_at ASC LIMIT 20`,
    [workspaceId, userId],
  );
  return rows;
}

export async function decideProfileReadRequest(input: {
  workspaceId: string; userId: string; requestId: string; approve: boolean; customerInformed: boolean;
}) {
  await ensurePrivacySchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT * FROM privacy_profile_read_requests
       WHERE id = $1 AND workspace_id = $2 AND user_id = $3
         AND status = 'pending' AND expires_at > now()
       FOR UPDATE`,
      [input.requestId, input.workspaceId, input.userId],
    );
    if (!found.rows.length) { await client.query("ROLLBACK"); return null; }
    const row = found.rows[0];
    if (input.approve && input.customerInformed !== true) {
      await client.query("ROLLBACK");
      return { error: "customer_confirmation_required" as const };
    }
    if (input.approve) {
      const policy = await client.query(
        'SELECT allow_mcp_profile_read FROM workspace_privacy_policies WHERE workspace_id = $1',
        [input.workspaceId],
      );
      const session = await client.query(
        `SELECT 1 FROM mcp_oauth_sessions
         WHERE session_id = $1 AND workspace_id = $2 AND user_id = $3
           AND profile_access_enabled = true AND expires_at > now()`,
        [row.mcp_session_id, input.workspaceId, input.userId],
      );
      if (policy.rows[0]?.allow_mcp_profile_read !== true || !session.rows.length) {
        await client.query("ROLLBACK");
        return { error: "profile_access_policy_or_session_disabled" as const };
      }
      const now = Date.now();
      const consentId = randomUUID();
      await client.query(
        `INSERT INTO privacy_consents
          (id, workspace_id, user_id, data_subject_id, data_subject_consent_confirmed,
           action, purpose, recipient_id, recipient_endpoint, data_categories, fields,
           affirmative, created_at, expires_at)
         VALUES ($1,$2,$3,$4,true,'read_customer_profile','form_filling',$5,$6,$7::jsonb,$8::jsonb,
                 true,to_timestamp($9 / 1000.0),to_timestamp($10 / 1000.0))`,
        [consentId, input.workspaceId, input.userId, row.data_subject_id,
          row.mcp_client_id, `mcp-session:${row.mcp_session_id}`, JSON.stringify(row.data_categories),
          JSON.stringify(row.fields), now, now + 5 * 60 * 1000],
      );
      await client.query(
        `UPDATE privacy_profile_read_requests SET status = 'approved', decided_at = now() WHERE id = $1`,
        [input.requestId],
      );
      await client.query("COMMIT");
      await audit({
        workspaceId: input.workspaceId, userId: input.userId, eventType: "profile_read_approved",
        consentId, operationId: input.requestId,
        request: {
          action: "read_customer_profile", purpose: "form_filling", operationId: input.requestId,
          workspaceId: input.workspaceId, userId: input.userId, dataSubjectId: row.data_subject_id,
          dataSubjectConsentConfirmed: true,
          recipient: { id: row.mcp_client_id, displayName: row.mcp_client_name, endpoint: `mcp-session:${row.mcp_session_id}` },
          dataCategories: row.data_categories, fields: row.fields,
        } as PrivacyRequest, decision: "allow", reason: "operator_approved_scoped_profile_read",
      });
      return { approved: true, expiresInMs: 5 * 60 * 1000 };
    }
    await client.query(
      `UPDATE privacy_profile_read_requests SET status = 'rejected', decided_at = now() WHERE id = $1`,
      [input.requestId],
    );
    await client.query("COMMIT");
    await audit({
      workspaceId: input.workspaceId, userId: input.userId, eventType: "profile_read_rejected",
      operationId: input.requestId, decision: "deny", reason: "operator_rejected",
    });
    return { approved: false };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
