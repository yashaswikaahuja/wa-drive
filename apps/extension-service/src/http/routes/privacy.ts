import { Router } from "express";
import { authMiddleware } from "../auth.js";
import {
  consumeAuthorization,
  createConsent,
  issueAuthorization,
  listConsents,
  revokeConsent,
} from "../../privacy/service.js";

const router = Router();
router.use(authMiddleware);
router.use((req: any, res: any, next: any) => {
  if (typeof req.user?.userId !== "string" || !req.user.userId.trim()) {
    return res.status(401).json({ error: "authenticated_user_required" });
  }
  next();
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
