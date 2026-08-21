/**
 * date pickers
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneDate = function (k) {


    k.fillOneHandlers = k.fillOneHandlers || [];
    var _fod = root.CcFillOneDate || {};
    k.fillOneHandlers.push({
      id: 'date',
      try(el, selector, value, type, elType) {
        if (_fod.fillDate) return _fod.fillDate(el, selector, value);
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
