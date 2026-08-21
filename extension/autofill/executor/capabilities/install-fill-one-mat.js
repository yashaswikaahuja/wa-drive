/**
 * mat-select/checkbox/radio
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneMat = function (k) {


    k.fillOneHandlers = k.fillOneHandlers || [];
    var _fom = root.CcFillOneMat || {};
    k.fillOneHandlers.push({
      id: 'mat',
      try(el, selector, value, type, elType) {
        if (_fom.fillMat) return _fom.fillMat(el, value, elType);
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
