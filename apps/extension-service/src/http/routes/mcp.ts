/**
 * POST /api/mcp
 * Streamable HTTP MCP. Auth is the same workspace bearer as /api/browser-task.
 * The signed-in extension performs each tool in the operator's Chrome.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { userFromAuthorization } from '../auth.js';
import { executeBrowserTask } from './browser-task.js';
import { listWorkspaceProfiles, readWorkspaceProfile } from './profiles.js';
import {
  getWorkspaceProfilePolicy, listMcpProfileSessions, createProfileReadRequest,
  issueAuthorization, consumeAuthorization,
} from '../../privacy/service.js';
import { respondToMcp } from '../mcp-rpc.js';
import { mountOAuth, unauthorized } from '../mcp-oauth.js';

const router = Router();
mountOAuth(router);

function wantsSse(accept: string) {
  return accept.includes('text/event-stream') && !accept.includes('application/json') && !accept.includes('*/*');
}

router.post('/', async (req: any, res: any) => {
  const parsed = userFromAuthorization(req.headers.authorization || '');
  if (!parsed.ok) return unauthorized(req, res, parsed.error);
  const accept = String(req.headers.accept || '');
  if (accept && !accept.includes('application/json') && !accept.includes('text/event-stream') && !accept.includes('*/*')) {
    return res.status(406).json({ error: 'accept must include application/json or text/event-stream' });
  }
  const outcome = await respondToMcp(req.body, parsed.user.workspaceId, executeBrowserTask, {
    listProfiles: listWorkspaceProfiles,
    readProfile: async (profileId: string, requestedFields: string[]) => {
      const { workspaceId, userId, mcpClientId, mcpClientName, mcpSessionId } = parsed.user as any;
      if (!mcpClientId || !mcpSessionId) return { error: 'mcp_client_session_required' };
      const policy = await getWorkspaceProfilePolicy(workspaceId);
      if (policy.allowMcpProfileRead !== true) return { error: 'workspace_policy_disabled' };
      const sessions = await listMcpProfileSessions(workspaceId, userId);
      const session = sessions.find((item: any) => item.sessionId === mcpSessionId);
      if (!session || session.profileAccessEnabled !== true) return { error: 'operator_session_permission_disabled' };

      const profile = await readWorkspaceProfile(workspaceId, profileId);
      if (!profile) return { error: 'profile_not_found' };
      const available = profile.fields && typeof profile.fields === 'object' ? profile.fields : {};
      const secretKey = /(password|passcode|otp|one.?time|captcha|payment|card.?number|cvv|security.?code|pin|secret|token)/i;
      const safeAvailable = Object.keys(available).filter((key) => !secretKey.test(key));
      const invalid = requestedFields.filter((field) => !safeAvailable.includes(field));
      if (invalid.length) return { error: 'field_not_available_or_prohibited', invalidFields: invalid };
      const fields = [...new Set(requestedFields)];
      const categories = [...new Set(fields.map((field) => {
        if (/(aadhaar|aadhar|pan|passport|voter|identity|document.?number|id.?number)/i.test(field)) return 'government_id';
        if (/(dob|birth|date.?of.?birth|age)/i.test(field)) return 'date_of_birth';
        if (/(address|street|district|state|city|pin.?code|postal)/i.test(field)) return 'address';
        if (/(income|salary|bank|account|ifsc|financial|amount)/i.test(field)) return 'financial';
        if (/(school|college|education|qualification|degree|marks|university)/i.test(field)) return 'education';
        if (/(phone|mobile|email|contact)/i.test(field)) return 'contact_details';
        return 'customer_identity';
      }))];

      const operationId = randomUUID();
      const request = {
        action: 'read_customer_profile', purpose: 'form_filling', operationId,
        workspaceId, userId, dataSubjectId: profileId, dataSubjectConsentConfirmed: true,
        recipient: { id: mcpClientId, displayName: mcpClientName || 'MCP client', endpoint: `mcp-session:${mcpSessionId}` },
        dataCategories: categories, fields,
      };
      const issued = await issueAuthorization({ workspaceId, userId, body: request });
      if (!issued.ok) {
        const pending = await createProfileReadRequest({
          workspaceId, userId, sessionId: mcpSessionId, clientId: mcpClientId,
          clientName: mcpClientName || 'MCP client', profileId,
          profileLabel: profile.displayLabel || profile.name || 'Customer',
          fields, dataCategories: categories,
        });
        return {
          error: 'approval_required',
          requestId: pending.id,
          profileLabel: pending.profileLabel,
          fields: pending.fields,
          dataCategories: pending.dataCategories,
          message: 'Ask the operator to approve this exact customer and field scope in the CyberControl extension, then retry read_profile.',
        };
      }
      // Re-check both gates immediately before consuming the single-use authorization.
      const latestPolicy = await getWorkspaceProfilePolicy(workspaceId);
      const latestSessions = await listMcpProfileSessions(workspaceId, userId);
      const latestSession = latestSessions.find((item: any) => item.sessionId === mcpSessionId);
      if (latestPolicy.allowMcpProfileRead !== true || !latestSession || latestSession.profileAccessEnabled !== true) {
        return { error: 'profile_access_revoked' };
      }
      const consumed = await consumeAuthorization({
        workspaceId, userId, token: issued.authorization.token, operationId,
      });
      if (!consumed || consumed.request?.dataSubjectId !== profileId ||
          consumed.request?.recipient?.id !== mcpClientId ||
          consumed.request?.recipient?.endpoint !== `mcp-session:${mcpSessionId}`) {
        return { error: 'authorization_invalid_expired_or_consumed' };
      }
      const returnedFields: Record<string, string> = {};
      for (const field of fields) returnedFields[field] = String(available[field] ?? '');
      return { profileId, displayLabel: profile.displayLabel || profile.name || 'Customer', fields: returnedFields };
    },
  });
  if (outcome.kind === 'accept') return res.status(202).end();
  if (wantsSse(accept)) {
    res.status(outcome.status);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.write(`event: message\ndata: ${JSON.stringify(outcome.body)}\n\n`);
    return res.end();
  }
  return res.status(outcome.status).json(outcome.body);
});

export default router;
