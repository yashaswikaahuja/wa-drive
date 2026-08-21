/**
 * Post-fill — compose corrections / confirm / mirror.
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFill = function (k) {
    root.CcExecParts.installPostFillCorrections(k);
    root.CcExecParts.installPostFillConfirm(k);
    root.CcExecParts.installPostFillMirror(k);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
