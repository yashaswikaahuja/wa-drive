/**
 * confirm/retype pass
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFillConfirm = function (k) {
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

// ── Confirm/Retype propagation pass ─────────────────────────────────────────
  // After primary fills settle, mirror DOM values into confirm/retype fields
  setTimeout(function() {
    // confirm-field-pattern.js is the single source of truth for confirm/retype detection.
    var _cfp = root.CcConfirmFieldPattern || {};
    var _isConfirmField = _cfp.isConfirmField || function() { return false; };
    var _getBaseId      = _cfp.getBaseId     || function(id) { return id; };
    var allInputs = Array.from(document.querySelectorAll('input[type=text],input[type=email],input[type=tel],input[type=number]'));
    allInputs.forEach(function(el) {
      if (!el.id && !el.name) return;
      var id = (el.id || el.name || '').toLowerCase();
      var label = (function() { if(el.id){var l=document.querySelector('label[for="'+el.id+'"]');if(l)return l.textContent.toLowerCase();} return ''; })();
      var isConfirm = _isConfirmField(id, label);
      if (!isConfirm) return;
      if (el.value) return; // already filled, skip
      // Find primary field by stripping confirm prefix from ID
      var baseId = _getBaseId(id);
      var primary = document.getElementById(baseId) || document.querySelector('[id$="'+baseId+'"]') || document.querySelector('[name="'+baseId+'"]');
      // Also try matching by placeholder pattern (both DOB fields have DD/MM)
      if (!primary || !primary.value) {
        var ph = (el.placeholder || '').toLowerCase();
        if (ph.includes('dd/mm') || ph.includes('dd-mm')) {
          // Find any filled input with same placeholder pattern
          var allFilled = Array.from(document.querySelectorAll('input[type=text]')).filter(function(inp) {
            return inp !== el && inp.value && (inp.placeholder || '').toLowerCase().match(/dd.mm/);
          });
          if (allFilled.length > 0) primary = allFilled[0];
        }
      }
      if (!primary || !primary.value) return;
      // Propagate settled DOM value
      var niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (niv) niv.set.call(el, primary.value); else el.value = primary.value;
      ['input','change','blur'].forEach(function(ev) { el.dispatchEvent(new Event(ev, {bubbles:true})); });
      _ccRecords.push((root.CcBuildFillRecord ? root.CcBuildFillRecord.buildFillRecord : function(b){return Object.assign({ts:Date.now(),rv:RUNTIME_VERSION,fillMode:'sequential'},b);})({ selector: '#'+(el.id||el.name), value: primary.value, type: 'text', result: 'filled', strategy: 'confirm-mirror', durationMs: 0 }, { rv: RUNTIME_VERSION }));
      _flushRecords();
    });
  }, 4000);

  
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
