import { Router } from 'express';
import { pool } from '../../db/db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

// GET /api/training/episodes — convert sessions + corrections into trainable episodes
// (workspace-scoped — only this operator's data)
router.get('/episodes', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const sessionsR = await pool.query(
      `SELECT id, hostname, semantic_form_key AS "semanticFormKey",
              runtime_version AS "runtimeVersion",
              total_filled AS "totalFilled", total_failed AS "totalFailed",
              records, created_at AS "receivedAt"
       FROM sessions
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.workspaceId, limit]
    );
    const correctionsR = await pool.query(
      `SELECT hostname, semantic_form_key AS "semanticFormKey",
              corrections, trigger
       FROM corrections
       WHERE workspace_id = $1`,
      [req.user.workspaceId]
    );

    // Group corrections by hostname|semanticFormKey
    const corrByHost = {};
    for (const batch of correctionsR.rows) {
      const key = (batch.hostname || '') + '|' + (batch.semanticFormKey || '');
      if (!corrByHost[key]) corrByHost[key] = [];
      const items = Array.isArray(batch.corrections) ? batch.corrections : [];
      corrByHost[key].push(...items);
    }

    const episodes = sessionsR.rows.map(session => {
      const key = (session.hostname || '') + '|' + (session.semanticFormKey || '');
      const sessionCorrections = corrByHost[key] || [];
      const records = Array.isArray(session.records) ? session.records : [];
      const steps = records.map(r => ({
        observation: { selector: r.selector, type: r.type },
        action: {
          type: r.strategy && r.strategy.startsWith('plugin:')
            ? r.strategy.replace('plugin:', '')
            : (r.type === 'ng-dropdown' ? 'click_dropdown'
              : r.type === 'select' ? 'select_option' : 'fill_text'),
          target: r.selector,
          value: r.value,
        },
        result: { outcome: r.result, failReason: r.failReason || null, durationMs: r.durationMs || 0 },
        reward: r.result === 'filled' ? 1.0 : r.result === 'skipped' ? 0.0 : -0.5,
        plugin: r.plugin || null,
        strategy: r.strategy || null,
      }));
      const supervisionSignals = sessionCorrections.map(c => ({
        field: c.field, selector: c.selector, semanticKey: c.semanticKey,
        autofilledValue: c.autofilledValue, operatorValue: c.finalOperatorValue,
        correctionType: c.correctionType, trigger: c.trigger,
      }));
      return {
        schemaVersion: '1.0',
        episodeId: session.id,
        hostname: session.hostname,
        semanticFormKey: session.semanticFormKey || '',
        runtimeVersion: session.runtimeVersion,
        totalFilled: session.totalFilled,
        totalFailed: session.totalFailed,
        steps,
        corrections: supervisionSignals,
        hasCorrections: supervisionSignals.length > 0,
        timestamp: session.receivedAt,
      };
    });

    res.json({ schemaVersion: '1.0', totalEpisodes: episodes.length, episodes });
  } catch (e) {
    console.error('[ext/training] episodes:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
