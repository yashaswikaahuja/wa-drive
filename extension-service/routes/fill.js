import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { generateFillPlan, handleObservation, validateSnapshot } from '../fill-planner.js';

const router = Router();

// ── POST /api/fill-plan ─────────────────────────────────────────────────
// Extension sends PageSnapshot + profile → server returns ActionPlan.
// Architecture: Extension = Eyes + Hands, Server = Brain + Memory + Knowledge.
router.post('/fill-plan', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  try {
    const { snapshot, profileId, profile } = req.body;

    if (!snapshot) {
      return res.status(400).json({ error: 'snapshot is required' });
    }
    if (!profile || Object.keys(profile).length === 0) {
      return res.status(400).json({ error: 'profile is required and must not be empty' });
    }

    // Validate snapshot structure before planning
    const validation = validateSnapshot(snapshot);
    if (!validation.valid) {
      return res.status(422).json({
        error: 'Invalid snapshot',
        details: validation.errors,
      });
    }

    // Generate the fill plan using server-side intelligence
    const planResult = await generateFillPlan({
      snapshot,
      workspace_id: req.user.workspaceId,
      phone: null, // Not needed when profile_overrides is provided
      person_key: null,
      profile_overrides: profile,
    });

    if (!planResult.success) {
      return res.status(200).json({
        plan: null,
        session: null,
        diagnostics: planResult.diagnostics,
      });
    }

    return res.json({
      plan: planResult.plan,
      session: { id: planResult.session_id },
      diagnostics: planResult.diagnostics,
    });
  } catch (err) {
    console.error('[fill-plan] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/fill-observation ──────────────────────────────────────────
// Extension reports execution results back to server for learning/tracking.
router.post('/fill-observation', authMiddleware, async (req, res) => {
  try {
    const { sessionId, planId, snapshot_id, outcome, steps } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'planId is required' });
    }

    // Record observation via fill-planner session tracking
    const result = handleObservation(sessionId, {
      plan_id: planId,
      snapshot_id: snapshot_id || null,
      outcome: outcome || 'unknown',
      step_results: (steps || []).map(s => ({
        step_id: s.step_id,
        status: s.status === 'succeeded' ? 'completed' : s.status,
        error_code: s.failure_code || null,
      })),
    });

    return res.json({
      acknowledged: result.acknowledged,
      session_status: result.session_status,
    });
  } catch (err) {
    console.error('[fill-observation] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
