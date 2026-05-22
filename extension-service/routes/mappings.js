import { Router } from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || resolve(__dirname, '../data');
const MAPPINGS_PATH = resolve(DATA_DIR, 'form_mappings.json');

function load() {
  if (!existsSync(MAPPINGS_PATH)) return {};
  try { return JSON.parse(readFileSync(MAPPINGS_PATH, 'utf8')); } catch { return {}; }
}
function save(data) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(MAPPINGS_PATH, JSON.stringify(data, null, 2));
}

// GET /api/mappings — list all form keys
router.get('/', (_req, res) => {
  res.json(Object.keys(load()));
});

// GET /api/mappings/:formKey
router.get('/:formKey', (req, res) => {
  const mappings = load();
  res.json(mappings[req.params.formKey] || null);
});

// POST /api/mappings/:formKey — save/update with confidence
router.post('/:formKey', (req, res) => {
  const { updates } = req.body || {};
  if (!updates) return res.status(400).json({ error: 'updates required' });
  const mappings = load();
  const formKey = req.params.formKey;
  if (!mappings[formKey]) mappings[formKey] = {};
  const today = new Date().toISOString().slice(0, 10);
  for (const [semanticKey, info] of Object.entries(updates)) {
    const { profileKey, delta = {} } = info;
    const existing = mappings[formKey][semanticKey];
    if (existing) {
      existing.fills = (existing.fills || 0) + (delta.fills || 0);
      existing.corrections = (existing.corrections || 0) + (delta.corrections || 0);
      existing.profileKey = profileKey;
      existing.lastSeen = today;
    } else {
      mappings[formKey][semanticKey] = {
        profileKey,
        fills: delta.fills || 0.5,
        corrections: delta.corrections || 0,
        lastSeen: today,
      };
    }
  }
  save(mappings);
  res.json({ ok: true });
});

export default router;
