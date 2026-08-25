/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
(function () {
'use strict';
/**
 * CyberControl Binding Registry — browser-private binding table.
 * Maps (context_id, node_id) → live DOM element with binding_generation tracking.
 *
 * INVARIANTS (architecture/dom-access-policy.yml):
 *  - Memory-only: no serialization, no persistence, no JSON output.
 *  - Lives exclusively in the extension isolated world.
 *  - Invalidated on full navigation, context destruction, node removal,
 *    binding_generation mismatch, or explicit perception reset.
 *  - Keys are (context_id, node_id); resolves via document_id + node_id.
 */

class BindingRegistry {
  constructor() {
    /** @type {Map<string, {liveNodeReference: any, bindingGeneration: number, adapterId: string|null, createdRevision: number}>} */
    this._entries = new Map();
  }

  /** Composite key for internal storage. */
  static _key(contextId, nodeId) {
    return `${contextId}\x00${nodeId}`;
  }

  /**
   * Register a live element binding.
   * @param {string} contextId
   * @param {string} nodeId
   * @param {Element} liveElement
   * @param {string|null} adapterId
   * @param {number} createdRevision
   */
  bind(contextId, nodeId, liveElement, adapterId, createdRevision) {
    const key = BindingRegistry._key(contextId, nodeId);
    this._entries.set(key, {
      liveNodeReference: liveElement,
      bindingGeneration: 1,
      adapterId: adapterId ?? null,
      createdRevision,
    });
  }

  /**
   * Resolve a binding. Returns the entry or null if not found.
   * @param {string} contextId
   * @param {string} nodeId
   * @returns {{liveNodeReference: any, bindingGeneration: number, adapterId: string|null, createdRevision: number}|null}
   */
  resolve(contextId, nodeId) {
    return this._entries.get(BindingRegistry._key(contextId, nodeId)) ?? null;
  }

  /**
   * Returns the current binding_generation for a binding, or 0 if not found.
   */
  getGeneration(contextId, nodeId) {
    const entry = this._entries.get(BindingRegistry._key(contextId, nodeId));
    return entry ? entry.bindingGeneration : 0;
  }

  /**
   * Rebind a node to a new live element (e.g. after SPA rerender).
   * Increments binding_generation for TOCTOU detection (perception-lifecycle
   * rebinding_continuity). Never silently preserves an old plan's generation.
   * @param {string} contextId
   * @param {string} nodeId
   * @param {Element} newElement
   * @param {{adapterId?: string|null, createdRevision?: number}} [opts]
   */
  rebind(contextId, nodeId, newElement, opts = {}) {
    const key = BindingRegistry._key(contextId, nodeId);
    const entry = this._entries.get(key);
    if (!entry) {
      throw new Error(`Cannot rebind non-existent binding: ${contextId}/${nodeId}`);
    }
    entry.liveNodeReference = newElement;
    entry.bindingGeneration += 1;
    if (opts.adapterId !== undefined) entry.adapterId = opts.adapterId;
    if (opts.createdRevision !== undefined) entry.createdRevision = opts.createdRevision;
  }

  /**
   * Continuity-aware live binding for perception publish / delta paths.
   * - New node → bind (generation 1)
   * - Same live element → update metadata only (generation unchanged)
   * - Different live element → rebind (generation advances)
   * @returns {{action: 'bound'|'rebound'|'touched', bindingGeneration: number}}
   */
  upsert(contextId, nodeId, liveElement, adapterId, createdRevision) {
    const entry = this.resolve(contextId, nodeId);
    if (!entry) {
      this.bind(contextId, nodeId, liveElement, adapterId, createdRevision);
      return { action: 'bound', bindingGeneration: 1 };
    }
    if (entry.liveNodeReference !== liveElement) {
      this.rebind(contextId, nodeId, liveElement, {
        adapterId: adapterId ?? entry.adapterId,
        createdRevision,
      });
      return { action: 'rebound', bindingGeneration: this.getGeneration(contextId, nodeId) };
    }
    entry.adapterId = adapterId ?? entry.adapterId;
    entry.createdRevision = createdRevision;
    return { action: 'touched', bindingGeneration: entry.bindingGeneration };
  }

  /**
   * Invalidate all bindings for a given context (e.g. frame navigation).
   */
  invalidateContext(contextId) {
    const prefix = `${contextId}\x00`;
    for (const key of this._entries.keys()) {
      if (key.startsWith(prefix)) {
        this._entries.delete(key);
      }
    }
  }

  /**
   * Invalidate a single binding.
   */
  invalidateNode(contextId, nodeId) {
    this._entries.delete(BindingRegistry._key(contextId, nodeId));
  }

  /**
   * Invalidate all bindings (full navigation / perception reset).
   */
  invalidateAll() {
    this._entries.clear();
  }

  /** Number of active bindings. */
  get size() {
    return this._entries.size;
  }

  /** Iterate over all bindings as [{ contextId, nodeId, ...entry }]. */
  *entries() {
    for (const [key, entry] of this._entries) {
      const [contextId, nodeId] = key.split('\x00');
      yield { contextId, nodeId, ...entry };
    }
  }

  /**
   * Serialization is prohibited. Overriding toJSON ensures any accidental
   * JSON.stringify throws immediately.
   */
  toJSON() {
    throw new Error('BindingRegistry serialization is prohibited (architecture/dom-access-policy.yml)');
  }
}

// Export for both ES modules and content-script injection contexts.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BindingRegistry };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcBindingRegistry = BindingRegistry;
}
})();
