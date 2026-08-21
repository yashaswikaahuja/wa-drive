/**
 * mat-select/checkbox/radio
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneMat = function (k) {
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

    k.fillOneHandlers = k.fillOneHandlers || [];
    var _fom = root.CcFillOneMat || {};
    k.fillOneHandlers.push({
      id: 'mat',
      try(el, selector, value, type, elType) {
        if (_fom.fillMat) return _fom.fillMat(el, value, elType);
        if (elType !== 'mat-select' && elType !== 'mat-checkbox' && elType !== 'mat-radio') return null;
        if (elType === 'mat-select') {
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
                return 1; // fire-and-forget, count as filled
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
        return 0;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
