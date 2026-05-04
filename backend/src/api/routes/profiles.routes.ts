import { Router, Request, Response } from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../../data');
const PROFILES_PATH = resolve(DATA_DIR, 'profiles.json');

function load(): Record<string, object> {
  if (!existsSync(PROFILES_PATH)) return {};
  try { return JSON.parse(readFileSync(PROFILES_PATH, 'utf8')); } catch { return {}; }
}
function save(data: Record<string, object>) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PROFILES_PATH, JSON.stringify(data, null, 2));
}

// GET /api/profiles — list all profiles
router.get('/', (_req: Request, res: Response) => {
  res.json(Object.values(load()));
});

// GET /api/profiles/:phone — get profile by phone
router.get('/:phone', (req: Request, res: Response) => {
  const profiles = load();
  const profile = profiles[req.params.phone];
  if (!profile) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(profile);
});

// POST /api/profiles — save/update profile
router.post('/', (req: Request, res: Response) => {
  const profile = req.body as { phone: string; [key: string]: string };
  if (!profile.phone) { res.status(400).json({ error: 'phone required' }); return; }
  const profiles = load();
  profiles[profile.phone] = { ...profiles[profile.phone], ...profile, updatedAt: new Date().toISOString() };
  save(profiles);
  res.json({ ok: true, profile: profiles[profile.phone] });
});

// DELETE /api/profiles/:phone
router.delete('/:phone', (req: Request, res: Response) => {
  const profiles = load();
  delete profiles[req.params.phone];
  save(profiles);
  res.json({ ok: true });
});

export default router;
