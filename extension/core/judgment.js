// ═══════════════════════════════════════════════════════════════════════════
// JUDGMENT — how to choose. (Primitive 6 of 6)
// ═══════════════════════════════════════════════════════════════════════════
// Given an Intent + the World (customer records) + Memory (saved knowledge),
// decide the value AND whether the system is confident enough to act alone.
// Deterministic first (saved mapping/rule via rule-engine, then derivation).
// What it can't resolve is marked 'unresolved' for the engine's fuzzy/AI batch
// passes; genuinely human tasks are marked 'checkpoint'.
//
// Returns a Resolution:
//   { status: 'resolved'|'unresolved'|'checkpoint'|'skip',
//     kind:   'value'|'option'|'check'|'checkOptions'|null,
//     value, source, confidence }
// ───────────────────────────────────────────────────────────────────────────

(function () {
  if (window.CCJudgment) return;

  // Confidence below which we still ACT (deterministic) but flag for review.
  const ACT_THRESHOLD = 0.2;

  function resolve(intent, world, memory) {
    if (intent.goal === 'human-checkpoint') {
      return { status: 'checkpoint', kind: null, source: 'judgment', confidence: 1, reason: intent.context.checkpoint ? 'human-required' : 'checkpoint' };
    }

    const field = intent.field;
    const records = world.records;
    const entry = memory.recall(field.id);

    // ── Deterministic pass: saved mapping + rule engine ─────────────────────
    if (entry && typeof ccEvaluateField === 'function') {
      const act = ccEvaluateField(entry, field, records, memory.translations);
      if (act && act.kind && act.kind !== 'skip') {
        const conf = memory.confidenceOf(entry);
        // Even low confidence acts (better than blank) but is flagged.
        return {
          status: 'resolved',
          kind: act.kind,
          value: act.value != null ? act.value : (act.option != null ? act.option : (act.options || act.check)),
          option: act.option, options: act.options, check: act.check,
          source: entry.source === 'manual' || entry.source === 'confirmed' ? 'memory:confirmed' : 'memory:learned',
          confidence: conf,
          lowConfidence: conf < ACT_THRESHOLD,
        };
      }
      // entry exists but rule said skip (e.g. condition unmet) → honor skip
      if (act && act.kind === 'skip') return { status: 'skip', source: 'memory', confidence: memory.confidenceOf(entry) };
    }

    // ── Agreement checkbox with no saved rule → safe default: check ─────────
    if (intent.goal === 'confirm' && field.type === 'checkbox-agreement') {
      return { status: 'resolved', kind: 'check', check: true, source: 'default:agreement', confidence: 0.6 };
    }

    // ── Not deterministically resolvable → defer to engine's fuzzy/AI batch ─
    return { status: 'unresolved', source: 'judgment', confidence: 0 };
  }

  window.CCJudgment = { resolve, ACT_THRESHOLD };
})();
