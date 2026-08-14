/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
(function () {
'use strict';
/**
 * CyberControl DOM Evidence Emitter — extension/runtime/dom-evidence.js
 * Phase 4.2 — Dynamic DOM Behavior Evidence
 *
 * Emits typed plan-relevant evidence when DOM changes invalidate later actions.
 * Extension reports facts only — NO strategic classification, NO execution_mode
 * selection, NO business interpretation.
 *
 * INVARIANTS (architecture/constitution.yml):
 *  - Extension = Eyes + Hands. No semantic interpretation, no AI, no planning.
 *  - Each event includes: type, timestamp, correlation context, public target refs,
 *    optional before/after fingerprints.
 *  - Only emits for targets that appear in the active plan's upcoming steps.
 *  - Bounded: max 50 evidence events per plan execution (prevents flood).
 *  - Public node/context refs only (no selectors, no DOM handles).
 */

/**
 * Evidence types — plan-relevant DOM behavior observations.
 */
const EVIDENCE_TYPES = Object.freeze([
  'control_removed',
  'control_recreated',
  'option_set_changed',
  'subtree_replaced',
  'cascade_triggered',
  'widget_recreated',
  'visibility_changed',
  'document_changed',
  'frame_changed',
]);

/**
 * Maximum evidence events per plan execution to prevent flood.
 */
const MAX_EVIDENCE_PER_PLAN = 50;

/**
 * Create an evidence event envelope.
 * @param {string} type — one of EVIDENCE_TYPES
 * @param {object} opts
 * @returns {object}
 */
function createEvidenceEvent(type, opts = {}) {
  return {
    type,
    timestamp: opts.timestamp || new Date().toISOString(),
    plan_id: opts.plan_id || null,
    step_id: opts.step_id || null,
    correlation_id: opts.correlation_id || null,
    context_id: opts.context_id || null,
    node_id: opts.node_id || null,
    severity_hint: opts.severity_hint || 'soft',
    before: opts.before || null,
    after: opts.after || null,
  };
}

class DomEvidenceEmitter {
  constructor() {
    /** @type {object|null} Active plan being watched. */
    this._plan = null;

    /** @type {object|null} Binding registry reference. */
    this._bindingRegistry = null;

    /** @type {Array<object>} Accumulated evidence events. */
    this._evidence = [];

    /** @type {Set<function>} Registered listeners. */
    this._listeners = new Set();

    /** @type {boolean} Whether currently observing. */
    this._active = false;

    /** @type {{observer: MutationObserver, disconnect: function}|null} */
    this._observerHandle = null;

    /** @type {Map<string, object>} Upcoming plan targets: key(context_id, node_id) → step info. */
    this._plannedTargets = new Map();

    /** @type {number} Current step index in plan execution. */
    this._currentStepIndex = 0;

    /** @type {Map<string, string>} Fingerprints of planned targets before mutations. */
    this._targetFingerprints = new Map();

    /** @type {Set<string>} Removed target keys — for control_recreated detection. */
    this._removedTargets = new Set();

    /** @type {string|null} Last action target key — for cascade detection. */
    this._lastActionTarget = null;

    /** @type {number} Timestamp of last action — for cascade window. */
    this._lastActionTime = 0;
  }

  /**
   * Begin watching for planned targets.
   * @param {object} plan — the active action plan
   * @param {object} bindingRegistry — BindingRegistry instance
   * @param {object} [options]
   * @param {Element|Document} [options.root] — observation root
   * @param {function} [options.observeMutations] — custom observer factory (for testing)
   */
  startObserving(plan, bindingRegistry, options = {}) {
    if (this._active) this.stopObserving();

    this._plan = plan;
    this._bindingRegistry = bindingRegistry;
    this._evidence = [];
    this._active = true;
    this._currentStepIndex = 0;
    this._removedTargets.clear();
    this._lastActionTarget = null;
    this._lastActionTime = 0;

    // Build planned targets map from upcoming steps
    this._buildPlannedTargets();

    // Capture initial fingerprints of planned targets
    this._captureFingerprints();

    // Set up DOM observation
    const root = options.root || (typeof document !== 'undefined' ? document.documentElement : null);
    if (root) {
      const observeFn = options.observeMutations || this._getObserveMutations();
      if (observeFn) {
        this._observerHandle = observeFn(root, (records) => {
          this._onMutations(records);
        });
      }
    }
  }

  /**
   * Stop observing and cleanup.
   */
  stopObserving() {
    this._active = false;
    if (this._observerHandle) {
      this._observerHandle.disconnect();
      this._observerHandle = null;
    }
    this._plan = null;
    this._bindingRegistry = null;
    this._plannedTargets.clear();
    this._targetFingerprints.clear();
    this._removedTargets.clear();
    this._lastActionTarget = null;
    this._lastActionTime = 0;
  }

  /**
   * Get accumulated evidence events.
   * @returns {Array<object>}
   */
  getEvidence() {
    return this._evidence.slice();
  }

  /**
   * Register a listener for real-time evidence events.
   * @param {function} callback
   */
  onEvidence(callback) {
    if (typeof callback === 'function') {
      this._listeners.add(callback);
    }
  }

  /**
   * Clear accumulated evidence and reset state.
   */
  reset() {
    this._evidence = [];
    this._removedTargets.clear();
    this._currentStepIndex = 0;
    this._lastActionTarget = null;
    this._lastActionTime = 0;
    if (this._plan) {
      this._buildPlannedTargets();
    }
  }

  /**
   * Notify the emitter that a step was executed (for cascade detection).
   * @param {string} stepId
   * @param {string} contextId
   * @param {string} nodeId
   */
  notifyStepExecuted(stepId, contextId, nodeId) {
    this._currentStepIndex++;
    this._lastActionTarget = this._targetKey(contextId, nodeId);
    this._lastActionTime = Date.now();
    // Rebuild planned targets to only track upcoming steps
    this._buildPlannedTargets();
  }

  /**
   * Emit a document-level change evidence (called externally on navigation).
   * @param {object} [opts]
   */
  emitDocumentChanged(opts = {}) {
    if (!this._active) return;
    this._emitEvidence('document_changed', {
      context_id: opts.context_id || null,
      node_id: null,
      severity_hint: 'hard',
      before: opts.before || null,
      after: opts.after || null,
    });
  }

  /**
   * Emit a frame-level change evidence (called externally on frame navigation).
   * @param {object} opts
   */
  emitFrameChanged(opts = {}) {
    if (!this._active) return;
    this._emitEvidence('frame_changed', {
      context_id: opts.context_id || null,
      node_id: opts.node_id || null,
      severity_hint: this._isPlannedTarget(opts.context_id, opts.node_id) ? 'hard' : 'soft',
      before: opts.before || null,
      after: opts.after || null,
    });
  }

  // ─── Internal ─────────────────────────────────────────────────────

  /**
   * Composite key for target tracking.
   */
  _targetKey(contextId, nodeId) {
    return `${contextId}\x00${nodeId}`;
  }

  /**
   * Build the set of upcoming planned targets from the plan steps.
   */
  _buildPlannedTargets() {
    this._plannedTargets.clear();
    if (!this._plan || !Array.isArray(this._plan.steps)) return;

    const steps = this._plan.steps;
    for (let i = this._currentStepIndex; i < steps.length; i++) {
      const step = steps[i];
      if (!step?.target?.context_id || !step?.target?.node_id) continue;
      const key = this._targetKey(step.target.context_id, step.target.node_id);
      if (!this._plannedTargets.has(key)) {
        this._plannedTargets.set(key, {
          step_id: step.step_id,
          context_id: step.target.context_id,
          node_id: step.target.node_id,
          step_index: i,
        });
      }
      // Also track option_target if present (for select_option steps)
      if (step.action?.option_target) {
        const optKey = this._targetKey(
          step.action.option_target.context_id,
          step.action.option_target.node_id
        );
        if (!this._plannedTargets.has(optKey)) {
          this._plannedTargets.set(optKey, {
            step_id: step.step_id,
            context_id: step.action.option_target.context_id,
            node_id: step.action.option_target.node_id,
            step_index: i,
          });
        }
      }
    }
  }

  /**
   * Check if a target is in the upcoming planned targets.
   */
  _isPlannedTarget(contextId, nodeId) {
    if (!contextId || !nodeId) return false;
    return this._plannedTargets.has(this._targetKey(contextId, nodeId));
  }

  /**
   * Capture fingerprints of planned targets for before/after comparison.
   */
  _captureFingerprints() {
    this._targetFingerprints.clear();
    if (!this._bindingRegistry) return;

    for (const [key, info] of this._plannedTargets) {
      const entry = this._bindingRegistry.resolve(info.context_id, info.node_id);
      if (entry && entry.liveNodeReference) {
        this._targetFingerprints.set(key, this._fingerprint(entry.liveNodeReference));
      }
    }
  }

  /**
   * Generate a structural fingerprint of an element (no selectors, no handles).
   */
  _fingerprint(element) {
    if (!element) return 'null';
    const tag = element.tagName?.toLowerCase() || 'unknown';
    const childCount = element.children?.length || 0;
    const visible = element.offsetParent !== null || element.tagName === 'BODY';
    return `${tag}:children=${childCount}:visible=${visible}`;
  }

  /**
   * Get the observeMutations function from the gateway.
   */
  _getObserveMutations() {
    if (typeof globalThis !== 'undefined' && globalThis.CcDomGateway?.observeMutations) {
      return globalThis.CcDomGateway.observeMutations;
    }
    return null;
  }

  /**
   * Handle incoming mutation records — the core evidence logic.
   * @param {MutationRecord[]} records
   */
  _onMutations(records) {
    if (!this._active || this._evidence.length >= MAX_EVIDENCE_PER_PLAN) return;

    for (const record of records) {
      if (this._evidence.length >= MAX_EVIDENCE_PER_PLAN) break;

      if (record.type === 'childList') {
        this._handleChildListMutation(record);
      } else if (record.type === 'attributes') {
        this._handleAttributeMutation(record);
      }
    }
  }

  /**
   * Handle childList mutations — detect removals, recreations, subtree replacements,
   * option changes, widget recreation.
   */
  _handleChildListMutation(record) {
    const removedNodes = record.removedNodes || [];
    const addedNodes = record.addedNodes || [];

    // Check for removed planned targets
    for (const node of removedNodes) {
      if (node.nodeType !== 1) continue;
      const targetInfo = this._findPlannedTargetInSubtree(node);
      if (targetInfo) {
        // Check if this is a subtree replacement (parent contains multiple planned targets)
        const subtreeTargets = this._findAllPlannedTargetsInSubtree(node);
        if (subtreeTargets.length > 1) {
          this._emitEvidence('subtree_replaced', {
            context_id: subtreeTargets[0].context_id,
            node_id: subtreeTargets[0].node_id,
            severity_hint: 'hard',
            before: { target_count: subtreeTargets.length },
            after: null,
          });
        } else {
          this._removedTargets.add(this._targetKey(targetInfo.context_id, targetInfo.node_id));
          this._emitEvidence('control_removed', {
            context_id: targetInfo.context_id,
            node_id: targetInfo.node_id,
            severity_hint: 'hard',
          });
        }
      }
    }

    // Check for re-added previously removed targets
    for (const node of addedNodes) {
      if (node.nodeType !== 1) continue;
      const targetInfo = this._findPlannedTargetForAddedNode(node);
      if (targetInfo && this._removedTargets.has(this._targetKey(targetInfo.context_id, targetInfo.node_id))) {
        this._removedTargets.delete(this._targetKey(targetInfo.context_id, targetInfo.node_id));
        this._emitEvidence('control_recreated', {
          context_id: targetInfo.context_id,
          node_id: targetInfo.node_id,
          severity_hint: 'hard',
          after: { binding_generation: this._getBindingGeneration(targetInfo.context_id, targetInfo.node_id) },
        });
      }
    }

    // Check for option_set_changed (mutations inside a select/combobox that is a planned target)
    const parentTarget = this._getParentPlannedTarget(record.target);
    if (parentTarget) {
      const parentTag = record.target.tagName?.toLowerCase();
      const parentRole = record.target.getAttribute?.('role')?.toLowerCase();
      if (parentTag === 'select' || parentTag === 'datalist' ||
          parentRole === 'listbox' || parentRole === 'combobox' ||
          record.target.closest?.('select, [role="listbox"], [role="combobox"]')) {
        this._emitEvidence('option_set_changed', {
          context_id: parentTarget.context_id,
          node_id: parentTarget.node_id,
          severity_hint: 'soft',
          before: { option_count: removedNodes.length > 0 ? addedNodes.length + removedNodes.length : null },
          after: { option_count: record.target.children?.length || null },
        });
      }
    }

    // Check for widget_recreated (structural rebuild of a widget containing planned targets)
    if (addedNodes.length > 0 && removedNodes.length > 0) {
      const addedTarget = this._findPlannedTargetInNodes(addedNodes);
      if (addedTarget && removedNodes.length > 0) {
        const parentKey = this._targetKey(addedTarget.context_id, addedTarget.node_id);
        const beforeFp = this._targetFingerprints.get(parentKey);
        const afterFp = addedTarget.element ? this._fingerprint(addedTarget.element) : null;
        if (beforeFp && afterFp && beforeFp !== afterFp) {
          this._emitEvidence('widget_recreated', {
            context_id: addedTarget.context_id,
            node_id: addedTarget.node_id,
            severity_hint: 'hard',
            before: { fingerprint: beforeFp },
            after: { fingerprint: afterFp },
          });
        }
      }
    }

    // Cascade detection: mutation occurred shortly after an action on a related control
    if (this._lastActionTarget && (Date.now() - this._lastActionTime) < 500) {
      const cascadeTarget = this._findPlannedTargetInNodes(addedNodes) || this._findPlannedTargetInNodes(removedNodes);
      if (cascadeTarget) {
        const cascadeKey = this._targetKey(cascadeTarget.context_id, cascadeTarget.node_id);
        if (cascadeKey !== this._lastActionTarget) {
          this._emitEvidence('cascade_triggered', {
            context_id: cascadeTarget.context_id,
            node_id: cascadeTarget.node_id,
            severity_hint: 'soft',
            before: { trigger_target: this._lastActionTarget.split('\x00')[1] },
          });
        }
      }
    }
  }

  /**
   * Handle attribute mutations — detect visibility changes on planned targets.
   */
  _handleAttributeMutation(record) {
    const element = record.target;
    if (!element || element.nodeType !== 1) return;

    const targetInfo = this._getTargetInfoForElement(element);
    if (!targetInfo) return;

    // Visibility-related attributes
    const visAttrs = ['style', 'hidden', 'class'];
    if (visAttrs.includes(record.attributeName)) {
      const wasVisible = this._wasTargetVisible(targetInfo.context_id, targetInfo.node_id);
      const isVisible = this._isElementVisible(element);
      if (wasVisible !== null && wasVisible !== isVisible) {
        this._emitEvidence('visibility_changed', {
          context_id: targetInfo.context_id,
          node_id: targetInfo.node_id,
          severity_hint: isVisible ? 'soft' : 'hard',
          before: { visible: wasVisible },
          after: { visible: isVisible },
        });
      }
    }
  }

  /**
   * Check if an element is visible.
   */
  _isElementVisible(element) {
    if (!element) return false;
    if (element.hasAttribute('hidden')) return false;
    const style = element.style;
    if (style) {
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden') return false;
      if (style.opacity === '0') return false;
    }
    return true;
  }

  /**
   * Check if a planned target was previously visible.
   */
  _wasTargetVisible(contextId, nodeId) {
    const key = this._targetKey(contextId, nodeId);
    const fp = this._targetFingerprints.get(key);
    if (!fp) return null;
    return fp.includes('visible=true');
  }

  /**
   * Find a planned target within a removed subtree by checking the binding registry.
   */
  _findPlannedTargetInSubtree(node) {
    if (!this._bindingRegistry) return null;
    for (const [, info] of this._plannedTargets) {
      const entry = this._bindingRegistry.resolve(info.context_id, info.node_id);
      if (entry && (entry.liveNodeReference === node || node.contains?.(entry.liveNodeReference))) {
        return info;
      }
    }
    return null;
  }

  /**
   * Find all planned targets within a subtree.
   */
  _findAllPlannedTargetsInSubtree(node) {
    const found = [];
    if (!this._bindingRegistry) return found;
    for (const [, info] of this._plannedTargets) {
      const entry = this._bindingRegistry.resolve(info.context_id, info.node_id);
      if (entry && (entry.liveNodeReference === node || node.contains?.(entry.liveNodeReference))) {
        found.push(info);
      }
    }
    return found;
  }

  /**
   * Find a planned target for a newly added node (for recreation detection).
   */
  _findPlannedTargetForAddedNode(node) {
    if (!this._bindingRegistry) return null;
    // Check if this node or its descendants match a planned target by checking
    // the binding registry after potential rebind
    for (const [, info] of this._plannedTargets) {
      const entry = this._bindingRegistry.resolve(info.context_id, info.node_id);
      if (entry && (entry.liveNodeReference === node || node.contains?.(entry.liveNodeReference))) {
        return info;
      }
    }
    return null;
  }

  /**
   * Find any planned target in a NodeList.
   */
  _findPlannedTargetInNodes(nodes) {
    if (!this._bindingRegistry) return null;
    for (const node of nodes) {
      if (node.nodeType !== 1) continue;
      for (const [, info] of this._plannedTargets) {
        const entry = this._bindingRegistry.resolve(info.context_id, info.node_id);
        if (entry && (entry.liveNodeReference === node || node.contains?.(entry.liveNodeReference))) {
          return { ...info, element: entry.liveNodeReference };
        }
      }
    }
    return null;
  }

  /**
   * Get the planned target info for a given element (by matching binding).
   */
  _getTargetInfoForElement(element) {
    if (!this._bindingRegistry) return null;
    for (const [, info] of this._plannedTargets) {
      const entry = this._bindingRegistry.resolve(info.context_id, info.node_id);
      if (entry && entry.liveNodeReference === element) {
        return info;
      }
    }
    return null;
  }

  /**
   * Get the planned target info if the given element is or contains a planned target.
   */
  _getParentPlannedTarget(element) {
    if (!this._bindingRegistry || !element) return null;
    for (const [, info] of this._plannedTargets) {
      const entry = this._bindingRegistry.resolve(info.context_id, info.node_id);
      if (entry && (entry.liveNodeReference === element || element.contains?.(entry.liveNodeReference))) {
        return info;
      }
    }
    return null;
  }

  /**
   * Get binding generation for a target.
   */
  _getBindingGeneration(contextId, nodeId) {
    if (!this._bindingRegistry) return null;
    return this._bindingRegistry.getGeneration(contextId, nodeId) || null;
  }

  /**
   * Emit an evidence event (bounded, public refs only).
   */
  _emitEvidence(type, opts = {}) {
    if (this._evidence.length >= MAX_EVIDENCE_PER_PLAN) return;

    const event = createEvidenceEvent(type, {
      plan_id: this._plan?.plan_id || null,
      step_id: opts.step_id || this._getNextStepId(opts.context_id, opts.node_id) || null,
      correlation_id: this._plan?.correlation_id || null,
      context_id: opts.context_id || null,
      node_id: opts.node_id || null,
      severity_hint: opts.severity_hint || 'soft',
      before: opts.before || null,
      after: opts.after || null,
    });

    this._evidence.push(event);

    // Notify listeners
    for (const listener of this._listeners) {
      try { listener(event); } catch { /* listener errors are non-fatal */ }
    }
  }

  /**
   * Get the next step_id for a given target.
   */
  _getNextStepId(contextId, nodeId) {
    if (!contextId || !nodeId) return null;
    const key = this._targetKey(contextId, nodeId);
    const info = this._plannedTargets.get(key);
    return info?.step_id || null;
  }
}

// Export for both ES modules and content-script injection contexts.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DomEvidenceEmitter, EVIDENCE_TYPES, MAX_EVIDENCE_PER_PLAN };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcDomEvidence = DomEvidenceEmitter;
}
})();
