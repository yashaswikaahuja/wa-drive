// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Knowledge Store REST API (Phase 2.2, Issue #86)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Endpoints:
//   POST   /api/knowledge           — create a record
//   GET    /api/knowledge/:id       — get by ID
//   GET    /api/knowledge           — query (filtered)
//   PATCH  /api/knowledge/:id       — update (creates new version)
//   DELETE /api/knowledge/:id       — deprecate (soft delete)
//   DELETE /api/knowledge/:id/hard  — hard delete (drafts only)
//   GET    /api/knowledge/lineage/:lineageId — version history
//   POST   /api/knowledge/resolve   — scope-aware resolution
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import * as store from '@cybercontrol/svc-knowledge';

const router = Router();

// ── Create ──────────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const record = req.body;
    if (!record || !record.kind) {
      return res.status(400).json({ error: 'Request body must include kind, scope, source, payload' });
    }
    const created = await store.create(record);
    res.status(201).json(created);
  } catch (e) {
    const status = e.message.startsWith('Validation') ? 400 : 500;
    res.status(status).json({ error: e.message });
  }
});

// ── Get by ID ───────────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const record = await store.getById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    res.json(record);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Query (filtered) ────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { kind, status, portal_id, form_key, organization_id, country, tags, limit, offset } = req.query;
    const results = await store.query({
      kind,
      status,
      scope: { portal_id, form_key, organization_id, country },
      tags: tags ? tags.split(',') : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ records: results, count: results.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update (creates new version) ────────────────────────────────────
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const changes = req.body;
    if (!changes || typeof changes !== 'object') {
      return res.status(400).json({ error: 'Request body must be an object with changes' });
    }
    const updated = await store.update(req.params.id, changes);
    res.json(updated);
  } catch (e) {
    const status = e.message.includes('not found') ? 404 : e.message.startsWith('Validation') ? 400 : 500;
    res.status(status).json({ error: e.message });
  }
});

// ── Deprecate (soft delete) ─────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await store.deprecate(req.params.id);
    res.json(result);
  } catch (e) {
    const status = e.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
});

// ── Hard delete (drafts only) ───────────────────────────────────────
router.delete('/:id/hard', authMiddleware, async (req, res) => {
  try {
    const result = await store.remove(req.params.id);
    res.json(result);
  } catch (e) {
    const status = e.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
});

// ── Lineage (version history) ───────────────────────────────────────
router.get('/lineage/:lineageId', authMiddleware, async (req, res) => {
  try {
    const records = await store.getByLineage(req.params.lineageId);
    res.json({ records, count: records.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Resolve (scope-aware best match) ────────────────────────────────
router.post('/resolve', authMiddleware, async (req, res) => {
  try {
    const { kind, portal_id, form_key, organization_id, country, single } = req.body;
    if (!kind) return res.status(400).json({ error: 'kind is required' });

    if (single) {
      const record = await store.resolveOne({ kind, portal_id, form_key, organization_id, country });
      res.json({ record });
    } else {
      const records = await store.resolveAll({ kind, portal_id, form_key, organization_id, country });
      res.json({ records, count: records.length });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
