// backend/src/api/routes/validation.routes.js (compiled to dist as .js)
'use strict';

const express = require('express');
const { validateAll, validateAdapter, getAllAdapters } = require('../../../tests/validate-adapters.js');

const router = express.Router();
const ADMIN_TOKEN = process.env.WORKER_SECRET || 'cybercontrol-worker-secret-2024';

function checkAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
}

let _running = false;

// GET /api/adapters/validate — validate all adapters
router.get('/validate', checkAuth, async (_req, res) => {
  if (_running) return res.json({ error: 'validation already running' });
  _running = true;
  try {
    const results = await validateAll();
    const summary = {
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      stale: results.filter(r => r.status === 'stale').length,
      error: results.filter(r => r.status === 'error').length,
      results,
    };
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    _running = false;
  }
});

// GET /api/adapters/validate/:hostname/:componentClass — validate one adapter
router.get('/validate/:hostname/:componentClass', checkAuth, async (req, res) => {
  const { hostname, componentClass } = req.params;
  const adapters = getAllAdapters();
  const adapter = adapters.find(a => a.hostname === hostname && a.componentClass === componentClass);
  if (!adapter) return res.status(404).json({ error: 'adapter not found' });
  try {
    const result = await validateAdapter(adapter);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
