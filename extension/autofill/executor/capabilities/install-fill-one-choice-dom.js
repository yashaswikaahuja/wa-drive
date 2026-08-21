/**
 * DOM radio / checkbox / file
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneChoiceDom = function (k) {
    var b = root.CcExecParts.bindKernelLocals(k);
    var filledBySource = b.filledBySource;


    k.fillOneHandlers = k.fillOneHandlers || [];
    var _for = root.CcFillOneRadio || {};
    k.fillOneHandlers.push({
      id: 'choice-dom',
      try(el, selector, value, type, elType) {
        if (_for.fillRadio) return _for.fillRadio(el, selector, value, type, elType, filledBySource);
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
