import { Router } from "express";
import { authMiddleware } from "../auth.js";
import {
  consumeAuthorization,
  createConsent,
  issueAuthorization,
  listConsents,
  revokeConsent,
  getWorkspaceProfilePolicy,
  setWorkspaceProfilePolicy,
  listMcpProfileSessions,
  setMcpProfileSessionPermission,
  listProfileReadRequests,
  decideProfileReadRequest,
} from "../../privacy/service.js";

const router = Router();
router.use(authMiddleware);
router.use((req: any, res: any, next: any) => {
  if (typeof req.user?.userId !== "string" || !req.user.userId.trim()) {
    return res.status(401).json({ error: "authenticated_user_required" });
  }
  next();
});


router.get("/profile-policy", async (req: any, res: any) => {
  try {
    res.json(await getWorkspaceProfilePolicy(req.user.workspaceId));
  } catch (error: any) {
    console.error("[privacy] get profile policy failed:", error.message);
    res.status(500).json({ error: "privacy_storage_error" });
  }
});

router.patch("/profile-policy", async (req: any, res: any) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "workspace_admin_required" });
  if (typeof req.body?.allowMcpProfileRead !== "boolean") {
    return res.status(400).json({ error: "allowMcpProfileRead_boolean_required" });
  }
  try {
    res.json(await setWorkspaceProfilePolicy(
      req.user.workspaceId, req.user.userId, req.body.allowMcpProfileRead,
    ));
  } catch (error: any) {
    console.error("[privacy] update profile policy failed:", error.message);
    res.status(500).json({ error: "privacy_storage_error" });
  }
});

router.get("/mcp-sessions", async (req: any, res: any) => {
  try {
    res.json({ sessions: await listMcpProfileSessions(req.user.workspaceId, req.user.userId) });
  } catch (error: any) {
    console.error("[privacy] list MCP sessions failed:", error.message);
    res.status(500).json({ error: "privacy_storage_error" });
  }
});

router.patch("/mcp-sessions/:id/profile-access", async (req: any, res: any) => {
  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "enabled_boolean_required" });
  try {
    const session = await setMcpProfileSessionPermission(
      req.user.workspaceId, req.user.userId, req.params.id, req.body.enabled,
    );
    if (!session) return res.status(404).json({ error: "mcp_session_not_found" });
    res.json({ session });
  } catch (error: any) {
    console.error("[privacy] update MCP session failed:", error.message);
    res.status(500).json({ error: "privacy_storage_error" });
  }
});

router.get("/profile-read-requests", async (req: any, res: any) => {
  try {
    res.json({ requests: await listProfileReadRequests(req.user.workspaceId, req.user.userId) });
  } catch (error: any) {
    console.error("[privacy] list profile requests failed:", error.message);
    res.status(500).json({ error: "privacy_storage_error" });
  }
});

router.post("/profile-read-requests/:id/decision", async (req: any, res: any) => {
  if (typeof req.body?.approve !== "boolean") return res.status(400).json({ error: "approve_boolean_required" });
  try {
    const result = await decideProfileReadRequest({
      workspaceId: req.user.workspaceId,
      userId: req.user.userId,
      requestId: req.params.id,
      approve: req.body.approve,
      customerInformed: req.body.customerInformed === true,
    });
    if (!result) return res.status(404).json({ error: "profile_read_request_expired_or_not_found" });
    if ("error" in result) return res.status(403).json({ error: result.error });
    res.json(result);
  } catch (error: any) {
    console.error("[privacy] decide profile request failed:", error.message);
    res.status(500).json({ error: "privacy_storage_error" });
  }
});

router.get("/consents", async (req: any, res: any) => {
  try {
    res.json({ consents: await listConsents(req.user.workspaceId, req.user.userId) });
  } catch (error: any) {
    console.error("[privacy] list consents failed:", error.message);
    res.status(500).json({ error: "privacy_storage_error" });
  }
});

router.post("/consents", async (req: any, res: any) => {
  try {
    const result = await createConsent({
      workspaceId: req.user.workspaceId,
      userId: req.user.userId,
      body: req.body || {},
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error: any) {
    console.error("[privacy] create consent failed:", error.message);
    res.status(500).json({ error: "privacy_storage_error" });
  }
});

router.delete("/consents/:id", async (req: any, res: any) => {
  try {
    const consent = await revokeConsent(req.user.workspaceId, req.user.userId, req.params.id);
    if (!consent) return res.status(404).json({ error: "consent_not_found_or_already_revoked" });
    res.json({ consent });
  } catch (error: any) {
    console.error("[privacy] revoke consent failed:", error.message);
    res.status(500).json({ error: "privacy_storage_error" });
  }
});

router.post("/authorizations/issue", async (req: any, res: any) => {
  try {
    const result = await issueAuthorization({
      workspaceId: req.user.workspaceId,
      userId: req.user.userId,
      body: req.body || {},
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.status(201).json(result);
  } catch (error: any) {
    console.error("[privacy] issue authorization failed:", error.message);
    res.status(500).json({ error: "privacy_storage_error" });
  }
});

router.post("/authorizations/consume", async (req: any, res: any) => {
  try {
    const result = await consumeAuthorization({
      workspaceId: req.user.workspaceId,
      userId: req.user.userId,
      token: req.body?.token,
      operationId: req.body?.operationId,
    });
    if (!result) return res.status(403).json({ error: "authorization_invalid_expired_or_consumed" });
    res.json(result);
  } catch (error: any) {
    console.error("[privacy] consume authorization failed:", error.message);
    res.status(500).json({ error: "privacy_storage_error" });
  }
});

export default router;
