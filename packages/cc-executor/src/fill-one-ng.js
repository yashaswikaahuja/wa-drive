/**
 * fill-one-ng — ng-dropdown Fill Handler
 *
 * Fills Angular ng-select / ng-dropdown elements via adapter-driven
 * overlay detection, MutationObserver session, option poll loop,
 * and click + verify pass.
 *
 * Depends on:
 *   CcNgOptionScorer   — option text scoring (CAP-11)
 *   CcNgSessionManager — session lifecycle (CAP-12)
 *   CcBuildFillRecord  — record stamping (CAP-10)
 *
 * Public API (on globalThis.CcFillOneNg):
 *   fillNg(el, selector, value, type, elType, ctx) => 1 | 0 | null
 *
 * ctx: { portalAdapters, filledBySource, _replayResults, _ccRecords,
 *        RUNTIME_VERSION, _flushRecords }
 *
 * Returns null if not ng-dropdown type.
 *
 * See fill-one-ng.md for full documentation.
 */
(function (root) {
  'use strict';

  function fillNg(el, selector, value, type, elType, ctx) {
    if (!(elType === 'ng-dropdown' || type === 'ng-dropdown')) return null;

    var portalAdapters   = ctx.portalAdapters   || {};
    var filledBySource   = ctx.filledBySource   || {};
    var _replayResults   = ctx._replayResults   || {};
    var _ccRecords       = ctx._ccRecords       || [];
    var RUNTIME_VERSION  = ctx.RUNTIME_VERSION  || '';
    var _flushRecords    = ctx._flushRecords    || function () {};

    var _nos = root.CcNgOptionScorer  || {};
    var _nsm = root.CcNgSessionManager || {};
    var _bfr = root.CcBuildFillRecord || {};

    var rootClass = el.className ? el.className.trim().split(/\s+/)[0] : 'ng-dropdown';
    var adapter = portalAdapters[rootClass] || portalAdapters['ng-dropdown'];

    if (!adapter) {
      var _noAdapterLabel = filledBySource[selector] && filledBySource[selector].label || selector;
      _replayResults[_noAdapterLabel] = 'no-adapter';
      try { sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults)); } catch (e) {}
      return 0;
    }

    var _label = (filledBySource[selector] && filledBySource[selector].label) || selector;
    var trigger = el.querySelector(adapter.triggerSelector) || el;

    if (!window._ccReplaySessions) window._ccReplaySessions = new Map();
    if (_nsm.cancelSession) _nsm.cancelSession(_label, window._ccReplaySessions);

    var session = _nsm.createSession
      ? _nsm.createSession(_label, window._ccReplaySessions)
      : { id: Math.random().toString(36).slice(2, 8), fieldKey: _label, resolved: false, cancelled: false,
          pollTimer: null, timeoutIds: [], observer: null, startedAt: Date.now() };
    if (!_nsm.createSession) window._ccReplaySessions.set(_label, session);

    function isVisible(node) {
      return window.ccDomUtils && window.ccDomUtils.isVisible
        ? window.ccDomUtils.isVisible(node)
        : !!(node && node.offsetParent !== null);
    }

    function cleanupAndRecord(result) {
      if (session.resolved && result !== session._result) return;
      session.resolved = true;
      session._result = result;
      if (_nsm.cleanupSession) {
        _nsm.cleanupSession(session, window._ccReplaySessions, _label);
      } else {
        try { clearInterval(session.pollTimer); } catch (e) {}
        (session.timeoutIds || []).forEach(function (id) { try { clearTimeout(id); } catch (e) {} });
        if (session.observer) { session.observer.disconnect(); session.observer = null; }
        window._ccReplaySessions.delete(_label);
      }
      _replayResults[_label] = result;
      try { sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults)); } catch (e) {}
      var _isOk = result === 'ok';
      var rec = _bfr.buildFillRecord
        ? _bfr.buildFillRecord({ selector: selector, value: value, type: 'ng-dropdown',
            result: _isOk ? 'filled' : 'skipped', failReason: _isOk ? null : result,
            strategy: 'ng-dropdown-click', durationMs: Date.now() - session.startedAt },
            { rv: RUNTIME_VERSION })
        : { selector: selector, value: value, type: 'ng-dropdown',
            result: _isOk ? 'filled' : 'skipped', failReason: _isOk ? null : result,
            strategy: 'ng-dropdown-click', durationMs: Date.now() - session.startedAt,
            ts: Date.now(), rv: RUNTIME_VERSION, fillMode: 'sequential' };
      _ccRecords.push(rec);
      _flushRecords();
    }

    var OVERLAY_TAGS = ['app-dropdown','ul','ng-dropdown-panel','cdk-overlay-container',
      '.dropdown-options','.options-list','.dropdown-menu','.ng-dropdown-panel'];
    var addedNodes = [];
    var _trace = { triggerLabel: _label, overlayFound: false, overlayTag: '', mutationCount: 0,
      optionCount: 0, matchedOption: '', clicked: false, verifyStatus: '', durationMs: 0 };

    trigger.click();

    var mo = new MutationObserver(function (mutations) {
      if (session.cancelled || session.resolved) return;
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (n) { if (n.nodeType === 1) addedNodes.push(n); });
      });
    });
    session.observer = mo;
    mo.observe(document.body, { childList: true, subtree: true });

    var _lastMutation = Date.now();
    var _stabilizeMo = new MutationObserver(function () { _lastMutation = Date.now(); });
    _stabilizeMo.observe(document.body, { childList: true, subtree: true, attributes: true });

    function waitStable(cb) {
      var check = setInterval(function () {
        if (session.cancelled) { clearInterval(check); _stabilizeMo.disconnect(); return; }
        if (Date.now() - _lastMutation >= 150) { clearInterval(check); _stabilizeMo.disconnect(); cb(); }
      }, 50);
      var capId = setTimeout(function () {
        clearInterval(check); _stabilizeMo.disconnect();
        if (!session.cancelled) cb();
      }, 1200);
      session.timeoutIds.push(capId);
    }

    waitStable(function () {
      if (session.cancelled || session.resolved) return;
      mo.disconnect(); session.observer = null;
      _trace.mutationCount = addedNodes.length;

      var _optQ = adapter.optionSelector || 'li,.ng-option,mat-option,.dropdown-item';
      var activeOverlayRoot = null;
      var trigRect = trigger.getBoundingClientRect();

      for (var i = 0; i < addedNodes.length; i++) {
        var node = addedNodes[i];
        if (!isVisible(node)) continue;
        var lis = Array.from(node.querySelectorAll(_optQ)).filter(function (o) { return isVisible(o); });
        if (lis.length > 0) { activeOverlayRoot = node; break; }
      }

      if (!activeOverlayRoot) {
        var bestDist = Infinity;
        OVERLAY_TAGS.forEach(function (sel) {
          try {
            document.querySelectorAll(sel).forEach(function (node) {
              var lis2 = Array.from(node.querySelectorAll(_optQ)).filter(function (o) { return isVisible(o); });
              if (lis2.length === 0) return;
              var r = node.getBoundingClientRect();
              var dist = Math.abs(r.left - trigRect.left) + Math.abs(r.top - trigRect.bottom);
              if (dist < bestDist) { bestDist = dist; activeOverlayRoot = node; }
            });
          } catch (e) {}
        });
      }

      if (!activeOverlayRoot && adapter.optionsContainer) {
        activeOverlayRoot = document.querySelector(adapter.optionsContainer) || null;
      }

      _trace.overlayFound = !!activeOverlayRoot;
      _trace.overlayTag = activeOverlayRoot
        ? activeOverlayRoot.tagName + '.' + activeOverlayRoot.className.slice(0, 40) : 'NONE';

      var attempts = 0;
      session.pollTimer = setInterval(function () {
        if (session.cancelled || session.resolved) { clearInterval(session.pollTimer); return; }
        attempts++;
        var searchRoot = activeOverlayRoot || document.body;
        var opts = Array.from(searchRoot.querySelectorAll(_optQ)).filter(function (o) { return isVisible(o); });
        if (opts.length === 0 && searchRoot !== document) {
          opts = Array.from(document.querySelectorAll(_optQ)).filter(function (o) {
            return isVisible(o) && !el.contains(o) && o.closest('[class*="dropdown"],[class*="options"],[class*="list"]');
          });
        }

        var v = value.toLowerCase().trim();
        _trace.optionCount = opts.length;

        var scoreOption = _nos.scoreOption || function (ot) {
          ot = String(ot || '').toLowerCase().trim();
          if (ot === v) return 100;
          if (ot.includes(v)) return 80;
          if (v.includes(ot) && ot.length > 3) return 70;
          return 0;
        };

        var bestOpt = null, bestScore = 0;
        opts.forEach(function (o) {
          var score = scoreOption(o.textContent.trim(), v);
          if (score > bestScore) { bestScore = score; bestOpt = o; }
        });
        var opt = bestScore >= 50 ? bestOpt : null;

        if (opt) {
          clearInterval(session.pollTimer);
          if (session.cancelled || session.resolved) return;
          _trace.matchedOption = opt.textContent.trim();
          _trace.clicked = true;
          ['pointerdown','mousedown','mouseup','click'].forEach(function (ev) {
            opt.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }));
          });

          var verifyStart = Date.now();
          var triggerInitialText = trigger.textContent.trim();
          var verifyPoll = setInterval(function () {
            if (session.cancelled || session.resolved) { clearInterval(verifyPoll); return; }
            var verifyEl = adapter.verifySelector ? el.querySelector(adapter.verifySelector) : null;
            var displayed = verifyEl ? verifyEl.textContent.trim() : '';
            var overlayGone = activeOverlayRoot ? !isVisible(activeOverlayRoot) : false;
            var triggerChanged = trigger.textContent.trim() !== triggerInitialText;
            var ariaSelected = opt.getAttribute('aria-selected') === 'true';
            var ok = (displayed && !/^(select|choose|--)$/i.test(displayed)) ||
                     overlayGone || triggerChanged || ariaSelected;
            if (ok || Date.now() - verifyStart >= 3000) {
              clearInterval(verifyPoll);
              if (session.resolved) return;
              _trace.verifyStatus = ok ? 'ok' : 'verify-fail';
              _trace.durationMs = Date.now() - session.startedAt;
              cleanupAndRecord(_trace.verifyStatus);
            }
          }, 200);

        } else if (attempts >= 10) {
          clearInterval(session.pollTimer);
          if (session.resolved) return;
          document.body.click();
          _trace.durationMs = Date.now() - session.startedAt;
          cleanupAndRecord('no-option');
        }
      }, 300);
    });

    return 1;
  }

  root.CcFillOneNg = {
    fillNg: fillNg,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcFillOneNg;
