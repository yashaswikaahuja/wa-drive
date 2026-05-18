import { Router } from 'express';
import { pool } from '../../db.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = Router();

router.get('/stats', authMiddleware, async (req: any, res) => {
  try {
    const ws = req.user.workspaceId;
    const [sessions, corrections, profiles, jobs] = await Promise.all([
      pool.query("SELECT COUNT(*) as total, COALESCE(SUM(total_filled), 0) as filled, COALESCE(SUM(total_failed), 0) as failed FROM sessions WHERE workspace_id = $1", [ws]),
      pool.query("SELECT COUNT(*) as total FROM corrections WHERE workspace_id = $1", [ws]),
      pool.query("SELECT COUNT(*) as total FROM profiles WHERE workspace_id = $1 AND deleted_at IS NULL", [ws]),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'queued') as queued, COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress FROM jobs WHERE workspace_id = $1", [ws]),
    ]);
    res.json({
      sessions: parseInt(sessions.rows[0].total),
      filled: parseInt(sessions.rows[0].filled),
      failed: parseInt(sessions.rows[0].failed),
      corrections: parseInt(corrections.rows[0].total),
      profiles: parseInt(profiles.rows[0].total),
      jobs: parseInt(jobs.rows[0].total),
      jobsQueued: parseInt(jobs.rows[0].queued),
      jobsInProgress: parseInt(jobs.rows[0].in_progress),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
