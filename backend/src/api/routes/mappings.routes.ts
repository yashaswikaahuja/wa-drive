import { Router, Request, Response } from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../../data');
const MAPPINGS_PATH = resolve(DATA_DIR, 'form_mappings.json');

function load(): Record<string, object> {
  if (!existsSync(MAPPINGS_PATH)) return {};
  try { return JSON.parse(readFileSync(MAPPINGS_PATH, 'utf8')); } catch { return {}; }
}
function save(data: Record<string, object>) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(MAPPINGS_PATH, JSON.stringify(data, null, 2));
}

// GET /api/mappings/:formKey — get saved mapping for a form
router.get('/:formKey', (req: Request, res: Response) => {
  const mappings = load();
  res.json(mappings[req.params.formKey] || null);
});

// POST /api/mappings/:formKey — save mapping for a form
router.post('/:formKey', (req: Request, res: Response) => {
  const mappings = load();
  mappings[req.params.formKey] = { ...req.body, savedAt: new Date().toISOString() };
  save(mappings);
  res.json({ ok: true });
});

// GET /api/mappings — list all saved form mappings
router.get('/', (_req: Request, res: Response) => {
  res.json(Object.keys(load()));
});

export default router;
