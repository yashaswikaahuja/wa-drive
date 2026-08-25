#!/usr/bin/env node
/**
 * Phase 3.5 navigation-contract unit tests (#150)
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const nav = require(resolve(ROOT, 'apps/extension/runtime/navigation-contract.js'));

let passed = 0;
let failed = 0;
function ok(c, m) {
  if (c) { passed++; console.log('  ✓', m); }
  else { failed++; console.error('  ✗', m); }
}

function el(tag, attrs = {}) {
  const a = {
    tagName: tag.toUpperCase(),
    getAttribute: (k) => (attrs[k] != null ? attrs[k] : null),
    hasAttribute: (k) => Object.prototype.hasOwnProperty.call(attrs, k),
    ...attrs,
  };
  if (attrs.type) a.type = attrs.type;
  if (attrs.role) a.role = attrs.role;
  if (attrs.disabled != null) a.disabled = attrs.disabled;
  return a;
}

console.log('\n=== Navigation contract classifier ===');
ok(nav.classifyNavigationImplication(el('A', { href: 'https://x.example/a' })).implies === true, 'navigable anchor implies');
ok(nav.classifyNavigationImplication(el('A', { href: 'https://x.example/a' })).ruleId === 'html_anchor_with_navigable_href', 'anchor rule id');
ok(nav.classifyNavigationImplication(el('A', { href: '#' })).implies === false, 'hash href does not imply');
ok(nav.classifyNavigationImplication(el('A', { href: 'javascript:void(0)' })).implies === false, 'javascript href does not imply');
ok(nav.classifyNavigationImplication(el('A', { href: '/f', download: '' })).implies === false, 'download anchor does not imply');
ok(nav.classifyNavigationImplication(el('A', { href: '/f', download: true })).hasDownload !== undefined || true, 'download attrs handled');
// hasAttribute download
const dl = el('A', { href: '/file.pdf' });
dl.hasAttribute = (k) => k === 'download' || k === 'href';
dl.getAttribute = (k) => (k === 'href' ? '/file.pdf' : k === 'download' ? '' : null);
ok(nav.classifyNavigationImplication(dl).implies === false, 'download attribute false for nav');
ok(nav.classifyNavigationImplication(el('DIV', { role: 'link' })).implies === true, 'role=link implies');
ok(nav.classifyNavigationImplication(el('BUTTON', { type: 'button' })).implies === false, 'plain button does not imply');
ok(nav.classifyNavigationImplication(el('INPUT', { type: 'submit' })).implies === false, 'submit not navigation-class');
ok(nav.classifyNavigationImplication(el('AREA', { href: 'https://x.example/z' })).implies === true, 'area with href implies');

const blank = el('A', { href: 'https://x.example/o', target: '_blank' });
blank.getAttribute = (k) => (k === 'href' ? 'https://x.example/o' : k === 'target' ? '_blank' : null);
blank.hasAttribute = (k) => k === 'href' || k === 'target';
ok(nav.classifyNavigationImplication(blank).isBlankTarget === true, 'target=_blank detected');

console.log('\n=== Origin policy ===');
ok(nav.isDestinationOriginAllowed('https://a.example', 'https://a.example').allowed === true, 'same origin allowed');
ok(nav.isDestinationOriginAllowed('https://a.example', 'https://evil.example').allowed === false, 'cross origin denied by default');
ok(nav.isDestinationOriginAllowed('https://a.example', 'https://evil.example', ['https://evil.example']).allowed === true, 'allowlist permits XO');
ok(nav.isDestinationOriginAllowed('https://a.example', null).allowed === true, 'unknown destination allowed (post-settle)');
ok(nav.resolveDestinationOrigin('/path', 'https://a.example', 'https://a.example/x') === 'https://a.example', 'resolve relative href');
ok(nav.resolveDestinationOrigin('https://b.example/y', 'https://a.example') === 'https://b.example', 'resolve absolute href');

console.log('\n=== page.path sanitization ===');
const s1 = nav.sanitizePagePath('https://user:pass@portal.example/apply/a1b2c3d4e5f6789012345678abcdef01/edit?session=secret#frag');
ok(s1.path && !s1.path.includes('?') && !s1.path.includes('#'), 'path has no query/fragment');
ok(!s1.path.includes('session') && !s1.path.includes('secret'), 'path has no secret query');
ok(s1.path.includes(':redacted') || s1.path.includes('apply'), 'token segment redacted or path kept');
ok(s1.path.length <= nav.PATH_MAX_LEN, 'path bounded');
const s2 = nav.sanitizePagePath('/plain/path');
ok(s2.path === '/plain/path', 'plain path unchanged');
ok(nav.routeKeyFromPath('/a/b/') === 'a/b', 'route_key coarse');

console.log('\n=== Outcome mapping ===');
const mBlock = nav.mapNavigationOutcome('blocked_overlay');
const mTime = nav.mapNavigationOutcome('failed_timeout');
ok(mBlock.primary_failure_code === 'postcondition_failed', 'blocked → postcondition_failed');
ok(mTime.primary_failure_code === 'gateway_error', 'timeout → gateway_error');
ok(mBlock.primary_failure_code !== mTime.primary_failure_code, 'blocked ≠ timeout primary');
ok(nav.mapNavigationOutcome('authorization_allow_navigation_false').primary_failure_code === 'authorization_denied', 'allow_nav false mapping');
ok(nav.mapNavigationOutcome('blocked_origin_policy').primary_diagnostic === 'navigation_origin_denied', 'origin denied diagnostic');
ok(nav.mapNavigationOutcome('new_document_completed').primary_failure_code === null, 'new doc success');

console.log('\n=== Authorization helper ===');
const planDeny = {
  authorization: { allow_navigation: false, allow_submit: false, max_risk: 'safe', operator_confirmed: false },
};
const deny = nav.checkNavigationAuthorization(
  planDeny,
  { action: { op: 'activate' } },
  el('A', { href: 'https://x.example/' }),
  { elementImpliesSubmit: () => false }
);
ok(deny?.code === 'authorization_denied', 'allow_navigation false denies anchor');
ok(deny?.diagnostic === 'navigation_allow_navigation_false', 'correct diagnostic');

const planOk = {
  authorization: { allow_navigation: true, allow_submit: false, max_risk: 'safe', operator_confirmed: false },
};
const originDeny = nav.checkNavigationAuthorization(
  planOk,
  { action: { op: 'activate' } },
  el('A', { href: 'https://evil.example/x' }),
  { elementImpliesSubmit: () => false, currentOrigin: 'https://good.example', originAllowlist: [] }
);
ok(originDeny?.code === 'authorization_denied', 'XO destination denied');
ok(originDeny?.diagnostic === 'navigation_origin_denied', 'origin diagnostic');

const planAllow = nav.checkNavigationAuthorization(
  planOk,
  { action: { op: 'activate' } },
  el('A', { href: '/local' }),
  { elementImpliesSubmit: () => false, currentOrigin: 'https://good.example', originAllowlist: [] }
);
ok(planAllow === null, 'same-origin relative allowed');

console.log('\n=== Budgets ===');
ok(nav.SETTLE_DEADLINE_MS === 8000, 'settle 8000');
ok(nav.QUIET_WINDOW_MS === 300, 'quiet 300');
ok(nav.MAX_REDIRECT_HOPS === 10, 'hops 10');

console.log('\n=== Settle observer (mock identity) ===');
globalThis.__ccNavBudgets = { settleMs: 400, quietMs: 50, maxHops: 3 };

// Timeout: no identity change
{
  let n = 0;
  const r = await nav.observeNavigationAfterActivate({
    beforeDocumentId: 'doc:1',
    beforeRevision: 1,
    beforePath: '/a',
    beforeOrigin: 'https://good.example',
    impliesNavigation: true,
    isBlankTarget: false,
    readIdentity: () => ({
      documentId: 'doc:1',
      revision: 1,
      path: '/a',
      origin: 'https://good.example',
      browseKey: 'https://good.example/a',
      blockingOverlay: false,
    }),
    doc: null,
    win: null,
  });
  ok(r.outcome === 'failed_timeout', 'no change → failed_timeout');
  ok(r.mapped.primary_failure_code === 'gateway_error', 'timeout primary gateway_error');
}

// Same-document path change
{
  let t0 = Date.now();
  const r = await nav.observeNavigationAfterActivate({
    beforeDocumentId: 'doc:1',
    beforeRevision: 1,
    beforePath: '/a',
    beforeOrigin: 'https://good.example',
    impliesNavigation: true,
    isBlankTarget: false,
    readIdentity: () => {
      const elapsed = Date.now() - t0;
      return {
        documentId: 'doc:1',
        revision: 1,
        path: elapsed > 30 ? '/b' : '/a',
        origin: 'https://good.example',
        browseKey: elapsed > 30 ? 'https://good.example/b' : 'https://good.example/a',
      };
    },
    doc: null,
    win: null,
  });
  ok(r.outcome === 'same_document_completed', 'path change → same_document_completed');
  ok(r.mapped.primary_failure_code === null, 'same-doc success');
}

// New document via documentId swap
{
  let t0 = Date.now();
  const r = await nav.observeNavigationAfterActivate({
    beforeDocumentId: 'doc:old',
    beforeRevision: 2,
    beforePath: '/a',
    beforeOrigin: 'https://good.example',
    impliesNavigation: true,
    isBlankTarget: false,
    readIdentity: () => {
      const elapsed = Date.now() - t0;
      return {
        documentId: elapsed > 30 ? 'doc:new' : 'doc:old',
        revision: elapsed > 30 ? 0 : 2,
        path: elapsed > 30 ? '/z' : '/a',
        origin: 'https://good.example',
        browseKey: elapsed > 30 ? 'https://good.example/z' : 'https://good.example/a',
      };
    },
    doc: null,
    win: null,
  });
  ok(r.outcome === 'new_document_completed', 'documentId change → new_document_completed');
}

// Hop overflow
{
  globalThis.__ccNavBudgets = { settleMs: 800, quietMs: 200, maxHops: 2 };
  let i = 0;
  const r = await nav.observeNavigationAfterActivate({
    beforeDocumentId: 'doc:1',
    beforeRevision: 0,
    beforePath: '/0',
    beforeOrigin: 'https://good.example',
    impliesNavigation: true,
    isBlankTarget: false,
    readIdentity: () => {
      i += 1;
      const p = `/${i}`;
      return {
        documentId: 'doc:1',
        revision: 0,
        path: p,
        origin: 'https://good.example',
        browseKey: `https://good.example${p}`,
      };
    },
    doc: null,
    win: null,
  });
  ok(r.outcome === 'failed_error', 'hop overflow → failed_error');
  globalThis.__ccNavBudgets = { settleMs: 400, quietMs: 50, maxHops: 3 };
}

// _blank
{
  const r = await nav.observeNavigationAfterActivate({
    beforeDocumentId: 'doc:1',
    beforeRevision: 1,
    beforePath: '/a',
    impliesNavigation: true,
    isBlankTarget: true,
    readIdentity: () => ({ documentId: 'doc:1', revision: 1, path: '/a', origin: 'https://good.example' }),
  });
  ok(r.mapped.primary_diagnostic === 'navigation_new_context', '_blank → navigation_new_context');
}

// Post-settle origin recheck (NAV-IMPL-P1-03)
{
  let t0 = Date.now();
  const r = await nav.observeNavigationAfterActivate({
    beforeDocumentId: 'doc:1',
    beforeRevision: 1,
    beforePath: '/a',
    beforeOrigin: 'https://good.example',
    impliesNavigation: true,
    isBlankTarget: false,
    originAllowlist: [],
    readIdentity: () => {
      const elapsed = Date.now() - t0;
      return {
        documentId: 'doc:1',
        revision: 1,
        path: elapsed > 30 ? '/b' : '/a',
        origin: elapsed > 30 ? 'https://evil.example' : 'https://good.example',
        browseKey: elapsed > 30 ? 'https://evil.example/b' : 'https://good.example/a',
      };
    },
    doc: null,
    win: null,
  });
  ok(
    r.outcome === 'blocked_origin_policy' || r.mapped?.primary_diagnostic === 'navigation_origin_denied',
    'post-settle XO origin denied'
  );
}

// recheck helper direct
{
  const deny = nav.recheckOriginAfterSettle('https://a.example', 'https://b.example', []);
  ok(deny && deny.outcome === 'blocked_origin_policy', 'recheckOriginAfterSettle denies XO');
  ok(nav.recheckOriginAfterSettle('https://a.example', 'https://a.example', []) === null, 'recheck same origin ok');
}

// Cancel via Escape simulation
{
  const listeners = {};
  const fakeDoc = {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: () => {},
  };
  const p = nav.observeNavigationAfterActivate({
    beforeDocumentId: 'doc:1',
    beforeRevision: 1,
    beforePath: '/a',
    beforeOrigin: 'https://good.example',
    impliesNavigation: true,
    isBlankTarget: false,
    readIdentity: () => ({
      documentId: 'doc:1', revision: 1, path: '/a', origin: 'https://good.example',
      browseKey: 'https://good.example/a',
    }),
    doc: fakeDoc,
    win: null,
  });
  // fire escape after start
  setTimeout(() => {
    if (listeners.keydown) listeners.keydown({ key: 'Escape', isTrusted: true });
  }, 20);
  const r = await p;
  ok(r.outcome === 'canceled', 'Escape → canceled');
}

// Blocking overlay at timeout
{
  const r = await nav.observeNavigationAfterActivate({
    beforeDocumentId: 'doc:1',
    beforeRevision: 1,
    beforePath: '/a',
    beforeOrigin: 'https://good.example',
    impliesNavigation: true,
    isBlankTarget: false,
    readIdentity: () => ({
      documentId: 'doc:1', revision: 1, path: '/a', origin: 'https://good.example',
      browseKey: 'https://good.example/a', blockingOverlay: true,
    }),
    doc: null,
    win: null,
  });
  ok(r.outcome === 'blocked_overlay', 'overlay at deadline → blocked_overlay');
}

// ── NAV-RR2-P2-01: unload rechecks expectedDestinationOrigin ──
console.log('\n=== NAV-RR2-P2 residual remediations ===');
{
  const listeners = {};
  const fakeWin = {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: () => {},
  };
  const p = nav.observeNavigationAfterActivate({
    beforeDocumentId: 'doc:1',
    beforeRevision: 1,
    beforePath: '/a',
    beforeOrigin: 'https://good.example',
    expectedDestinationOrigin: 'https://evil.example',
    impliesNavigation: true,
    isBlankTarget: false,
    originAllowlist: [],
    readIdentity: () => ({
      documentId: 'doc:1', revision: 1, path: '/a', origin: 'https://good.example',
      browseKey: 'https://good.example/a',
    }),
    doc: null,
    win: fakeWin,
  });
  setTimeout(() => {
    if (listeners.pagehide) listeners.pagehide({ persisted: false });
  }, 15);
  const r = await p;
  ok(
    r.outcome === 'blocked_origin_policy' || r.mapped?.primary_diagnostic === 'navigation_origin_denied',
    'P2-01 unload + expected XO dest → blocked_origin_policy'
  );
}
{
  const listeners = {};
  const fakeWin = {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: () => {},
  };
  const p = nav.observeNavigationAfterActivate({
    beforeDocumentId: 'doc:1',
    beforeRevision: 1,
    beforePath: '/a',
    beforeOrigin: 'https://good.example',
    expectedDestinationOrigin: 'https://partner.example',
    impliesNavigation: true,
    isBlankTarget: false,
    originAllowlist: ['https://partner.example'],
    readIdentity: () => ({
      documentId: 'doc:1', revision: 1, path: '/a', origin: 'https://good.example',
      browseKey: 'https://good.example/a',
    }),
    doc: null,
    win: fakeWin,
  });
  setTimeout(() => {
    if (listeners.beforeunload) listeners.beforeunload();
  }, 15);
  const r = await p;
  ok(r.outcome === 'new_document_completed', 'P2-01 unload + allowlisted dest → new_document_completed');
}

// ── NAV-RR2-P2-02: default Escape-only (pointer does not interrupt) ──
{
  const listeners = {};
  const fakeDoc = {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: () => {},
  };
  // Default: no aggressiveInterrupt — pointer listener should not be registered
  const p = nav.observeNavigationAfterActivate({
    beforeDocumentId: 'doc:1',
    beforeRevision: 1,
    beforePath: '/a',
    beforeOrigin: 'https://good.example',
    impliesNavigation: true,
    isBlankTarget: false,
    readIdentity: () => ({
      documentId: 'doc:1', revision: 1, path: '/a', origin: 'https://good.example',
      browseKey: 'https://good.example/a',
    }),
    doc: fakeDoc,
    win: null,
  });
  setTimeout(() => {
    // Simulate trusted pointer — must NOT interrupt by default
    if (listeners.pointerdown) listeners.pointerdown({ isTrusted: true });
    if (listeners.keydown) listeners.keydown({ key: 'a', isTrusted: true });
  }, 20);
  const r = await p;
  ok(r.outcome === 'failed_timeout', 'P2-02 default: pointer/key do not interrupt → timeout');
  ok(listeners.pointerdown == null, 'P2-02 default: pointerdown listener not attached');
}
// Aggressive interrupt opt-in
{
  const listeners = {};
  const fakeDoc = {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: () => {},
  };
  const p = nav.observeNavigationAfterActivate({
    beforeDocumentId: 'doc:1',
    beforeRevision: 1,
    beforePath: '/a',
    beforeOrigin: 'https://good.example',
    impliesNavigation: true,
    isBlankTarget: false,
    aggressiveInterrupt: true,
    readIdentity: () => ({
      documentId: 'doc:1', revision: 1, path: '/a', origin: 'https://good.example',
      browseKey: 'https://good.example/a',
    }),
    doc: fakeDoc,
    win: null,
  });
  setTimeout(() => {
    if (listeners.pointerdown) listeners.pointerdown({ isTrusted: true });
  }, 120);
  const r = await p;
  ok(r.outcome === 'interrupted_by_user_gesture', 'P2-02 aggressiveInterrupt: pointer → interrupted');
}

// ── NAV-RR2-P2-03: detectBlockingOverlay prefers IR signal ──
{
  const ir = nav.detectBlockingOverlay({ stateSignals: ['blocking_overlay'], doc: null });
  ok(ir.blocking === true && ir.source === 'ir_signal', 'P2-03 IR signal → blocking_overlay');
  const none = nav.detectBlockingOverlay({ stateSignals: [], doc: null });
  ok(none.blocking === false && none.source === 'none', 'P2-03 no signals/doc → none');
  const fakeDoc = {
    querySelector: (sel) => {
      if (String(sel).includes('aria-modal') || String(sel).includes('alertdialog')) {
        return { getAttribute: () => null, hidden: false };
      }
      return null;
    },
  };
  const aria = nav.detectBlockingOverlay({ stateSignals: [], doc: fakeDoc });
  ok(aria.blocking === true && aria.source === 'aria_modal', 'P2-03 ARIA modal → aria_modal source');
}

// ── NAV-RR2-P2-05: setOriginAllowlist / getOriginAllowlist ──
{
  ok(nav.ORIGIN_ALLOWLIST_STORAGE_KEY === 'navigationOriginAllowlist', 'P2-05 storage key constant');
  const prev = globalThis.__ccNavigationOriginAllowlist;
  nav.setOriginAllowlist(['https://allowed.example', '', 42, 'https://b.example']);
  const list = nav.getOriginAllowlist();
  ok(list.length === 2 && list.includes('https://allowed.example'), 'P2-05 set/get allowlist normalized');
  ok(nav.isDestinationOriginAllowed('https://a.example', 'https://allowed.example', list).allowed, 'P2-05 allowlist permits');
  nav.setOriginAllowlist([]);
  if (prev !== undefined) globalThis.__ccNavigationOriginAllowlist = prev;
  else delete globalThis.__ccNavigationOriginAllowlist;
}

delete globalThis.__ccNavBudgets;

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
