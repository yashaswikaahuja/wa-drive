// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scope Resolution API (Phase 2.3, Issue #87)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Endpoints:
//   POST /api/resolve/one        — resolve single best record with explanation
//   POST /api/resolve/all        — resolve all matching records (de-duplicated)
//   POST /api/resolve/inherited  — resolve with full inheritance chain
//   POST /api/resolve/explain    — explain resolution without selecting
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { resolveOne, resolveAll, resolveWithInheritance } from '@cybercontrol/svc-knowledge';

const router = Router();

// ── Resolve single best record ──────────────────────────────────────
router.post('/one', authMiddleware, async (req, res) => {
  try {
    const context = req.body;
    if (!context?.kind) {
      return res.status(400).json({ error: 'kind is required in request body' });
    }
    const result = await resolveOne(context);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Resolve all matching (de-duplicated by entity) ──────────────────
router.post('/all', authMiddleware, async (req, res) => {
  try {
    const context = req.body;
    if (!context?.kind) {
      return res.status(400).json({ error: 'kind is required in request body' });
    }
    const result = await resolveAll(context);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Resolve with inheritance chain ──────────────────────────────────
router.post('/inherited', authMiddleware, async (req, res) => {
  try {
    const context = req.body;
    if (!context?.kind) {
      return res.status(400).json({ error: 'kind is required in request body' });
    }
    const result = await resolveWithInheritance(context);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Explain resolution (dry-run, shows all candidates + ranking) ────
router.post('/explain', authMiddleware, async (req, res) => {
  try {
    const context = req.body;
    if (!context?.kind) {
      return res.status(400).json({ error: 'kind is required in request body' });
    }
    // Resolve and include all metadata for debugging
    const result = await resolveOne(context);
    const allResult = await resolveAll(context);
    res.json({
      winner: result.record,
      explanation: result.explanation,
      conflicts: result.conflicts,
      inherited: result.inherited,
      all_candidates: allResult.records,
      total_evaluated: allResult.explanation.candidates_evaluated,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
