/**
 * Bake sequential-chunk-*.js strings into sequential.js so installSequential
 * alone populates k._seqChunks (no separate chunk installer calls needed).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));

function extractChunkString(file) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  // k._seqChunks[N] = "....";
  const m = src.match(/k\._seqChunks\[\d+\]\s*=\s*("(?:\\.|[^"\\])*")\s*;/);
  if (!m) throw new Error('no chunk string in ' + file);
  return m[1]; // still quoted JSON string
}

const chunks = [1, 2, 3, 4, 5].map((i) => extractChunkString(`sequential-chunk-${i}.js`));

const out = `/**
 * sequential fill loop — chunks baked in at build time
 * Rebuild helper: node extension/autofill/executor/_bake-chunks-into-sequential.mjs
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSequential = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, waitForDOMQuiet, waitForNetworkIdle,
      detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

    // Always (re)load baked chunks onto this kernel
    k._seqChunks = [
${chunks.map((c) => '      ' + c).join(',\n')}
    ];

    async function fillSequential() {
      const chunkBody = (k._seqChunks || []).join('\\n');
      const body = chunkBody
        .replace(/\\bcontinue\\b/g, 'return')
        .replace(/\\bbreak\\b/g, 'return');
      if (!body.trim()) {
        throw new Error('sequential_chunks_empty');
      }
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const names = [
        'selector', 'fieldData', 'k',
        'portalAdapters', 'filledBySource', 'mapping', '_replayResults', '_ccRecords',
        'RUNTIME_VERSION', '_CC_USE_PLUGINS', 'PRIORITY_KEYS', 'entries', 'getEl',
        '_emitFillDebug', '_flushRecords', '_pushSelectRecord', 'settleAfterAct',
        'waitForSelectOptionsSequential', 'waitForOptions', 'waitForDOMQuiet', 'waitForNetworkIdle',
        'detectStrategy', 'verifyValue',
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
          waitForSelectOptionsSequential, waitForOptions, waitForDOMQuiet, waitForNetworkIdle,
          detectStrategy, verifyValue,
          _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
          _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
          _isPlaceholderPlanned, _selectIsActive, fillOne
        );
      }
    }
    k.fillSequential = fillSequential;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

fs.writeFileSync(path.join(dir, 'sequential.js'), out);
console.log('baked sequential.js lines', out.split(/\n/).length);
