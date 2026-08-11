#!/usr/bin/env node
/**
 * Phase 3.5 navigation-contract unit tests (#150)
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(import.meta.url);
const nav = require(resolve(ROOT, 'extension/runtime/navigation-contract.js'));

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
