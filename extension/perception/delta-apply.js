/**
 * CyberControl PageDelta application — Phase 3.3 remediation (#133 / IMP-P1-02)
 *
 * Applies typed PageDelta operations to a base PageSnapshot and produces a
 * composed graph for invariant validation. Does not mutate the base object.
 *
 * Consumers must not publish or execute from an unvalidated composed graph.
 */

/**
 * Deep-clone a JSON-safe value.
 * @param {*} value
 * @returns {*}
 */
function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Apply a PageDelta's operations onto a base PageSnapshot.
 *
 * @param {object} baseSnapshot — complete PageSnapshot
 * @param {object} delta — PageDelta with operations[]
 * @returns {{ ok: boolean, snapshot: object|null, errors: string[] }}
 */
function applyPageDelta(baseSnapshot, delta) {
  const errors = [];
  if (!baseSnapshot || baseSnapshot.kind !== 'page_snapshot') {
    return { ok: false, snapshot: null, errors: ['base is not a page_snapshot'] };
  }
  if (!delta || delta.kind !== 'page_delta') {
    return { ok: false, snapshot: null, errors: ['delta is not a page_delta'] };
  }
  if (delta.document_id !== baseSnapshot.document_id) {
    return { ok: false, snapshot: null, errors: ['document_id mismatch'] };
  }
  if (delta.base_revision !== baseSnapshot.revision) {
    return { ok: false, snapshot: null, errors: ['base_revision mismatch'] };
  }

  const next = cloneJson(baseSnapshot);
  next.revision = delta.revision;
  next.snapshot_id = delta.result_snapshot_id || next.snapshot_id;
  next.canonical_hash = delta.result_canonical_hash || next.canonical_hash;
  next.observed_at = delta.observed_at || next.observed_at;
  if (delta.producer) next.producer = cloneJson(delta.producer);
  if (delta.privacy) next.privacy = cloneJson(delta.privacy);

  const ops = Array.isArray(delta.operations) ? delta.operations : [];
  for (const op of ops) {
    if (!op || !op.op || !op.entity) {
      errors.push('malformed operation');
      continue;
    }
    try {
      applyOp(next, op, errors);
    } catch (e) {
      errors.push(e.message || String(e));
    }
  }

  if (errors.length) {
    return { ok: false, snapshot: next, errors };
  }
  return { ok: true, snapshot: next, errors: [] };
}

function applyOp(snap, op, errors) {
  const { op: kind, entity, id, value } = op;

  if (entity === 'node') {
    if (!snap.nodes || typeof snap.nodes !== 'object' || Array.isArray(snap.nodes)) {
      snap.nodes = {};
    }
    if (kind === 'add' || kind === 'replace') {
      if (!value || !value.node_id) {
        errors.push(`node ${kind} missing value.node_id`);
        return;
      }
      if (id && value.node_id !== id) {
        errors.push(`node ${kind} id mismatch ${id} vs ${value.node_id}`);
      }
      snap.nodes[value.node_id] = cloneJson(value);
    } else if (kind === 'remove') {
      if (!id || !snap.nodes[id]) {
        errors.push(`node remove unknown id ${id}`);
        return;
      }
      delete snap.nodes[id];
      // Drop edges that referenced the removed node
      snap.edges = (snap.edges || []).filter(
        (e) => e.source_id !== id && e.target_id !== id
      );
    } else {
      errors.push(`unknown node op ${kind}`);
    }
    return;
  }

  if (entity === 'edge') {
    if (!Array.isArray(snap.edges)) snap.edges = [];
    if (kind === 'add') {
      if (!value || !value.edge_id) {
        errors.push('edge add missing value.edge_id');
        return;
      }
      if (snap.edges.some((e) => e.edge_id === value.edge_id)) {
        errors.push(`edge add duplicate ${value.edge_id}`);
        return;
      }
      snap.edges.push(cloneJson(value));
    } else if (kind === 'replace') {
      const idx = snap.edges.findIndex((e) => e.edge_id === id);
      if (idx < 0) {
        errors.push(`edge replace unknown id ${id}`);
        return;
      }
      if (!value || value.edge_id !== id) {
        errors.push(`edge replace value.edge_id must match id`);
        return;
      }
      snap.edges[idx] = cloneJson(value);
    } else if (kind === 'remove') {
      // Idempotent: edge may already be gone after cascade from node remove
      snap.edges = snap.edges.filter((e) => e.edge_id !== id);
    } else {
      errors.push(`unknown edge op ${kind}`);
    }
    return;
  }

  if (entity === 'context') {
    if (!Array.isArray(snap.contexts)) snap.contexts = [];
    if (kind === 'add') {
      if (!value || !value.context_id) {
        errors.push('context add missing value.context_id');
        return;
      }
      snap.contexts.push(cloneJson(value));
    } else if (kind === 'replace') {
      const idx = snap.contexts.findIndex((c) => c.context_id === id);
      if (idx < 0) {
        errors.push(`context replace unknown id ${id}`);
        return;
      }
      snap.contexts[idx] = cloneJson(value);
    } else if (kind === 'remove') {
      const before = snap.contexts.length;
      snap.contexts = snap.contexts.filter((c) => c.context_id !== id);
      if (snap.contexts.length === before) {
        errors.push(`context remove unknown id ${id}`);
      }
    }
    return;
  }

  if (entity === 'state') {
    if (kind === 'replace' || kind === 'add') {
      snap.state = cloneJson(value || { signals: [], candidates: [] });
    }
    return;
  }

  // page / diagnostics ops — best-effort replace
  if (entity === 'page' && (kind === 'replace' || kind === 'add') && value) {
    snap.page = cloneJson(value);
  }
}

/**
 * Apply delta, then run graph invariants on the composed snapshot.
 *
 * @param {object} baseSnapshot
 * @param {object} delta
 * @param {function} [validateGraphInvariantsFn]
 * @returns {{ ok: boolean, snapshot: object|null, errors: string[] }}
 */
function validateComposedGraph(baseSnapshot, delta, validateGraphInvariantsFn) {
  const applied = applyPageDelta(baseSnapshot, delta);
  if (!applied.ok) {
    return { ok: false, snapshot: applied.snapshot, errors: applied.errors };
  }

  let validate = validateGraphInvariantsFn;
  if (!validate && typeof globalThis !== 'undefined' && globalThis.CcGraphInvariants?.validateGraphInvariants) {
    validate = globalThis.CcGraphInvariants.validateGraphInvariants;
  }
  if (!validate && typeof require !== 'undefined') {
    try {
      // eslint-disable-next-line global-require
      validate = require('./graph-invariants.js').validateGraphInvariants;
    } catch {
      return {
        ok: false,
        snapshot: applied.snapshot,
        errors: ['graph_invariants_unavailable during composed validation'],
      };
    }
  }
  if (!validate) {
    return {
      ok: false,
      snapshot: applied.snapshot,
      errors: ['graph_invariants_unavailable during composed validation'],
    };
  }

  const gi = validate(applied.snapshot);
  if (!gi.valid) {
    return { ok: false, snapshot: applied.snapshot, errors: gi.errors || ['composed graph invalid'] };
  }
  return { ok: true, snapshot: applied.snapshot, errors: [] };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applyPageDelta, validateComposedGraph, cloneJson };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcDeltaApply = { applyPageDelta, validateComposedGraph, cloneJson };
}
