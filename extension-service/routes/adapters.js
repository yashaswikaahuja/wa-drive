import { Router } from 'express';
import { loadDoc, mutateDoc, KEYS } from '../store.js';

const router = Router();

const load = () => loadDoc(KEYS.ADAPTERS);
const mutate = (fn) => mutateDoc(KEYS.ADAPTERS, fn);

// GET /api/adapters — get all adapters
router.get('/', async (_req, res) => {
  res.json(await load());
});

// GET /api/adapters/:hostname
router.get('/:hostname', async (req, res) => {
  const store = await load();
  res.json(store[req.params.hostname] || {});
});

// POST /api/adapters/:hostname
router.post('/:hostname', async (req, res) => {
  const { componentClass, triggerSelector, optionsContainer, optionSelector, verifySelector } = req.body || {};
  if (!componentClass || !triggerSelector || !optionSelector) {
    return res.status(400).json({ error: 'componentClass, triggerSelector, optionSelector required' });
  }
  const hostname = req.params.hostname;
  let saved;
  await mutate((store) => {
    if (!store[hostname]) store[hostname] = {};
    const today = new Date().toISOString().slice(0, 10);
    const existing = store[hostname][componentClass];
    store[hostname][componentClass] = {
      componentClass,
      triggerSelector,
      optionsContainer: optionsContainer || '',
      optionSelector,
      verifySelector: verifySelector || '',
      adapterVersion: (existing?.adapterVersion || 0) + 1,
      learnedAt: existing?.learnedAt || today,
      lastUsedAt: today,
      successCount: existing?.successCount || 0,
      failureCount: existing?.failureCount || 0,
      stale: false,
    };
    saved = store[hostname][componentClass];
    return store;
  });
  res.json({ ok: true, adapter: saved });
});

// PATCH /api/adapters/:hostname/:componentClass
router.patch('/:hostname/:componentClass', async (req, res) => {
  const { success, stale } = req.body || {};
  let notFound = false;
  await mutate((store) => {
    const adapter = store[req.params.hostname]?.[req.params.componentClass];
    if (!adapter) { notFound = true; return store; }
    if (success === true) adapter.successCount++;
    if (success === false) adapter.failureCount++;
    if (stale !== undefined) adapter.stale = stale;
    adapter.lastUsedAt = new Date().toISOString().slice(0, 10);
    return store;
  });
  if (notFound) return res.status(404).json({ error: 'adapter not found' });
  res.json({ ok: true });
});

// DELETE /api/adapters/:hostname/:componentClass
router.delete('/:hostname/:componentClass', async (req, res) => {
  const { hostname, componentClass } = req.params;
  await mutate((data) => {
    if (data[hostname]) {
      delete data[hostname][componentClass];
      if (Object.keys(data[hostname]).length === 0) delete data[hostname];
    }
    return data;
  });
  res.json({ ok: true });
});

export default router;
