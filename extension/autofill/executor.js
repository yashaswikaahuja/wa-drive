/**
 * Sequential fill kernel — thin facade.
 *
 * Parts under autofill/executor/ (injected before this file). Public API unchanged:
 *   fillFormFieldsSequential(mapping, filledBySource, portalAdapters, allFields)
 */
globalThis.fillFormFieldsSequential = async function fillFormFieldsSequential(mapping, filledBySource, portalAdapters, allFields) {
  portalAdapters = portalAdapters || {};
  const parts = (typeof globalThis !== 'undefined' && globalThis.CcExecParts) || {};

  // Hard requirements — without these fill cannot run
  const need = [
    'bindKernelLocals',
    'installDebug',
    'installSelectHelpers',
    'installSettle',
    'installDomOrder',
    'installStrategy',
    'installFillOne',
    'installSequential',
  ];
  // Soft requirements — missing = degraded path (log, don't hard-crash early)
  const soft = [
    'installFillOneNgHelpers',
    'installFillOneNg',
    'installFillOneMat',
    'installFillOneRadioPlanned',
    'installFillOneSelect',
    'installFillOneChoiceDom',
    'installFillOneDate',
    'installFillOneText',
    'installPostFill',
  ];
  const missingHard = need.filter((n) => typeof parts[n] !== 'function');
  if (missingHard.length) {
    const ver =
      typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest
        ? chrome.runtime.getManifest().version
        : '?';
    const present = Object.keys(parts)
      .filter((k) => k === 'bindKernelLocals' || k.indexOf('install') === 0)
      .sort()
      .join('|');
    console.error('[CC] executor hard parts missing:', missingHard.join(','), 'present=', present, 'ver=', ver);
    throw new Error('executor_parts_not_loaded:' + missingHard[0] + ' @' + ver);
  }
  const missingSoft = soft.filter((n) => typeof parts[n] !== 'function');
  if (missingSoft.length) {
    console.warn('[CC] executor soft parts missing (inject incomplete?):', missingSoft.join(','));
  }

  const RUNTIME_VERSION =
    typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest
      ? chrome.runtime.getManifest().version
      : 'inj';

  console.log(
    '[CC] fillFormFieldsSequential started v' + RUNTIME_VERSION + ', fields:',
    Object.keys(mapping || {}).length
  );

  const k = {
    mapping: mapping || {},
    filledBySource: filledBySource || {},
    portalAdapters: portalAdapters,
    allFields: allFields || null,
    records: [],
    replayResults: {},
    RUNTIME_VERSION: RUNTIME_VERSION,
    STRATEGY_VERSION: '1.0',
    WAIT_ENGINE_VERSION: '1.2',
    CC_USE_PLUGINS: true,
    CC_LEGACY_COMPARE: true,
    fillRunId: 'fill:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ajaxWaitBudgetMs: 45000,
    ajaxNotLoadedCount: 0,
    cascadeSettled: Object.create(null),
    filled: 0,
    entries: [],
    PRIORITY_KEYS: null,
    CASCADE_PARENTS: null,
    fillOneHandlers: [],
    _seqChunks: [],
  };

  k.flushRecords = function flushRecords() {
    try {
      document.body.setAttribute('data-cc-records', JSON.stringify(k.records));
    } catch {
      /* ignore */
    }
  };

  function install(name) {
    if (typeof parts[name] === 'function') parts[name](k);
  }

  // Core helpers
  install('installDebug');
  install('installSelectHelpers');
  install('installSettle');
  install('installDomOrder');
  install('installStrategy');

  // fillOne handlers then dispatcher
  install('installFillOneNgHelpers');
  install('installFillOneNg');
  install('installFillOneMat');
  install('installFillOneRadioPlanned');
  install('installFillOneSelect');
  install('installFillOneChoiceDom');
  install('installFillOneDate');
  install('installFillOneText');
  install('installFillOne');

  // sequential — solid closure (no AsyncFunction)
  install('installSequential');
  if (typeof k.fillSequential !== 'function') {
    throw new Error(
      'executor_parts_not_loaded:fillSequential @' +
        ((typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest)
          ? chrome.runtime.getManifest().version
          : '?')
    );
  }

  k.emitFillDebug('fill.start', {
    fieldCount: Object.keys(k.mapping).length,
    waitEngine: k.WAIT_ENGINE_VERSION,
  });

  await k.fillSequential();

  k.emitFillDebug('fill.end', {
    filled: k.filled,
    records: k.records.length,
    ajaxBudgetLeftMs: k.ajaxWaitBudgetMs,
  });

  parts.installPostFill(k);

  try {
    document.body.setAttribute('data-cc-records', JSON.stringify(k.records));
  } catch {
    /* ignore */
  }

  return k.filled;
}
