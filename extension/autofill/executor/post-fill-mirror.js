/**
 * mirror observer
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFillMirror = function (k) {
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

// ── Mirror Observer: sync derived fields when operator fills primary manually ──
  setTimeout(function() {
    var confirmPatterns = /^c(?=[a-z])|^confirm|^retype|^re_?type|^re_?enter|^verify/i;
    var allInputs = Array.from(document.querySelectorAll('input[type=text],input[type=email],input[type=tel]'));
    allInputs.forEach(function(el) {
      if (!el.id) return;
      if (el.value) return; // already filled — no need to observe
      var id = el.id.toLowerCase();
      // Find if this is a primary field with a derived confirm field
      var confirmId = null;
      allInputs.forEach(function(other) {
        if (!other.id || other === el) return;
        var oid = other.id.toLowerCase();
        if (confirmPatterns.test(oid)) {
          var baseId = oid.replace(/^c(?=[a-z])/,'').replace(/^confirm_?/i,'').replace(/^retype_?/i,'').replace(/^re_?type_?/i,'').replace(/^re_?enter_?/i,'').replace(/^verify_?/i,'');
          if (baseId === id || id.includes(baseId) || baseId.includes(id)) confirmId = other.id;
        }
      });
      if (!confirmId) return;
      // Attach listener: when primary changes, mirror to confirm
      var _mirrorTarget = document.getElementById(confirmId);
      var _mirroring = false;
      el.addEventListener('input', function() {
        if (_mirroring) return;
        _mirroring = true;
        var niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (niv) niv.set.call(_mirrorTarget, el.value); else _mirrorTarget.value = el.value;
        ['input','change'].forEach(function(ev) { _mirrorTarget.dispatchEvent(new Event(ev, {bubbles:true})); });
        _mirroring = false;
      });
    });
  }, 3000);

  // Final flush via DOM attribute (shared between all worlds and executeScript calls)
  try { document.body.setAttribute('data-cc-records', JSON.stringify(_ccRecords)); } catch {}
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
