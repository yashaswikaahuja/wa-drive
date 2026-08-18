/**
 * Build CcExecParts modules from _source_snapshot.js
 * Run from repo: node extension/autofill/executor/_build-parts.mjs
 *
 * fillOne / sequential use local aliases (same names as original closure)
 * so bodies stay readable and avoid breaking object keys like `{ filled: n }`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const snap = fs.readFileSync(path.join(dir, '_source_snapshot.js'), 'utf8');
const lines = snap.split(/\r?\n/);

function slice(a, b) {
  return lines.slice(a - 1, b).join('\n');
}

function wrap(installFnName, body, headerComment) {
  return `/**
 * ${headerComment}
 * Part of sequential kernel â€” load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.${installFnName} = function (k) {
${body}
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
}

const ALIASES = `    const portalAdapters = k.portalAdapters;
    const filledBySource = k.filledBySource;
    const mapping = k.mapping;
    const allFields = k.allFields;
    const _replayResults = k.replayResults;
    const _ccRecords = k.records;
    const RUNTIME_VERSION = k.RUNTIME_VERSION;
    const STRATEGY_VERSION = k.STRATEGY_VERSION;
    const WAIT_ENGINE_VERSION = k.WAIT_ENGINE_VERSION;
    const _CC_USE_PLUGINS = k.CC_USE_PLUGINS;
    const _CC_LEGACY_COMPARE = k.CC_LEGACY_COMPARE;
    const PRIORITY_KEYS = k.PRIORITY_KEYS;
    const entries = k.entries;
    const getEl = function () { return k.getEl.apply(k, arguments); };
    const _emitFillDebug = function () { return k.emitFillDebug.apply(k, arguments); };
    const _flushRecords = function () { return k.flushRecords(); };
    const _pushSelectRecord = function () { return k.pushSelectRecord.apply(k, arguments); };
    const settleAfterAct = function () { return k.settleAfterAct.apply(k, arguments); };
    const waitForSelectOptionsSequential = function () { return k.waitForSelectOptionsSequential.apply(k, arguments); };
    const waitForOptions = function () { return k.waitForOptions.apply(k, arguments); };
    const waitForDOMQuiet = function () { return k.waitForDOMQuiet.apply(k, arguments); };
    const waitForNetworkIdle = function () { return k.waitForNetworkIdle.apply(k, arguments); };
    const detectStrategy = function () { return k.detectStrategy.apply(k, arguments); };
    const verifyValue = function () { return k.verifyValue.apply(k, arguments); };
    const _isPlaceholderOption = function () { return k.isPlaceholderOption.apply(k, arguments); };
    const _realOptions = function () { return k.realOptions.apply(k, arguments); };
    const _sampleOptions = function () { return k.sampleOptions.apply(k, arguments); };
    const _readSelectActual = function () { return k.readSelectActual.apply(k, arguments); };
    const _selectLoadMode = function () { return k.selectLoadMode.apply(k, arguments); };
    const _cascadeSemanticKey = function () { return k.cascadeSemanticKey.apply(k, arguments); };
    const _CASCADE_PARENTS = k.CASCADE_PARENTS;
    const _cascadeSettled = k.cascadeSettled;
    const _isPlaceholderPlanned = function () { return k.isPlaceholderPlanned.apply(k, arguments); };
    const _selectIsActive = function () { return k.selectIsActive.apply(k, arguments); };
    const fillOne = function () { return k.fillOne.apply(k, arguments); };
    // Mutable budget / counters â€” sync through k
    Object.defineProperty(k, '_bindBudget', { value: true, configurable: true });
`;

/** Rewrite mutable budget vars onto k (safe); leave `filled` to explicit handling. */
function rewriteBudget(body) {
  return body
    .replace(/\b_ajaxWaitBudgetMs\b/g, 'k.ajaxWaitBudgetMs')
    .replace(/\b_ajaxNotLoadedCount\b/g, 'k.ajaxNotLoadedCount');
}

function rewriteFilledVar(body) {
  // filled += / filled = / (filled) as value â€” not property keys `filled:`
  return body
    .replace(/([^.\w])filled\s*\+=/g, '$1k.filled +=')
    .replace(/([^.\w])filled\s*=/g, '$1k.filled =')
    .replace(/([^.\w])\bfilled\b(?!\s*:)/g, '$1k.filled');
}

// â”€â”€ debug.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  let body = slice(19, 91);
  body = body
    .replace(/\bRUNTIME_VERSION\b/g, 'k.RUNTIME_VERSION')
    .replace(/\b_fillRunId\b/g, 'k.fillRunId')
    .replace(/\blet _debugPort = null;\s*/g, '')
    .replace(/\blet _debugQueue = \[\];\s*/g, '')
    .replace(/\blet _debugFlushTimer = null;\s*/g, '')
    .replace(/\b_debugPort\b/g, 'k._debugPort')
    .replace(/\b_debugQueue\b/g, 'k._debugQueue')
    .replace(/\b_debugFlushTimer\b/g, 'k._debugFlushTimer')
    .replace(/function _ensureDebugPort/g, 'function ensureDebugPort')
    .replace(/function _flushDebugQueue/g, 'function flushDebugQueue')
    .replace(/function _scheduleDebugFlush/g, 'function scheduleDebugFlush')
    .replace(/function _emitFillDebug/g, 'function emitFillDebug')
    .replace(/\b_ensureDebugPort\b/g, 'ensureDebugPort')
    .replace(/\b_flushDebugQueue\b/g, 'flushDebugQueue')
    .replace(/\b_scheduleDebugFlush\b/g, 'scheduleDebugFlush');
  body =
    `    k._debugPort = null;\n    k._debugQueue = [];\n    k._debugFlushTimer = null;\n` +
    body +
    `\n    k.emitFillDebug = emitFillDebug;\n    k.flushDebugQueue = flushDebugQueue;\n`;
  fs.writeFileSync(path.join(dir, 'debug.js'), wrap('installDebug', body, 'Live fill_debug emit (port + batch queue)'));
}

// â”€â”€ select-helpers.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  let body = slice(102, 211);
  body = body
    .replace(/const _cascadeSettled = Object\.create\(null\);\s*/g, '')
    .replace(/let _ajaxNotLoadedCount = 0;\s*/g, '')
    .replace(/let _ajaxWaitBudgetMs = 45000; \/\/[^\n]*\n/g, '')
    .replace(/function _isPlaceholderOption/g, 'function isPlaceholderOption')
    .replace(/function _realOptions/g, 'function realOptions')
    .replace(/function _sampleOptions/g, 'function sampleOptions')
    .replace(/function _readSelectActual/g, 'function readSelectActual')
    .replace(/function _selectLoadMode/g, 'function selectLoadMode')
    .replace(/function _cascadeSemanticKey/g, 'function cascadeSemanticKey')
    .replace(/const _CASCADE_PARENTS =/g, 'k.CASCADE_PARENTS =')
    .replace(/function _isPlaceholderPlanned/g, 'function isPlaceholderPlanned')
    .replace(/function _selectIsActive/g, 'function selectIsActive')
    .replace(/function _pushSelectRecord/g, 'function pushSelectRecord')
    .replace(/\b_isPlaceholderOption\b/g, 'isPlaceholderOption')
    .replace(/\b_realOptions\b/g, 'realOptions')
    .replace(/\bRUNTIME_VERSION\b/g, 'k.RUNTIME_VERSION')
    .replace(/\b_ccRecords\b/g, 'k.records')
    .replace(/\b_flushRecords\b/g, 'k.flushRecords')
    .replace(/\b_emitFillDebug\b/g, 'k.emitFillDebug');
  body += `
    k.isPlaceholderOption = isPlaceholderOption;
    k.realOptions = realOptions;
    k.sampleOptions = sampleOptions;
    k.readSelectActual = readSelectActual;
    k.selectLoadMode = selectLoadMode;
    k.cascadeSemanticKey = cascadeSemanticKey;
    k.isPlaceholderPlanned = isPlaceholderPlanned;
    k.selectIsActive = selectIsActive;
    k.pushSelectRecord = pushSelectRecord;
`;
  fs.writeFileSync(path.join(dir, 'select-helpers.js'), wrap('installSelectHelpers', body, 'Select/cascade helpers + pushSelectRecord'));
}

// â”€â”€ settle.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  let body = slice(225, 256) + '\n' + slice(421, 472);
  body = rewriteBudget(body);
  body += `
    k.settleAfterAct = settleAfterAct;
    k.waitForSelectOptionsSequential = waitForSelectOptionsSequential;
    k.waitForOptions = waitForOptions;
    k.waitForDOMQuiet = waitForDOMQuiet;
    k.waitForNetworkIdle = waitForNetworkIdle;
`;
  fs.writeFileSync(path.join(dir, 'settle.js'), wrap('installSettle', body, 'settleAfterAct + WaitEngine'));
}

// â”€â”€ strategy.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  let body = slice(258, 418);
  // verifyValue uses getEl â€” alias
  body =
    `    const getEl = function () { return k.getEl.apply(k, arguments); };\n` + body;
  body += `
    k.STRATEGY_REGISTRY = STRATEGY_REGISTRY;
    k.detectStrategy = detectStrategy;
    k.verifyValue = verifyValue;
`;
  fs.writeFileSync(path.join(dir, 'strategy.js'), wrap('installStrategy', body, 'STRATEGY_REGISTRY + detectStrategy + verifyValue'));
}

// â”€â”€ dom-order.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  const body = `
    function getEl(sel) {
      if (sel.startsWith('form-field-')) {
        const all = document.querySelectorAll('input[type=text],input[type=email],input[type=tel],input[type=number],input[type=date],input[type=radio],input[type=checkbox],input:not([type]),textarea,select');
        return all[parseInt(sel.split('-')[2])];
      }
      if (sel.startsWith('ng-dropdown-')) return document.querySelectorAll('div.ng-dropdown')[parseInt(sel.split('-')[2])];
      return document.querySelector(sel);
    }
    k.getEl = getEl;
    k.PRIORITY_KEYS = [
      'state', 'rajya', 'à¤°à¤¾à¤œà¥à¤¯',
      'district', 'jila', 'à¤œà¤¿à¤²à¤¾',
      'sub_division', 'subdivision', 'sub-division', 'à¤…à¤¨à¥à¤®à¤‚à¤¡à¤²',
      'block', 'prakhand', 'à¤ªà¥à¤°à¤–à¤‚à¤¡',
      'panchayat', 'village_panchayat', 'à¤ªà¤‚à¤šà¤¾à¤¯à¤¤',
      'village', 'gram', 'à¤—à¥à¤°à¤¾à¤®', 'mohalla', 'à¤®à¥‹à¤¹à¤²à¥à¤²à¤¾',
      'tehsil', 'taluka', 'à¤¤à¤¹à¤¸à¥€à¤²',
      'police_station', 'police-station', 'thana', 'à¤¥à¤¾à¤¨à¤¾',
      'post_office', 'post-office', 'à¤¡à¤¾à¤• à¤˜à¤°',
      'pin_code', 'pincode', 'à¤ªà¤¿à¤¨',
      'municipal', 'à¤¨à¤—à¤°',
    ];
    k.entries = Object.entries(k.mapping || {});
    k.entries.sort(([sa], [sb]) => {
      const a = getEl(sa), b = getEl(sb);
      if (!a || !b) return 0;
      if (a === b) return 0;
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
`;
  fs.writeFileSync(path.join(dir, 'dom-order.js'), wrap('installDomOrder', body, 'getEl + PRIORITY_KEYS + DOM-order entries'));
}

// â”€â”€ fill-one.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  let body = slice(508, 1159);
  body = rewriteBudget(body);
  // Avoid const fillOne alias shadowing the function declaration
  const aliases = ALIASES.replace(
    /const fillOne = function \(\) \{ return k\.fillOne\.apply\(k, arguments\); \};\n/,
    ''
  );
  body = aliases + '\n' + body + '\n    k.fillOne = fillOne;\n';
  fs.writeFileSync(path.join(dir, 'fill-one.js'), wrap('installFillOne', body, 'Single-field fillOne strategies'));
}

// â”€â”€ sequential.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  let body = slice(1164, 1575);
  body = rewriteBudget(body);
  body = rewriteFilledVar(body);
  const aliases = ALIASES.replace(
    /const fillOne = function \(\) \{ return k\.fillOne\.apply\(k, arguments\); \};/,
    'const fillOne = function () { return k.fillOne.apply(k, arguments); };'
  );
  // entries is const alias to k.entries â€” for-loop uses entries; good
  // filled rewrites point to k.filled
  body = aliases + '\n' + body + '\n    k.fillSequential = fillSequential;\n';
  fs.writeFileSync(path.join(dir, 'sequential.js'), wrap('installSequential', body, 'DOM-order sequential fill loop'));
}

// â”€â”€ post-fill.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  let body = slice(1584, 1759);
  body = rewriteBudget(body);
  const aliases = ALIASES.replace(
    /const fillOne = function \(\) \{ return k\.fillOne\.apply\(k, arguments\); \};\n/,
    ''
  );
  body = aliases + '\n' + body + '\n';
  fs.writeFileSync(path.join(dir, 'post-fill.js'), wrap('installPostFill', body, 'Correction observer + confirm/retype + mirror'));
}

console.log('OK â€” built parts in', dir);
