import { Router } from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../../data');
const ADAPTERS_PATH = resolve(DATA_DIR, 'adapters.json');
function load() {
    if (!existsSync(ADAPTERS_PATH))
        return {};
    try {
        return JSON.parse(readFileSync(ADAPTERS_PATH, 'utf8'));
    }
    catch {
        return {};
    }
}
function save(data) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(ADAPTERS_PATH, JSON.stringify(data, null, 2));
}
// GET /api/adapters — get all adapters
router.get('/', (req, res) => {
    res.json(load());
});
// DELETE /api/adapters/:hostname/:componentClass
router.delete('/:hostname/:componentClass', (req, res) => {
    const { hostname, componentClass } = req.params;
    const data = load();
    if (data[hostname]) {
        delete data[hostname][componentClass];
        if (Object.keys(data[hostname]).length === 0)
            delete data[hostname];
        save(data);
    }
    res.json({ ok: true });
});
// GET /api/adapters/:hostname — get all adapters for a hostname
router.get('/:hostname', (req, res) => {
    const store = load();
    res.json(store[req.params.hostname] || {});
});
// POST /api/adapters/:hostname — save/update an adapter
router.post('/:hostname', (req, res) => {
    const { componentClass, triggerSelector, optionsContainer, optionSelector, verifySelector } = req.body;
    if (!componentClass || !triggerSelector || !optionSelector) {
        res.status(400).json({ error: 'componentClass, triggerSelector, optionSelector required' });
        return;
    }
    const store = load();
    const hostname = req.params.hostname;
    if (!store[hostname])
        store[hostname] = {};
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
    save(store);
    res.json({ ok: true, adapter: store[hostname][componentClass] });
});
// PATCH /api/adapters/:hostname/:componentClass — update stats (success/failure/stale)
router.patch('/:hostname/:componentClass', (req, res) => {
    const { success, stale } = req.body;
    const store = load();
    const adapter = store[req.params.hostname]?.[req.params.componentClass];
    if (!adapter) {
        res.status(404).json({ error: 'adapter not found' });
        return;
    }
    if (success === true)
        adapter.successCount++;
    if (success === false)
        adapter.failureCount++;
    if (stale !== undefined)
        adapter.stale = stale;
    adapter.lastUsedAt = new Date().toISOString().slice(0, 10);
    save(store);
    res.json({ ok: true });
});
export default router;
//# sourceMappingURL=adapters.routes.js.map