/**
 * User management — admin-only, workspace-scoped.
 *
 * An admin (workspace owner) manages the operators/admins inside THEIR workspace only.
 * Every query is scoped to req.user.workspaceId; roles are constrained to admin|operator.
 * Guards prevent an admin from locking themselves out (no self role/status change or self-delete)
 * and from removing the workspace's last active admin.
 */
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool, auditLog, logActivity } from '../../db.js';
import { authMiddleware, requireRole } from '../../middleware/auth.js';

const router = Router();
const ROLES = ['admin', 'operator'];

// All routes below require an authenticated admin.
router.use(authMiddleware, requireRole('admin'));

// GET /api/users — list users in the caller's workspace
router.get('/', async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, role, status, created_at AS "createdAt"
       FROM users WHERE workspace_id = $1 AND deleted_at IS NULL
       ORDER BY (role = 'admin') DESC, created_at ASC`,
      [req.user.workspaceId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/users — create an operator (or admin) in the caller's workspace
router.post('/', async (req: any, res) => {
  let { name, email, phone, password, role } = req.body || {};
  role = ROLES.includes(role) ? role : 'operator';
  email = email ? String(email).trim().toLowerCase() : null;
  phone = phone ? String(phone).trim() : null;
  if (!password || (!email && !phone)) return res.status(400).json({ error: 'email or phone, and password required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (workspace_id, email, phone, password_hash, name, role, status)
       VALUES ($1,$2,$3,$4,$5,$6,'active')
       RETURNING id, name, email, phone, role, status, created_at AS "createdAt"`,
      [req.user.workspaceId, email, phone, hash, name || null, role]
    );
    await auditLog(req.user.workspaceId, req.user.userId, 'user_create', 'user', rows[0].id, { role, email, phone });
    logActivity(req.user.workspaceId, 'operator.added', { role }, req.user.userId);
    res.status(201).json(rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email or phone already in use' });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/users/:id — change role/status, or reset password (workspace-scoped)
router.patch('/:id', async (req: any, res) => {
  const { role, status, password } = req.body || {};
  if (req.params.id === req.user.userId && (role !== undefined || status !== undefined))
    return res.status(400).json({ error: 'You cannot change your own role or status' });
  if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (status !== undefined && !['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (password !== undefined && String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const target = (await pool.query(
      "SELECT id, role, status FROM users WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
      [req.params.id, req.user.workspaceId]
    )).rows[0];
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Don't strip the workspace's last active admin.
    if ((role !== undefined && role !== 'admin' && target.role === 'admin') ||
        (status !== undefined && status !== 'active' && target.role === 'admin')) {
      const admins = (await pool.query(
        "SELECT COUNT(*)::int AS n FROM users WHERE workspace_id = $1 AND role = 'admin' AND status = 'active' AND deleted_at IS NULL",
        [req.user.workspaceId]
      )).rows[0].n;
      if (admins <= 1) return res.status(400).json({ error: 'Cannot remove the last active admin' });
    }

    const sets: string[] = ['updated_at = now()'];
    const params: any[] = [];
    let i = 1;
    if (role !== undefined) { sets.push(`role = $${i++}`); params.push(role); }
    if (status !== undefined) { sets.push(`status = $${i++}`); params.push(status); }
    if (password !== undefined) { sets.push(`password_hash = $${i++}`); params.push(await bcrypt.hash(password, 12)); }
    if (params.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id, req.user.workspaceId);
    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i++} AND workspace_id = $${i}
       RETURNING id, name, email, phone, role, status, created_at AS "createdAt"`,
      params
    );
    // Suspending or demoting kills the target's live sessions so it takes effect immediately.
    if (status === 'suspended' || (role !== undefined && role !== target.role))
      await pool.query("UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [req.params.id]);
    await auditLog(req.user.workspaceId, req.user.userId, 'user_update', 'user', req.params.id, { role, status, passwordReset: password !== undefined });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/users/:id — soft-delete a user in the caller's workspace
router.delete('/:id', async (req: any, res) => {
  if (req.params.id === req.user.userId) return res.status(400).json({ error: 'You cannot delete your own account' });
  try {
    const target = (await pool.query(
      "SELECT id, role FROM users WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
      [req.params.id, req.user.workspaceId]
    )).rows[0];
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'admin') {
      const admins = (await pool.query(
        "SELECT COUNT(*)::int AS n FROM users WHERE workspace_id = $1 AND role = 'admin' AND status = 'active' AND deleted_at IS NULL",
        [req.user.workspaceId]
      )).rows[0].n;
      if (admins <= 1) return res.status(400).json({ error: 'Cannot delete the last active admin' });
    }
    await pool.query("UPDATE users SET deleted_at = now(), updated_at = now() WHERE id = $1 AND workspace_id = $2", [req.params.id, req.user.workspaceId]);
    await pool.query("UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [req.params.id]);
    await auditLog(req.user.workspaceId, req.user.userId, 'user_delete', 'user', req.params.id, { role: target.role });
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
