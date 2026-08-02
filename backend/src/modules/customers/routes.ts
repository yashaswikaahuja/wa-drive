import { Router } from 'express';
import multer from 'multer';
import { pool } from '../../db.js';
import { authMiddleware } from '../../middleware/auth.js';
import { getDriveForWorkspace, uploadFileToDrive } from '../drive/service.js';
import { autoExtractInBackground } from '../../services/extraction.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// GET /api/customers/households
router.get('/households', authMiddleware, async (req: any, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        primary_contact_phone as phone,
        COUNT(*) as person_count,
        ARRAY_AGG(json_build_object(
          'id', id,
          'name', name,
          'displayLabel', display_label,
          'relationship', relationship,
          'createdAt', created_at,
          'updatedAt', updated_at
        ) ORDER BY relationship = 'self' DESC, created_at) as persons
      FROM profiles
      WHERE workspace_id = $1 AND deleted_at IS NULL
      GROUP BY primary_contact_phone
      ORDER BY MAX(updated_at) DESC
    `, [req.user.workspaceId]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/customers/persons
router.post('/persons', authMiddleware, async (req: any, res) => {
  const { phone, name, relationship, displayLabel, data } = req.body;
  if (!phone || !name) return res.status(400).json({ error: 'phone and name required' });
  try {
    const { rows } = await pool.query(`
      INSERT INTO profiles (workspace_id, primary_contact_phone, name, display_label, relationship, data, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
    `, [req.user.workspaceId, phone, name, displayLabel || name, relationship || 'self', JSON.stringify(data || {}), req.user.userId]);
    res.json({ ok: true, id: rows[0].id });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/customers/persons/:id — full profile for a single person
router.get('/persons/:id', authMiddleware, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, primary_contact_phone as phone, name, display_label as "displayLabel",
              relationship, data, created_at as "createdAt", updated_at as "updatedAt"
       FROM profiles
       WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user.workspaceId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Person not found' });
    const person = rows[0];
    // Document-centric: derive fields from per-document extractions; operator edits (in data) win.
    try {
      const { deriveProfile } = await import('../../services/deriveProfile.js');
      const personKey = (person.displayLabel || person.name || '').toLowerCase().replace(/[^a-z\u0900-\u097F]/g, '').trim();
      const derived = await deriveProfile(req.user.workspaceId, person.phone, personKey, person.data || {});
      if (Object.keys(derived).length > 0) person.data = derived;
    } catch (e: any) { console.warn('[deriveProfile]', e.message); }
    res.json(person);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/customers/persons/:id
router.patch('/persons/:id', authMiddleware, async (req: any, res) => {
  const { fields, displayLabel, relationship } = req.body;
  try {
    const { rows } = await pool.query(
      "SELECT data FROM profiles WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
      [req.params.id, req.user.workspaceId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Person not found' });
    const current = rows[0].data || {};
    const merged: any = { ...current };
    if (fields) {
      const now = new Date().toISOString();
      for (const [key, info] of Object.entries(fields)) {
        const fieldInfo = info as any;
        merged[key] = {
          value: fieldInfo.value,
          source: fieldInfo.source || 'manual',
          documentId: fieldInfo.documentId || null,
          confidence: fieldInfo.confidence || 1.0,
          confirmedBy: req.user.userId,
          confirmedAt: now,
        };
      }
    }
    const updates = ['data = $1::jsonb', 'updated_by = $2', 'updated_at = now()'];
    const params: any[] = [JSON.stringify(merged), req.user.userId];
    let pi = 3;
    if (displayLabel !== undefined) { updates.push(`display_label = $${pi}`); params.push(displayLabel); pi++; }
    if (relationship !== undefined) { updates.push(`relationship = $${pi}`); params.push(relationship); pi++; }
    params.push(req.params.id, req.user.workspaceId);
    await pool.query(`UPDATE profiles SET ${updates.join(', ')} WHERE id = $${pi} AND workspace_id = $${pi + 1}`, params);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/customers/persons/:id — soft delete a single person
router.delete('/persons/:id', authMiddleware, async (req: any, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE profiles SET deleted_at = now() WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
      [req.params.id, req.user.workspaceId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Person not found' });
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/customers/households/:phone — soft delete all persons for a phone
router.delete('/households/:phone', authMiddleware, async (req: any, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    const { rowCount } = await pool.query(
      "UPDATE profiles SET deleted_at = now() WHERE primary_contact_phone = $1 AND workspace_id = $2 AND deleted_at IS NULL",
      [phone, req.user.workspaceId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Household not found' });
    res.json({ ok: true, deleted: rowCount });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/customers/group-docs/:phone — group a phone's documents by extracted name
// Each ID doc's cached extraction has a 'name'. Docs with the same (fuzzy) name belong
// to the same applicant. Nameless docs (photo/signature/aadhaar-back) are returned ungrouped
// for the operator to assign manually.
router.get('/group-docs/:phone', authMiddleware, async (req: any, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    const { rows } = await pool.query(
      `SELECT d.id, d.file_name as "fileName", d.tag, d.uploaded_at as "uploadedAt", e.suggested
       FROM drive_files d
       LEFT JOIN extraction_cache e ON e.file_id = d.id
       WHERE d.workspace_id = $1 AND d.customer_id = $2
       ORDER BY d.uploaded_at DESC`,
      [req.user.workspaceId, phone]
    );

    const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z\u0900-\u097F]/g, '').trim();
    // similarity: one name contained in the other, or share first+last token
    function lev(x: string, y: string): number {
      const m = x.length, n = y.length;
      const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0)));
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
        dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1] + (x[i-1] === y[j-1] ? 0 : 1));
      return dp[m][n];
    }
    function sameName(a: string, b: string): boolean {
      const na = norm(a), nb = norm(b);
      if (!na || !nb) return false;
      if (na === nb) return true;
      if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
      // Whole-name fuzzy (OCR typos): small edit distance relative to length
      const maxLen = Math.max(na.length, nb.length);
      const dist = lev(na, nb);
      if (maxLen >= 6 && dist <= 2) return true;
      if (maxLen >= 10 && dist <= 3) return true;
      // Token overlap with near-matches
      const ta = a.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
      const tb = b.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
      let exact = 0, near = 0;
      for (const x of ta) for (const y of tb) {
        if (x === y) exact++;
        else if (Math.max(x.length, y.length) >= 4 && lev(x, y) <= 2) near++;
      }
      return exact >= 2 || (exact >= 1 && near >= 1) || (near >= 2);
    }

    const groups: { name: string; docs: any[] }[] = [];
    const ungrouped: any[] = [];

    for (const d of rows) {
      const name = d.suggested?.name?.value || d.suggested?.name || '';
      const doc = { id: d.id, fileName: d.fileName, tag: d.tag, hasName: !!name, name };
      if (!name) { ungrouped.push(doc); continue; }
      const g = groups.find(grp => sameName(grp.name, name));
      if (g) { g.docs.push(doc); if (name.length > g.name.length) g.name = name; }
      else groups.push({ name, docs: [doc] });
    }

    res.json({ groups, ungrouped });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/customers/upload — operator uploads a hardcopy scan for a customer
router.post('/upload', authMiddleware, upload.single('file') as any, async (req: any, res) => {
  const { phone, personName } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  if (!req.file) return res.status(400).json({ error: 'No file attached' });

  const wsId = req.user.workspaceId;
  try {
    const drive = await getDriveForWorkspace(wsId);
    if (!drive) return res.status(500).json({ error: 'Drive not connected' });

    const fileName = `${phone}_${Date.now()}_${req.file.originalname || 'scan.jpg'}`;
    const mimetype = req.file.mimetype || 'image/jpeg';
    const { fileId, webContentLink } = await uploadFileToDrive(drive, req.file.buffer, fileName, mimetype, phone, personName || 'Operator Upload');

    // Insert into drive_files
    await pool.query(
      `INSERT INTO drive_files(id, workspace_id, file_name, customer_id, customer_name, file_url, uploaded_at)
       VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(id) DO NOTHING`,
      [fileId, wsId, fileName, phone, personName || '', `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`]
    );

    // Auto-extract in background
    autoExtractInBackground(req.file.buffer, fileId, wsId, mimetype, phone);

    res.json({ ok: true, fileId, fileName });
  } catch (e: any) {
    console.error('[Customers] upload error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/customers/share/:personId — generate a share token for a profile
router.post('/share/:personId', authMiddleware, async (req: any, res) => {
  const { personId } = req.params;
  const { targetEmail, targetPhone } = req.body;
  const wsId = req.user.workspaceId;
  try {
    const { rows: profiles } = await pool.query(
      'SELECT id, primary_contact_phone, name, display_label, relationship, data FROM profiles WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL',
      [personId, wsId]
    );
    if (!profiles.length) return res.status(404).json({ error: 'Person not found' });
    const profile = profiles[0];

    // Derive full profile data (merges extraction_cache + overrides)
    let fullData = profile.data || {};
    try {
      const { deriveProfile } = await import('../../services/deriveProfile.js');
      const personKey = (profile.display_label || profile.name || '').toLowerCase().replace(/[^a-z\u0900-\u097F]/g, '').trim();
      const derived = await deriveProfile(wsId, profile.primary_contact_phone, personKey, fullData);
      if (Object.keys(derived).length > 0) fullData = derived;
    } catch {}

    // Generate token
    const crypto = await import('crypto');
    const token = crypto.randomBytes(16).toString('hex');
    await pool.query(
      `INSERT INTO profile_shares(token, source_workspace_id, profile_id, phone, created_by, snapshot_data, target_email, target_phone)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
      [token, wsId, personId, profile.primary_contact_phone, req.user.userId,
       JSON.stringify({ ...fullData, _name: profile.display_label || profile.name, _relationship: profile.relationship || 'self' }),
       targetEmail || null, targetPhone || null]
    );
    res.json({ ok: true, token, expiresIn: '7 days' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/customers/shared/:token — public link to view shared profile (no auth required)
router.get('/shared/:token', async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.token, s.phone, s.snapshot_data, s.expires_at, s.created_at,
              p.display_label, p.name, p.relationship
       FROM profile_shares s JOIN profiles p ON p.id = s.profile_id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invalid or expired share link' });
    const share = rows[0];
    const data = share.snapshot_data || {};
    const { _name, _relationship, ...fields } = data;
    res.json({
      name: share.display_label || share.name || _name || '',
      phone: share.phone,
      relationship: share.relationship || _relationship || 'self',
      fields,
      expiresAt: share.expires_at,
      createdAt: share.created_at,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/customers/import-shared — import a shared profile into this workspace
router.post('/import-shared', authMiddleware, async (req: any, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  const wsId = req.user.workspaceId;
  try {
    const { rows: shares } = await pool.query(
      `SELECT s.*, p.name, p.display_label, p.primary_contact_phone, p.relationship
       FROM profile_shares s JOIN profiles p ON p.id = s.profile_id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [token]
    );
    if (!shares.length) return res.status(404).json({ error: 'Invalid or expired share token' });
    const share = shares[0];
    if (share.source_workspace_id === wsId) return res.status(400).json({ error: 'Cannot import to same workspace' });

    // Check target restriction (if set)
    if (share.target_email || share.target_phone) {
      // Verify the importer's workspace matches the target
      const { rows: wsUsers } = await pool.query(
        'SELECT email, phone FROM users WHERE workspace_id = $1',
        [wsId]
      );
      const emails = wsUsers.map((u: any) => (u.email || '').toLowerCase());
      const phones = wsUsers.map((u: any) => (u.phone || '').replace(/\D/g, ''));
      const targetEmailMatch = share.target_email && emails.includes(share.target_email.toLowerCase());
      const targetPhoneMatch = share.target_phone && phones.some((p: string) => p.endsWith(share.target_phone.replace(/\D/g, '').slice(-10)));
      if (!targetEmailMatch && !targetPhoneMatch) {
        return res.status(403).json({ error: 'This share is restricted to a specific recipient' });
      }
    }

    // Check if profile already exists
    const { rows: existing } = await pool.query(
      `SELECT id FROM profiles WHERE workspace_id = $1 AND primary_contact_phone = $2 AND display_label = $3 AND deleted_at IS NULL`,
      [wsId, share.primary_contact_phone, share.display_label || share.name]
    );
    if (existing.length) return res.status(409).json({ error: 'Profile already exists in your workspace' });

    // Build full data from snapshot — mark all fields as 'shared' source so deriveProfile respects them
    const snapshot = share.snapshot_data || {};
    const { _name, _relationship, ...fields } = snapshot;
    const profileData: any = {};
    for (const [k, v] of Object.entries(fields)) {
      const fv = v as any;
      profileData[k] = typeof fv === 'object' && fv !== null
        ? { ...fv, source: 'shared' }
        : { value: fv, source: 'shared', confidence: 0.9 };
    }

    // Create profile with full data
    const { rows: [newProfile] } = await pool.query(
      `INSERT INTO profiles(workspace_id, primary_contact_phone, name, display_label, relationship, data, created_by)
       VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [wsId, share.primary_contact_phone, share.name || _name, share.display_label || _name, share.relationship || _relationship || 'self', JSON.stringify(profileData), req.user.userId]
    );

    // Mark share as used
    await pool.query('UPDATE profile_shares SET used_by_workspace_id = $1, used_at = now() WHERE id = $2', [wsId, share.id]);

    const fieldCount = Object.keys(profileData).length;
    res.json({ ok: true, profileId: newProfile.id, name: share.display_label || share.name || _name, fieldsImported: fieldCount });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
