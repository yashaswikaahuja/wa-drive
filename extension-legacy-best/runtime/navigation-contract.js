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

/**
 * Optional test / operator overrides:
 * globalThis.__ccNavBudgets = { settleMs, quietMs, maxHops, aggressiveInterrupt }
 * aggressiveInterrupt (default false): pointer/key during settle → interrupted (NAV-RR2-P2-02)
 */
function budgets() {
  const o = (typeof globalThis !== 'undefined' && globalThis.__ccNavBudgets) || {};
  return {
    settleMs: Number(o.settleMs) > 0 ? Number(o.settleMs) : SETTLE_DEADLINE_MS,
    quietMs: Number(o.quietMs) >= 0 ? Number(o.quietMs) : QUIET_WINDOW_MS,
    maxHops: Number(o.maxHops) > 0 ? Number(o.maxHops) : MAX_REDIRECT_HOPS,
    aggressiveInterrupt: o.aggressiveInterrupt === true,
  };
}

/** chrome.storage.local key for operator-confirmed destination origins (NAV-RR2-P2-05). */
const ORIGIN_ALLOWLIST_STORAGE_KEY = 'navigationOriginAllowlist';

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
 * Seeded from chrome.storage.local via popup inject (NAV-RR2-P2-05).
 */
function getOriginAllowlist() {
  if (typeof globalThis === 'undefined') return [];
  const raw = globalThis.__ccNavigationOriginAllowlist;
  return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string' && x.length > 0) : [];
}

/**
 * Set in-page allowlist (extension isolated world only; never public IR).
 * @param {string[]|unknown} list
 * @returns {string[]} normalized list stored
 */
function setOriginAllowlist(list) {
  const normalized = Array.isArray(list)
    ? list.filter((x) => typeof x === 'string' && x.length > 0)
    : [];
  if (typeof globalThis !== 'undefined') {
    globalThis.__ccNavigationOriginAllowlist = normalized;
  }
  return normalized;
}

/**
 * Detect blocking overlay (NAV-RR2-P2-03).
 * Preference order:
 *  1. IR PageState signals (blocking_overlay) from perception snapshot
 *  2. IR-aligned ARIA dialog/modal live probes
 *  3. Conservative heuristic selectors (last resort)
 *
 * @param {object} [opts]
 * @param {string[]} [opts.stateSignals] from page_snapshot.state.signals
 * @param {Document|null} [opts.doc]
 * @returns {{ blocking: boolean, source: 'ir_signal'|'aria_modal'|'heuristic'|'none' }}
 */
function detectBlockingOverlay(opts = {}) {
  const signals = Array.isArray(opts.stateSignals) ? opts.stateSignals : [];
  if (signals.includes('blocking_overlay')) {
    return { blocking: true, source: 'ir_signal' };
  }

  const doc = opts.doc != null
    ? opts.doc
    : (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.querySelector !== 'function') {
    return { blocking: false, source: 'none' };
  }

  // IR-aligned: explicit modal dialogs (page-ir blocking_overlay equivalent)
  try {
    const ariaModal = doc.querySelector(
      '[aria-modal="true"], [role="dialog"][aria-modal="true"], [role="alertdialog"]'
    );
    if (ariaModal) {
      // Prefer visible / not aria-hidden when computable
      const hidden = ariaModal.getAttribute?.('aria-hidden') === 'true'
        || ariaModal.hidden === true;
      if (!hidden) {
        return { blocking: true, source: 'aria_modal' };
      }
    }
  } catch { /* ignore */ }

  // Heuristic last resort (legacy portals)
  try {
    const heuristic = doc.querySelector(
      '.modal.show, .modal[style*="display: block"], [data-cc-blocking-overlay]'
    );
    if (heuristic) {
      return { blocking: true, source: 'heuristic' };
    }
  } catch { /* ignore */ }

  return { blocking: false, source: 'none' };
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
 * Live browse identity for settle observation (NAV-IMPL-P1-01).
 * Prefer live location over perception documentId so SPA path changes are visible
 * without re-perceive. Full top-level unload is signalled via pagehide/beforeunload.
 */
function browseKeyFromIdentity(identity) {
  if (!identity) return null;
  const o = identity.origin || '';
  const p = identity.path || '';
  return `${o}${p}`;
}

/**
 * Post-settle origin policy recheck (NAV-IMPL-P1-03).
 * @returns {{ outcome: string, mapped: object }|null} deny result or null if ok
 */
function recheckOriginAfterSettle(beforeOrigin, afterOrigin, allowlist) {
  if (!afterOrigin) return null;
  if (!beforeOrigin) return null;
  if (afterOrigin === beforeOrigin) return null;
  const allow = isDestinationOriginAllowed(beforeOrigin, afterOrigin, allowlist);
  if (allow.allowed) return null;
  return {
    outcome: 'blocked_origin_policy',
    mapped: mapNavigationOutcome('blocked_origin_policy'),
  };
}

/**
 * Observe navigation identity-effect after activate (bounded).
 * @param {object} opts
 * @param {string|null} opts.beforeDocumentId
 * @param {number} opts.beforeRevision
 * @param {string|null} opts.beforePath
 * @param {string|null} [opts.beforeOrigin]
 * @param {string|null} [opts.expectedDestinationOrigin] known href origin for unload recheck (NAV-RR2-P2-01)
 * @param {boolean} opts.impliesNavigation
 * @param {boolean} opts.isBlankTarget
 * @param {() => {documentId: string|null, revision: number, path: string|null, origin: string|null, browseKey?: string|null, blockingOverlay?: boolean}} opts.readIdentity
 * @param {object} [opts.doc] document for gesture listeners
 * @param {string[]} [opts.originAllowlist]
 * @param {boolean} [opts.aggressiveInterrupt] override budgets.aggressiveInterrupt
 * @returns {Promise<{outcome: string, mapped: object, hops: number}>}
 */
async function observeNavigationAfterActivate(opts) {
  const {
    beforeDocumentId,
    beforeRevision,
    beforePath,
    beforeOrigin = null,
    expectedDestinationOrigin = null,
    impliesNavigation,
    isBlankTarget,
    readIdentity,
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null,
    originAllowlist = getOriginAllowlist(),
    aggressiveInterrupt: aggressiveInterruptOpt,
  } = opts;

  const b = budgets();
  // NAV-RR2-P2-02: Escape-only cancel by default; pointer/key interrupt opt-in only
  const aggressiveInterrupt = aggressiveInterruptOpt === true
    || (aggressiveInterruptOpt !== false && b.aggressiveInterrupt === true);

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
  let unloading = false;
  const start = Date.now();
  // Escape → canceled (NAV-IMPL-P1-02). Pointer/key interrupt only when aggressiveInterrupt.
  const onKey = (ev) => {
    if (ev && (ev.key === 'Escape' || ev.keyCode === 27)) {
      canceled = true;
      return;
    }
    if (!aggressiveInterrupt) return;
    if (ev && ev.isTrusted === false) return;
    if (ev && (ev.key === 'Tab' || ev.metaKey || ev.ctrlKey || ev.altKey)) return;
    if (Date.now() - start < 100) return;
    interrupted = true;
  };
  const onPointer = (ev) => {
    if (!aggressiveInterrupt) return;
    if (ev && ev.isTrusted === false) return;
    if (Date.now() - start < 100) return;
    interrupted = true;
  };
  // NAV-IMPL-P1-01: full document unload → new_document_completed (fail-closed)
  const onPageHide = (ev) => {
    if (ev && ev.persisted) return;
    unloading = true;
  };
  const onBeforeUnload = () => {
    unloading = true;
  };

  if (doc?.addEventListener) {
    doc.addEventListener('keydown', onKey, true);
    // Only attach pointer listener when aggressive interrupt is enabled (noise reduction)
    if (aggressiveInterrupt) {
      doc.addEventListener('pointerdown', onPointer, true);
    }
  }
  if (win?.addEventListener) {
    win.addEventListener('pagehide', onPageHide, true);
    win.addEventListener('beforeunload', onBeforeUnload, true);
  }

  let lastChangeAt = start;
  let hops = 0;
  let lastPath = beforePath;
  let lastDoc = beforeDocumentId;
  let lastBrowseKey = null;
  try {
    const initial = readIdentity();
    lastBrowseKey = initial.browseKey || browseKeyFromIdentity(initial);
  } catch { /* ignore */ }
  const beforeBrowseKey = lastBrowseKey;
  let sawChange = false;

  /**
   * On unload the live after-origin is unreadable. Prefer expectedDestinationOrigin
   * from pre-activate classifier href (NAV-RR2-P2-01); else beforeOrigin (recheck no-op).
   */
  const identityForUnload = () => ({
    origin: expectedDestinationOrigin || beforeOrigin || null,
  });

  const finishSuccess = (outcome, identity, hopCount) => {
    const afterOrigin = identity?.origin || null;
    const originDeny = recheckOriginAfterSettle(
      beforeOrigin || null,
      afterOrigin,
      originAllowlist
    );
    if (originDeny) {
      return { ...originDeny, hops: hopCount };
    }
    return {
      outcome,
      mapped: mapNavigationOutcome(outcome),
      hops: hopCount,
    };
  };

  try {
    while (Date.now() - start < b.settleMs) {
      if (canceled) {
        return {
          outcome: 'canceled',
          mapped: mapNavigationOutcome('canceled'),
          hops,
        };
      }
      if (interrupted) {
        return {
          outcome: 'interrupted_by_user_gesture',
          mapped: mapNavigationOutcome('interrupted_by_user_gesture'),
          hops,
        };
      }
      // Top-level navigation tearing down the isolated world: report new document
      // before the context is destroyed (NAV-IMPL-P1-01 fail-closed).
      // NAV-RR2-P2-01: recheck known expected destination origin on unload.
      if (unloading) {
        return finishSuccess('new_document_completed', identityForUnload(), hops);
      }

      let identity;
      try {
        identity = readIdentity();
        if (!identity.browseKey) {
          identity.browseKey = browseKeyFromIdentity(identity);
        }
      } catch (e) {
        // Context torn down mid-read → treat as document navigation (fail-closed)
        return finishSuccess('new_document_completed', identityForUnload(), hops);
      }

      // Compare to last* for hop counting; to before* for success classification
      const pathStep = identity.path !== lastPath;
      const browseStep = identity.browseKey != null && identity.browseKey !== lastBrowseKey;
      const docStep = identity.documentId != null && lastDoc != null && identity.documentId !== lastDoc;

      if (docStep || pathStep || browseStep) {
        hops += 1;
        if (hops > b.maxHops) {
          return { outcome: 'failed_error', mapped: mapNavigationOutcome('failed_error'), hops };
        }
        lastDoc = identity.documentId;
        lastPath = identity.path;
        lastBrowseKey = identity.browseKey;
        lastChangeAt = Date.now();
        sawChange = true;
      } else if (
        identity.revision != null && beforeRevision != null
        && identity.revision >= 0 && beforeRevision >= 0
        && identity.revision !== beforeRevision
        && !sawChange
      ) {
        // revision-only bump without path hop
        lastChangeAt = Date.now();
        sawChange = true;
      }

      // Quiet window after change
      if (sawChange && Date.now() - lastChangeAt >= b.quietMs) {
        const docFromBefore = identity.documentId != null && beforeDocumentId != null
          && identity.documentId !== beforeDocumentId;
        const originFromBefore = beforeOrigin && identity.origin && identity.origin !== beforeOrigin;
        const pathFromBefore = identity.path !== beforePath;
        const browseFromBefore = identity.browseKey && beforeBrowseKey
          && identity.browseKey !== beforeBrowseKey;
        const revFromBefore = identity.revision != null && beforeRevision != null
          && identity.revision >= 0 && beforeRevision >= 0
          && identity.revision !== beforeRevision;

        if (docFromBefore || originFromBefore) {
          return finishSuccess('new_document_completed', identity, hops);
        }
        if (pathFromBefore || browseFromBefore || revFromBefore) {
          return finishSuccess('same_document_completed', identity, hops);
        }
      }

      await sleep(50);
    }

    // Deadline exceeded
    if (unloading) {
      return finishSuccess('new_document_completed', identityForUnload(), hops);
    }
    const finalId = (() => {
      try {
        const id = readIdentity();
        if (!id.browseKey) id.browseKey = browseKeyFromIdentity(id);
        return id;
      } catch {
        return null;
      }
    })();
    if (!finalId) {
      // Context gone
      return finishSuccess('new_document_completed', identityForUnload(), hops);
    }
    if (finalId.documentId != null && beforeDocumentId != null && finalId.documentId !== beforeDocumentId) {
      return finishSuccess('new_document_completed', finalId, hops);
    }
    if (beforeOrigin && finalId.origin && finalId.origin !== beforeOrigin) {
      return finishSuccess('new_document_completed', finalId, hops);
    }
    if (
      finalId.path !== beforePath
      || (finalId.browseKey && beforeBrowseKey && finalId.browseKey !== beforeBrowseKey)
      || (finalId.revision !== beforeRevision && finalId.revision >= 0 && beforeRevision >= 0)
    ) {
      return finishSuccess('same_document_completed', finalId, hops);
    }
    if (finalId.blockingOverlay) {
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
      doc.removeEventListener('keydown', onKey, true);
      if (aggressiveInterrupt) {
        doc.removeEventListener('pointerdown', onPointer, true);
      }
    }
    if (win?.removeEventListener) {
      win.removeEventListener('pagehide', onPageHide, true);
      win.removeEventListener('beforeunload', onBeforeUnload, true);
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
  ORIGIN_ALLOWLIST_STORAGE_KEY,
  OUTCOME_MAP,
  budgets,
  browseKeyFromIdentity,
  recheckOriginAfterSettle,
  classifyNavigationImplication,
  elementImpliesNavigation,
  isNavigableHref,
  resolveDestinationOrigin,
  isDestinationOriginAllowed,
  getOriginAllowlist,
  setOriginAllowlist,
  detectBlockingOverlay,
  sanitizePagePath,
  routeKeyFromPath,
  mapNavigationOutcome,
  observeNavigationAfterActivate,
  checkNavigationAuthorization,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.CcNavigationContract = api;
})();
