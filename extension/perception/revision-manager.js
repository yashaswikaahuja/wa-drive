/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
(function () {
'use strict';
/**
 * CyberControl Revision Manager — manages document_id, snapshot_id,
 * and monotonic revision numbers per the perception lifecycle.
 *
 * INVARIANTS (architecture/perception-lifecycle.yml):
 *  - Revision is strictly monotonic within a document_id lifetime.
 *  - Document identity changes on full navigation (browsing context replaces
 *    its Document), not on SPA hash/history changes.
 *  - Snapshot IDs are globally unique and never reused.
 *  - Expected_revision equality is the precondition for execution handshake.
 */

// Portable ID generation conforming to schema Identifier: ^[A-Za-z][A-Za-z0-9._:-]{0,127}$
let _idCounter = 0;
function generateId(prefix) {
  _idCounter += 1;
  const ts = Date.now().toString(36);
  const seq = _idCounter.toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${ts}.${seq}.${rand}`;
}

class RevisionManager {
  constructor() {
    /** @type {string|null} */
    this._documentId = null;
    /** @type {number} */
    this._revision = -1;
    /** @type {Map<string, string>} contextId → document_id */
    this._contextDocuments = new Map();
  }

  /**
   * Begin a new document lifecycle (full navigation).
   * Generates a new document_id and resets revision to 0.
   * @returns {string} The new document_id.
   */
  newDocument() {
    this._documentId = generateId('doc');
    this._revision = 0;
    return this._documentId;
  }

  /** Current document_id (null if uninitialized). */
  currentDocumentId() {
    return this._documentId;
  }

  /** Current revision number (-1 if uninitialized, 0+ after newDocument). */
  currentRevision() {
    return this._revision;
  }

  /**
   * Increment and return the next revision number.
   * Must only be called after newDocument().
   */
  nextRevision() {
    if (this._documentId === null) {
      throw new Error('Cannot increment revision before newDocument()');
    }
    this._revision += 1;
    return this._revision;
  }

  /**
   * Generate a globally unique snapshot_id.
   * @returns {string}
   */
  newSnapshotId() {
    return generateId('snap');
  }

  /**
   * Full navigation: new document_id, reset revision.
   * Returns { documentId, revision } for convenience.
   */
  onFullNavigation() {
    const documentId = this.newDocument();
    return { documentId, revision: this._revision };
  }

  /**
   * Same-document navigation (SPA route, pushState, hashchange).
   * Retains document_id, increments revision.
   */
  onSameDocumentNavigation() {
    return { documentId: this._documentId, revision: this.nextRevision() };
  }

  /**
   * Per-context frame navigation: assigns a new document_id to the given context.
   * Does not affect the top-level document_id or revision.
   * @param {string} contextId
   * @returns {string} The new context-specific document_id.
   */
  onFrameNavigation(contextId) {
    const docId = generateId('framedoc');
    this._contextDocuments.set(contextId, docId);
    return docId;
  }

  /**
   * Get the document_id for a specific context (frame). Returns null for
   * shadow_root contexts or unregistered contexts.
   */
  getContextDocumentId(contextId) {
    return this._contextDocuments.get(contextId) ?? null;
  }

  /**
   * Check whether the given expected revision matches current state.
   * Used for execution handshake (exact revision equality).
   */
  isRevisionCurrent(expectedRevision) {
    return this._revision === expectedRevision;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RevisionManager, generateId };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcRevisionManager = RevisionManager;
}
})();
