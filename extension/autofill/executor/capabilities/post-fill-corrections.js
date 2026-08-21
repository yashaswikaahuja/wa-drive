/**
 * post-fill-corrections — Operator Correction Observer
 *
 * After fills settle, snapshots DOM values. On submit-button click or
 * beforeunload, captures operator-changed values and POSTs them as
 * correction signals to the backend (data-cc-backend attribute).
 * Also captures unmapped fields as 'completion' corrections.
 *
 * Public API (on globalThis.CcPostFillCorrections):
 *   installCorrectionsObserver(opts)
 *
 * opts: { entries, filledBySource, allFields, getEl, records,
 *         RUNTIME_VERSION, settleDelayMs? }
 */
(function (root) {
  'use strict';

  function readFieldValue(el) {
    if (!el) return '';
    if (el.tagName === 'SELECT') {
      var opt = el.options && el.options[el.selectedIndex];
      return (opt ? (opt.text || opt.value) : '') || '';
    }
    if (el.classList && el.classList.contains('ng-dropdown')) {
      var vEl = el.querySelector('.value-area .value,.select-type,.ng-value-label');
      return (vEl && vEl.textContent.trim()) || '';
    }
    return el.value || '';
  }

  function installCorrectionsObserver(opts) {
    opts = opts || {};
    var entries         = opts.entries         || [];
    var filledBySource  = opts.filledBySource  || {};
    var allFields       = opts.allFields       || [];
    var getEl           = opts.getEl           || function (s) { return document.querySelector(s); };
    var records         = opts.records         || [];
    var settleDelayMs   = typeof opts.settleDelayMs === 'number' ? opts.settleDelayMs : 10000;

    setTimeout(function () {
      var _ccBackendUrl = document.body.getAttribute('data-cc-backend') || '';
      var _ccFormKey    = document.body.getAttribute('data-cc-formkey') || '';
      var snapshot = {}, fieldMeta = {};

      for (var i = 0; i < entries.length; i++) {
        var sel = entries[i][0], fd = entries[i][1];
        var el = getEl(sel);
        if (!el) continue;
        snapshot[sel] = readFieldValue(el);
        var rec = records.find(function (r) { return r.selector === sel; });
        fieldMeta[sel] = {
          label: (filledBySource[sel] && filledBySource[sel].label) || sel,
          semanticKey: (filledBySource[sel] && filledBySource[sel].semanticKey) || '',
          profileKey:  (filledBySource[sel] && filledBySource[sel].profileKey)  || '',
          plugin: rec && rec.plugin || null,
          strategy: rec && rec.strategy || '',
          originalResult: rec && rec.result || 'unknown',
          autofilledValue: fd.value,
        };
      }

      if (Array.isArray(allFields)) {
        for (var j = 0; j < allFields.length; j++) {
          var f = allFields[j];
          if (snapshot[f.selector] !== undefined) continue;
          var el2 = getEl(f.selector);
          if (!el2) continue;
          snapshot[f.selector] = readFieldValue(el2);
          fieldMeta[f.selector] = { label: f.label || f.selector, semanticKey: '', profileKey: '',
            plugin: null, strategy: 'unmapped', originalResult: 'unmapped', autofilledValue: '' };
        }
      }

      function captureCorrections(trigger) {
        var out = [];
        Object.keys(snapshot).forEach(function (s) {
          var el = getEl(s);
          if (!el) return;
          var cur = readFieldValue(el);
          if (cur !== snapshot[s] && cur !== '') {
            var m = fieldMeta[s] || {};
            out.push({ selector: s, field: m.label, semanticKey: m.semanticKey,
              profileKey: m.profileKey, autofilledValue: m.autofilledValue,
              snapshotValue: snapshot[s], finalOperatorValue: cur,
              correctionType: (!snapshot[s] || snapshot[s] === '') ? 'completion' : 'override',
              originalResult: m.originalResult, plugin: m.plugin, strategy: m.strategy,
              trigger: trigger, ts: Date.now() });
          }
        });
        return out;
      }

      function postCorrections(trigger) {
        var corrections = captureCorrections(trigger);
        if (!corrections.length) return;
        try { document.body.setAttribute('data-cc-corrections', JSON.stringify(corrections)); } catch (e) {}
        if (_ccBackendUrl) {
          var tok = document.body.getAttribute('data-cc-token') || '';
          var pid = document.body.getAttribute('data-cc-profile-id') || '';
          var hdrs = { 'Content-Type': 'application/json' };
          if (tok) hdrs['Authorization'] = 'Bearer ' + tok;
          fetch(_ccBackendUrl + '/corrections', {
            method: 'POST', headers: hdrs,
            body: JSON.stringify({ hostname: location.hostname, semanticFormKey: _ccFormKey,
              profileId: pid, trigger: trigger, corrections: corrections }),
          }).catch(function () {});
        }
      }

      document.addEventListener('click', function (e) {
        var btn = e.target.closest('button,input[type="submit"],[type="submit"],.btn-submit,.submit-btn');
        if (!btn) return;
        var txt = (btn.textContent || btn.value || '').toLowerCase();
        if (/submit|save|next|continue|proceed|finalize/i.test(txt) || btn.type === 'submit') {
          postCorrections('submit');
        }
      }, true);

      window.addEventListener('beforeunload', function () { postCorrections('unload'); });
    }, settleDelayMs);
  }

  root.CcPostFillCorrections = { installCorrectionsObserver: installCorrectionsObserver };

})(typeof globalThis !== 'undefined' ? globalThis : this);
