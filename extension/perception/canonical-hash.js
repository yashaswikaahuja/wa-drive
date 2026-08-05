/**
 * CyberControl Canonical Hash — deterministic serialization and SHA-256.
 *
 * Produces the `canonical_hash` field required by PageSnapshot/PageDelta.
 * Canonicalization adopts RFC 8785 JCS (JSON Canonicalization Scheme):
 *  - Sorted object keys (recursively)
 *  - No insignificant whitespace
 *  - Volatile envelope fields removed before hashing
 *
 * Output format: "sha256:<64-hex-digits>"
 */

/**
 * Volatile fields excluded from the canonical hash input.
 * These change across equivalent observations.
 */
const VOLATILE_FIELDS = new Set([
  'snapshot_id',
  'observed_at',
  'revision',
  'canonical_hash',
]);

/**
 * Recursively produce a canonicalized JSON string with sorted keys.
 * Removes volatile envelope fields from the top-level object only.
 * @param {any} value
 * @param {boolean} [isRoot=false]
 * @returns {string}
 */
function canonicalize(value, isRoot = true) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!isFinite(value)) return 'null';
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalize(item, false)).join(',') + ']';
  }
  // Object — sort keys, exclude volatiles at root
  const keys = Object.keys(value).sort();
  const parts = [];
  for (const key of keys) {
    if (isRoot && VOLATILE_FIELDS.has(key)) continue;
    const v = value[key];
    if (v === undefined) continue;
    parts.push(JSON.stringify(key) + ':' + canonicalize(v, false));
  }
  return '{' + parts.join(',') + '}';
}

/**
 * Compute SHA-256 of a UTF-8 string, returned as hex.
 * Uses Node.js crypto when available, Web Crypto otherwise.
 * @param {string} text
 * @returns {Promise<string>}
 */
async function sha256Hex(text) {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoded = new TextEncoder().encode(text);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node.js fallback
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Compute the canonical hash of a PageSnapshot or PageDelta.
 * @param {object} snapshot
 * @returns {Promise<string>} "sha256:<hex>"
 */
async function computeCanonicalHash(snapshot) {
  const canonical = canonicalize(snapshot, true);
  const hex = await sha256Hex(canonical);
  return `sha256:${hex}`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { canonicalize, computeCanonicalHash, sha256Hex, VOLATILE_FIELDS };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcCanonicalHash = { canonicalize, computeCanonicalHash };
}
