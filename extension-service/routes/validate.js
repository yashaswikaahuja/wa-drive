// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation Engine REST API (Phase 2.4, Issue #88)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Standalone validation — check records before persisting.
//
// Endpoints:
//   POST /api/validate         — validate a record (dry-run, no persist)
//   POST /api/validate/batch   — validate multiple records
//   POST /api/validate/transition — check if a status transition is valid
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { validate, detectConflicts, validateTransition } from '../validation-engine.js';

const router = Router();

// ── Validate single record (dry-run) ────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const record = req.body;
    if (!record || typeof record !== 'object') {
      return res.status(400).json({ error: 'Request body must be a knowledge record object' });
    }
    const result = validate(record, req.body._options || {});
    res.json({
      valid: result.valid,
      errors: result.errors,
      error_count: result.errors.length,
      critical_count: result.errors.filter(e => e.severity === 'critical').length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Validate batch ──────────────────────────────────────────────────
router.post('/batch', authMiddleware, async (req, res) => {
  try {
    const records = req.body?.records;
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'Request body must have a records array' });
    }
    if (records.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 records per batch' });
    }

    const results = records.map((record, index) => {
      const result = validate(record);
      return { index, valid: result.valid, error_count: result.errors.length, errors: result.errors };
    });

    const validCount = results.filter(r => r.valid).length;
    res.json({
      total: records.length,
      valid: validCount,
      invalid: records.length - validCount,
      results,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Validate status transition ──────────────────────────────────────
router.post('/transition', authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.body || {};
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to statuses are required' });
    }
    const errors = validateTransition(from, to);
    res.json({
      valid: errors.length === 0,
      from,
      to,
      errors,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
