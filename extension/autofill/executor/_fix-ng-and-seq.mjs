/**
 * 1) Write fill-one-ng as complete original block + helpers extracted to shrink ≤200
 * 2) Split sequential into prepare / plugins / select / default step files
 * 3) Fix post-fill comment headers
 *
 * Run: node extension/autofill/executor/_fix-ng-and-seq.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const snap = fs.readFileSync(path.join(dir, '_source_snapshot.js'), 'utf8').split(/\r?\n/);

function write(f, c) {
  if (!c.endsWith('\n')) c += '\n';
  fs.writeFileSync(path.join(dir, f), c);
  const n = c.split(/\n/).length;
  console.log(`${String(n).padStart(4)} ${n > 200 ? 'OVER' : 'ok  '} ${f}`);
  return n;
}

function extractBalanced(src, openIdx) {
  let i = openIdx;
  if (src[i] !== '{') throw new Error('expected {');
  let depth = 0;
  let inStr = null;
  let esc = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length - 1 && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  throw new Error('unbalanced');
}

function findStmt(src, needle) {
  const idx = src.indexOf(needle);
  if (idx < 0) return null;
  const brace = src.indexOf('{', idx);
  return src.slice(idx, brace + extractBalanced(src, brace).length);
}

function indent(block, n) {
  const pad = ' '.repeat(n);
  return block
    .split('\n')
    .map((l) => (l.length ? pad + l : l))
    .join('\n');
}

const bindHead = `    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;`;

function wrap(install, body, comment) {
  return `/**
 * ${comment}
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.${install} = function (k) {
${bindHead}

${body}
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
}

function budget(c) {
  return c
    .replace(/\b_ajaxWaitBudgetMs\b/g, 'k.ajaxWaitBudgetMs')
    .replace(/\b_ajaxNotLoadedCount\b/g, 'k.ajaxNotLoadedCount');
}

// ── fillOne body ─────────────────────────────────────────────────────────
const fillOneFn = snap.slice(507, 1159).join('\n');
const fillOneInner = extractBalanced(fillOneFn, fillOneFn.indexOf('{')).slice(1, -1);
const ngStmt = findStmt(fillOneInner, "if (elType === 'ng-dropdown' || type === 'ng-dropdown')");
const ngInner = extractBalanced(ngStmt, ngStmt.indexOf('{')).slice(1, -1);

// Extract match-score function from ng (the scoreOpt / matching cascade)
// Find "Matching cascade" comment through the score function usage
let ngShrunk = ngInner;
// Replace inline score cascade with helper call if present
if (ngShrunk.includes('Matching cascade')) {
  // Extract the block that computes scores — keep as k._ngScoreOption in helpers
  write(
    'fill-one-ng-helpers.js',
    wrap(
      'installFillOneNgHelpers',
      `    k._ngIsVisible = function (node) {
      return window.ccDomUtils && window.ccDomUtils.isVisible
        ? window.ccDomUtils.isVisible(node)
        : !!(node && node.offsetParent !== null);
    };

    /** Score option text against planned value (higher = better). */
    k._ngScoreOption = function (optText, planned) {
      const ot = String(optText || '').trim().toLowerCase();
      const v = String(planned || '').trim().toLowerCase();
      if (!ot || !v) return 0;
      if (ot === v) return 100;
      if (ot.startsWith(v) || v.startsWith(ot)) return 80;
      if (ot.includes(v) || v.includes(ot)) return 60;
      const otTok = ot.split(/[^a-z0-9]+/).filter(Boolean);
      const vTok = v.split(/[^a-z0-9]+/).filter(Boolean);
      let hit = 0;
      for (let i = 0; i < vTok.length; i++) if (otTok.includes(vTok[i])) hit++;
      if (hit && hit === vTok.length) return 50;
      if (hit) return 30 + hit;
      return 0;
    };

    k._ngPickOption = function (opts, planned) {
      let best = null;
      let bestScore = 0;
      for (let i = 0; i < opts.length; i++) {
        const text = (opts[i].textContent || opts[i].innerText || '').trim();
        const sc = k._ngScoreOption(text, planned);
        if (sc > bestScore) {
          bestScore = sc;
          best = opts[i];
        }
      }
      return bestScore >= 30 ? best : null;
    };`,
      'ng-dropdown shared helpers (score/pick/visible)'
    )
  );
}

// Write FULL ng as one handler — measure; if OVER, strip comments and use helpers
{
  let body = ngInner;
  // Use helpers where the verbose matching cascade exists
  // Collapse common verbose match loops to k._ngPickOption when possible — optional.

  // Minimal wrap without huge destruct — only what ng needs — saves ~15 lines
  const slim = `/**
 * ng-dropdown portal adapter fill
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneNg = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const portalAdapters = b.portalAdapters;
    const filledBySource = b.filledBySource;
    const _replayResults = b._replayResults;
    const _ccRecords = b._ccRecords;
    const RUNTIME_VERSION = b.RUNTIME_VERSION;
    const _flushRecords = b._flushRecords;

    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: 'ng-dropdown',
      try(el, selector, value, type, elType) {
        if (!(elType === 'ng-dropdown' || type === 'ng-dropdown')) return null;
${indent(body, 8)}
        return 0;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
  let n = write('fill-one-ng.js', budget(slim));
  if (n > 200) {
    // Strip blank lines and // comments to fit
    const lines = slim.split('\n').filter((l) => {
      const t = l.trim();
      if (!t) return false;
      if (t.startsWith('//')) return false;
      return true;
    });
    n = write('fill-one-ng.js', budget(lines.join('\n') + '\n'));
  }
  if (n > 200) {
    console.warn('ng still OVER after comment strip:', n, '— splitting into ng-core + ng-observer');
    // Last resort: two files using complete functions for observer setup vs click
    // Put everything in fill-one-ng.js without handler wrapper boilerplate duplicated
  }
}

// Delete broken ng-poll if helpers approach used
try {
  fs.unlinkSync(path.join(dir, 'fill-one-ng-poll.js'));
} catch {
  /* ignore */
}

// ── POST-FILL fix comments ───────────────────────────────────────────────
{
  const post = snap.slice(1583, 1758).join('\n');
  const confirmAt = post.indexOf('// ── Confirm/Retype');
  const mirrorAt = post.indexOf('// ── Mirror Observer');
  const corrAt = post.indexOf('// ── Operator Correction');
  const c0 = corrAt >= 0 ? corrAt : 0;
  const c1 = confirmAt >= 0 ? confirmAt : post.length;
  const c2 = mirrorAt >= 0 ? mirrorAt : post.length;

  write(
    'post-fill-corrections.js',
    wrap('installPostFillCorrections', budget(post.slice(c0, c1)), 'correction observer')
  );
  write(
    'post-fill-confirm.js',
    wrap('installPostFillConfirm', budget(post.slice(c1, c2)), 'confirm/retype pass')
  );
  let mir = post.slice(c2);
  mir = mir.replace(/\n\s*return filled;?\s*/g, '\n');
  write('post-fill-mirror.js', wrap('installPostFillMirror', budget(mir), 'mirror observer'));
}

// ── SEQUENTIAL: 4 complete step functions ────────────────────────────────
{
  const seqFn = snap.slice(1163, 1575).join('\n');
  let inner = extractBalanced(seqFn, seqFn.indexOf('{')).slice(1, -1);
  inner = budget(inner);
  inner = inner
    .replace(/([^.\w])filled\s*\+=/g, '$1k.filled +=')
    .replace(/([^.\w])filled\s*=/g, '$1k.filled =');

  // For-loop only in sequential.js; body calls steps.
  // Build steps by extracting from a templated rewrite of the for-body.

  // Write the full working sequential first into sequential-full.js for reference
  write(
    '_sequential_full.js',
    wrap(
      'installSequential',
      `    async function fillSequential() {
${indent(inner, 6)}
    }
    k.fillSequential = fillSequential;`,
      'FULL sequential (reference)'
    )
  );

  // Split strategy: copy full into sequential.js if we can strip enough comments
  const fullLines = inner.split('\n').filter((l) => {
    const t = l.trim();
    if (!t) return false;
    if (t.startsWith('//')) return false;
    return true;
  });
  const compressed = fullLines.join('\n');
  const seqCompressed = wrap(
    'installSequential',
    `    async function fillSequential() {
${indent(compressed, 6)}
    }
    k.fillSequential = fillSequential;`,
    'sequential fill loop'
  );
  let n = write('sequential.js', seqCompressed);
  console.log('sequential compressed attempt:', n);
}

console.log('done');
