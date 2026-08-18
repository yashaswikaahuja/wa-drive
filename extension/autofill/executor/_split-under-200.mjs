/**
 * Split oversized executor parts to ≤200 lines each.
 * Run: node extension/autofill/executor/_split-under-200.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fo = fs.readFileSync(path.join(dir, 'fill-one.js'), 'utf8').split(/\r?\n/);
const seq = fs.readFileSync(path.join(dir, 'sequential.js'), 'utf8').split(/\r?\n/);
const post = fs.readFileSync(path.join(dir, 'post-fill.js'), 'utf8').split(/\r?\n/);

const slice = (lines, a, b) => lines.slice(a - 1, b).join('\n');

function wrap(installName, inner, comment) {
  return `/**
 * ${comment}
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.${installName} = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

${inner}
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
}

function reindent(block, fromIndent, toIndent) {
  const from = ' '.repeat(fromIndent);
  const to = ' '.repeat(toIndent);
  return block
    .split('\n')
    .map((l) => (l.startsWith(from) ? to + l.slice(from.length) : l))
    .join('\n');
}

// ═══════════════════════════════════════════════════════════════════
// FILL-ONE HANDLERS
// ═══════════════════════════════════════════════════════════════════

// NG A: lines 70-185 (open/session/overlay) — becomes helper returning ctx or code
{
  // Take interior of ng block from session start through overlayFound log (before poll)
  const interior = reindent(slice(fo, 71, 129), 8, 6);
  const inner = `
    k._ngDropdownPrepare = function (el, selector, value) {
${interior}
      return { adapter, _label, trigger, session, root: el, _optQ, OVERLAY_TAGS, activeOverlayRoot, _trace, isVisible, cleanupSession };
    };
`;
  // Problem: interior still has `if (adapter) {` structure from original — need raw from adapter check
  // Use lines 72-129 instead which are inside `if (adapter)`
}
// Rebuild ng more carefully from known-good _fo_ng.js
const ng = fs.readFileSync(path.join(dir, '_fo_ng.js'), 'utf8').split(/\r?\n/);

// _fo_ng starts with `      if (elType === 'ng-dropdown'...`
// Find "Poll for matching" line
let pollIdx = ng.findIndex((l) => l.includes('Poll for matching option'));
if (pollIdx < 0) pollIdx = 130;
const ngHead = ng.slice(0, pollIdx).join('\n'); // includes opening if
const ngTail = ng.slice(pollIdx).join('\n');

function stripNgIf(block) {
  let s = block;
  s = s.replace(/^\s*if \(elType === 'ng-dropdown' \|\| type === 'ng-dropdown'\) \{\n/, '');
  // Remove the trailing `      }` that closed the if — keep returns
  // Count: original ends with return 0; }  }  for adapter else and outer if
  return s;
}

// Simpler reliable approach: register try() handlers that contain the EXACT original if-blocks
// Split ng into two files by making the second half a function called from the first.

{
  // File 1: everything until poll, then call k._ngPollAndMatch(...)
  const beforePoll = reindent(ng.slice(1, pollIdx).join('\n'), 8, 8); // skip outer if line
  // beforePoll still starts with `const rootClass` inside if(adapter) after we skip first line of if elType

  // Parse structure from _fo_ng:
  // line0: if (elType...) {
  // line1-...: const rootClass... if (adapter) { ... poll ... returns } no-adapter return 0 }

  const inner = `
    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: 'ng-dropdown',
      try(el, selector, value, type, elType) {
        if (!(elType === 'ng-dropdown' || type === 'ng-dropdown')) return null;
        return k._ngDropdownFill(el, selector, value, type);
      },
    });
`;
  fs.writeFileSync(path.join(dir, 'fill-one-ng-dispatch.js'), wrap('installFillOneNgDispatch', inner, 'ng-dropdown handler registration'));

  // Build _ngDropdownFill split across two installers
  // Part A defines the function start through overlay, then calls part B
  // Actually define full function in two parts using string concat on k:

  const partAbody = ng.slice(1, pollIdx); // inside elType if, from rootClass
  // Find `if (adapter)` 
  // We'll create _ngDropdownFill as complete in one file by moving helpers out.

  // Extract score/match helpers from poll section to shrink main body.
}

// ── Pragmatic: write handler files with original blocks, split ng by extracting match helpers ──

function writeTryHandler(file, install, id, comment, tryBody) {
  const inner = `    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: '${id}',
      try(el, selector, value, type, elType) {
${tryBody}
      },
    });
`;
  const out = wrap(install, inner, comment);
  fs.writeFileSync(path.join(dir, file), out);
  const n = out.split(/\n/).length;
  console.log(String(n).padStart(4), n > 200 ? 'OVER' : 'ok  ', file);
  return n;
}

// MAT (small)
writeTryHandler(
  'fill-one-mat.js',
  'installFillOneMat',
  'mat',
  'mat-select / mat-checkbox / mat-radio',
  `        if (elType === 'mat-select') {
          const trigger = el.querySelector('.mat-select-trigger,.mat-mdc-select-trigger') || el;
          trigger.click();
          setTimeout(() => {
            const v = value.toLowerCase().trim();
            const opts = Array.from(document.querySelectorAll('mat-option,.mat-option,.mat-mdc-option'));
            const opt = opts.find(o => o.textContent.trim().toLowerCase() === v) ||
                        opts.find(o => o.textContent.trim().toLowerCase().startsWith(v)) ||
                        opts.find(o => v.startsWith(o.textContent.trim().toLowerCase()) && o.textContent.trim().length > 2) ||
                        opts.find(o => o.textContent.trim().toLowerCase().includes(v));
            if (opt) opt.click(); else document.body.click();
          }, 400);
          return 1;
        }
        if (elType === 'mat-checkbox') {
          const shouldCheck = /yes|true|1|on|checked/i.test(value);
          const input = el.querySelector('input[type="checkbox"]');
          const isChecked = input ? input.checked : el.classList.contains('mat-checkbox-checked');
          if (shouldCheck !== isChecked) { (input || el).click(); }
          return 1;
        }
        if (elType === 'mat-radio') {
          const v = value.toLowerCase().trim();
          const label = el.textContent.trim().toLowerCase();
          if (label === v || label.includes(v) || v.includes(label)) {
            const input = el.querySelector('input[type="radio"]') || el;
            input.click();
            return 1;
          }
          return 0;
        }
        return null;`
);

// CHOICE: radio-click, radio-group, radio, checkbox, file
{
  const head = reindent(slice(fo, 339, 370), 6, 8);
  const tail = reindent(slice(fo, 484, 545), 6, 8);
  // head has if type===radio-click without else chain; tail has } else if radio
  const tryBody = `        ${head.trim()}
        if (elType === 'radio') {
${reindent(slice(fo, 485, 500), 8, 10)}
          return 0;
        }
        if (elType === 'checkbox') {
${reindent(slice(fo, 502, 506), 8, 10)}
          return 0;
        }
        if (el.type === 'file') {
${reindent(slice(fo, 513, 545), 8, 10)}
        }
        return null;`;
  writeTryHandler('fill-one-choice.js', 'installFillOneChoice', 'choice', 'radio / checkbox / file', tryBody);
}

// SELECT
{
  const body = reindent(slice(fo, 372, 482), 6, 8);
  // starts with if (elType === 'select') {
  const tryBody = `        ${body.trim()}
        return null;`;
  // body already returns inside; after closing brace of if, return null
  writeTryHandler('fill-one-select.js', 'installFillOneSelect', 'select', 'native <select>', tryBody);
}

// DATE
{
  const body = reindent(slice(fo, 546, 643), 6, 8);
  // starts with } else if — fix to if
  let b = body.trim().replace(/^\} else if/, 'if').replace(/^else if/, 'if');
  const tryBody = `        ${b}
        return null;`;
  writeTryHandler('fill-one-date.js', 'installFillOneDate', 'date', 'flatpickr / jQuery / mat / native date', tryBody);
}

// TEXT
{
  let body = reindent(slice(fo, 644, 694), 6, 8).trim();
  body = body.replace(/^\} else \{/, '').replace(/^\s*else \{/, '');
  // remove trailing `}` of else
  if (body.endsWith('}')) {
    // remove last closing brace of else block carefully
    const idx = body.lastIndexOf('\n      }');
    // keep as function body
  }
  const tryBody = `        // text / textarea keystroke path (default)
        {
${reindent(slice(fo, 645, 693), 8, 10)}
          return 1;
        }`;
  writeTryHandler('fill-one-text.js', 'installFillOneText', 'text', 'keystroke / legacy text input', tryBody);
}

// NG — two files composing one fill function
{
  const prep = reindent(ng.slice(1, pollIdx).join('\n'), 8, 6); // inside elType if
  const poll = reindent(ng.slice(pollIdx).join('\n'), 8, 6);

  // prep includes `const rootClass` ... through overlay log, and opens `if (adapter)`
  // We'll define k._ngDropdownFill in ng-a that contains prepare+calls poll callback

  const ngA = `
    k._ngDropdownFill = function (el, selector, value, type) {
${prep}
      // continue in poll module
      return k._ngDropdownPoll(el, selector, value, type, {
        adapter, _label, trigger, session, root: el, activeOverlayRoot, _optQ, _trace, isVisible, cleanupSession,
      });
    };
`;
  // prep still has structure with if(adapter){ ... without closing — messy

  // FALLBACK: keep entire ng in one file but compress by removing verbose comments / using bind
  // 229 lines of content + wrap overhead ≈ 260. Must split.

  // Write ng as exact original block in fill-one-ng.js WITHOUT alias block (use bind) 
  // and move match scoring function out.
}

// Extract match scoring from ng poll into helper to shrink
{
  // Full ng handler with bind — measure size
  const fullNg = `
    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: 'ng-dropdown',
      try(el, selector, value, type, elType) {
        if (!(elType === 'ng-dropdown' || type === 'ng-dropdown')) return null;
${reindent(ng.slice(1).join('\n'), 6, 8)}
        return 0;
      },
    });
`;
  // ng.slice(1) still has closing braces for if adapter / if elType — the original _fo_ng ends with returns and braces
  let raw = wrap('installFillOneNg', fullNg, 'ng-dropdown portal adapter fill');
  // Fix: ng content starts with const rootClass after we skipped if elType — good
  // But original slice(1) starts with `        const rootClass` after `if (elType){` was line 0
  // Actually ng[0] is the if line, ng[1] is const rootClass — good

  // Remove trailing extra braces from original that closed elType if
  fs.writeFileSync(path.join(dir, 'fill-one-ng.js'), raw);
  console.log(String(raw.split(/\n/).length).padStart(4), raw.split(/\n/).length > 200 ? 'OVER' : 'ok  ', 'fill-one-ng.js');
}

// Dispatcher fill-one.js
{
  const dispatcher = `/**
 * fillOne dispatcher — resolves element + elType, runs registered handlers.
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
        return all[parseInt(selector.split('-')[2])];
      }
      if (selector.startsWith('ng-dropdown-')) {
        return document.querySelectorAll('div.ng-dropdown')[parseInt(selector.split('-')[2])];
      }
      return document.querySelector(selector);
    }

    function detectElType(el, type) {
      const tagName = el.tagName.toLowerCase();
      return tagName === 'select' ? 'select'
        : tagName === 'ng-select' ? 'ng-dropdown'
        : tagName === 'mat-select' ? 'mat-select'
        : tagName === 'mat-checkbox' ? 'mat-checkbox'
        : tagName === 'mat-radio-button' ? 'mat-radio'
        : (el.classList && (el.classList.contains('ng-dropdown') || el.classList.contains('ng-select'))) ? 'ng-dropdown'
        : (tagName !== 'input' && (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox')) ? 'ng-dropdown'
        : el.type || type || 'text';
    }

    function fillOne(selector, value, type) {
      let el;
      try {
        el = resolveEl(selector);
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
`;
  fs.writeFileSync(path.join(dir, 'fill-one.js'), dispatcher);
  console.log(String(dispatcher.split(/\n/).length).padStart(4), 'ok  ', 'fill-one.js (dispatcher)');
}

// ═══════════════════════════════════════════════════════════════════
// SEQUENTIAL — split into prepare loop head + act/verify
// ═══════════════════════════════════════════════════════════════════
{
  // Find midpoint near plugin/fillOne section (~210)
  const splitAt = 220;
  const headFn = slice(seq, 47, splitAt - 1); // async function fillSequential start ... 
  const tailFn = slice(seq, splitAt, 448); // rest of function before k.fillSequential =

  // Actually installSequential should define full function by calling helpers
  const seqA = wrap(
    'installSequentialPrepare',
    `
    k._seqPrepareField = async function (selector, fieldData) {
      const { value, type } = fieldData;
      let isNgDropdown = type === 'ng-dropdown' || selector.startsWith('ng-dropdown-');
      const fieldLabel = (filledBySource[selector]?.label || selector).toLowerCase();
      const _fieldCtxEarly = filledBySource[selector] || {};
      _emitFillDebug('field.start', {
        selector,
        label: _fieldCtxEarly.label || fieldLabel,
        type,
        planned: value,
        profileKey: _fieldCtxEarly.profileKey || fieldData.profileKey || null,
      });
      const _selectLike = /^(select|dropdown|ng-dropdown|mat-select)$/.test(type || '');
      const isDependent = _selectLike && PRIORITY_KEYS.some((pk) => fieldLabel.includes(pk) || selector.toLowerCase().includes(pk));
      let el = getEl(selector);
      if (!isNgDropdown && el) {
        const _tag = el.tagName.toLowerCase();
        if (_tag === 'ng-select' || (el.classList && (el.classList.contains('ng-select') || el.classList.contains('ng-dropdown')))) {
          isNgDropdown = true;
        }
        if (!isNgDropdown && _tag !== 'select' && _tag !== 'input' && _tag !== 'mat-select') {
          const _role = el.getAttribute('role');
          if (_role === 'combobox' || _role === 'listbox') isNgDropdown = true;
        }
      }
      return { value, type, isNgDropdown, fieldLabel, el, isDependent, _selectLike, _fieldCtxEarly };
    };
`,
    'sequential: per-field prepare (start debug + resolve el)'
  );
  fs.writeFileSync(path.join(dir, 'sequential-prepare.js'), seqA);
  console.log(String(seqA.split(/\n/).length).padStart(4), seqA.split(/\n/).length > 200 ? 'OVER' : 'ok  ', 'sequential-prepare.js');
}

console.log('\\nNOTE: sequential body + ng still need completion in this script — continuing…');
console.log('pollIdx', pollIdx, 'ng lines', ng.length);
