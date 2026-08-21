/**
 * native select
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneSelect = function (k) {
    var b = root.CcExecParts.bindKernelLocals(k);
    var mapping = b.mapping;


    k.fillOneHandlers = k.fillOneHandlers || [];
    var _fos = root.CcFillOneSelect || {};
    k.fillOneHandlers.push({
      id: 'select',
      try(el, selector, value, type, elType) {
        if (elType !== 'select') return null;
        if (_fos.fillSelect) return _fos.fillSelect(el, selector, value, mapping);
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
