/**
 * CyberControl Pattern Extractor — extension-service/pattern-extractor.js
 * Phase 5.1 — Server Behavioral Teach (Unknown Widgets)
 *
 * Extracts Interaction Knowledge from a sequence of behavioral observations.
 * Input: observations (user actions + state transitions).
 * Output: Interaction Knowledge record describing widget behavior.
 *
 * ARCHITECTURE (D03 / D06):
 *   - Identifies widgets by BEHAVIOR, never by framework name.
 *   - Uses vocabulary: affordances, probing, state_transitions.
 *   - Behavioral fingerprint = stable identity from observed mechanics.
 *   - Framework-independent: React/Angular/Vue are NEVER part of identity.
 *
 * Extraction pipeline:
 *   1. Normalize observations → canonical action sequence
 *   2. Detect interaction boundaries (open → interact → close)
 *   3. Infer affordances from successful actions
 *   4. Map state transitions from before/after pairs
 *   5. Compute behavioral fingerprint from affordances + interaction pattern
 *   6. Determine behavior_kind and interaction_mode
 */

import { createHash } from 'node:crypto';

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Recognized action types from extension observations.
 */
const ACTION_TYPES = new Set([
  'click', 'dblclick', 'type', 'select', 'focus', 'blur',
  'keydown', 'keyup', 'scroll', 'hover', 'change', 'input',
]);

/**
 * Affordance vocabulary (D03).
 * Maps observed action patterns → canonical affordance names.
 */
const AFFORDANCE_MAP = {
  focus: 'focus',
  type: 'type_text',
  input: 'type_text',
  click: 'activate',
  dblclick: 'activate',
  select: 'select_one',
  change: 'select_one',
  scroll: 'scroll',
  keydown: 'key_interact',
};

/**
 * Interaction mode detection heuristics.
 */
const InteractionMode = {
  NATIVE: 'native',
  INLINE: 'inline',
  OVERLAY: 'overlay',
  COMPOSITE: 'composite',
  DELEGATED: 'delegated',
  UNKNOWN: 'unknown',
};

/**
 * Behavior kinds from widget-taxonomy.yml.
 */
const BehaviorKind = {
  TEXT_ENTRY: 'text_entry',
  SELECTION: 'selection',
  TOGGLE: 'toggle',
  DATE_TIME: 'date_time',
  FILE_UPLOAD: 'file_upload',
  ACTION: 'action',
  CONTAINER: 'container',
  UNKNOWN: 'unknown',
};

// ═══════════════════════════════════════════════════════════════════════
// MAIN EXTRACTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Extract Interaction Knowledge from a set of behavioral observations.
 *
 * @param {object} input
 * @param {string} input.targetNodeId — node being taught
 * @param {string} input.targetContextId — context containing the node
 * @param {object|null} input.targetHint — optional { label, behavior_kind, position }
 * @param {Array<object>} input.observations — sequential observations from extension
 * @returns {InteractionKnowledge}
 *
 * @typedef {object} InteractionKnowledge
 * @property {string[]} affordances — what the widget can do (D03 vocabulary)
 * @property {Array<InteractionStep>} interaction_sequence — ordered steps to operate
 * @property {Array<StateTransition>} state_transitions — observed state changes
 * @property {string} behavioral_fingerprint — stable hash of behavioral identity
 * @property {string} behavior_kind — from widget taxonomy
 * @property {string} cardinality — 'one' | 'many' | 'none' | 'unknown'
 * @property {string} interaction_mode — from widget taxonomy
 * @property {number} confidence — 0.0–1.0
 * @property {object} detection — behavioral detection hints
 */
export function extractPattern(input) {
  const { targetNodeId, targetContextId, targetHint, observations } = input;

  if (!observations || observations.length === 0) {
    throw new Error('Cannot extract pattern from empty observations');
  }

  // 1. Normalize observations
  const normalized = _normalizeObservations(observations, targetNodeId, targetContextId);

  // 2. Detect interaction boundaries
  const phases = _detectInteractionPhases(normalized);

  // 3. Infer affordances from successful actions
  const affordances = _inferAffordances(normalized, phases);

  // 4. Build interaction sequence
  const interactionSequence = _buildInteractionSequence(normalized, phases);

  // 5. Extract state transitions
  const stateTransitions = _extractStateTransitions(normalized);

  // 6. Determine behavior kind and interaction mode
  const behaviorKind = _inferBehaviorKind(affordances, normalized, targetHint);
  const interactionMode = _inferInteractionMode(normalized, phases);
  const cardinality = _inferCardinality(normalized, behaviorKind);

  // 7. Compute behavioral fingerprint
  const fingerprint = _computeBehavioralFingerprint(
    affordances, interactionSequence, behaviorKind, interactionMode
  );

  // 8. Compute confidence based on observation quality
  const confidence = _computeConfidence(normalized, phases, stateTransitions);

  // 9. Build detection hints (behavioral, not selector-based)
  const detection = _buildDetectionHints(normalized, behaviorKind, interactionMode);

  return {
    affordances,
    interaction_sequence: interactionSequence,
    state_transitions: stateTransitions,
    behavioral_fingerprint: fingerprint,
    behavior_kind: behaviorKind,
    cardinality,
    interaction_mode: interactionMode,
    confidence,
    detection,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// PIPELINE STAGES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Stage 1: Normalize raw observations into a canonical form.
 * Filters irrelevant actions, deduplicates rapid-fire events.
 */
function _normalizeObservations(observations, targetNodeId, targetContextId) {
  const result = [];

  for (const obs of observations) {
    // Skip unknown action types
    if (!ACTION_TYPES.has(obs.action_type)) continue;

    result.push({
      seq: result.length,
      action_type: obs.action_type,
      target: obs.target || { node_id: targetNodeId, context_id: targetContextId },
      is_primary_target: obs.target?.node_id === targetNodeId,
      is_within_context: obs.target?.context_id === targetContextId,
      state_before: obs.state_before || null,
      state_after: obs.state_after || null,
      timestamp: obs.timestamp || 0,
      metadata: obs.metadata || {},
    });
  }

  // Deduplicate rapid-fire identical events (< 50ms apart, same action+target)
  const deduped = [];
  for (let i = 0; i < result.length; i++) {
    const curr = result[i];
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.action_type === curr.action_type &&
      prev.target?.node_id === curr.target?.node_id &&
      curr.timestamp - prev.timestamp < 50
    ) {
      // Skip duplicate — keep the one with more state info
      if (curr.state_after && !prev.state_after) {
        deduped[deduped.length - 1] = curr;
      }
      continue;
    }
    deduped.push(curr);
  }

  return deduped;
}

/**
 * Stage 2: Detect interaction phases.
 * Returns { trigger, body, completion } indices marking the open→interact→close cycle.
 */
function _detectInteractionPhases(normalized) {
  if (normalized.length === 0) return { trigger: null, body: [], completion: null };

  // Heuristic: first action on primary target = trigger
  let triggerIdx = null;
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i].is_primary_target && normalized[i].action_type !== 'blur') {
      triggerIdx = i;
      break;
    }
  }

  // Last blur/click-outside or selection = completion
  let completionIdx = null;
  for (let i = normalized.length - 1; i >= 0; i--) {
    const obs = normalized[i];
    if (
      obs.action_type === 'blur' ||
      obs.action_type === 'select' ||
      obs.action_type === 'change' ||
      (obs.state_after?.selected != null)
    ) {
      completionIdx = i;
      break;
    }
  }

  // Body = everything between trigger and completion
  const bodyStart = (triggerIdx != null) ? triggerIdx + 1 : 0;
  const bodyEnd = (completionIdx != null) ? completionIdx : normalized.length;
  const body = [];
  for (let i = bodyStart; i < bodyEnd; i++) {
    body.push(i);
  }

  return { trigger: triggerIdx, body, completion: completionIdx };
}

/**
 * Stage 3: Infer affordances from observed successful actions.
 * Only includes affordances that were mechanically proven (action → state change).
 */
function _inferAffordances(normalized, phases) {
  const affordanceSet = new Set();

  for (const obs of normalized) {
    // An action proves an affordance if:
    // 1. It's a recognized action type
    // 2. It targets the primary widget or its child context
    // 3. Preferably has state change evidence
    if (!obs.is_primary_target && !obs.is_within_context) continue;

    const affordance = AFFORDANCE_MAP[obs.action_type];
    if (affordance) {
      // If we have state evidence, the affordance is proven
      if (obs.state_after && _stateChanged(obs.state_before, obs.state_after)) {
        affordanceSet.add(affordance);
      } else if (obs.is_primary_target) {
        // Primary target actions are assumed affordances even without state evidence
        affordanceSet.add(affordance);
      }
    }
  }

  // Focus is implied for any interactive widget
  affordanceSet.add('focus');

  // Normalize: if we have both 'activate' and 'select_one', keep both
  // If we have 'type_text' and 'select_one', this is a combobox pattern
  return [...affordanceSet].sort();
}

/**
 * Stage 4: Build the canonical interaction sequence.
 * Returns ordered steps describing how to operate the widget.
 */
function _buildInteractionSequence(normalized, phases) {
  const steps = [];

  if (phases.trigger != null) {
    const triggerObs = normalized[phases.trigger];
    steps.push({
      step: 'trigger',
      action: triggerObs.action_type,
      target_role: 'primary',
      description: `${triggerObs.action_type} on the widget to initiate interaction`,
      expected_outcome: _describeTransition(triggerObs.state_before, triggerObs.state_after),
    });
  }

  // Group body actions by purpose
  const bodyActions = phases.body.map(i => normalized[i]);
  const typeActions = bodyActions.filter(a => a.action_type === 'type' || a.action_type === 'input');
  const clickActions = bodyActions.filter(a => a.action_type === 'click');
  const keyActions = bodyActions.filter(a => a.action_type === 'keydown');

  if (typeActions.length > 0) {
    steps.push({
      step: 'input',
      action: 'type_text',
      target_role: typeActions[0].is_primary_target ? 'primary' : 'child_input',
      description: 'Type text to filter or enter a value',
      expected_outcome: 'options_filtered or value_entered',
    });
  }

  if (keyActions.length > 0) {
    const keys = [...new Set(keyActions.map(a => a.metadata?.key).filter(Boolean))];
    if (keys.length > 0) {
      steps.push({
        step: 'navigate',
        action: 'key_press',
        target_role: 'primary',
        description: `Navigate using keyboard: ${keys.join(', ')}`,
        keys,
        expected_outcome: 'focus_moved',
      });
    }
  }

  if (clickActions.length > 0) {
    // Distinguish clicks on options vs. other elements
    const optionClicks = clickActions.filter(a => !a.is_primary_target);
    if (optionClicks.length > 0) {
      steps.push({
        step: 'select',
        action: 'click',
        target_role: 'option',
        description: 'Click an option to select it',
        expected_outcome: 'value_selected',
      });
    }
  }

  if (phases.completion != null) {
    const completionObs = normalized[phases.completion];
    // Only add explicit completion step if it's different from select
    if (completionObs.action_type === 'blur' || completionObs.action_type === 'click') {
      if (!steps.some(s => s.step === 'select' && completionObs.action_type === 'click')) {
        steps.push({
          step: 'confirm',
          action: completionObs.action_type,
          target_role: completionObs.is_primary_target ? 'primary' : 'outside',
          description: `${completionObs.action_type} to confirm/close`,
          expected_outcome: _describeTransition(completionObs.state_before, completionObs.state_after),
        });
      }
    }
  }

  // Number them
  return steps.map((s, i) => ({ order: i + 1, ...s }));
}

/**
 * Stage 5: Extract state transitions from observation pairs.
 */
function _extractStateTransitions(normalized) {
  const transitions = [];

  for (const obs of normalized) {
    if (!obs.state_before || !obs.state_after) continue;
    if (!_stateChanged(obs.state_before, obs.state_after)) continue;

    transitions.push({
      trigger_action: obs.action_type,
      trigger_target: obs.is_primary_target ? 'primary' : 'child',
      before: _serializeState(obs.state_before),
      after: _serializeState(obs.state_after),
      is_significant: _isSignificantTransition(obs.state_before, obs.state_after),
    });
  }

  // Deduplicate identical transitions
  const seen = new Set();
  return transitions.filter(t => {
    const key = `${t.trigger_action}:${t.before}→${t.after}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Stage 6a: Infer behavior_kind from affordances and interaction pattern.
 */
function _inferBehaviorKind(affordances, normalized, targetHint) {
  // If hint provides behavior_kind, use it as a starting point
  if (targetHint?.behavior_kind && targetHint.behavior_kind !== 'unknown') {
    return targetHint.behavior_kind;
  }

  const hasTypeText = affordances.includes('type_text');
  const hasSelectOne = affordances.includes('select_one');
  const hasActivate = affordances.includes('activate');
  const hasToggle = affordances.includes('toggle');

  // Check state transitions for selection evidence
  const hasSelectionTransition = normalized.some(o =>
    o.state_after?.selected != null || o.state_after?.value != null
  );

  if (hasTypeText && hasSelectOne) return BehaviorKind.SELECTION; // combobox
  if (hasSelectOne || hasSelectionTransition) return BehaviorKind.SELECTION;
  if (hasTypeText && !hasSelectOne) return BehaviorKind.TEXT_ENTRY;
  if (hasToggle) return BehaviorKind.TOGGLE;
  if (hasActivate && !hasSelectOne && !hasTypeText) return BehaviorKind.ACTION;

  return BehaviorKind.UNKNOWN;
}

/**
 * Stage 6b: Infer interaction_mode from observation patterns.
 */
function _inferInteractionMode(normalized, phases) {
  // Overlay: if we see nodes appearing after trigger (options panel)
  const triggerObs = phases.trigger != null ? normalized[phases.trigger] : null;
  if (triggerObs?.state_after?.expanded === true || triggerObs?.state_after?.opened === true) {
    return InteractionMode.OVERLAY;
  }

  // Check if body actions target different nodes than the primary
  const bodyActions = phases.body.map(i => normalized[i]);
  const uniqueTargets = new Set(bodyActions.map(a => a.target?.node_id).filter(Boolean));

  if (uniqueTargets.size > 2) {
    // Multiple distinct targets suggest composite/overlay
    return InteractionMode.COMPOSITE;
  }

  // If all actions on primary target, likely native or inline
  const allPrimary = normalized.every(o => o.is_primary_target);
  if (allPrimary) {
    return InteractionMode.NATIVE;
  }

  // Default: overlay for any widget that opens a separate panel
  if (bodyActions.some(a => !a.is_primary_target)) {
    return InteractionMode.OVERLAY;
  }

  return InteractionMode.UNKNOWN;
}

/**
 * Stage 6c: Infer cardinality from behavior.
 */
function _inferCardinality(normalized, behaviorKind) {
  if (behaviorKind === BehaviorKind.TOGGLE) return 'one';
  if (behaviorKind === BehaviorKind.ACTION) return 'none';
  if (behaviorKind === BehaviorKind.TEXT_ENTRY) return 'one';

  // Check if multiple selections were made
  const selections = normalized.filter(o =>
    o.action_type === 'select' || o.state_after?.selected != null
  );
  if (selections.length > 1) {
    // Check if they're additive (multi-select) or replacing (single-select)
    const lastSelected = selections[selections.length - 1]?.state_after?.value;
    const firstSelected = selections[0]?.state_after?.value;
    if (lastSelected && firstSelected && lastSelected !== firstSelected) {
      // Different values selected — could be single-select with changes
      return 'one';
    }
    // Multiple selections accumulating → many
    return 'many';
  }

  return 'one';
}

/**
 * Stage 7: Compute a stable behavioral fingerprint.
 * Identity is derived SOLELY from behavior, never from framework or DOM structure.
 */
function _computeBehavioralFingerprint(affordances, interactionSequence, behaviorKind, interactionMode) {
  // The fingerprint captures:
  // - Sorted affordances
  // - Step sequence (action types in order)
  // - Behavior kind + mode
  const data = {
    affordances: [...affordances].sort(),
    steps: interactionSequence.map(s => `${s.step}:${s.action}`),
    kind: behaviorKind,
    mode: interactionMode,
  };

  const hash = createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .slice(0, 16);

  return `bf:${behaviorKind}:${interactionMode}:${hash}`;
}

/**
 * Stage 8: Compute confidence based on observation quality.
 */
function _computeConfidence(normalized, phases, stateTransitions) {
  let score = 0.3; // Base confidence for any observation

  // More observations → higher confidence (up to +0.2)
  const obsBonus = Math.min(normalized.length / 20, 0.2);
  score += obsBonus;

  // State transitions increase confidence (+0.15 for each, max +0.3)
  const transBonus = Math.min(stateTransitions.length * 0.15, 0.3);
  score += transBonus;

  // Clear phases (trigger → body → completion) boost confidence
  if (phases.trigger != null) score += 0.05;
  if (phases.body.length > 0) score += 0.05;
  if (phases.completion != null) score += 0.05;

  // Significant transitions (value changes) are strong evidence
  const significantCount = stateTransitions.filter(t => t.is_significant).length;
  if (significantCount > 0) score += 0.05;

  return Math.min(score, 0.95); // Cap at 0.95 — only validation can reach 1.0
}

/**
 * Stage 9: Build behavioral detection hints.
 * These are behavioral signatures, NOT selectors or framework names.
 */
function _buildDetectionHints(normalized, behaviorKind, interactionMode) {
  const hints = {
    behavior_kind: behaviorKind,
    interaction_mode: interactionMode,
  };

  // Gather observed role/tag patterns (anonymous, no selectors)
  const roles = new Set();
  const tags = new Set();
  for (const obs of normalized) {
    if (obs.target?.role) roles.add(obs.target.role);
    if (obs.target?.tag) tags.add(obs.target.tag);
  }

  if (roles.size > 0) hints.observed_roles = [...roles];
  if (tags.size > 0) hints.observed_tags = [...tags];

  // Interaction signature (sequence of action types)
  hints.action_signature = normalized
    .filter(o => o.is_primary_target || o.is_within_context)
    .map(o => o.action_type)
    .slice(0, 10); // Cap at 10 for fingerprint

  return hints;
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if state changed between before and after.
 */
function _stateChanged(before, after) {
  if (!before || !after) return false;
  return JSON.stringify(before) !== JSON.stringify(after);
}

/**
 * Serialize state object to a comparable string.
 */
function _serializeState(state) {
  if (!state) return 'null';
  // Pick the most relevant state properties
  const relevant = {};
  for (const key of ['value', 'selected', 'expanded', 'opened', 'checked', 'disabled', 'visible']) {
    if (state[key] !== undefined) relevant[key] = state[key];
  }
  return JSON.stringify(relevant);
}

/**
 * Determine if a state transition is "significant" (value/selection change).
 */
function _isSignificantTransition(before, after) {
  if (!before || !after) return false;
  // Value change, selection change, or expand/collapse are significant
  if (before.value !== after.value) return true;
  if (before.selected !== after.selected) return true;
  if (before.expanded !== after.expanded) return true;
  if (before.checked !== after.checked) return true;
  return false;
}

/**
 * Describe a state transition in human terms.
 */
function _describeTransition(before, after) {
  if (!before || !after) return 'state_changed';
  if (before.expanded === false && after.expanded === true) return 'widget_opened';
  if (before.expanded === true && after.expanded === false) return 'widget_closed';
  if (before.value !== after.value) return 'value_changed';
  if (before.selected !== after.selected) return 'selection_changed';
  if (before.visible !== after.visible) return 'visibility_changed';
  return 'state_changed';
}

export { BehaviorKind, InteractionMode, ACTION_TYPES, AFFORDANCE_MAP };
