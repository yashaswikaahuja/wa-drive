/**
 * Finish ≤200-line split for fill-one / sequential / post-fill.
 * Run: node extension/autofill/executor/_finish-split.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const write = (f, c) => {
  fs.writeFileSync(path.join(dir, f), c);
  const n = c.split(/\n/).length;
  console.log(`${String(n).padStart(4)} ${n > 200 ? 'OVER' : 'ok  '} ${f}`);
};

const DESTRUCT = `    const b = root.CcExecParts.bindKernelLocals(k);
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
${DESTRUCT}

${body}
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
}

function dedent(block, spaces) {
  const re = new RegExp(`^[ ]{0,${spaces}}`, 'gm');
  return block.replace(re, '');
}

function pushHandler(id, tryBody) {
  return `    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: '${id}',
      try(el, selector, value, type, elType) {
${tryBody}
      },
    });`;
}

// ── NG: part A prepares; part B polls (compose via k._ngPollMatch) ─────────
{
  let a = read('_slice_ng_a.js');
  // strip outer `if (elType === 'ng-dropdown' || type === 'ng-dropdown') {`
  a = a.replace(/^\s*if \(elType === 'ng-dropdown' \|\| type === 'ng-dropdown'\) \{\r?\n/, '');
  a = dedent(a, 8);

  let b = read('_slice_ng_b.js');
  b = dedent(b, 8);
  // b starts with comment "// Poll for matching..." and uses locals from a

  // Part B as function receiving closed-over context object
  write(
    'fill-one-ng-poll.js',
    wrap(
      'installFillOneNgPoll',
      `    k._ngPollMatch = function (ctx) {
      const {
        el, selector, value, type, adapter, _label, trigger, session,
        root, activeOverlayRoot, _optQ, _trace, isVisible, cleanupSession,
      } = ctx;
${b.split('\n').map((l) => '      ' + l).join('\n')}
    };`,
      'ng-dropdown: poll / match / verify'
    )
  );

  // Part A: after overlay setup, call _ngPollMatch. Need to not close adapter if early.
  // The slice_ng_a ends mid-block before poll — still inside if(adapter).
  // Append call to poll and close braces.
  write(
    'fill-one-ng.js',
    wrap(
      'installFillOneNg',
      pushHandler(
        'ng-dropdown',
        `        if (!(elType === 'ng-dropdown' || type === 'ng-dropdown')) return null;
${a.split('\n').map((l) => '        ' + l).join('\n')}
        // Hand off to poll/match (defined in fill-one-ng-poll.js)
        return k._ngPollMatch({
          el, selector, value, type, adapter, _label, trigger, session,
          root: el, activeOverlayRoot, _optQ, _trace, isVisible, cleanupSession,
        });`
      ),
      'ng-dropdown: open session + overlay locate'
    )
  );
}

// ── MAT ──────────────────────────────────────────────────────────────────
{
  let mat = dedent(read('_slice_mat.js'), 6);
  // starts with comment + if mat-select
  write(
    'fill-one-mat.js',
    wrap(
      'installFillOneMat',
      pushHandler(
        'mat',
        `        if (elType !== 'mat-select' && elType !== 'mat-checkbox' && elType !== 'mat-radio') return null;
${mat.split('\n').map((l) => '        ' + l).join('\n')}
        return 0;`
      ),
      'mat-select / mat-checkbox / mat-radio'
    )
  );
}

// ── CHOICE (radio-click/group + radio/checkbox/file) ─────────────────────
{
  const a = dedent(read('_slice_choice_a.js'), 6);
  let b = dedent(read('_slice_choice_b.js'), 6);
  // b starts with `} else if (elType === 'radio')` — convert to if chain
  b = b.replace(/^\s*\} else if/, 'if').replace(/^\s*else if/, 'if');
  // also fix nested `} else if (elType === 'checkbox')` etc already as else if in chain — ok if we keep else if after converting first
  // After first replace only first line — remaining `} else if` for checkbox/file need fix
  b = b.replace(/\} else if/g, ' else if');

  write(
    'fill-one-choice.js',
    wrap(
      'installFillOneChoice',
      pushHandler(
        'choice',
        `${a.split('\n').map((l) => '        ' + l).join('\n')}
${b.split('\n').map((l) => '        ' + l).join('\n')}
        return null;`
      ),
      'radio-click / radio-group / radio / checkbox / file'
    )
  );
}

// ── SELECT ───────────────────────────────────────────────────────────────
{
  let sel = dedent(read('_slice_select.js'), 6);
  // starts with if (elType === 'select') { ... }
  write(
    'fill-one-select.js',
    wrap(
      'installFillOneSelect',
      pushHandler(
        'select',
        `        if (elType !== 'select') return null;
${sel
  .replace(/^\s*if \(elType === 'select'\) \{\r?\n/, '')
  .split('\n')
  .map((l) => '        ' + l)
  .join('\n')}
        return null;`
      ),
      'native <select> apply + retry'
    )
  );
}

// ── DATE ─────────────────────────────────────────────────────────────────
{
  let d = dedent(read('_slice_date.js'), 6);
  d = d.replace(/^\s*\} else if/, 'if').replace(/^\s*else if/, 'if');
  d = d.replace(/\} else if/g, ' else if');
  write(
    'fill-one-date.js',
    wrap(
      'installFillOneDate',
      pushHandler(
        'date',
        `${d.split('\n').map((l) => '        ' + l).join('\n')}
        return null;`
      ),
      'flatpickr / jQuery / mat / native date inputs'
    )
  );
}

// ── TEXT ─────────────────────────────────────────────────────────────────
{
  let t = dedent(read('_slice_text.js'), 6);
  t = t.replace(/^\s*\} else \{\r?\n/, '').replace(/^\s*else \{\r?\n/, '');
  // remove final closing brace of else if present as only `}`
  const lines = t.split('\n');
  if (lines.length && lines[lines.length - 1].trim() === '}') lines.pop();
  t = lines.join('\n');
  write(
    'fill-one-text.js',
    wrap(
      'installFillOneText',
      pushHandler(
        'text',
        `        // default text/textarea path
${t.split('\n').map((l) => '        ' + l).join('\n')}
        return 0;`
      ),
      'keystroke / legacy text fill'
    )
  );
}

// ── DISPATCHER ───────────────────────────────────────────────────────────
write(
  'fill-one.js',
  `/**
 * fillOne dispatcher — resolve el/elType, run registered handlers in order.
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOne = function (k) {
    k.fillOneHandlers = k.fillOneHandlers || [];

    function resolveEl(selector) {
      if (selector.startsWith('form-field-')) {
        const all = document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select');
        return all[parseInt(selector.split('-')[2], 10)];
      }
      if (selector.startsWith('ng-dropdown-')) {
        return document.querySelectorAll('div.ng-dropdown')[parseInt(selector.split('-')[2], 10)];
      }
      return document.querySelector(selector);
    }

    function detectElType(el, type) {
      const tagName = el.tagName.toLowerCase();
      if (tagName === 'select') return 'select';
      if (tagName === 'ng-select') return 'ng-dropdown';
      if (tagName === 'mat-select') return 'mat-select';
      if (tagName === 'mat-checkbox') return 'mat-checkbox';
      if (tagName === 'mat-radio-button') return 'mat-radio';
      if (el.classList && (el.classList.contains('ng-dropdown') || el.classList.contains('ng-select'))) {
        return 'ng-dropdown';
      }
      if (tagName !== 'input' && (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox')) {
        return 'ng-dropdown';
      }
      return el.type || type || 'text';
    }

    function fillOne(selector, value, type) {
      try {
        const el = resolveEl(selector);
        if (!el) return 0;
        const elType = detectElType(el, type);
        console.log('[CC] fillOne:', selector, 'elType:', elType, 'value:', value);
        const handlers = k.fillOneHandlers || [];
        for (let i = 0; i < handlers.length; i++) {
          const r = handlers[i].try(el, selector, value, type, elType);
          if (r !== null && r !== undefined) return r;
        }
        return 0;
      } catch (e) {
        return 0;
      }
    }

    k.fillOne = fillOne;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`
);

// ═════════════════════════════════════════════════════════════════════════
// SEQUENTIAL split
// ═════════════════════════════════════════════════════════════════════════
{
  const seq = read('sequential.js').split(/\r?\n/);
  // Find fillSequential and end
  const start = seq.findIndex((l) => l.includes('async function fillSequential'));
  const end = seq.findIndex((l, i) => i > start && l.trim() === 'k.fillSequential = fillSequential;');
  const fnLines = seq.slice(start, end); // includes function ... closing brace before assign

  // Split function body roughly in half at a clean boundary near plugin/fillOne act
  let mid = -1;
  for (let i = 0; i < fnLines.length; i++) {
    if (fnLines[i].includes('const _plugin =') || fnLines[i].includes('_CC_USE_PLUGINS && typeof findPlugin')) {
      // prefer the later main plugin dispatch (~line 208 in file)
      mid = i;
    }
  }
  if (mid < 0) mid = Math.floor(fnLines.length / 2);

  // Better split: extract field body into k._seqHandleField
  // sequential.js = loop + call handle
  // sequential-field-a.js = first part of handle (through early plugin returns)
  // sequential-field-b.js = rest (act/verify/records)

  // Find for-loop body start
  const forIdx = fnLines.findIndex((l) => l.includes('for (const [selector, fieldData]'));
  const bodyStart = forIdx + 1;
  // Find matching end of for — last `    }` before function close
  // Simpler approach: keep original installSequential but replace alias block with bind,
  // then cut the for-loop body into _seqStepA / _seqStepB

  // Use line numbers from full file: prepare 47-219, act 220-448
  const full = seq;
  // Find absolute mid at line containing `const _plugin =` near 208
  let absMid = full.findIndex((l) => l.trim().startsWith('const _plugin ='));
  if (absMid < 0) absMid = 220;

  // Build sequential-field.js as handleField with PART from start of for body to mid
  // and sequential-verify.js from mid to end of for

  // Easiest maintainable approach given time:
  // 1) sequential.js — thin loop calling k._seqProcessField
  // 2) Move entire for-body into sequential-process.js — still ~400 lines OVER
  // Must split process into 2-3 files.

  const forStartAbs = full.findIndex((l) => l.includes('for (const [selector, fieldData]'));
  const assignAbs = full.findIndex((l) => l.includes('k.fillSequential = fillSequential'));
  // body is forStartAbs+1 .. assignAbs-2 (closing braces)

  // Split body at absMid
  const partA = full.slice(forStartAbs + 1, absMid).join('\n');
  const partB = full.slice(absMid, assignAbs - 1).join('\n');
  // partB may include closing braces of for/function — trim trailing closes for process helper

  write(
    'sequential-field-a.js',
    wrap(
      'installSequentialFieldA',
      `    k._seqFieldA = async function (selector, fieldData) {
      const { value, type } = fieldData;
${dedent(partA, 6)
  .split('\n')
  .map((l) => '      ' + l)
  .join('\n')}
      return { value, type, selector, fieldData, cont: true };
    };`,
      'sequential field phase A (start → early plugin/ng paths)'
    )
  );

  write(
    'sequential-field-b.js',
    wrap(
      'installSequentialFieldB',
      `    k._seqFieldB = async function (ctx) {
      const selector = ctx.selector;
      const fieldData = ctx.fieldData;
      const value = ctx.value;
      const type = ctx.type;
${dedent(partB, 6)
  .split('\n')
  .map((l) => '      ' + l)
  .join('\n')}
    };`,
      'sequential field phase B (act → settle → verify → records)'
    )
  );

  write(
    'sequential.js',
    wrap(
      'installSequential',
      `    async function fillSequential() {
      for (const [selector, fieldData] of entries) {
        const ctx = await k._seqFieldA(selector, fieldData);
        if (!ctx || ctx.cont === false) continue;
        await k._seqFieldB(ctx);
      }
    }
    k.fillSequential = fillSequential;`,
      'DOM-order sequential fill loop (dispatches field A/B)'
    )
  );
}

// ═════════════════════════════════════════════════════════════════════════
// POST-FILL split
// ═════════════════════════════════════════════════════════════════════════
{
  const post = read('post-fill.js').split(/\r?\n/);
  const corrStart = post.findIndex((l) => l.includes('Operator Correction') || l.includes('setTimeout(() => {'));
  const confirmStart = post.findIndex((l) => l.includes('Confirm/Retype'));
  const mirrorStart = post.findIndex((l) => l.includes('Mirror Observer'));
  const end = post.findIndex((l) => l.includes('Final flush'));

  const slicePost = (a, b) => post.slice(a, b).join('\n');

  write(
    'post-fill-corrections.js',
    wrap(
      'installPostFillCorrections',
      dedent(slicePost(corrStart >= 0 ? corrStart : 46, confirmStart > 0 ? confirmStart : 150), 2)
        .split('\n')
        .map((l) => '    ' + l)
        .join('\n'),
      'Operator correction observer'
    )
  );

  write(
    'post-fill-confirm.js',
    wrap(
      'installPostFillConfirm',
      dedent(slicePost(confirmStart, mirrorStart > 0 ? mirrorStart : end), 2)
        .split('\n')
        .map((l) => '    ' + l)
        .join('\n'),
      'Confirm/retype propagation pass'
    )
  );

  write(
    'post-fill-mirror.js',
    wrap(
      'installPostFillMirror',
      (() => {
        let s = slicePost(mirrorStart, end > 0 ? end + 3 : post.length - 3);
        s = s.replace(/\n\s*return filled;?\s*$/m, '\n');
        s = s.replace(/return filled;?\s*/g, '');
        return dedent(s, 2)
          .split('\n')
          .map((l) => '    ' + l)
          .join('\n');
      })(),
      'Mirror observer + final records flush'
    )
  );

  write(
    'post-fill.js',
    `/**
 * Post-fill installer — runs corrections / confirm / mirror modules.
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFill = function (k) {
    if (typeof root.CcExecParts.installPostFillCorrections === 'function') {
      root.CcExecParts.installPostFillCorrections(k);
    }
    if (typeof root.CcExecParts.installPostFillConfirm === 'function') {
      root.CcExecParts.installPostFillConfirm(k);
    }
    if (typeof root.CcExecParts.installPostFillMirror === 'function') {
      root.CcExecParts.installPostFillMirror(k);
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`
  );
}

console.log('\\nDone generating. Next: fix syntax of OVER files + update inject lists.');
