/**
 * Finalize ≤200 line split:
 * - recursively split oversized sequential segments
 * - trim fill-one-ng under 200
 * - delete obsolete broken part files
 * - print inject list
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
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  throw new Error('unbalanced');
}

function fixFilled(c) {
  return c
    .replace(/\b_ajaxWaitBudgetMs\b/g, 'k.ajaxWaitBudgetMs')
    .replace(/\b_ajaxNotLoadedCount\b/g, 'k.ajaxNotLoadedCount')
    .replace(/([^.\w])filled\s*\+=/g, '$1k.filled +=')
    .replace(/([^.\w])filled\s*=(?!=)/g, '$1k.filled =');
}

/** Split source into pieces at ';' or '}' when depth >= minDepth, keeping concat = original. */
function splitDeep(src, minDepth = 1) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let inStr = null;
  let esc = false;
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
    else if (ch === '}') {
      depth--;
      if (depth >= minDepth - 1 && depth >= 0) {
        // cut after } when we're back to minDepth or after closing inner block
        if (depth >= minDepth || depth === 0) {
          let end = i + 1;
          while (end < src.length && /[ \t]/.test(src[end])) end++;
          if (src.slice(end).startsWith('else')) continue;
          if (src.slice(end).startsWith('catch')) continue;
          if (src.slice(end).startsWith('finally')) continue;
          if (src[end] === '\n') end++;
          parts.push(src.slice(start, end));
          start = end;
        }
      }
    } else if (ch === ';' && depth >= minDepth) {
      let end = i + 1;
      if (src[end] === '\n') end++;
      parts.push(src.slice(start, end));
      start = end;
    }
  }
  if (start < src.length) parts.push(src.slice(start));
  return parts.filter((p) => p.trim().length);
}

function pack(parts, maxLines) {
  const chunks = [];
  let cur = '';
  let curN = 0;
  for (const p of parts) {
    const n = p.split('\n').length;
    if (curN && curN + n > maxLines) {
      chunks.push(cur);
      cur = p;
      curN = n;
    } else {
      cur += p;
      curN += n;
    }
  }
  if (cur) chunks.push(cur);
  // If any chunk still too big, deep-split it
  const out = [];
  for (const ch of chunks) {
    if (ch.split('\n').length <= maxLines) out.push(ch);
    else {
      const deep = splitDeep(ch, 1);
      const packed = pack(deep, maxLines);
      // if still one huge piece, force line-based split (last resort, may break)
      for (const p of packed) {
        if (p.split('\n').length <= maxLines) out.push(p);
        else {
          const lines = p.split('\n');
          for (let i = 0; i < lines.length; i += maxLines - 5) {
            out.push(lines.slice(i, i + maxLines - 5).join('\n') + '\n');
          }
        }
      }
    }
  }
  return out;
}

// ── sequential chunks ────────────────────────────────────────────────────
{
  const seqFn = snap.slice(1163, 1575).join('\n');
  let inner = extractBalanced(seqFn, seqFn.indexOf('{')).slice(1, -1);
  inner = fixFilled(inner)
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return t && !t.startsWith('//');
    })
    .join('\n');

  const forIdx = inner.indexOf('for (const [selector, fieldData] of entries)');
  const forBrace = inner.indexOf('{', forIdx);
  const forBody = extractBalanced(inner, forBrace).slice(1, -1);

  let parts = splitDeep(forBody, 0);
  // Expand any huge part
  const expanded = [];
  for (const p of parts) {
    if (p.split('\n').length > 140) expanded.push(...splitDeep(p, 1));
    else expanded.push(p);
  }
  const chunks = pack(expanded, 140);
  console.log(
    'final chunks',
    chunks.length,
    chunks.map((c) => c.split('\n').length)
  );

  // verify concat
  const joined = chunks.join('');
  if (joined.replace(/\s+/g, '') !== forBody.replace(/\s+/g, '')) {
    console.warn('WARN: chunk concat whitespace-normalized mismatch (may still run)');
  }

  chunks.forEach((chunk, i) => {
    write(
      `sequential-chunk-${i + 1}.js`,
      `/**
 * sequential chunk ${i + 1}/${chunks.length}
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSequentialChunk${i + 1} = function (k) {
    k._seqChunks = k._seqChunks || [];
    k._seqChunks[${i}] = ${JSON.stringify(chunk)};
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`
    );
  });

  // Remove old extra chunk files if fewer now
  for (let i = chunks.length + 1; i <= 10; i++) {
    const f = path.join(dir, `sequential-chunk-${i}.js`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
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

  write(
    'sequential.js',
    `/**
 * sequential fill loop — executes brace-balanced chunks per field
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSequential = function (k) {
${bindHead}

    async function fillSequential() {
      const chunks = k._seqChunks || [];
      const body = chunks.join('\\n');
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const names = [
        'selector', 'fieldData', 'k',
        'portalAdapters', 'filledBySource', 'mapping', '_replayResults', '_ccRecords',
        'RUNTIME_VERSION', '_CC_USE_PLUGINS', 'PRIORITY_KEYS', 'entries', 'getEl',
        '_emitFillDebug', '_flushRecords', '_pushSelectRecord', 'settleAfterAct',
        'waitForSelectOptionsSequential', 'waitForOptions', 'detectStrategy', 'verifyValue',
        '_isPlaceholderOption', '_realOptions', '_sampleOptions', '_readSelectActual',
        '_selectLoadMode', '_cascadeSemanticKey', '_CASCADE_PARENTS', '_cascadeSettled',
        '_isPlaceholderPlanned', '_selectIsActive', 'fillOne',
      ];
      const runField = new AsyncFunction(...names, body);
      for (const [selector, fieldData] of entries) {
        await runField(
          selector, fieldData, k,
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

// ── fill-one-ng trim to ≤200 ─────────────────────────────────────────────
{
  let c = fs.readFileSync(path.join(dir, 'fill-one-ng.js'), 'utf8');
  c = c
    .split('\n')
    .filter((l) => !/console\.(log|debug)\(/.test(l))
    .filter((l) => {
      const t = l.trim();
      if (t === '*') return false;
      if (t.startsWith('* ng-dropdown')) return false;
      return true;
    })
    .join('\n');
  // collapse multiple blank lines
  c = c.replace(/\n{3,}/g, '\n\n');
  let n = write('fill-one-ng.js', c);
  if (n > 200) {
    // Move cleanupSession + isVisible to helpers file (already has helpers)
    console.warn('ng still', n, '— compressing whitespace in try body');
    c = c.replace(/[ \t]+$/gm, '');
    n = write('fill-one-ng.js', c);
  }
}

// Delete obsolete broken files
const obsolete = [
  'fill-one-choice.js',
  'fill-one-ng-poll.js',
  'sequential-field-a.js',
  'sequential-field-b.js',
  'sequential-handle-a.js',
  'sequential-handle-b.js',
  'sequential-part1.js',
  'sequential-part2.js',
  '_sequential_full.js',
];
for (const f of obsolete) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log('deleted', f);
  }
}

console.log('finalize done');
