/**
 * correction observer
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFillCorrections = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, allFields, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

// CcPostFillCorrections is the single source for correction observer logic.
  var _pfc = root.CcPostFillCorrections || {};
  if (_pfc.installCorrectionsObserver) {
    _pfc.installCorrectionsObserver({
      entries: Array.from(entries),
      filledBySource: filledBySource,
      allFields: allFields,
      getEl: getEl,
      records: k.records || [],
      RUNTIME_VERSION: RUNTIME_VERSION,
    });
    return;
  }
  // ── Operator Correction Observer ─────────────────────────────────────────
  // After runtime settles, snapshot filled values.
  // On form submit or page unload, capture final state and POST corrections.
  setTimeout(() => {
    const _ccBackendUrl = document.body.getAttribute('data-cc-backend') || '';
    const _ccFormKey = document.body.getAttribute('data-cc-formkey') || '';
    const snapshot = {};
    const fieldMeta = {};
    for (const [selector, fieldData] of entries) {
      let el = getEl(selector);
      if (!el) continue;
      const val = el.tagName === 'SELECT' ? (el.options[el.selectedIndex]?.text || el.value)
        : el.classList?.contains('ng-dropdown') ? (el.querySelector('.value-area .value,.select-type,.ng-value-label')?.textContent?.trim() || '')
        : el.value || '';
      snapshot[selector] = val;
      const rec = _ccRecords.find(r => r.selector === selector);
      fieldMeta[selector] = {
        label: filledBySource[selector]?.label || selector,
        semanticKey: filledBySource[selector]?.semanticKey || '',
        profileKey: filledBySource[selector]?.profileKey || '',
        plugin: rec?.plugin || null,
        strategy: rec?.strategy || '',
        originalResult: rec?.result || 'unknown',
        autofilledValue: fieldData.value
      };
    }

    // Also snapshot UNMAPPED fields the popup detected — so when operator fills them
    // manually, we capture them as 'completion' corrections (= teaching signal that
    // populates the profile next time)
    if (Array.isArray(allFields)) {
      for (const f of allFields) {
        if (snapshot[f.selector] !== undefined) continue; // already tracked as mapped
        const el = getEl(f.selector);
        if (!el) continue;
        const val = el.tagName === 'SELECT' ? (el.options[el.selectedIndex]?.text || el.value)
          : el.classList?.contains('ng-dropdown') ? (el.querySelector('.value-area .value,.select-type,.ng-value-label')?.textContent?.trim() || '')
          : el.value || '';
        snapshot[f.selector] = val;
        fieldMeta[f.selector] = {
          label: f.label || f.selector,
          semanticKey: '',
          profileKey: '',
          plugin: null,
          strategy: 'unmapped',
          originalResult: 'unmapped',
          autofilledValue: '',
        };
      }
    }

    function captureCorrections(trigger) {
      const corrections = [];
      for (const [selector, originalVal] of Object.entries(snapshot)) {
        let el = getEl(selector);
        if (!el) continue;
        const currentVal = el.tagName === 'SELECT' ? (el.options[el.selectedIndex]?.text || el.value)
          : el.classList?.contains('ng-dropdown') ? (el.querySelector('.value-area .value,.select-type,.ng-value-label')?.textContent?.trim() || '')
          : el.value || '';
        if (currentVal !== originalVal && currentVal !== '') {
          const meta = fieldMeta[selector] || {};
          corrections.push({
            selector, field: meta.label, semanticKey: meta.semanticKey, profileKey: meta.profileKey,
            autofilledValue: meta.autofilledValue, snapshotValue: originalVal, finalOperatorValue: currentVal,
            correctionType: (!originalVal || originalVal === '') ? 'completion' : 'override',
            originalResult: meta.originalResult, plugin: meta.plugin, strategy: meta.strategy,
            trigger, ts: Date.now()
          });
        }
      }
      return corrections;
    }

    function postCorrections(trigger) {
      const corrections = captureCorrections(trigger);
      if (corrections.length === 0) return;
      document.body.setAttribute('data-cc-corrections', JSON.stringify(corrections));
      if (_ccBackendUrl) {
        const _ccToken = document.body.getAttribute('data-cc-token') || '';
        const _ccProfileId = document.body.getAttribute('data-cc-profile-id') || '';
        const headers = { 'Content-Type': 'application/json' };
        if (_ccToken) headers['Authorization'] = 'Bearer ' + _ccToken;
        fetch(_ccBackendUrl + '/corrections', {
          method: 'POST',
          headers,
          body: JSON.stringify({ hostname: location.hostname, semanticFormKey: _ccFormKey, profileId: _ccProfileId, trigger, corrections })
        }).catch(() => {});
      }
    }

    // Detect submit button clicks
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button,input[type="submit"],[type="submit"],.btn-submit,.submit-btn');
      if (!btn) return;
      const txt = (btn.textContent || btn.value || '').toLowerCase();
      if (/submit|save|next|continue|proceed|finalize/i.test(txt) || btn.type === 'submit') {
        postCorrections('submit');
      }
    }, true);

    // Fallback: beforeunload
    window.addEventListener('beforeunload', () => postCorrections('unload'));
  }, 10000);

  
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
