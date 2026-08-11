/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
/**
 * Phase 3.5 Navigation Understanding — runtime contract helpers.
 * Normative source: architecture/navigation-understanding.yml v0.2.0
 * Architecture-owned classifier/mapping; ActionPlanExecutor consumes this.
 */
(function () {
'use strict';

const SETTLE_DEADLINE_MS = 8000;
const QUIET_WINDOW_MS = 300;
const MAX_REDIRECT_HOPS = 10;
const PATH_MAX_LEN = 512;

/** @type {Readonly<Record<string, {primary_failure_code: string|null, primary_diagnostic: string}>>} */
const OUTCOME_MAP = Object.freeze({
  same_document_completed: { primary_failure_code: null, primary_diagnostic: 'navigation_same_document_completed' },
  new_document_completed: { primary_failure_code: null, primary_diagnostic: 'navigation_new_document_completed' },
  blocked_overlay: { primary_failure_code: 'postcondition_failed', primary_diagnostic: 'navigation_blocked' },
  blocked_origin_policy: { primary_failure_code: 'authorization_denied', primary_diagnostic: 'navigation_origin_denied' },
  authorization_allow_navigation_false: { primary_failure_code: 'authorization_denied', primary_diagnostic: 'navigation_allow_navigation_false' },
  failed_timeout: { primary_failure_code: 'gateway_error', primary_diagnostic: 'navigation_failed_timeout' },
  failed_error: { primary_failure_code: 'gateway_error', primary_diagnostic: 'navigation_failed_error' },
  canceled: { primary_failure_code: 'postcondition_failed', primary_diagnostic: 'navigation_canceled' },
  interrupted_by_user_gesture: { primary_failure_code: 'postcondition_failed', primary_diagnostic: 'navigation_interrupted' },
  document_replaced_mid_plan: { primary_failure_code: 'document_replaced', primary_diagnostic: 'navigation_document_replaced' },
  stale_snapshot: { primary_failure_code: 'stale_snapshot', primary_diagnostic: 'navigation_stale_snapshot' },
  stale_target: { primary_failure_code: 'stale_target', primary_diagnostic: 'navigation_stale_target' },
});

function isNavigableHref(href) {
  const h = String(href || '').trim();
  if (!h || h === '#' || h.startsWith('#')) return false;
  if (/^javascript:/i.test(h)) return false;
  return true;
}

/**
 * Normative mechanical navigation-implication classifier (NAV-ARCH-P1-02).
 * @returns {{ implies: boolean, ruleId: string|null, isBlankTarget: boolean, isDownload: boolean, destinationHref: string|null }}
 */
function classifyNavigationImplication(el) {
  if (!el || typeof el.tagName !== 'string') {
    return { implies: false, ruleId: 'ambiguous', isBlankTarget: false, isDownload: false, destinationHref: null };
  }
  const tag = el.tagName.toUpperCase();
  const role = String(el.getAttribute?.('role') || el.role || '').toLowerCase();
  const type = String(el.type || el.getAttribute?.('type') || '').toLowerCase();
  const href = el.getAttribute?.('href');
  const hasDownload = el.hasAttribute?.('download') === true;
  const targetAttr = String(el.getAttribute?.('target') || '').toLowerCase();
  const isBlankTarget = targetAttr === '_blank' || targetAttr === '_new';

  // False rules first (download, hash, submit, plain button)
  if ((tag === 'A' || tag === 'AREA') && hasDownload) {
    return { implies: false, ruleId: 'download_anchor', isBlankTarget, isDownload: true, destinationHref: href || null };
  }
  if ((tag === 'A' || tag === 'AREA') && href != null && !isNavigableHref(href)) {
    return { implies: false, ruleId: 'hash_only_href', isBlankTarget, isDownload: false, destinationHref: href };
  }
  if (tag === 'INPUT' && (type === 'submit' || type === 'image')) {
    return { implies: false, ruleId: 'submit_control', isBlankTarget: false, isDownload: false, destinationHref: null };
  }
  if (tag === 'BUTTON') {
    const effective = type || 'submit';
    if (effective === 'submit' && role !== 'link') {
      return { implies: false, ruleId: 'submit_control', isBlankTarget: false, isDownload: false, destinationHref: null };
    }
    if (role !== 'link' && effective !== 'submit') {
      // plain button
      if (role !== 'link') {
        return { implies: false, ruleId: 'button_without_form_nav', isBlankTarget: false, isDownload: false, destinationHref: null };
      }
    }
  }
  if (tag === 'INPUT' && (type === 'button' || type === 'reset') && role !== 'link') {
    return { implies: false, ruleId: 'button_without_form_nav', isBlankTarget: false, isDownload: false, destinationHref: null };
  }

  // True rules
  if (tag === 'A' && isNavigableHref(href)) {
    return { implies: true, ruleId: 'html_anchor_with_navigable_href', isBlankTarget, isDownload: false, destinationHref: href };
  }
  if (tag === 'AREA' && isNavigableHref(href)) {
    return { implies: true, ruleId: 'area_with_href', isBlankTarget, isDownload: false, destinationHref: href };
  }
  if (role === 'link') {
    const disabled = el.getAttribute?.('aria-disabled') === 'true' || el.disabled === true;
    if (!disabled) {
      return {
        implies: true,
        ruleId: 'role_link_with_activatable_name',
        isBlankTarget,
        isDownload: false,
        destinationHref: isNavigableHref(href) ? href : null,
      };
    }
  }

  return { implies: false, ruleId: 'ambiguous', isBlankTarget, isDownload: false, destinationHref: null };
}

/** @deprecated alias — use classifyNavigationImplication(el).implies */
function elementImpliesNavigation(el) {
  return classifyNavigationImplication(el).implies;
}

/**
 * Resolve href against a base location-like object.
 * @returns {string|null} absolute origin or null if unknown
 */
function resolveDestinationOrigin(href, baseOrigin, baseHref) {
  if (!href || !isNavigableHref(href)) return null;
  try {
    const base = baseHref || baseOrigin || 'https://invalid.local/';
    const u = new URL(href, base);
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Destination origin policy (NAV-ARCH-P1-04).
 * @param {string|null} currentOrigin
 * @param {string|null} destinationOrigin
 * @param {string[]} [allowlist] operator-confirmed origins
 */
function isDestinationOriginAllowed(currentOrigin, destinationOrigin, allowlist = []) {
  if (!destinationOrigin) {
    // unknown destination — allow attempt; post-settle recheck
    return { allowed: true, reason: 'unknown_destination' };
  }
  if (currentOrigin && destinationOrigin === currentOrigin) {
    return { allowed: true, reason: 'same_origin' };
  }
  const list = Array.isArray(allowlist) ? allowlist : [];
  if (list.includes(destinationOrigin)) {
    return { allowed: true, reason: 'operator_allowlist' };
  }
  return { allowed: false, reason: 'origin_denied' };
}

/**
 * Get operator allowlist from extension memory (never public IR).
 */
function getOriginAllowlist() {
  if (typeof globalThis === 'undefined') return [];
  const raw = globalThis.__ccNavigationOriginAllowlist;
  return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
}

/**
 * Sanitize public page.path (NAV-ARCH-P1-03).
 * @param {string|null|undefined} rawPathOrUrl
 * @param {{redactTokens?: boolean}} [opts]
 * @returns {{ path: string|null, redacted: boolean, diagnostic: string|null }}
 */
function sanitizePagePath(rawPathOrUrl, opts = {}) {
  if (rawPathOrUrl == null || rawPathOrUrl === '') {
    return { path: null, redacted: false, diagnostic: null };
  }
  let path = String(rawPathOrUrl);
  let redacted = false;
  try {
    // If absolute URL, take pathname only
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path) || path.startsWith('//')) {
      const u = new URL(path, 'https://invalid.local');
      path = u.pathname || '/';
    }
  } catch {
    // fall through
  }
  // Strip query/fragment if still present
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  const h = path.indexOf('#');
  if (h >= 0) path = path.slice(0, h);
  // Drop credentials-looking prefixes
  path = path.replace(/^\/\/[^/]+@/, '/');
  if (!path.startsWith('/') && path.length > 0 && !path.startsWith('.')) {
    // bare segment — keep as relative path with leading slash for http(s) style
    path = `/${path}`;
  }

  if (opts.redactTokens !== false) {
    const parts = path.split('/').map((seg) => {
      // long hex or base64-ish tokens
      if (seg.length >= 24 && /^[A-Za-z0-9_-]+$/.test(seg) && /[0-9]/.test(seg) && /[A-Za-z]/.test(seg)) {
        redacted = true;
        return ':redacted';
      }
      if (seg.length >= 32 && /^[a-f0-9]+$/i.test(seg)) {
        redacted = true;
        return ':redacted';
      }
      return seg;
    });
    path = parts.join('/');
  }

  if (path.length > PATH_MAX_LEN) {
    path = path.slice(0, PATH_MAX_LEN);
    return { path, redacted: true, diagnostic: 'path_truncated' };
  }
  return {
    path,
    redacted,
    diagnostic: redacted ? 'path_segment_redacted' : null,
  };
}

/**
 * Coarse route_key without query/fragment.
 */
function routeKeyFromPath(path) {
  if (!path) return null;
  return String(path).replace(/^\/+|\/+$/g, '').slice(0, 160) || null;
}

/**
 * Map navigation outcome to frozen FailureCode + diagnostic (NAV-ARCH-P1-01).
 */
function mapNavigationOutcome(outcome) {
  const row = OUTCOME_MAP[outcome];
  if (!row) {
    return {
      navigation_outcome: outcome,
      primary_failure_code: 'gateway_error',
      primary_diagnostic: 'navigation_failed_error',
    };
  }
  return {
    navigation_outcome: outcome,
    primary_failure_code: row.primary_failure_code,
    primary_diagnostic: row.primary_diagnostic,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Observe navigation identity-effect after activate (bounded).
 * @param {object} opts
 * @param {string|null} opts.beforeDocumentId
 * @param {number} opts.beforeRevision
 * @param {string|null} opts.beforePath
 * @param {boolean} opts.impliesNavigation
 * @param {boolean} opts.isBlankTarget
 * @param {() => {documentId: string|null, revision: number, path: string|null, origin: string|null, blockingOverlay?: boolean}} opts.readIdentity
 * @param {object} [opts.doc] document for gesture listeners
 * @returns {Promise<{outcome: string, mapped: object, hops: number}>}
 */
async function observeNavigationAfterActivate(opts) {
  const {
    beforeDocumentId,
    beforeRevision,
    beforePath,
    impliesNavigation,
    isBlankTarget,
    readIdentity,
    doc = typeof document !== 'undefined' ? document : null,
  } = opts;

  if (isBlankTarget) {
    // New browsing context; origin document identity unchanged
    return {
      outcome: 'same_document_completed',
      mapped: {
        ...mapNavigationOutcome('same_document_completed'),
        primary_diagnostic: 'navigation_new_context',
      },
      hops: 0,
    };
  }

  if (!impliesNavigation) {
    return { outcome: 'not_applicable', mapped: null, hops: 0 };
  }

  let interrupted = false;
  let canceled = false;
  const onGesture = () => { interrupted = true; };
  const onPageHide = () => { /* may be navigation */ };
  if (doc?.addEventListener) {
    doc.addEventListener('pointerdown', onGesture, true);
    doc.addEventListener('keydown', onGesture, true);
  }

  const start = Date.now();
  let lastChangeAt = start;
  let hops = 0;
  let lastPath = beforePath;
  let lastDoc = beforeDocumentId;
  let sawChange = false;

  try {
    while (Date.now() - start < SETTLE_DEADLINE_MS) {
      if (interrupted) {
        return {
          outcome: 'interrupted_by_user_gesture',
          mapped: mapNavigationOutcome('interrupted_by_user_gesture'),
          hops,
        };
      }

      let identity;
      try {
        identity = readIdentity();
      } catch (e) {
        return {
          outcome: 'failed_error',
          mapped: mapNavigationOutcome('failed_error'),
          hops,
        };
      }

      if (identity.documentId !== lastDoc) {
        hops += 1;
        if (hops > MAX_REDIRECT_HOPS) {
          return { outcome: 'failed_error', mapped: mapNavigationOutcome('failed_error'), hops };
        }
        lastDoc = identity.documentId;
        lastPath = identity.path;
        lastChangeAt = Date.now();
        sawChange = true;
      } else if (identity.path !== lastPath || identity.revision !== beforeRevision) {
        if (identity.path !== lastPath) hops += 1;
        if (hops > MAX_REDIRECT_HOPS) {
          return { outcome: 'failed_error', mapped: mapNavigationOutcome('failed_error'), hops };
        }
        lastPath = identity.path;
        lastChangeAt = Date.now();
        sawChange = true;
      }

      // Quiet window after change
      if (sawChange && Date.now() - lastChangeAt >= QUIET_WINDOW_MS) {
        if (identity.documentId !== beforeDocumentId) {
          return {
            outcome: 'new_document_completed',
            mapped: mapNavigationOutcome('new_document_completed'),
            hops,
          };
        }
        if (identity.path !== beforePath || identity.revision !== beforeRevision) {
          return {
            outcome: 'same_document_completed',
            mapped: mapNavigationOutcome('same_document_completed'),
            hops,
          };
        }
      }

      await sleep(50);
    }

    // Deadline exceeded
    const finalId = (() => {
      try { return readIdentity(); } catch { return null; }
    })();
    if (finalId && finalId.documentId !== beforeDocumentId) {
      return {
        outcome: 'new_document_completed',
        mapped: mapNavigationOutcome('new_document_completed'),
        hops,
      };
    }
    if (finalId && (finalId.path !== beforePath || finalId.revision !== beforeRevision)) {
      return {
        outcome: 'same_document_completed',
        mapped: mapNavigationOutcome('same_document_completed'),
        hops,
      };
    }
    if (finalId?.blockingOverlay) {
      return {
        outcome: 'blocked_overlay',
        mapped: mapNavigationOutcome('blocked_overlay'),
        hops,
      };
    }
    if (canceled) {
      return {
        outcome: 'canceled',
        mapped: mapNavigationOutcome('canceled'),
        hops,
      };
    }
    return {
      outcome: 'failed_timeout',
      mapped: mapNavigationOutcome('failed_timeout'),
      hops,
    };
  } finally {
    if (doc?.removeEventListener) {
      doc.removeEventListener('pointerdown', onGesture, true);
      doc.removeEventListener('keydown', onGesture, true);
    }
  }
}

/**
 * Authorization checks for activate: submit, navigation allow, origin policy.
 * @returns {{ code: string, diagnostic: string, message: string }|null}
 */
function checkNavigationAuthorization(plan, step, element, context = {}) {
  if (step.action?.op !== 'activate') return null;
  const auth = plan.authorization || {};
  const classification = classifyNavigationImplication(element);

  // Submit class (existing)
  if (auth.allow_submit === false && typeof context.elementImpliesSubmit === 'function') {
    if (context.elementImpliesSubmit(element)) {
      return {
        code: 'authorization_denied',
        diagnostic: 'authorization_allow_submit_false',
        message: 'Submission action denied: allow_submit is false',
      };
    }
  }

  if (classification.implies && auth.allow_navigation === false) {
    const mapped = mapNavigationOutcome('authorization_allow_navigation_false');
    return {
      code: mapped.primary_failure_code,
      diagnostic: mapped.primary_diagnostic,
      message: 'Navigation action denied: allow_navigation is false',
    };
  }

  if (classification.implies && classification.destinationHref) {
    const currentOrigin = context.currentOrigin
      || (typeof location !== 'undefined' ? location.origin : null);
    const baseHref = typeof location !== 'undefined' ? location.href : currentOrigin;
    const destOrigin = resolveDestinationOrigin(classification.destinationHref, currentOrigin, baseHref);
    const allow = isDestinationOriginAllowed(currentOrigin, destOrigin, context.originAllowlist || getOriginAllowlist());
    if (!allow.allowed) {
      const mapped = mapNavigationOutcome('blocked_origin_policy');
      return {
        code: mapped.primary_failure_code,
        diagnostic: mapped.primary_diagnostic,
        message: 'Navigation denied: destination origin policy',
      };
    }
  }

  return null;
}

const api = {
  SETTLE_DEADLINE_MS,
  QUIET_WINDOW_MS,
  MAX_REDIRECT_HOPS,
  PATH_MAX_LEN,
  OUTCOME_MAP,
  classifyNavigationImplication,
  elementImpliesNavigation,
  isNavigableHref,
  resolveDestinationOrigin,
  isDestinationOriginAllowed,
  getOriginAllowlist,
  sanitizePagePath,
  routeKeyFromPath,
  mapNavigationOutcome,
  observeNavigationAfterActivate,
  checkNavigationAuthorization,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.CcNavigationContract = api;
})();
