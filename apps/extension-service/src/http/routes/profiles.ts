import { Router } from 'express';
import { pool } from '../../db/db.js';
import { authMiddleware } from '../auth.js';
import { deriveProfile, deriveProfilesForWorkspace } from '@cybercontrol/svc-fill-planner';

const router = Router();

export async function listWorkspaceProfiles(workspaceId: string) {
  const { rows } = await pool.query(`
    SELECT id, name, primary_contact_phone AS phone, display_label AS "displayLabel",
           CASE
             WHEN length(regexp_replace(COALESCE(primary_contact_phone, ''), '[^0-9]', '', 'g')) >= 4
             THEN right(regexp_replace(COALESCE(primary_contact_phone, ''), '[^0-9]', '', 'g'), 4)
             ELSE NULL
           END AS "phoneLast4",
           relationship, updated_at AS "updatedAt", data
    FROM profiles
    WHERE workspace_id = $1 AND deleted_at IS NULL
    ORDER BY updated_at DESC
  `, [workspaceId]);
  return deriveProfilesForWorkspace(workspaceId, rows);
}

function fieldValue(value: any) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).slice(0, 300);
  if (typeof value === 'object' && value && value.value != null && value.value !== '') return String(value.value).slice(0, 300);
  return '';
}

async function loadFullProfile(workspaceId: string, profileId: string) {
  const { rows } = await pool.query(`
    SELECT id, name, primary_contact_phone AS phone, display_label AS "displayLabel",
           relationship, data, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM profiles
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
  `, [profileId, workspaceId]);
  if (!rows.length) return null;
  const profile = rows[0];
  try {
    const personKey = (profile.displayLabel || profile.name || '')
      .toLowerCase().replace(/[^a-z\u0900-\u097F]/g, '').trim();
    const derived = await deriveProfile(workspaceId, profile.phone, personKey, profile.data || {});
    if (Object.keys(derived).length > 0) profile.data = derived;
  } catch (e: any) {
    console.warn('[ext/profiles] deriveProfile failed:', e.message);
  }
  return profile;
}

export async function readWorkspaceProfile(workspaceId: string, profileId: string) {
  const profile = await loadFullProfile(workspaceId, profileId);
  if (!profile) return null;
  const fields: any = {};
  const data = profile.data || {};
  for (const key of Object.keys(data)) {
    const shown = fieldValue(data[key]);
    if (shown) fields[key] = shown;
  }
  return {
    id: profile.id,
    name: profile.name,
    phone: profile.phone,
    displayLabel: profile.displayLabel,
    relationship: profile.relationship,
    updatedAt: profile.updatedAt,
    fields,
  };
}

// GET /api/profiles — list profiles for the authenticated workspace
router.get('/', authMiddleware, async ( req: any, res: any) => {
  try {
    res.json(await listWorkspaceProfiles(req.user.workspaceId));
  } catch (e) {
    console.error('[ext/profiles] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/profiles/:id — full profile (with data jsonb) for autofill
router.get('/:id', authMiddleware, async ( req: any, res: any) => {
  try {
    const profile = await loadFullProfile(req.user.workspaceId, req.params.id);
    if (!profile) return res.status(404).json({ error: 'Not found' });
    res.json(profile);
  } catch (e) {
    console.error('[ext/profiles] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
