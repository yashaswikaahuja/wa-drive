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
    // confirm-field-pattern.js is the single source of truth for confirm/retype detection.
    var _cfp = root.CcConfirmFieldPattern || {};
    var _isConfirmField = _cfp.isConfirmField || function() { return false; };
    var _getBaseId      = _cfp.getBaseId     || function(id) { return id; };
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
        if (_isConfirmField(oid)) {
          var baseId = _getBaseId(oid);
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
