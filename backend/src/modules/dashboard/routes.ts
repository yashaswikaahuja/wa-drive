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

// GET /api/dashboard/queue — the work queue: who needs attention, grouped by customer
// Status logic:
//   'pending'  = has documents but NO profile data yet (yellow — received, not extracted)
//   'new'      = has documents, no profile at all (a brand-new sender)
//   'ready'    = has a profile with data (green — can fill)
router.get('/queue', authMiddleware, async (req: any, res) => {
  try {
    const ws = req.user.workspaceId;
    // Customers (phones) that have sent documents
    const docs = await pool.query(
      `SELECT customer_id as phone, customer_name as name, COUNT(*)::int as doc_count, MAX(uploaded_at) as last_doc
       FROM drive_files WHERE workspace_id = $1 AND customer_id IS NOT NULL
       GROUP BY customer_id, customer_name`,
      [ws]
    );
    // Profiles with their data completeness
    const profiles = await pool.query(
      `SELECT primary_contact_phone as phone, name, display_label, data, updated_at
       FROM profiles WHERE workspace_id = $1 AND deleted_at IS NULL`,
      [ws]
    );
    const profileByPhone: Record<string, any> = {};
    for (const p of profiles.rows) {
      const fieldCount = p.data && typeof p.data === 'object' ? Object.keys(p.data).length : 0;
      const existing = profileByPhone[p.phone];
      if (!existing || fieldCount > existing.fieldCount) {
        profileByPhone[p.phone] = { name: p.display_label || p.name, fieldCount, updated_at: p.updated_at };
      }
    }

    const queue = docs.rows.map((d: any) => {
      const prof = profileByPhone[d.phone];
      let status: 'ready' | 'pending' | 'new';
      if (prof && prof.fieldCount > 3) status = 'ready';
      else if (prof) status = 'pending';
      else status = 'new';
      return {
        phone: d.phone,
        name: prof?.name || d.name || d.phone,
        docCount: d.doc_count,
        lastActivity: d.last_doc,
        status,
        fieldCount: prof?.fieldCount || 0,
      };
    });

    // Also include profiles that have no docs (manually created, ready)
    for (const p of profiles.rows) {
      if (!docs.rows.find((d: any) => d.phone === p.phone)) {
        const fieldCount = p.data && typeof p.data === 'object' ? Object.keys(p.data).length : 0;
        queue.push({
          phone: p.phone, name: p.display_label || p.name || p.phone,
          docCount: 0, lastActivity: p.updated_at,
          status: fieldCount > 3 ? 'ready' : 'pending', fieldCount,
        });
      }
    }

    // Sort: new docs first (pending/new), then ready, by recency
    const order: Record<string, number> = { new: 0, pending: 1, ready: 2 };
    queue.sort((a: any, b: any) => {
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
    });

    res.json(queue);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;