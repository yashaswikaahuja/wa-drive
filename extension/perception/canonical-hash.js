/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
(function () {
'use strict';
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
    try {
      const encoded = new TextEncoder().encode(text);
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_) { /* fall through to software implementation */ }
  }
  // Node.js fallback
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }
  // Pure-JS software fallback (RFC 6234) — used when SubtleCrypto unavailable
  // (e.g. non-secure contexts like about:blank in test harnesses)
  return _sha256Software(text);
}

/**
 * Software SHA-256 (pure JS, no external deps).
 * Used only when SubtleCrypto and Node crypto are both unavailable.
 */
function _sha256Software(str) {
  /* Derived from public-domain SHA-256 reference */
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  function rotr(n, b) { return (n >>> b) | (n << (32 - b)); }
  function bytes(s) {
    const b = [];
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) b.push(c);
      else if (c < 0x800) { b.push(0xc0 | (c >> 6)); b.push(0x80 | (c & 0x3f)); }
      else { b.push(0xe0 | (c >> 12)); b.push(0x80 | ((c >> 6) & 0x3f)); b.push(0x80 | (c & 0x3f)); }
    }
    return b;
  }
  const msg = bytes(str);
  const len = msg.length;
  msg.push(0x80);
  while ((msg.length % 64) !== 56) msg.push(0);
  const bitLen = len * 8;
  msg.push(0,0,0,0, (bitLen >>> 24)&0xff, (bitLen >>> 16)&0xff, (bitLen >>> 8)&0xff, bitLen&0xff);
  let [h0,h1,h2,h3,h4,h5,h6,h7] = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  for (let i = 0; i < msg.length; i += 64) {
    const w = new Uint32Array(64);
    for (let j = 0; j < 16; j++) w[j] = (msg[i+j*4]<<24)|(msg[i+j*4+1]<<16)|(msg[i+j*4+2]<<8)|msg[i+j*4+3];
    for (let j = 16; j < 64; j++) { const s0 = rotr(w[j-15],7)^rotr(w[j-15],18)^(w[j-15]>>>3); const s1 = rotr(w[j-2],17)^rotr(w[j-2],19)^(w[j-2]>>>10); w[j] = (w[j-16]+s0+w[j-7]+s1)>>>0; }
    let [a,b,c,d,e,f,g,h] = [h0,h1,h2,h3,h4,h5,h6,h7];
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e,6)^rotr(e,11)^rotr(e,25);
      const ch = (e&f)^(~e&g);
      const t1 = (h+S1+ch+K[j]+w[j])>>>0;
      const S0 = rotr(a,2)^rotr(a,13)^rotr(a,22);
      const maj = (a&b)^(a&c)^(b&c);
      const t2 = (S0+maj)>>>0;
      [h,g,f,e,d,c,b,a] = [g,f,e,(d+t1)>>>0,c,b,a,(t1+t2)>>>0];
    }
    h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
    h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map((v) => v.toString(16).padStart(8,'0')).join('');
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
})();
