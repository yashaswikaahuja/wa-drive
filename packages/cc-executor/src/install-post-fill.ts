/**
 * Post-fill — compose corrections / confirm / mirror.
 * Part of sequential kernel — load before autofill/executor.ts
 */
(function (root: any) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFill = function (k) {
    root.CcExecParts.installPostFillCorrections(k);
    root.CcExecParts.installPostFillConfirm(k);
    root.CcExecParts.installPostFillMirror(k);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
