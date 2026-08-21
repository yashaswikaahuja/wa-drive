/**
 * radio-click / radio-group
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneRadioPlanned = function (k) {


    k.fillOneHandlers = k.fillOneHandlers || [];
    var _for2 = root.CcFillOneRadio || {};
    k.fillOneHandlers.push({
      id: 'radio-planned',
      try(el, selector, value, type, elType) {
        if (_for2.fillRadio) return _for2.fillRadio(el, selector, value, type, elType, filledBySource);
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
