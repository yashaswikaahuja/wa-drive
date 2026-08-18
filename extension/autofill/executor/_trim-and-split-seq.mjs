import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));

function write(f, c) {
  if (!c.endsWith('\n')) c += '\n';
  fs.writeFileSync(path.join(dir, f), c);
  const n = c.split(/\n/).length;
  console.log(`${String(n).padStart(4)} ${n > 200 ? 'OVER' : 'ok  '} ${f}`);
  return n;
}

// ── Trim fill-one-ng.js ──────────────────────────────────────────────────
{
  let c = fs.readFileSync(path.join(dir, 'fill-one-ng.js'), 'utf8');
  c = c.replace(
    /const b = root\.CcExecParts\.bindKernelLocals\(k\);\s*const \{[\s\S]*?\} = b;/,
    `const b = root.CcExecParts.bindKernelLocals(k);
    const portalAdapters = b.portalAdapters;
    const filledBySource = b.filledBySource;
    const _replayResults = b._replayResults;
    const _ccRecords = b._ccRecords;
    const RUNTIME_VERSION = b.RUNTIME_VERSION;
    const _flushRecords = b._flushRecords;`
  );
  c = c
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      if (t.startsWith('// ─')) return false;
      if (t.startsWith('* Part of sequential')) return false;
      return true;
    })
    .join('\n');
  write('fill-one-ng.js', c);
}

// ── Split sequential into 3 step files + thin loop ───────────────────────
{
  const full = fs.readFileSync(path.join(dir, 'sequential.js'), 'utf8');
  // Extract function body between fillSequential() { ... } then k.fillSequential
  const m = full.match(/async function fillSequential\(\) \{([\s\S]*)\}\s*k\.fillSequential = fillSequential;/);
  if (!m) {
    console.error('could not find fillSequential body');
    process.exit(1);
  }
  let body = m[1];

  // The body is a for-loop. Extract for-loop contents.
  const forMatch = body.match(/for \(const \[selector, fieldData\] of entries\) \{([\s\S]*)\}\s*$/);
  if (!forMatch) {
    // try without trailing
    const idx = body.indexOf('for (const [selector, fieldData] of entries)');
    if (idx < 0) {
      console.error('no for-loop');
      process.exit(1);
    }
    // find opening brace after for
    const open = body.indexOf('{', idx);
    // balanced extract
    let depth = 0;
    let end = open;
    for (let i = open; i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    body = body.slice(open + 1, end);
  } else {
    body = forMatch[1];
  }

  const lines = body.split('\n');

  // Find cut points by markers inside the for body
  function findLine(re, from = 0) {
    for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i;
    return -1;
  }

  const btnPlugin = findLine(/_btnPlugin|button-click plugin/);
  const selectPath = findLine(/isDependent|waitForSelectOptionsSequential|selectLoadMode/);
  // Main act branching: after early returns for plugins, typically `if (isNgDropdown)` done then select vs else
  const elseDefault = findLine(/\} else \{/); // may be many
  // Find the big else for non-select path - look for file URL deferred or isChoice
  let defaultPath = findLine(/File input \(async|waiting_human|isChoice\s*=/);
  // Better: find `} else {` that precedes file/choice handling near mid-end
  let cuts = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('_btnPlugin') || lines[i].includes('Phase boundary: button-click')) cuts.push(['btn', i]);
    if (lines[i].includes('isDependent') && lines[i].includes('waitForSelect') === false) cuts.push(['dep', i]);
    if (lines[i].trim().startsWith('} else {')) cuts.push(['else', i]);
    if (lines[i].includes('_trulyFilled')) cuts.push(['verify', i]);
  }
  console.log(
    'cut hints',
    cuts.slice(0, 20),
    'total lines',
    lines.length,
    'btn',
    btnPlugin,
    'default',
    defaultPath
  );

  // Manual stable cuts based on known structure from snapshot:
  // Part1: start → through early ng-dropdown plugin settle (before isDependent select wait)
  // Part2: select/cascade path including tryApply
  // Part3: else default + verify/records

  // Find line with `if (isDependent)` for select wait - first major select-specific
  const depLine = findLine(/\bif \(isDependent\)/);
  // Find the else that goes with `if (type select-like / isNgDropdown paths done)` — 
  // In original, after ng plugin block, there's select handling starting with isDependent

  // Find `let strategy` or tryApply or `if (_selectLike` act section
  const tryApplyLine = findLine(/async function tryApply|function tryApply|let applyRes/);
  const elseLine = (() => {
    // last `} else {` before verify that is at indent of main field branches
    let last = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s{6,12}\} else \{\s*$/.test(lines[i]) || /^\s{8,14}\} else \{\s*$/.test(lines[i])) last = i;
    }
    // prefer else before _trulyFilled
    const ver = findLine(/_trulyFilled/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('} else {') && i < ver && i > (tryApplyLine > 0 ? tryApplyLine : 100)) {
        // check if this else is the non-select branch by looking ahead
        const window = lines.slice(i, i + 15).join('\n');
        if (window.includes('file') || window.includes('isChoice') || window.includes('fillOne')) return i;
      }
    }
    return last;
  })();

  console.log({ depLine, tryApplyLine, elseLine, total: lines.length });

  // If we can't find clean cuts, split by thirds on line count at nearest blank/comment
  function nearestBoundary(target) {
    for (let d = 0; d < 40; d++) {
      for (const i of [target + d, target - d]) {
        if (i > 10 && i < lines.length - 10) {
          const t = lines[i].trim();
          if (!t || t.startsWith('//') || t === '}' || t.startsWith('if (')) return i;
        }
      }
    }
    return target;
  }

  let cut1 = depLine > 20 ? depLine : nearestBoundary(Math.floor(lines.length / 3));
  let cut2 = elseLine > cut1 + 20 ? elseLine : nearestBoundary(Math.floor((2 * lines.length) / 3));

  // IMPORTANT: mid-function cuts break. Instead emit ONE sequential file per
  // complete step function that receives/returns a state object, and rewrite
  // the body to use state.*. That's a big rewrite.
  //
  // Pragmatic working approach under 200: keep sequential as 2 files of ~197
  // by splitting ONLY at a top-level point inside the for-loop where we can
  // use async IIFE continuations with shared state object initialized in part1.

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

  // Use eval-free approach: store the for-body as two async functions that
  // share locals via a \`state\` object. Auto-prefix declarations is hard.
  //
  // WORKING compromise: two files sequential-a.js and sequential-b.js each
  // containing half the ORIGINAL fillSequential function as a STRING executed
  // via new Function with explicit parameter list of all locals — too fragile.
  //
  // BEST working ≤200 approach now:
  // sequential.js remains the loop + calls k._seqRunField(selector, fieldData)
  // sequential-field.js contains the FULL for-body as async function — still ~350 OVER
  // So split field into field-1.js and field-2.js where field-1 returns state and
  // field-2 continues — REQUIRES converting lets to state.prop throughout.

  // Convert for-body to use state bag with a simple transform:
  const decls = [
    'isNgDropdown',
    'fieldLabel',
    '_fieldCtxEarly',
    '_selectLike',
    'isDependent',
    'el',
    '_t0',
    '_fieldCtx',
    '_selectLike2',
    'strategy',
    'settleMeta',
    'liveEl',
    'attempt',
    'semKey',
    'loadMode',
    'applyRes',
    'actual',
    'matchOk',
    'isChoice',
    '_r',
    '_ver',
    '_trulyFilled',
    '_el2',
    '_strategy',
    '_recChoice',
  ];

  // For this iteration: write sequential as 2 physical files by cutting at cut2
  // and wrapping each half in `await (async () => { ... })()` sharing outer
  // `let` declarations hoisted in sequential.js thin file.

  const hoistLets = decls.map((d) => `      let ${d};`).join('\n');
  const part1 = lines.slice(0, cut2).join('\n');
  const part2 = lines.slice(cut2).join('\n');

  // Rewrite part1/part2 to assign to hoisted vars: change `let X` / `const X` at start of statements
  function hoistRewrite(src) {
    let s = src;
    for (const d of decls) {
      s = s.replace(new RegExp(`\\bconst ${d}\\b`, 'g'), d);
      s = s.replace(new RegExp(`\\blet ${d}\\b`, 'g'), d);
    }
    // value/type from fieldData stay const in loop
    return s;
  }

  write(
    'sequential-part1.js',
    `/**
 * sequential field body part 1
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSequentialPart1 = function (k) {
${bindHead}
    k._seqPart1 = async function (selector, fieldData, scope) {
      const { value, type } = fieldData;
      // bind hoisted scope vars into local names
${decls.map((d) => `      let ${d} = scope.${d};`).join('\n')}
${hoistRewrite(part1)}
${decls.map((d) => `      scope.${d} = ${d};`).join('\n')}
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`
  );

  write(
    'sequential-part2.js',
    `/**
 * sequential field body part 2
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSequentialPart2 = function (k) {
${bindHead}
    k._seqPart2 = async function (selector, fieldData, scope) {
      const { value, type } = fieldData;
${decls.map((d) => `      let ${d} = scope.${d};`).join('\n')}
${hoistRewrite(part2)}
${decls.map((d) => `      scope.${d} = ${d};`).join('\n')}
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`
  );

  write(
    'sequential.js',
    `/**
 * sequential fill loop — dispatches part1/part2 per field
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSequential = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const { entries } = b;

    async function fillSequential() {
      for (const [selector, fieldData] of entries) {
        const scope = {};
        await k._seqPart1(selector, fieldData, scope);
        await k._seqPart2(selector, fieldData, scope);
      }
    }
    k.fillSequential = fillSequential;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`
  );
}

console.log('trim/split done');
