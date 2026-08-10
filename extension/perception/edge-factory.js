/**
 * CyberControl Edge Factory — Phase 3.3 Relationships & Structural Semantics (#131)
 *
 * Derives public Page IR edges from IR nodes + private observation metadata.
 * Implements #130 P1 conditions:
 *   - parent_id is authoritative; contains mirrors parent_id only
 *   - no business-semantic depends_on
 *   - no dangling transitions_to (target must exist as a node)
 *
 * Edge types produced:
 *   contains, belongs_to_context, labels, describes, error_for, controls,
 *   validates, confirms, repeats, activates, overlays, visually_groups_with
 *
 * NEVER produces depends_on (service-owned business interpretation).
 * transitions_to only when destination node exists in the same snapshot.
 */

const DETECTOR = 'edge-factory';
const DETECTOR_VERSION = '2.0.0';

/**
 * Derive edges from nodes + contexts + optional private fact metadata.
 *
 * @param {object} nodesMap — { [node_id]: Node }
 * @param {object[]} contexts — Context[]
 * @param {object} [options]
 * @param {object} [options.factMeta] — { [node_id]: private observation aids from gateway }
 * @returns {object[]} Edge[]
 */
function deriveEdges(nodesMap, contexts, options = {}) {
  const edges = [];
  const seen = new Set(); // dedupe type|source|target
  const factMeta = options.factMeta || {};
  const nodes = Object.values(nodesMap || {});
  const byId = nodesMap || {};
  const contextIds = new Set((contexts || []).map((c) => c.context_id));

  // Index private DOM ids → node_id (same context preferred)
  const domIdIndex = buildDomIdIndex(factMeta, byId);

  function pushEdge(type, sourceId, targetId, evidenceSpec) {
    if (!sourceId || !targetId) return;
    if (type === 'depends_on') return; // hard forbid
    if (type === 'belongs_to_context') {
      if (!byId[sourceId] || !contextIds.has(targetId)) return;
    } else {
      if (!byId[sourceId] || !byId[targetId]) return; // no dangling endpoints
    }
    // Cross-inaccessible-context: skip non-structural edges
    if (type !== 'contains' && type !== 'belongs_to_context') {
      const a = byId[sourceId];
      const b = byId[targetId];
      if (a && b && a.context_id !== b.context_id) {
        const ca = (contexts || []).find((c) => c.context_id === a.context_id);
        const cb = (contexts || []).find((c) => c.context_id === b.context_id);
        if (isInaccessible(ca) || isInaccessible(cb)) return;
      }
    }
    const key = `${type}|${sourceId}|${targetId}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(makeEdge(type, sourceId, targetId, evidenceSpec));
  }

  // ── 1. contains: mirror parent_id only (authoritative) ───────────────
  for (const node of nodes) {
    if (node.parent_id) {
      pushEdge('contains', node.parent_id, node.node_id, {
        source: 'derived',
        confidence: 1.0,
        signals: ['structural.parent_child'],
        facts: ['structural.parent_child'],
      });
    }
  }

  // ── 2. belongs_to_context ────────────────────────────────────────────
  for (const node of nodes) {
    if (node.context_id && contextIds.has(node.context_id)) {
      pushEdge('belongs_to_context', node.node_id, node.context_id, {
        source: 'derived',
        confidence: 1.0,
        signals: ['structural.context_membership'],
        facts: ['structural.context_membership'],
      });
    }
  }

  // ── 3. labels via aria-labelledby / label[for] (observed-grade) ───────
  for (const node of nodes) {
    const meta = factMeta[node.node_id] || {};
    const ctx = node.context_id;

    // aria-labelledby on control → label nodes
    if (isInteractiveKind(node) && meta.labelledByIds?.length) {
      for (const lid of meta.labelledByIds) {
        const labelNodeId = resolveDomId(domIdIndex, lid, ctx);
        if (labelNodeId) {
          pushEdge('labels', labelNodeId, node.node_id, {
            source: 'observed',
            confidence: 0.95,
            signals: ['aria.labelledby'],
            facts: ['aria.labelledby'],
          });
        }
      }
    }

    // label[for=id] → control with matching id
    if ((node.kind === 'content' || meta.tag === 'label') && meta.htmlFor) {
      const controlId = resolveDomId(domIdIndex, meta.htmlFor, ctx);
      if (controlId && isInteractiveKind(byId[controlId])) {
        pushEdge('labels', node.node_id, controlId, {
          source: 'observed',
          confidence: 0.95,
          signals: ['html.label_for'],
          facts: ['html.label_for'],
        });
      }
    }
  }

  // ── 4. labels candidate: adjacent content (lower confidence) ─────────
  const ordered = nodes.slice().sort((a, b) => {
    if (a.context_id !== b.context_id) return String(a.context_id).localeCompare(String(b.context_id));
    return (a.order || 0) - (b.order || 0);
  });
  for (let i = 0; i < ordered.length - 1; i++) {
    const current = ordered[i];
    const next = ordered[i + 1];
    if (current.context_id !== next.context_id) continue;
    if (current.kind !== 'content' || !isInteractiveKind(next)) continue;
    // Skip if an observed labels edge already targets next
    const already = edges.some((e) => e.type === 'labels' && e.target_id === next.node_id);
    if (already) continue;
    const text = (current.observed?.sanitized_text || '').trim();
    const name = (next.observed?.accessible_name || '').trim();
    if (!text || !name) continue;
    if (textIncludesName(text, name)) {
      pushEdge('labels', current.node_id, next.node_id, {
        source: 'candidate',
        confidence: 0.55,
        signals: ['heuristic.adjacent_label'],
        facts: ['heuristic.adjacent_label'],
        alternatives: ['unlabelled', 'aria.labelledby_missing'],
      });
    }
  }

  // ── 5. describes via aria-describedby ────────────────────────────────
  for (const node of nodes) {
    const meta = factMeta[node.node_id] || {};
    if (!isInteractiveKind(node) || !meta.describedByIds?.length) continue;
    for (const did of meta.describedByIds) {
      const descId = resolveDomId(domIdIndex, did, node.context_id);
      if (descId) {
        pushEdge('describes', descId, node.node_id, {
          source: 'observed',
          confidence: 0.95,
          signals: ['aria.describedby'],
          facts: ['aria.describedby'],
        });
      }
    }
  }

  // ── 6. error_for / validates ─────────────────────────────────────────
  const validationNodes = nodes.filter((n) => n.kind === 'validation_message');
  const controlNodes = nodes.filter((n) => isInteractiveKind(n));

  // aria-errormessage on control
  for (const node of controlNodes) {
    const meta = factMeta[node.node_id] || {};
    for (const eid of meta.errorMessageIds || []) {
      const msgId = resolveDomId(domIdIndex, eid, node.context_id);
      if (msgId) {
        pushEdge('error_for', msgId, node.node_id, {
          source: 'observed',
          confidence: 0.95,
          signals: ['aria.errormessage'],
          facts: ['aria.errormessage'],
        });
        pushEdge('validates', msgId, node.node_id, {
          source: 'derived',
          confidence: 0.85,
          signals: ['aria.errormessage'],
          facts: ['validation.message_targets_control'],
        });
      }
    }
  }

  // Heuristic: validation_message → closest preceding control (candidate)
  for (const vNode of validationNodes) {
    const already = edges.some((e) => e.type === 'error_for' && e.source_id === vNode.node_id);
    if (already) continue;
    const sameCtx = controlNodes
      .filter((c) => c.context_id === vNode.context_id && (c.order || 0) < (vNode.order || 0));
    if (!sameCtx.length) continue;
    const closest = sameCtx[sameCtx.length - 1];
    pushEdge('error_for', vNode.node_id, closest.node_id, {
      source: 'candidate',
      confidence: 0.55,
      signals: ['heuristic.adjacent_error'],
      facts: ['heuristic.adjacent_error'],
      alternatives: ['orphan_validation'],
    });
    pushEdge('validates', vNode.node_id, closest.node_id, {
      source: 'candidate',
      confidence: 0.5,
      signals: ['heuristic.adjacent_error'],
      facts: ['heuristic.adjacent_error'],
    });
  }

  // ── 7. controls via aria-controls / aria-owns ────────────────────────
  for (const node of nodes) {
    const meta = factMeta[node.node_id] || {};
    for (const cid of [...(meta.controlsIds || []), ...(meta.ownsIds || [])]) {
      const targetId = resolveDomId(domIdIndex, cid, node.context_id);
      if (targetId && targetId !== node.node_id) {
        pushEdge('controls', node.node_id, targetId, {
          source: 'observed',
          confidence: 0.9,
          signals: meta.controlsIds?.includes(cid) ? ['aria.controls'] : ['aria.owns'],
          facts: meta.controlsIds?.includes(cid) ? ['aria.controls'] : ['aria.owns'],
        });
      }
    }
  }

  // Form node "controls" its descendant interactive nodes (structural ownership)
  for (const form of nodes.filter((n) => n.kind === 'form')) {
    for (const child of controlNodes) {
      if (isDescendant(child, form, byId)) {
        pushEdge('controls', form.node_id, child.node_id, {
          source: 'derived',
          confidence: 0.9,
          signals: ['structural.form_control'],
          facts: ['structural.form_control'],
        });
      }
    }
  }

  // ── 8. confirms: submit/button that confirms a form ──────────────────
  for (const node of controlNodes) {
    const meta = factMeta[node.node_id] || {};
    const role = (node.observed?.role || '').toLowerCase();
    const type = (meta.type || '').toLowerCase();
    const name = (node.observed?.accessible_name || '').toLowerCase();
    const isSubmit =
      type === 'submit' ||
      role === 'button' && /submit|confirm|save|continue|next|verify/i.test(name) ||
      meta.tag === 'button' && type === 'submit';
    if (!isSubmit) continue;
    // Nearest ancestor form
    let p = node.parent_id;
    while (p && byId[p]) {
      if (byId[p].kind === 'form') {
        pushEdge('confirms', node.node_id, p, {
          source: 'derived',
          confidence: 0.8,
          signals: ['structural.submit_confirms_form'],
          facts: ['structural.submit_confirms_form'],
        });
        break;
      }
      p = byId[p].parent_id;
    }
  }

  // ── 9. activates: ONLY when a real activation target is observed ─────
  // IMP-P1-03 (#133): do NOT emit activates→parent (over-claims). Require
  // aria-controls / aria-owns resolving to an existing node that is an
  // interactive control or dialog/region container.
  for (const node of nodes) {
    const meta = factMeta[node.node_id] || {};
    const ids = [...(meta.controlsIds || []), ...(meta.ownsIds || [])];
    for (const cid of ids) {
      const targetId = resolveDomId(domIdIndex, cid, node.context_id);
      if (!targetId || targetId === node.node_id || !byId[targetId]) continue;
      const target = byId[targetId];
      const role = (target.observed?.role || '').toLowerCase();
      const isActivationTarget =
        isInteractiveKind(target) ||
        target.kind === 'region' ||
        target.kind === 'form' ||
        role === 'dialog' ||
        role === 'alertdialog' ||
        role === 'menu' ||
        role === 'listbox';
      if (!isActivationTarget) continue;
      pushEdge('activates', node.node_id, targetId, {
        source: 'observed',
        confidence: 0.9,
        signals: meta.controlsIds?.includes(cid) ? ['aria.controls'] : ['aria.owns'],
        facts: ['aria.activation_target'],
      });
    }
  }

  // transitions_to: ONLY if destination node exists (e.g. in-page target id)
  // We never invent off-snapshot destinations.
  for (const node of nodes) {
    const meta = factMeta[node.node_id] || {};
    // data-cc style not used; if controlsIds point to a region/page node, treat as transition
    for (const cid of meta.controlsIds || []) {
      const dest = resolveDomId(domIdIndex, cid, node.context_id);
      if (!dest || !byId[dest]) continue;
      const destKind = byId[dest].kind;
      if (destKind === 'region' || destKind === 'page' || destKind === 'form' || destKind === 'section') {
        pushEdge('transitions_to', node.node_id, dest, {
          source: 'observed',
          confidence: 0.75,
          signals: ['aria.controls_destination'],
          facts: ['aria.controls_destination'],
        });
      }
    }
  }

  // ── 10. overlays: haspopup / dialog containers ───────────────────────
  for (const node of nodes) {
    const meta = factMeta[node.node_id] || {};
    const role = (node.observed?.role || '').toLowerCase();
    const isDialog = role === 'dialog' || role === 'alertdialog' ||
      (node.widget?.behavior_kind === 'container' && /dialog/i.test(node.widget?.implementation_hint || ''));

    if (meta.hasPopup && meta.hasPopup !== 'false') {
      // Overlay target via aria-controls if present and exists
      for (const cid of meta.controlsIds || []) {
        const overlayId = resolveDomId(domIdIndex, cid, node.context_id);
        if (overlayId) {
          pushEdge('overlays', overlayId, node.node_id, {
            source: 'observed',
            confidence: 0.85,
            signals: ['aria.haspopup', 'aria.controls'],
            facts: ['aria.haspopup_controls'],
          });
        }
      }
    }

    if (isDialog && node.parent_id) {
      // Dialog overlays its parent region/page
      pushEdge('overlays', node.node_id, node.parent_id, {
        source: 'derived',
        confidence: 0.75,
        signals: ['role.dialog_overlays_parent'],
        facts: ['role.dialog_overlays_parent'],
      });
    }
  }

  // ── 11. repeats: progressive candidate structural clones (NOT template IR) ─
  // P1-05 (#133): repeats is a progressive candidate structural-clone hint,
  // not a formal template/instance model. Service must not treat these as
  // business "row of family members" semantics.
  const sectionLike = nodes.filter((n) =>
    n.kind === 'region' || n.kind === 'form' || n.kind === 'section');
  const byParent = new Map();
  for (const n of sectionLike) {
    const key = `${n.context_id}|${n.parent_id || 'root'}`;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(n);
  }
  for (const siblings of byParent.values()) {
    if (siblings.length < 2) continue;
    siblings.sort((a, b) => (a.order || 0) - (b.order || 0));
    const sig0 = structuralSignature(siblings[0], byId);
    for (let i = 1; i < siblings.length; i++) {
      const sigI = structuralSignature(siblings[i], byId);
      if (sig0 && sig0 === sigI) {
        pushEdge('repeats', siblings[0].node_id, siblings[i].node_id, {
          source: 'candidate',
          confidence: 0.6,
          signals: ['heuristic.structural_repeat'],
          facts: ['heuristic.structural_repeat'],
          alternatives: ['independent_section'],
        });
      }
    }
  }

  // ── 12. visually_groups_with: fieldset/region siblings under same parent ─
  for (const n of sectionLike) {
    if (!n.parent_id) continue;
    const siblings = sectionLike.filter(
      (s) => s.parent_id === n.parent_id && s.context_id === n.context_id && s.node_id !== n.node_id
    );
    for (const s of siblings) {
      // Emit once with ordered endpoints
      if (n.node_id < s.node_id) {
        pushEdge('visually_groups_with', n.node_id, s.node_id, {
          source: 'derived',
          confidence: 0.65,
          signals: ['structural.sibling_regions'],
          facts: ['structural.sibling_regions'],
        });
      }
    }
  }

  // Stable sort for determinism
  edges.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if (a.source_id !== b.source_id) return a.source_id.localeCompare(b.source_id);
    return a.target_id.localeCompare(b.target_id);
  });

  return edges;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function isInteractiveKind(node) {
  if (!node) return false;
  return node.kind === 'control' || node.kind === 'widget' ||
    (node.kind === 'option') ||
    (node.widget && node.widget.behavior_kind && node.widget.behavior_kind !== 'unknown');
}

function isInaccessible(ctx) {
  if (!ctx) return false;
  return ctx.access === 'cross_origin' || ctx.access === 'closed_shadow' ||
    ctx.access === 'permission_denied' || ctx.access === 'unsupported';
}

function textIncludesName(text, name) {
  const t = text.toLowerCase();
  const n = name.toLowerCase().slice(0, 40);
  if (!n) return false;
  return t.includes(n) || n.includes(t.slice(0, 40));
}

function isDescendant(node, ancestor, byId) {
  let p = node.parent_id;
  let guard = 0;
  while (p && byId[p] && guard++ < 256) {
    if (p === ancestor.node_id) return true;
    p = byId[p].parent_id;
  }
  return false;
}

function structuralSignature(node, byId) {
  const kids = Object.values(byId).filter((n) => n.parent_id === node.node_id);
  if (!kids.length) return `${node.kind}:0`;
  const parts = kids
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((k) => `${k.kind}:${k.widget?.behavior_kind || k.observed?.role || 'x'}`)
    .slice(0, 24);
  return parts.join(',');
}

function buildDomIdIndex(factMeta, byId) {
  // map: `${contextId}|${domId}` → node_id and also bare domId → [node_ids]
  const exact = new Map();
  const bare = new Map();
  for (const [nodeId, meta] of Object.entries(factMeta || {})) {
    const domId = meta.domId || meta.id;
    if (!domId || !byId[nodeId]) continue;
    const ctx = byId[nodeId].context_id;
    exact.set(`${ctx}|${domId}`, nodeId);
    if (!bare.has(domId)) bare.set(domId, []);
    bare.get(domId).push(nodeId);
  }
  return { exact, bare };
}

function resolveDomId(index, domId, preferredContextId) {
  if (!domId || !index) return null;
  const hit = index.exact.get(`${preferredContextId}|${domId}`);
  if (hit) return hit;
  const list = index.bare.get(domId) || [];
  return list.length === 1 ? list[0] : (list[0] || null);
}

/**
 * Stable edge_id from type + endpoints (Identifier-safe).
 */
function stableEdgeId(type, sourceId, targetId) {
  const raw = `e.${type}.${sourceId}.${targetId}`;
  // Sanitize to Identifier pattern
  let id = raw.replace(/[^A-Za-z0-9._:-]/g, '_');
  if (!/^[A-Za-z]/.test(id)) id = `e${id}`;
  if (id.length <= 128) return id;
  // Truncate with hash suffix
  const h = simpleHash(`${type}|${sourceId}|${targetId}`);
  return (`e.${type}.${h}`).slice(0, 128);
}

function simpleHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * @param {string} type
 * @param {string} sourceId
 * @param {string} targetId
 * @param {object} evidenceSpec
 */
function makeEdge(type, sourceId, targetId, evidenceSpec) {
  const conf = typeof evidenceSpec.confidence === 'number' ? evidenceSpec.confidence : 0.7;
  const evidence = [{
    source: evidenceSpec.source || 'derived',
    detector: DETECTOR,
    detector_version: DETECTOR_VERSION,
    confidence: conf,
    facts: (evidenceSpec.facts || []).slice(0, 32),
  }];
  if (evidenceSpec.signals?.length) {
    evidence[0].signals = evidenceSpec.signals.slice(0, 32);
  }
  if (evidenceSpec.alternatives?.length) {
    evidence[0].alternatives = evidenceSpec.alternatives.slice(0, 8);
  }
  return {
    edge_id: stableEdgeId(type, sourceId, targetId),
    type,
    source_id: sourceId,
    target_id: targetId,
    evidence,
  };
}

/** @deprecated sequential counter no longer used; kept for test API compat */
function resetEdgeCounter() {
  // stable ids — no-op
}

function generateEdgeId() {
  return stableEdgeId('unknown', 'x', 'y');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    deriveEdges,
    makeEdge,
    resetEdgeCounter,
    generateEdgeId,
    stableEdgeId,
    DETECTOR_VERSION,
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcEdgeFactory = {
    deriveEdges,
    makeEdge,
    resetEdgeCounter,
    stableEdgeId,
  };
}
