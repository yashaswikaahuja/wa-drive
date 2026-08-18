// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Knowledge Versioning API (Phase 2.6, Issue #90)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Endpoints:
//   POST   /api/versions/publish/:id     — publish draft → active
//   POST   /api/versions/promote/:id     — promote active → validated
//   POST   /api/versions/deprecate/:id   — deprecate record
//   POST   /api/versions/snapshot        — create snapshot
//   GET    /api/versions/snapshots       — list snapshots
//   POST   /api/versions/restore/:id     — restore from snapshot
//   POST   /api/versions/compatibility   — check compatibility
//   POST   /api/versions/migrate         — plan migration
//   GET    /api/versions/lineage/:id     — get lineage history
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import {
  publish, promote, deprecate,
  createSnapshot, listSnapshots, restoreSnapshot,
  checkCompatibility, planMigration, getLineageHistory,
} from '../../engines/knowledge-versioning.js';

const router = Router();

// ── Lifecycle ───────────────────────────────────────────────────────

router.post('/publish/:id', authMiddleware, async (req, res) => {
  try {
    const result = await publish(req.params.id);
    res.json(result);
  } catch (e) {
    const status = e.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: e.message });
  }
});

router.post('/promote/:id', authMiddleware, async (req, res) => {
  try {
    const result = await promote(req.params.id);
    res.json(result);
  } catch (e) {
    const status = e.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: e.message });
  }
});

router.post('/deprecate/:id', authMiddleware, async (req, res) => {
  try {
    const result = await deprecate(req.params.id);
    res.json(result);
  } catch (e) {
    const status = e.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: e.message });
  }
});

// ── Snapshots ───────────────────────────────────────────────────────

router.post('/snapshot', authMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await createSnapshot(name, description, req.user?.userId);
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/snapshots', authMiddleware, async (req, res) => {
  try {
    const snapshots = await listSnapshots();
    res.json({ snapshots, count: snapshots.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/restore/:id', authMiddleware, async (req, res) => {
  try {
    const result = await restoreSnapshot(req.params.id);
    res.json(result);
  } catch (e) {
    const status = e.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
});

// ── Compatibility ───────────────────────────────────────────────────

router.post('/compatibility', authMiddleware, async (req, res) => {
  try {
    const { record, existing_records } = req.body || {};
    if (!record) return res.status(400).json({ error: 'record is required' });
    const result = checkCompatibility(record, existing_records || []);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Migration ───────────────────────────────────────────────────────

router.post('/migrate', authMiddleware, async (req, res) => {
  try {
    const { from_version, to_version, changes } = req.body || {};
    if (!from_version || !to_version) {
      return res.status(400).json({ error: 'from_version and to_version are required' });
    }
    const result = await planMigration(from_version, to_version, changes || []);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Lineage ─────────────────────────────────────────────────────────

router.get('/lineage/:id', authMiddleware, async (req, res) => {
  try {
    const result = await getLineageHistory(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
