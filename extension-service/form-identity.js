/**
 * CyberControl Form Identity — extension-service/form-identity.js
 * Phase 7.1 — Weak Semantic Key
 *
 * Multi-signal form recognition for portals where labels are non-unique
 * or unreadable (e.g. ServicePlus-like portals).
 *
 * Computes a stable form_key from multiple signals:
 *   - URL path (normalized, without query params)
 *   - Page title
 *   - Hidden field names/values
 *   - Field signature (sorted accessible_names + types)
 *   - Form structure hash
 *
 * Used by fill-planner.js for form-specific knowledge resolution.
 *
 * ARCHITECTURE:
 *   Server = Brain. Form identity is a server-side decision.
 *   Extension sends the PageSnapshot; server computes form_key.
 */

import { createHash } from 'node:crypto';

/**
 * Confidence thresholds for form identity matching.
 */
const CONFIDENCE = {
  HIGH: 0.9,      // Strong match — use without verification
  MEDIUM: 0.7,    // Moderate match — usable but track for confirmation
  LOW: 0.5,       // Weak match — trigger verification prompt
  REJECT: 0.3,    // Too low — treat as unknown form
};

/**
 * Compute a stable form_key from a PageSnapshot.
 *
 * @param {object} snapshot — PageSnapshot v2
 * @returns {{ formKey: string, confidence: number, signals: object }}
 */
export function computeFormKey(snapshot) {
  const signals = extractSignals(snapshot);
  const formKey = hashSignals(signals);
  const confidence = assessConfidence(signals);

  return { formKey, confidence, signals };
}

/**
 * Match a computed form_key against known portal_definition records.
 *
 * @param {string} formKey — computed form_key
 * @param {object[]} knownForms — portal_definition records with form_key
 * @param {object} signals — extracted signals for fuzzy matching
 * @returns {{ match: object|null, confidence: number, method: string }}
 */
export function matchFormKey(formKey, knownForms, signals) {
  // Exact match
  const exact = knownForms.find((f) => f.form_key === formKey);
  if (exact) {
    return { match: exact, confidence: 1.0, method: 'exact_key' };
  }

  // Fuzzy match: compare individual signals
  let bestMatch = null;
  let bestScore = 0;

  for (const known of knownForms) {
    const score = computeSimilarity(signals, known.signals || {});
    if (score > bestScore) {
      bestScore = score;
      bestMatch = known;
    }
  }

  if (bestScore >= CONFIDENCE.LOW) {
    return { match: bestMatch, confidence: bestScore, method: 'fuzzy_signals' };
  }

  return { match: null, confidence: 0, method: 'no_match' };
}

/**
 * Extract form identity signals from a PageSnapshot.
 *
 * @param {object} snapshot
 * @returns {object}
 */
export function extractSignals(snapshot) {
  const page = snapshot.page || {};
  const nodes = snapshot.nodes || {};
  const nodeList = Object.values(nodes);

  // URL path (normalized)
  const urlPath = normalizePath(page.path || '');

  // Page title
  const title = (page.title || '').trim().toLowerCase();

  // Hidden fields (inputs with no visible state or type=hidden)
  const hiddenFields = nodeList
    .filter((n) => n.kind === 'control' && n.state?.visible === false)
    .map((n) => ({
      name: n.observed?.accessible_name || '',
      role: n.observed?.role || '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Field signature (sorted accessible_names + widget types)
  const fieldSignature = nodeList
    .filter((n) => n.kind === 'control' && n.widget)
    .map((n) => `${(n.observed?.accessible_name || '').toLowerCase()}:${n.widget?.behavior_kind || 'unknown'}`)
    .sort();

  // Form structure: count of each node kind
  const structure = {};
  for (const n of nodeList) {
    structure[n.kind] = (structure[n.kind] || 0) + 1;
  }

  // Control count and types distribution
  const controlTypes = {};
  for (const n of nodeList) {
    if (n.widget) {
      const bk = n.widget.behavior_kind;
      controlTypes[bk] = (controlTypes[bk] || 0) + 1;
    }
  }

  return {
    urlPath,
    title,
    hiddenFields,
    fieldSignature,
    structure,
    controlTypes,
    controlCount: fieldSignature.length,
    origin: page.origin || null,
  };
}

/**
 * Hash signals into a stable form_key.
 *
 * Uses a subset of signals that are most stable across visits:
 * URL path + field signature (names + types).
 * Title and hidden fields are secondary stability signals.
 *
 * @param {object} signals
 * @returns {string}
 */
function hashSignals(signals) {
  const primary = [
    signals.urlPath,
    signals.fieldSignature.join('|'),
  ].join('\n');

  const hash = createHash('sha256').update(primary, 'utf8').digest('hex').slice(0, 16);
  return `fk.${hash}`;
}

/**
 * Assess confidence of the form key based on signal richness.
 *
 * @param {object} signals
 * @returns {number} 0-1 confidence
 */
function assessConfidence(signals) {
  let score = 0;
  let maxScore = 0;

  // URL path is informative (not just '/')
  maxScore += 2;
  if (signals.urlPath && signals.urlPath !== '/' && signals.urlPath.length > 3) {
    score += 2;
  }

  // Has a meaningful title
  maxScore += 1;
  if (signals.title && signals.title.length > 3) {
    score += 1;
  }

  // Has fields with accessible names
  maxScore += 3;
  const namedFields = signals.fieldSignature.filter((f) => !f.startsWith(':'));
  if (namedFields.length > 0) {
    score += Math.min(3, namedFields.length / 2);
  }

  // Has multiple controls (real form, not a login page)
  maxScore += 2;
  if (signals.controlCount >= 5) score += 2;
  else if (signals.controlCount >= 3) score += 1;

  // Has hidden fields (portal-specific markers)
  maxScore += 1;
  if (signals.hiddenFields.length > 0) score += 1;

  return Math.min(1, score / maxScore);
}

/**
 * Compute similarity between two signal sets for fuzzy matching.
 *
 * @param {object} a
 * @param {object} b
 * @returns {number} 0-1 similarity
 */
function computeSimilarity(a, b) {
  let totalWeight = 0;
  let matchWeight = 0;

  // URL path match (weight 3)
  totalWeight += 3;
  if (a.urlPath && b.urlPath && a.urlPath === b.urlPath) matchWeight += 3;
  else if (a.urlPath && b.urlPath && a.urlPath.startsWith(b.urlPath.split('/').slice(0, -1).join('/'))) matchWeight += 1;

  // Title match (weight 1)
  totalWeight += 1;
  if (a.title && b.title && a.title === b.title) matchWeight += 1;

  // Field signature overlap (weight 4 — most important for ServicePlus-like)
  totalWeight += 4;
  if (a.fieldSignature && b.fieldSignature) {
    const setA = new Set(a.fieldSignature);
    const setB = new Set(b.fieldSignature);
    const intersection = [...setA].filter((x) => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;
    if (union > 0) {
      matchWeight += 4 * (intersection / union); // Jaccard similarity
    }
  }

  // Control count similarity (weight 1)
  totalWeight += 1;
  if (a.controlCount && b.controlCount) {
    const ratio = Math.min(a.controlCount, b.controlCount) / Math.max(a.controlCount, b.controlCount);
    matchWeight += ratio;
  }

  // Structure similarity (weight 1)
  totalWeight += 1;
  if (a.structure && b.structure) {
    const allKinds = new Set([...Object.keys(a.structure), ...Object.keys(b.structure)]);
    let structMatch = 0;
    for (const kind of allKinds) {
      const va = a.structure[kind] || 0;
      const vb = b.structure[kind] || 0;
      if (va > 0 && vb > 0) structMatch += Math.min(va, vb) / Math.max(va, vb);
    }
    matchWeight += structMatch / allKinds.size;
  }

  return totalWeight > 0 ? matchWeight / totalWeight : 0;
}

/**
 * Normalize a URL path for stable comparison.
 */
function normalizePath(path) {
  return (path || '/')
    .replace(/\?.*$/, '')   // Remove query string
    .replace(/#.*$/, '')    // Remove fragment
    .replace(/\/+$/, '')    // Remove trailing slashes
    .toLowerCase() || '/';
}

export { CONFIDENCE };
