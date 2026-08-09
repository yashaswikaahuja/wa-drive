(function() {
/**
 * CyberControl Context Discovery — enumerates browsing contexts.
 *
 * Discovers and classifies all contexts (top-level, frames, shadow roots)
 * from gateway-provided structural data.
 *
 * Output conforms to the Context schema in page-ir.schema.json.
 */

let _contextCounter = 0;

/**
 * Generate a unique context_id conforming to the Identifier pattern.
 * @param {string} kind — 'top_level' | 'frame' | 'shadow_root'
 * @returns {string}
 */
function generateContextId(kind) {
  _contextCounter += 1;
  const prefix = kind === 'top_level' ? 'ctx.top' : kind === 'frame' ? 'ctx.frame' : 'ctx.shadow';
  return `${prefix}.${_contextCounter}`;
}

/**
 * Discover all contexts on the current page via the gateway.
 *
 * @param {object} gateway — DOM gateway module (captureStructuralFacts, enumerateContexts)
 * @param {string} documentId — top-level document_id from RevisionManager
 * @param {object} revisionManager — for generating frame document IDs
 * @returns {object[]} Array of Context objects conforming to schema.
 */
function discoverContexts(gateway, documentId, revisionManager) {
  const contexts = [];

  // Top-level context
  const topCtxId = generateContextId('top_level');
  contexts.push({
    context_id: topCtxId,
    parent_context_id: null,
    kind: 'top_level',
    document_id: documentId,
    origin: typeof location !== 'undefined' ? location.origin : null,
    access: 'accessible',
    root_node_id: null, // filled by snapshot builder after nodes are created
    diagnostic_code: null,
  });

  // Frames and shadow roots from the gateway
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return contexts;

  const { frames, shadowRoots } = gateway.enumerateContexts(doc);

  for (const frame of frames) {
    const ctxId = generateContextId('frame');
    const frameDocId = frame.access === 'accessible' ? revisionManager.onFrameNavigation(ctxId) : null;
    contexts.push({
      context_id: ctxId,
      parent_context_id: topCtxId,
      kind: 'frame',
      document_id: frameDocId,
      origin: frame.src ? safeOrigin(frame.src) : null,
      access: frame.access,
      root_node_id: null,
      diagnostic_code: frame.access === 'cross_origin' ? 'cross_origin_frame' : null,
    });
  }

  for (const sr of shadowRoots) {
    const ctxId = generateContextId('shadow_root');
    contexts.push({
      context_id: ctxId,
      parent_context_id: topCtxId,
      kind: 'shadow_root',
      document_id: null, // shadow roots share host document
      origin: null,
      access: sr.access,
      root_node_id: null,
      diagnostic_code: sr.access === 'closed_shadow' ? 'closed_shadow_root' : null,
    });
  }

  return contexts;
}

/**
 * Safely extract origin from a URL string.
 */
function safeOrigin(url) {
  try { return new URL(url).origin; } catch { return null; }
}

/**
 * Reset the internal context counter (for testing).
 */
function resetContextCounter() {
  _contextCounter = 0;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { discoverContexts, generateContextId, resetContextCounter };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcContextDiscovery = { discoverContexts, generateContextId };
}

})();