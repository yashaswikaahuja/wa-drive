(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  // Minimal fallback if fill-one-ng-helpers.js did not inject
  root.CcExecParts.installFillOneNgHelpers = root.CcExecParts.installFillOneNgHelpers || function (k) {
    k._ngCancelSession = function (label) {
      var _nsm = root.CcNgSessionManager;
      if (_nsm && _nsm.cancelSession) {
        _nsm.cancelSession(label, window._ccReplaySessions || null);
        return;
      }
      // Fallback
      var old = window._ccReplaySessions && window._ccReplaySessions.get(label);
      if (!old) return;
      old.cancelled = true; try { clearInterval(old.pollTimer); } catch (e) {}
      (old.timeoutIds || []).forEach(function (id) { try { clearTimeout(id); } catch(e) {} });
      if (old.observer) { old.observer.disconnect(); old.observer = null; }
      window._ccReplaySessions.delete(label);
    };
  };
  root.CcExecParts.installFillOneNg = function (k) {
    root.CcExecParts.installFillOneNgHelpers(k);
    var b = root.CcExecParts.bindKernelLocals(k);
    var portalAdapters = b.portalAdapters;
    var filledBySource = b.filledBySource;
    var _replayResults = b._replayResults;
    var _ccRecords = b._ccRecords;
    var RUNTIME_VERSION = b.RUNTIME_VERSION;
    var _flushRecords = b._flushRecords;
    k.fillOneHandlers = k.fillOneHandlers || [];
    var _fong = root.CcFillOneNg || {};
    k.fillOneHandlers.push({
      id: 'ng-dropdown',
      try(el, selector, value, type, elType) {
        if (_fong.fillNg) return _fong.fillNg(el, selector, value, type, elType, {
          portalAdapters, filledBySource, _replayResults, _ccRecords,
          RUNTIME_VERSION, _flushRecords,
        });
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
