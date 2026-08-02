// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION — what actually happened. (Primitive 4 of 6)
// ═══════════════════════════════════════════════════════════════════════════
// Records the outcome of every action as structured evidence. Feeds two things:
// (1) the session report (accurate filled/skipped counts) and (2) the learning
// loop (which mappings to reinforce, which to flag). Backward-compatible with
// the existing /sessions record shape.
// ───────────────────────────────────────────────────────────────────────────

(function () {
  if (window.CCObservation) return;

  // Summarize execution records into an accurate report + learning signals.
  // records: from CCAction.execute (executor records + direct toggles)
  // intents: the full intent list (to count checkpoints / unresolved)
  function summarize(records, resolutions, plan) {
    const filled = records.filter(r => r.result === 'filled').length;
    const failed = records.filter(r => r.result === 'error' || (r.result === 'skipped' && r.failReason && r.failReason !== 'unresolved')).length;
    const checkpoints = (plan.checkpoints || []).length;
    const unresolved = resolutions.filter(r => r.resolution.status === 'unresolved').length;
    const lowConfidence = resolutions.filter(r => r.resolution.lowConfidence).length;

    return {
      total: resolutions.length,
      filled,
      failed,
      checkpoints,
      unresolved,
      lowConfidence,
      records,
      // Learning signals: which fields were filled from which source (for reinforcement)
      reinforcements: records
        .filter(r => r.result === 'filled' && r.semanticKey)
        .map(r => ({ semanticKey: r.semanticKey, source: r.source })),
    };
  }

  // Build the sync-mapping updates that reinforce/record what was used, so the
  // server's knowledge (fills/confidence) grows. semanticKey + profileKey come
  // from fbs. delta.fills=1 for each successful deterministic fill.
  function buildMappingSync(resolutions, records) {
    const updates = {};
    const filledSelectors = new Set(records.filter(r => r.result === 'filled').map(r => r.selector));
    for (const { intent, resolution } of resolutions) {
      const f = intent.field;
      if (!f.id) continue;
      const wasFilled = filledSelectors.has(f.selector) ||
        (f.optionSelectors || []).some(s => filledSelectors.has(s));
      updates[f.id] = {
        profileKey: (resolution && resolution.profileKey) || null,
        label: f.label,
        type: f.type,
        order: f.order,
        options: f.options || null,
        delta: { fills: wasFilled ? 1 : 0, corrections: 0 },
      };
    }
    return updates;
  }

  window.CCObservation = { summarize, buildMappingSync };
})();
