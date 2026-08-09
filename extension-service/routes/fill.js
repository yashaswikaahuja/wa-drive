import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { generateFillPlan, handleObservation, validateSnapshot, deriveScope } from '../fill-planner.js';
import { mapUnknownFields } from '../semantic-mapper.js';

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

    const scope = deriveScope(snapshot);

    // DEBUG: log fillable nodes (those with type_text/select affordances)
    const allNodes = Object.values(snapshot.nodes || {});
    const fillable = allNodes.filter(n => {
      const aff = (n.affordances || []);
      return aff.some(a => ['type_text','select_one','select_many','toggle'].includes(a));
    });
    const nodeNames = fillable.slice(0, 20).map(n => ({
      id: n.node_id,
      name: n.observed?.accessible_name || '(none)',
      aff: (n.affordances || []).join(','),
    }));
    console.log('[fill-plan DEBUG] scope:', JSON.stringify(scope));
    console.log('[fill-plan DEBUG] total nodes:', allNodes.length, 'fillable:', fillable.length);
    console.log('[fill-plan DEBUG] fillable sample:', JSON.stringify(nodeNames));
    console.log('[fill-plan DEBUG] profile keys:', Object.keys(profile).slice(0, 20).join(', '));

    // Generate the fill plan using server-side intelligence
    let planResult = await generateFillPlan({
      snapshot,
      workspace_id: req.user.workspaceId,
      phone: null,
      person_key: null,
      profile_overrides: profile,
    });

    // ── Cold-start semantic mapping ─────────────────────────────────
    // If the planner found no mappings (all fields unmapped), invoke AI
    // semantic mapper to learn new field→profileKey associations.
    const unmappedCount = planResult.diagnostics?.unmapped_count || 0;
    const mappedCount = planResult.diagnostics?.mapped_count || 0;

    if (mappedCount === 0 && unmappedCount > 0) {
      // Extract unmapped nodes from snapshot for AI mapping
      const nodes = snapshot.nodes || {};
      const unmappedFields = Object.values(nodes).filter(n => {
        const aff = n.affordances || [];
        return aff.some(a => ['type_text', 'select_one', 'select_many', 'toggle'].includes(a));
      });

      if (unmappedFields.length > 0) {
        const pageContext = {
          page_title: snapshot.page?.title || '',
          page_url: snapshot.page?.origin || '',
          form_heading: snapshot.page?.route_key || '',
          portal_id: scope.portal_id,
          form_key: scope.form_key,
          language: snapshot.page?.language || 'en',
        };

        const mapResult = await mapUnknownFields({
          fields: unmappedFields,
          pageContext,
          scope: { ...scope, organization_id: req.user.workspaceId },
          requesterId: req.user.userId,
        });

        // If AI produced mappings, retry the fill plan (new knowledge records exist)
        if (mapResult.ok && mapResult.mappings.length > 0) {
          planResult = await generateFillPlan({
            snapshot,
            workspace_id: req.user.workspaceId,
            phone: null,
            person_key: null,
            profile_overrides: profile,
          });
          // Attach semantic mapping diagnostics
          planResult.diagnostics = {
            ...planResult.diagnostics,
            semantic_mapping: {
              strategy: mapResult.strategy,
              mapped: mapResult.mappings.length,
              excluded: mapResult.excluded.length,
            },
          };
        } else {
          // Attach why semantic mapping didn't produce results
          planResult.diagnostics = {
            ...planResult.diagnostics,
            semantic_mapping: {
              strategy: mapResult.strategy,
              mapped: 0,
              excluded: mapResult.excluded?.length || 0,
              note: mapResult.strategy === 'no_ai_key' 
                ? 'No AI key configured — cannot map unknown fields'
                : mapResult.strategy === 'rate_limited'
                ? 'AI rate limited — retry later'
                : 'AI mapping produced no results',
            },
          };
        }
      }
    }

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
