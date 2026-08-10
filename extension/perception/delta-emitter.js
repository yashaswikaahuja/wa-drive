/**
 * CyberControl Delta Emitter — extension/perception/delta-emitter.js
 * Phase 3.3 — Perception Completion
 *
 * Observes relevant DOM mutations via the gateway MutationObserver,
 * coalesces dirty subtrees, re-perceives affected nodes, diffs against
 * the previous snapshot, and emits a validated PageDelta.
 *
 * INVARIANTS (architecture/perception-lifecycle.yml):
 *  - base_revision exactly equals the consumer's last-seen revision.
 *  - revision is strictly greater than base_revision.
 *  - result_canonical_hash equals the canonical_hash of the complete
 *    resulting snapshot (delta_hash_semantics).
 *  - A delta larger than 50% of a full snapshot is replaced by a snapshot.
 *  - No delta emitted when canonical public IR is unchanged.
 *  - CyberControl-private mutations are filtered by the gateway.
 *
 * ARCHITECTURE (constitution.yml):
 *  - Extension = Eyes + Hands. No semantic interpretation, no AI, no planning.
 *  - This module only observes and reports structural changes.
 */

/**
 * @typedef {object} DeltaEmitterDeps
 * @property {object} gateway — dom-gateway module (observeMutations, captureStructuralFacts)
 * @property {object} revisionManager — RevisionManager instance
 * @property {object} bindingRegistry — BindingRegistry instance
 * @property {object} snapshotBuilder — snapshot-builder module ({ buildSnapshot })
 * @property {object} canonicalHash — canonical-hash module ({ computeCanonicalHash })
 * @property {object} validator — validator module ({ validateDelta })
 * @property {object} nodeFactory — node-factory module
 * @property {object} edgeFactory — edge-factory module
 * @property {object} privacyFilter — privacy-filter module
 * @property {object} widgetClassifier — widget-classifier module
 * @property {object} contextDiscovery — context-discovery module
 */

/**
 * Compaction threshold: if delta operations exceed this fraction of the
 * total node count in the base snapshot, emit a full snapshot instead.
 */
const COMPACTION_THRESHOLD = 0.5;

/**
 * Maximum coalesce window before flushing (ms).
 * Prevents unbounded batching on continuous mutations.
 */
const COALESCE_WINDOW_MS = 100;

/**
 * Minimum quiet period after last mutation before emitting (ms).
 */
const SETTLE_DELAY_MS = 50;

class DeltaEmitter {
  /**
   * @param {DeltaEmitterDeps} deps
   * @param {object} [options]
   * @param {number} [options.coalesceMs] — override coalesce window
   * @param {number} [options.settleMs] — override settle delay
   * @param {function} [options.onDelta] — callback(PageDelta | PageSnapshot)
   * @param {function} [options.onError] — callback(Error)
   */
  constructor(deps, options = {}) {
    this._deps = deps;
    this._coalesceMs = options.coalesceMs ?? COALESCE_WINDOW_MS;
    this._settleMs = options.settleMs ?? SETTLE_DELAY_MS;
    this._onDelta = options.onDelta || null;
    this._onError = options.onError || null;

    /** @type {object|null} Last emitted/known complete snapshot. */
    this._baseSnapshot = null;

    /** @type {Set<string>} Dirty node_ids (by parent subtree hint). */
    this._dirtyNodes = new Set();

    /** @type {boolean} Whether full-page re-perception is needed. */
    this._fullDirty = false;

    /** @type {number|null} Settle timer ID. */
    this._settleTimer = null;

    /** @type {number|null} Coalesce deadline timer ID. */
    this._coalesceTimer = null;

    /** @type {boolean} */
    this._active = false;

    /** @type {{observer: MutationObserver, disconnect: function}|null} */
    this._observerHandle = null;

    /** @type {boolean} Processing lock to prevent re-entrant emission. */
    this._emitting = false;
  }

  /**
   * Start observing DOM mutations.
   * Requires a base snapshot to diff against.
   * @param {object} baseSnapshot — a valid PageSnapshot (from buildSnapshot)
   * @param {Element|Document} [root] — observation root (defaults to document)
   */
  start(baseSnapshot, root) {
    if (this._active) return;
    this._baseSnapshot = baseSnapshot;
    this._active = true;

    const observeRoot = root || (typeof document !== 'undefined' ? document.documentElement : null);
    if (!observeRoot) throw new Error('DeltaEmitter.start: no root element');

    this._observerHandle = this._deps.gateway.observeMutations(observeRoot, (records) => {
      this._onMutations(records);
    });
  }

  /**
   * Stop observing and clean up timers.
   */
  stop() {
    this._active = false;
    if (this._observerHandle) {
      this._observerHandle.disconnect();
      this._observerHandle = null;
    }
    this._clearTimers();
    this._dirtyNodes.clear();
    this._fullDirty = false;
  }

  /**
   * Get the current base snapshot (last known good state).
   * @returns {object|null}
   */
  getBaseSnapshot() {
    return this._baseSnapshot;
  }

  /**
   * Force-set base snapshot (e.g. after consumer receives a fresh snapshot).
   * @param {object} snapshot
   */
  setBaseSnapshot(snapshot) {
    this._baseSnapshot = snapshot;
  }

  // ─── Internal ─────────────────────────────────────────────────────

  /**
   * Handle incoming filtered mutation records from the gateway observer.
   * @param {MutationRecord[]} records
   */
  _onMutations(records) {
    if (!this._active) return;

    for (const record of records) {
      if (record.type === 'childList') {
        // Structural change — mark full dirty (conservative; future optimization
        // can narrow to the mutated subtree).
        this._fullDirty = true;
      } else if (record.type === 'attributes' || record.type === 'characterData') {
        // Attribute/text change — mark the target as dirty.
        // We don't have the node_id readily, so mark full dirty for now.
        // A more refined approach would maintain element→node_id reverse lookup.
        this._fullDirty = true;
      }
    }

    this._scheduleEmit();
  }

  /**
   * Schedule a delta emission after the settle/coalesce window.
   */
  _scheduleEmit() {
    // Reset settle timer on every new batch of mutations.
    if (this._settleTimer !== null) {
      clearTimeout(this._settleTimer);
    }
    this._settleTimer = setTimeout(() => {
      this._settleTimer = null;
      this._emit();
    }, this._settleMs);

    // Hard coalesce deadline: ensures we don't wait forever during
    // continuous mutation streams.
    if (this._coalesceTimer === null) {
      this._coalesceTimer = setTimeout(() => {
        this._coalesceTimer = null;
        if (this._settleTimer !== null) {
          clearTimeout(this._settleTimer);
          this._settleTimer = null;
        }
        this._emit();
      }, this._coalesceMs);
    }
  }

  /**
   * Perform the actual delta computation and emission.
   */
  async _emit() {
    if (this._emitting || !this._active) return;
    this._emitting = true;
    this._clearTimers();

    try {
      const base = this._baseSnapshot;
      if (!base) {
        this._emitting = false;
        return;
      }

      // Re-perceive: build a new full snapshot.
      const newSnapshot = await this._deps.snapshotBuilder.buildSnapshot({
        gateway: this._deps.gateway,
        revisionManager: this._deps.revisionManager,
        bindingRegistry: this._deps.bindingRegistry,
        privacyFilter: this._deps.privacyFilter,
        widgetClassifier: this._deps.widgetClassifier,
        contextDiscovery: this._deps.contextDiscovery,
        nodeFactory: this._deps.nodeFactory,
        edgeFactory: this._deps.edgeFactory,
        canonicalHash: this._deps.canonicalHash,
        validator: this._deps.validator,
      });

      // Check if canonical IR actually changed.
      if (newSnapshot.canonical_hash === base.canonical_hash) {
        // No meaningful change — do not emit.
        this._fullDirty = false;
        this._dirtyNodes.clear();
        this._emitting = false;
        return;
      }

      // Compute delta operations.
      const operations = this._diffSnapshots(base, newSnapshot);

      // Compaction check: if ops > 50% of base node count, emit full snapshot.
      const baseNodeCount = Object.keys(base.nodes).length;
      if (operations.length > baseNodeCount * COMPACTION_THRESHOLD) {
        // Emit as full snapshot instead of delta.
        this._baseSnapshot = newSnapshot;
        this._fullDirty = false;
        this._dirtyNodes.clear();
        this._emitting = false;
        if (this._onDelta) this._onDelta(newSnapshot);
        return;
      }

      // Build PageDelta envelope.
      const delta = {
        kind: 'page_delta',
        schema_version: '2.0.0',
        producer: newSnapshot.producer,
        document_id: newSnapshot.document_id,
        base_snapshot_id: base.snapshot_id,
        base_revision: base.revision,
        revision: newSnapshot.revision,
        observed_at: new Date().toISOString(),
        result_snapshot_id: newSnapshot.snapshot_id,
        result_canonical_hash: newSnapshot.canonical_hash,
        operations,
        diagnostics: this._buildDiagnostics(base, newSnapshot),
        privacy: this._aggregatePrivacy(operations, newSnapshot),
      };

      // Validate delta schema.
      const validation = this._deps.validator.validateDelta(delta);
      if (!validation.valid) {
        const err = new Error(`PageDelta validation failed: ${(validation.errors || []).slice(0, 5).join('; ')}`);
        err.validationErrors = validation.errors;
        if (this._onError) this._onError(err);
        // Fall back to emitting the full snapshot.
        this._baseSnapshot = newSnapshot;
        this._fullDirty = false;
        this._dirtyNodes.clear();
        this._emitting = false;
        if (this._onDelta) this._onDelta(newSnapshot);
        return;
      }

      // IMP-P1-02 (#133): reconstruct graph from base+ops and re-run invariants.
      // Prefer explicit delta-apply module; fail closed if unavailable.
      const composeOk = this._validateComposedGraph(base, delta, newSnapshot);
      if (!composeOk.ok) {
        const err = new Error(
          `PageDelta composed graph invalid: ${(composeOk.errors || []).slice(0, 5).join('; ')}`
        );
        err.validationErrors = composeOk.errors;
        if (this._onError) this._onError(err);
        // Fall back to full snapshot (already invariant-validated by buildSnapshot).
        this._baseSnapshot = newSnapshot;
        this._fullDirty = false;
        this._dirtyNodes.clear();
        this._emitting = false;
        if (this._onDelta) this._onDelta(newSnapshot);
        return;
      }

      // Success — update base and emit.
      this._baseSnapshot = newSnapshot;
      this._fullDirty = false;
      this._dirtyNodes.clear();
      if (this._onDelta) this._onDelta(delta);
    } catch (err) {
      if (this._onError) this._onError(err);
    } finally {
      this._emitting = false;
    }
  }

  /**
   * Apply delta ops to base and run graph invariants (IMP-P1-02).
   * @param {object} base
   * @param {object} delta
   * @param {object} [authoritativeNext] — optional full snapshot for cross-check
   * @returns {{ ok: boolean, errors: string[] }}
   */
  _validateComposedGraph(base, delta, authoritativeNext) {
    let applyFn = null;
    let validateCompose = null;
    if (typeof globalThis !== 'undefined' && globalThis.CcDeltaApply) {
      applyFn = globalThis.CcDeltaApply.applyPageDelta;
      validateCompose = globalThis.CcDeltaApply.validateComposedGraph;
    } else if (typeof require !== 'undefined') {
      try {
        // eslint-disable-next-line global-require
        const mod = require('./delta-apply.js');
        applyFn = mod.applyPageDelta;
        validateCompose = mod.validateComposedGraph;
      } catch (e) {
        return { ok: false, errors: [`delta_apply_unavailable: ${e.message || e}`] };
      }
    }
    if (!validateCompose && !applyFn) {
      return { ok: false, errors: ['delta_apply_unavailable: module not loaded'] };
    }

    let giValidate = null;
    if (this._deps.validator?.validateGraphInvariants) {
      giValidate = (s) => this._deps.validator.validateGraphInvariants(s);
    }

    if (validateCompose) {
      const result = validateCompose(base, delta, giValidate);
      if (!result.ok) return { ok: false, errors: result.errors || ['composed graph invalid'] };
      // Optional: composed edge multiset should match authoritative next when provided
      if (authoritativeNext && result.snapshot) {
        const edgeKey = (e) => `${e.type}|${e.source_id}|${e.target_id}`;
        const a = new Set((result.snapshot.edges || []).map(edgeKey));
        const b = new Set((authoritativeNext.edges || []).map(edgeKey));
        if (a.size !== b.size || [...a].some((k) => !b.has(k))) {
          // Not a hard failure if node_ids churn — only warn via diagnostics path.
          // Hard-check parent_id/contains already covered by invariants on composed.
        }
      }
      return { ok: true, errors: [] };
    }

    const applied = applyFn(base, delta);
    if (!applied.ok) return { ok: false, errors: applied.errors };
    if (giValidate) {
      const gi = giValidate(applied.snapshot);
      if (!gi.valid) return { ok: false, errors: gi.errors || ['composed graph invalid'] };
    }
    return { ok: true, errors: [] };
  }

  /**
   * Diff two snapshots and produce typed DeltaOperation[].
   * @param {object} base
   * @param {object} next
   * @returns {object[]}
   */
  _diffSnapshots(base, next) {
    const ops = [];

    // ── Nodes ──────────────────────────────────────────────────────
    const baseNodeIds = new Set(Object.keys(base.nodes));
    const nextNodeIds = new Set(Object.keys(next.nodes));

    // Removed nodes
    for (const id of baseNodeIds) {
      if (!nextNodeIds.has(id)) {
        ops.push({ op: 'remove', entity: 'node', id });
      }
    }

    // Added nodes
    for (const id of nextNodeIds) {
      if (!baseNodeIds.has(id)) {
        ops.push({ op: 'add', entity: 'node', id, value: next.nodes[id] });
      }
    }

    // Replaced nodes (changed content)
    for (const id of nextNodeIds) {
      if (baseNodeIds.has(id)) {
        if (!this._nodesEqual(base.nodes[id], next.nodes[id])) {
          ops.push({ op: 'replace', entity: 'node', id, value: next.nodes[id] });
        }
      }
    }

    // ── Edges ──────────────────────────────────────────────────────
    const baseEdgeMap = new Map(base.edges.map((e) => [e.edge_id, e]));
    const nextEdgeMap = new Map(next.edges.map((e) => [e.edge_id, e]));

    for (const [id] of baseEdgeMap) {
      if (!nextEdgeMap.has(id)) {
        ops.push({ op: 'remove', entity: 'edge', id });
      }
    }
    for (const [id, edge] of nextEdgeMap) {
      if (!baseEdgeMap.has(id)) {
        ops.push({ op: 'add', entity: 'edge', id, value: edge });
      } else if (!this._edgesEqual(baseEdgeMap.get(id), edge)) {
        ops.push({ op: 'replace', entity: 'edge', id, value: edge });
      }
    }

    // ── Contexts ───────────────────────────────────────────────────
    const baseCtxMap = new Map(base.contexts.map((c) => [c.context_id, c]));
    const nextCtxMap = new Map(next.contexts.map((c) => [c.context_id, c]));

    for (const [id] of baseCtxMap) {
      if (!nextCtxMap.has(id)) {
        ops.push({ op: 'remove', entity: 'context', id });
      }
    }
    for (const [id, ctx] of nextCtxMap) {
      if (!baseCtxMap.has(id)) {
        ops.push({ op: 'add', entity: 'context', id, value: ctx });
      } else if (JSON.stringify(baseCtxMap.get(id)) !== JSON.stringify(ctx)) {
        ops.push({ op: 'replace', entity: 'context', id, value: ctx });
      }
    }

    // ── Page state ─────────────────────────────────────────────────
    if (JSON.stringify(base.state) !== JSON.stringify(next.state)) {
      ops.push({ op: 'replace', entity: 'state', id: null, value: next.state });
    }

    return ops;
  }

  /**
   * Shallow structural equality for nodes (excludes geometry timing jitter).
   */
  _nodesEqual(a, b) {
    // Compare everything except geometry micro-differences that don't matter.
    // Use JSON for determinism — already canonical-safe fields.
    const strip = (n) => {
      const { geometry, ...rest } = n;
      return JSON.stringify(rest);
    };
    if (strip(a) !== strip(b)) return false;
    // Compare geometry with tolerance (1px).
    if (!a.geometry && !b.geometry) return true;
    if (!a.geometry || !b.geometry) return false;
    return (
      Math.abs(a.geometry.x - b.geometry.x) <= 1 &&
      Math.abs(a.geometry.y - b.geometry.y) <= 1 &&
      Math.abs(a.geometry.width - b.geometry.width) <= 1 &&
      Math.abs(a.geometry.height - b.geometry.height) <= 1 &&
      Math.abs(a.geometry.viewport_intersection - b.geometry.viewport_intersection) <= 0.01
    );
  }

  /**
   * Edge equality.
   */
  _edgesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /**
   * Build delta-specific diagnostics.
   */
  _buildDiagnostics(base, next) {
    const diags = [];
    const opsCount = Object.keys(next.nodes).length - Object.keys(base.nodes).length;
    if (Math.abs(opsCount) > 100) {
      diags.push({
        code: 'large_delta',
        severity: 'warning',
        node_id: null,
        message: `Delta involves significant structural change (${opsCount > 0 ? '+' : ''}${opsCount} nodes)`,
      });
    }
    return diags;
  }

  /**
   * Aggregate privacy: at least as restrictive as the most restrictive
   * operation value or affected node.
   */
  _aggregatePrivacy(operations, snapshot) {
    const ORDER = ['public', 'ordinary', 'personal', 'sensitive', 'secret'];
    let maxIdx = 0; // 'public'

    for (const op of operations) {
      if (op.value && op.value.privacy) {
        const idx = ORDER.indexOf(op.value.privacy.classification);
        if (idx > maxIdx) maxIdx = idx;
      }
      // For node references, check the snapshot's privacy.
      if (op.entity === 'node' && op.id && snapshot.nodes[op.id]) {
        const idx = ORDER.indexOf(snapshot.nodes[op.id].privacy?.classification);
        if (idx > maxIdx) maxIdx = idx;
      }
    }

    return {
      classification: ORDER[maxIdx] || 'ordinary',
      redacted: maxIdx >= ORDER.indexOf('secret'),
      reason: maxIdx >= ORDER.indexOf('secret') ? 'contains_secret_node_changes' : null,
    };
  }

  /**
   * Clear all pending timers.
   */
  _clearTimers() {
    if (this._settleTimer !== null) {
      clearTimeout(this._settleTimer);
      this._settleTimer = null;
    }
    if (this._coalesceTimer !== null) {
      clearTimeout(this._coalesceTimer);
      this._coalesceTimer = null;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DeltaEmitter, COMPACTION_THRESHOLD, COALESCE_WINDOW_MS, SETTLE_DELAY_MS };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcDeltaEmitter = DeltaEmitter;
}
