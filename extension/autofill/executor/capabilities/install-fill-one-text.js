/**
 * text / keystroke fill
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneText = function (k) {


    k.fillOneHandlers = k.fillOneHandlers || [];
    // fill-one-text.js capability is the single source for text fill logic.
    var _fot = root.CcFillOneText || {};
    k.fillOneHandlers.push({
      id: 'text',
      try(el, selector, value, type, elType) {
        if (_fot.fillText) return _fot.fillText(el, value);
        return null; // capability not loaded
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
