// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Behavior Classifier — extension-service/behavior-classifier.js
// Phase 4.3 — Server Static/Dynamic Classification
// Issue #197
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Classifies a form/session as UNKNOWN | STATIC | DYNAMIC based on:
//   - PageSnapshot topology (cascade/dependency edges)
//   - dom_evidence from M4.2 (hard-class events)
//   - Prior server knowledge for form scope
//
// Rules:
//   - UNKNOWN is conservative: effective_execution_mode = 'dynamic'
//   - Framework identity alone NEVER forces mode
//   - Server-owned: extension never writes durable classification
//
// Does NOT own: plan construction, execution, DOM observation.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Hard-class evidence event types that force DYNAMIC classification.
 * These indicate structural DOM changes that invalidate full-form batch.
 */
const HARD_EVIDENCE_TYPES = new Set([
  'control_removed',
  'subtree_replaced',
  'option_set_changed',
  'cascade_triggered',
  'widget_recreated',
]);

/**
 * Edge types that represent cascade/dependency relationships between nodes.
 */
const CASCADE_EDGE_TYPES = new Set([
  'cascade',
  'dependency',
  'controls',
  'populates',
  'triggers_load',
]);

/**
 * Check if an evidence event type is a hard-class signal.
 *
 * @param {string} type — Evidence event type
 * @returns {boolean}
 */
export function isHardEvidenceType(type) {
  return HARD_EVIDENCE_TYPES.has(type);
}

/**
 * Classify form behavior for a planning session.
 *
 * Inputs:
 *   - snapshot: PageSnapshot with nodes and edges
 *   - domEvidence: Array of dom_evidence events from M4.2
 *   - priorKnowledge: Server-stored knowledge for this form scope
 *   - planSteps: Array of planned fill steps (each has target.node_id)
 *
 * @param {object} params
 * @param {object} params.snapshot — PageSnapshot (nodes, edges, page metadata)
 * @param {object[]} params.domEvidence — DOM evidence events from extension
 * @param {object|null} params.priorKnowledge — Prior server knowledge for form scope
 * @param {object[]} params.planSteps — Planned fill steps
 * @returns {{
 *   system_classification: 'STATIC' | 'DYNAMIC' | 'UNKNOWN',
 *   effective_execution_mode: 'static' | 'dynamic',
 *   confidence: number,
 *   reason_codes: string[],
 *   evidence_summary: { hard_signals: number, soft_signals: number, cascade_edges: number }
 * }}
 */
export function classifyFormBehavior({ snapshot, domEvidence, priorKnowledge, planSteps }) {
  const reasonCodes = [];
  let hardSignals = 0;
  let softSignals = 0;
  let cascadeEdgeCount = 0;
  let forceDynamic = false;
  let forceUnknown = false;

  // Collect planned target node IDs for scope-limited analysis
  const targetNodeIds = new Set(
    (planSteps || []).map(s => s.target?.node_id || s.node_id).filter(Boolean)
  );

  // ── 1. Check prior knowledge ──────────────────────────────────────
  if (priorKnowledge) {
    if (priorKnowledge.behavior === 'dynamic') {
      forceDynamic = true;
      reasonCodes.push('prior_dynamic_knowledge');
    }
    // Note: framework identity alone never forces mode
    // e.g. priorKnowledge.framework === 'angular' does NOT trigger DYNAMIC
  }

  // ── 2. Check snapshot edges for cascade/dependency between targets ─
  const edges = snapshot?.edges || [];
  for (const edge of edges) {
    if (!CASCADE_EDGE_TYPES.has(edge.type)) continue;

    const sourceInTargets = targetNodeIds.has(edge.source) || targetNodeIds.has(edge.from);
    const destInTargets = targetNodeIds.has(edge.target) || targetNodeIds.has(edge.to);

    if (sourceInTargets && destInTargets) {
      cascadeEdgeCount++;
    }
  }

  if (cascadeEdgeCount > 0) {
    forceDynamic = true;
    reasonCodes.push('cascade_edges_detected');
  }

  // ── 3. Check dom_evidence for hard-class events ────────────────────
  const evidenceArray = Array.isArray(domEvidence) ? domEvidence : [];
  for (const evt of evidenceArray) {
    const evtType = evt.type || evt.event_type;
    if (!evtType) continue;

    if (isHardEvidenceType(evtType)) {
      hardSignals++;
      // Only count as forcing dynamic if it affects upcoming targets
      const affectsTarget = !evt.node_id || targetNodeIds.has(evt.node_id);
      if (affectsTarget) {
        forceDynamic = true;
      }
    } else {
      softSignals++;
    }
  }

  if (hardSignals > 0 && forceDynamic) {
    reasonCodes.push('hard_dom_evidence');
  }

  // ── 4. Check widget types for observable cascade patterns ──────────
  const nodes = snapshot?.nodes || {};
  let cascadeHint = false;
  const selectionNodes = [];

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (!targetNodeIds.has(nodeId)) continue;
    const widget = node.widget || {};
    if (widget.behavior_kind === 'select' || widget.behavior_kind === 'select_one' ||
        widget.behavior_kind === 'combobox' ||
        (node.affordances || []).includes('select_one')) {
      selectionNodes.push(nodeId);
    }
  }

  // Look for parent→child option patterns among selection nodes
  if (selectionNodes.length >= 2 && cascadeEdgeCount === 0) {
    // Check if edges (not already counted) suggest cascade between selection widgets
    for (const edge of edges) {
      const sourceIsSelection = selectionNodes.includes(edge.source || edge.from);
      const destIsSelection = selectionNodes.includes(edge.target || edge.to);
      if (sourceIsSelection && destIsSelection) {
        cascadeHint = true;
        break;
      }
    }
  }

  if (cascadeHint && !forceDynamic) {
    softSignals++;
    reasonCodes.push('selection_cascade_hint');
  }

  // ── 5. Determine classification ────────────────────────────────────
  let systemClassification;
  let effectiveMode;
  let confidence;

  if (forceDynamic) {
    systemClassification = 'DYNAMIC';
    effectiveMode = 'dynamic';
    confidence = computeConfidence(hardSignals, cascadeEdgeCount, reasonCodes, priorKnowledge);
  } else if (isFirstEncounter(priorKnowledge, evidenceArray)) {
    // First encounter: if no dynamic signals at all, treat as STATIC (fill all in one pass).
    // Only default to dynamic when there's actual evidence of dynamic behavior.
    if (hardSignals === 0 && cascadeEdgeCount === 0 && softSignals === 0) {
      systemClassification = 'STATIC';
      effectiveMode = 'static';
      confidence = 0.6;
      reasonCodes.push('first_encounter_no_signals');
    } else {
      systemClassification = 'UNKNOWN';
      effectiveMode = 'dynamic';
      confidence = 0.3;
      forceUnknown = true;
      reasonCodes.push('first_encounter_with_signals');
    }
  } else if (hasCleanHistory(priorKnowledge) && hardSignals === 0 && cascadeEdgeCount === 0) {
    // Clean history + no signals → STATIC
    systemClassification = 'STATIC';
    effectiveMode = 'static';
    confidence = computeStaticConfidence(priorKnowledge, softSignals);
    reasonCodes.push('clean_history');
  } else if (hardSignals === 0 && cascadeEdgeCount === 0 && softSignals === 0) {
    // No signals at all but not first encounter and not clean history → UNKNOWN
    systemClassification = 'UNKNOWN';
    effectiveMode = 'dynamic';
    confidence = 0.4;
    reasonCodes.push('insufficient_evidence');
  } else {
    // Ambiguous: some soft signals but no hard evidence → UNKNOWN
    systemClassification = 'UNKNOWN';
    effectiveMode = 'dynamic';
    confidence = 0.5;
    reasonCodes.push('ambiguous_signals');
  }

  // Clamp confidence to [0, 1]
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    system_classification: systemClassification,
    effective_execution_mode: effectiveMode,
    confidence,
    reason_codes: reasonCodes,
    evidence_summary: {
      hard_signals: hardSignals,
      soft_signals: softSignals,
      cascade_edges: cascadeEdgeCount,
    },
  };
}

// ── Internal Helpers ─────────────────────────────────────────────────

/**
 * Determine if this is the first encounter with the form scope.
 */
function isFirstEncounter(priorKnowledge, evidenceArray) {
  if (!priorKnowledge) return true;
  if (priorKnowledge.encounter_count === 0) return true;
  if (priorKnowledge.encounter_count == null && !priorKnowledge.behavior) return true;
  return false;
}

/**
 * Determine if prior knowledge indicates clean execution history.
 */
function hasCleanHistory(priorKnowledge) {
  if (!priorKnowledge) return false;
  // Clean history: has prior encounters with no recorded dynamic behavior
  if (priorKnowledge.behavior === 'static') return true;
  if (priorKnowledge.encounter_count > 0 && priorKnowledge.dynamic_incidents === 0) return true;
  if (priorKnowledge.clean_fills > 0 && !priorKnowledge.dynamic_incidents) return true;
  return false;
}

/**
 * Compute confidence for DYNAMIC classification.
 */
function computeConfidence(hardSignals, cascadeEdges, reasonCodes, priorKnowledge) {
  let confidence = 0.5;

  // Prior knowledge is strongest signal
  if (reasonCodes.includes('prior_dynamic_knowledge')) confidence += 0.3;
  // Cascade edges in snapshot are strong structural evidence
  if (cascadeEdges > 0) confidence += 0.2;
  // Hard DOM evidence is observed behavior
  if (hardSignals > 0) confidence += Math.min(0.2, hardSignals * 0.05);

  return Math.min(1.0, confidence);
}

/**
 * Compute confidence for STATIC classification.
 */
function computeStaticConfidence(priorKnowledge, softSignals) {
  let confidence = 0.6;

  if (priorKnowledge?.encounter_count > 5) confidence += 0.2;
  else if (priorKnowledge?.encounter_count > 2) confidence += 0.1;

  if (priorKnowledge?.clean_fills > 3) confidence += 0.1;

  // Soft signals slightly reduce confidence
  if (softSignals > 0) confidence -= softSignals * 0.05;

  return Math.max(0.4, Math.min(1.0, confidence));
}
