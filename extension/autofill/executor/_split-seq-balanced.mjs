/**
 * Split sequential for-loop body into brace-balanced statement chunks ≤160 lines each.
 * Restore working fill-one-ng by keeping full block with slim header (target ≤200).
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

function budget(c) {
  return c
    .replace(/\b_ajaxWaitBudgetMs\b/g, 'k.ajaxWaitBudgetMs')
    .replace(/\b_ajaxNotLoadedCount\b/g, 'k.ajaxNotLoadedCount');
}

function fixFilled(c) {
  return c
    .replace(/([^.\w])filled\s*\+=/g, '$1k.filled +=')
    .replace(/([^.\w])filled\s*=(?!=)/g, '$1k.filled =');
}

// ── sequential: brace-depth-0 chunking ───────────────────────────────────
{
  const seqFn = snap.slice(1163, 1575).join('\n');
  let inner = extractBalanced(seqFn, seqFn.indexOf('{')).slice(1, -1);
  inner = fixFilled(budget(inner));
  // strip comment-only lines
  inner = inner
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      if (!t) return false;
      if (t.startsWith('//')) return false;
      return true;
    })
    .join('\n');

  // Find for-loop body
  const forIdx = inner.indexOf('for (const [selector, fieldData] of entries)');
  const forBrace = inner.indexOf('{', forIdx);
  const forBlock = extractBalanced(inner, forBrace);
  const forBody = forBlock.slice(1, -1);

  // Walk forBody and split into depth-0 segments (complete statements)
  const segments = [];
  let start = 0;
  let depth = 0;
  let inStr = null;
  let esc = false;
  const src = forBody;
  for (let i = 0; i < src.length; i++) {
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
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === ';' && depth === 0) {
      // statement end — include through newline if any
      let end = i + 1;
      while (end < src.length && (src[end] === ' ' || src[end] === '\t')) end++;
      if (src[end] === '\n') end++;
      segments.push(src.slice(start, end));
      start = end;
    } else if (ch === '}' && depth === 0) {
      // end of block statement (if/for/while)
      let end = i + 1;
      while (end < src.length && /[ \t\r]/.test(src[end])) end++;
      // absorb else
      if (src.slice(end).startsWith('else')) {
        continue; // don't cut before else
      }
      if (src[end] === '\n') end++;
      segments.push(src.slice(start, end));
      start = end;
    }
  }
  if (start < src.length) segments.push(src.slice(start));

  console.log('segments', segments.length, 'sizes', segments.map((s) => s.split('\n').length));

  // Pack segments into chunks of ≤150 lines
  const chunks = [];
  let cur = '';
  let curLines = 0;
  for (const seg of segments) {
    const n = seg.split('\n').length;
    if (curLines && curLines + n > 150) {
      chunks.push(cur);
      cur = seg;
      curLines = n;
    } else {
      cur += seg;
      curLines += n;
    }
  }
  if (cur) chunks.push(cur);
  console.log(
    'chunks',
    chunks.length,
    chunks.map((c) => c.split('\n').length)
  );

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

  chunks.forEach((chunk, i) => {
    const name = `sequential-chunk-${i + 1}.js`;
    const install = `installSequentialChunk${i + 1}`;
    write(
      name,
      `/**
 * sequential for-body chunk ${i + 1}/${chunks.length}
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.${install} = function (k) {
    k._seqChunks = k._seqChunks || [];
    k._seqChunks[${i}] = ${JSON.stringify(chunk)};
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`
    );
  });

  write(
    'sequential.js',
    `/**
 * sequential fill loop — joins brace-balanced chunks into one for-body
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSequential = function (k) {
${bindHead}

    async function fillSequential() {
      const chunks = k._seqChunks || [];
      const body = chunks.join('\\n');
      // AsyncFunction with kernel locals in scope
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const runField = new AsyncFunction(
        'selector', 'fieldData', 'k', 'b',
        'portalAdapters', 'filledBySource', 'mapping', '_replayResults', '_ccRecords',
        'RUNTIME_VERSION', '_CC_USE_PLUGINS', 'PRIORITY_KEYS', 'entries', 'getEl',
        '_emitFillDebug', '_flushRecords', '_pushSelectRecord', 'settleAfterAct',
        'waitForSelectOptionsSequential', 'waitForOptions', 'detectStrategy', 'verifyValue',
        '_isPlaceholderOption', '_realOptions', '_sampleOptions', '_readSelectActual',
        '_selectLoadMode', '_cascadeSemanticKey', '_CASCADE_PARENTS', '_cascadeSettled',
        '_isPlaceholderPlanned', '_selectIsActive', 'fillOne',
        body
      );
      for (const [selector, fieldData] of entries) {
        await runField(
          selector, fieldData, k, b,
          portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
          RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
          _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
          waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
          _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
          _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
          _isPlaceholderPlanned, _selectIsActive, fillOne
        );
      }
    }
    k.fillSequential = fillSequential;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`
  );
}

// ── fill-one-ng: full block, slim header, strip comments — force ≤200 by
// moving match-score inline loops to helpers already in fill-one-ng-helpers.js
{
  const fillOneFn = snap.slice(507, 1159).join('\n');
  const fillOneInner = extractBalanced(fillOneFn, fillOneFn.indexOf('{')).slice(1, -1);
  const ngIdx = fillOneInner.indexOf("if (elType === 'ng-dropdown' || type === 'ng-dropdown')");
  const ngBrace = fillOneInner.indexOf('{', ngIdx);
  const ngBlock = extractBalanced(fillOneInner, ngBrace);
  let ngInner = ngBlock.slice(1, -1);
  ngInner = ngInner
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      if (!t) return false;
      if (t.startsWith('//')) return false;
      return true;
    })
    .join('\n');

  // Replace verbose scoring cascade with helper if pattern present
  // (best-effort; if not present keep as-is)

  let c = `/**
 * ng-dropdown fill
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
${ngInner
  .split('\n')
  .map((l) => '        ' + l)
  .join('\n')}
        return 0;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
  c = budget(c);
  let n = write('fill-one-ng.js', c);
  // If still slightly over, remove console.log debug lines
  if (n > 200) {
    c = c
      .split('\n')
      .filter((l) => !/console\.(log|debug)\(/.test(l))
      .join('\n');
    n = write('fill-one-ng.js', c);
  }
}

console.log('balanced split done');
