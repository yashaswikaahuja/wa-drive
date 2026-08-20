(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  // Minimal fallback if fill-one-ng-helpers.js did not inject
  root.CcExecParts.installFillOneNgHelpers = root.CcExecParts.installFillOneNgHelpers || function (k) {
    k._ngCancelSession = function (label) {
      const old = window._ccReplaySessions && window._ccReplaySessions.get(label);
      if (!old) return;
      old.cancelled = true; try { clearInterval(old.pollTimer); } catch (e) {}
      (old.timeoutIds || []).forEach(function (id) { clearTimeout(id); });
      if (old.observer) old.observer.disconnect();
      window._ccReplaySessions.delete(label);
    };
  };
  root.CcExecParts.installFillOneNg = function (k) {
    root.CcExecParts.installFillOneNgHelpers(k);
    const b = root.CcExecParts.bindKernelLocals(k);
    const portalAdapters = b.portalAdapters, filledBySource = b.filledBySource;
    const _replayResults = b._replayResults, _ccRecords = b._ccRecords;
    const RUNTIME_VERSION = b.RUNTIME_VERSION, _flushRecords = b._flushRecords;
    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: 'ng-dropdown',
      try(el, selector, value, type, elType) {
        if (!(elType === 'ng-dropdown' || type === 'ng-dropdown')) return null;
        const rootClass = el.className ? el.className.trim().split(/\s+/)[0] : 'ng-dropdown';
        const adapter = portalAdapters[rootClass] || portalAdapters['ng-dropdown'];
        if (adapter) {
          const _label = filledBySource[selector]?.label || selector;
          const trigger = el.querySelector(adapter.triggerSelector) || el;
          if (!window._ccReplaySessions) window._ccReplaySessions = new Map();
          k._ngCancelSession && k._ngCancelSession(_label);
          const session = { id: Math.random().toString(36).slice(2,8), fieldKey: _label, resolved: false, cancelled: false, pollTimer: null, timeoutIds: [], observer: null, startedAt: Date.now() };
          window._ccReplaySessions.set(_label, session);
          function isVisible(node) {
            return window.ccDomUtils.isVisible(node);
          }
          function cleanupSession(result) {
            if (session.resolved && result !== session._result) return; // already resolved, don't overwrite
            session.resolved = true;
            session._result = result;
            clearInterval(session.pollTimer);
            session.timeoutIds.forEach(id => clearTimeout(id));
            if (session.observer) { session.observer.disconnect(); session.observer = null; }
            window._ccReplaySessions.delete(_label);
            _replayResults[_label] = result;
            sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults));
            const _isOk = result === 'ok';
            _ccRecords.push((root.CcBuildFillRecord ? root.CcBuildFillRecord.buildFillRecord : function(b){return Object.assign({ts:Date.now(),rv:RUNTIME_VERSION,fillMode:'sequential'},b);})({ selector, value, type: 'ng-dropdown', result: _isOk ? 'filled' : 'skipped', failReason: _isOk ? null : result, strategy: 'ng-dropdown-click', durationMs: Date.now()-session.startedAt }, { rv: RUNTIME_VERSION }));
            _flushRecords();
          }
          const OVERLAY_TAGS = ['app-dropdown','ul','ng-dropdown-panel','cdk-overlay-container',
                '.dropdown-options','.options-list','.dropdown-menu','.ng-dropdown-panel'];
          const addedNodes = [];
          const _trace = { triggerLabel: _label, overlayFound: false, overlayTag: '', mutationCount: 0, optionCount: 0, matchedOption: '', clicked: false, verifyStatus: '', durationMs: 0 };
          trigger.click();
          const mo = new MutationObserver(mutations => {
            if (session.cancelled || session.resolved) return;
            for (const m of mutations) {
              m.addedNodes.forEach(n => { if (n.nodeType === 1) addedNodes.push(n); });
            }
          });
          session.observer = mo;
          mo.observe(document.body, { childList: true, subtree: true });
          let _lastMutation = Date.now();
          const _stabilizeMo = new MutationObserver(() => { _lastMutation = Date.now(); });
          _stabilizeMo.observe(document.body, { childList: true, subtree: true, attributes: true });
          function waitStable(cb) {
            const check = setInterval(() => {
              if (session.cancelled) { clearInterval(check); _stabilizeMo.disconnect(); return; }
              if (Date.now() - _lastMutation >= 150) { clearInterval(check); _stabilizeMo.disconnect(); cb(); }
            }, 50);
            const capId = setTimeout(() => { clearInterval(check); _stabilizeMo.disconnect(); if (!session.cancelled) cb(); }, 1200);
            session.timeoutIds.push(capId);
          }
          waitStable(() => {
            if (session.cancelled || session.resolved) return;
            mo.disconnect();
            session.observer = null;
            _trace.mutationCount = addedNodes.length;
            let activeOverlayRoot = null;
            const trigRect = trigger.getBoundingClientRect();
            for (const node of addedNodes) {
              if (!isVisible(node)) continue;
              const _optQ = adapter.optionSelector || 'li,.ng-option,mat-option,.dropdown-item';
              const lis = Array.from(node.querySelectorAll(_optQ)).filter(o => isVisible(o));
              if (lis.length > 0) { activeOverlayRoot = node; break; }
            }
            if (!activeOverlayRoot) {
              let bestDist = Infinity;
              OVERLAY_TAGS.forEach(sel => {
                try {
          document.querySelectorAll(sel).forEach(node => {
            const lis = Array.from(node.querySelectorAll(_optQ)).filter(o => isVisible(o));
            if (lis.length === 0) return;
            const r = node.getBoundingClientRect();
            const dist = Math.abs(r.left - trigRect.left) + Math.abs(r.top - trigRect.bottom);
            if (dist < bestDist) { bestDist = dist; activeOverlayRoot = node; }
          });
                } catch {}
              });
            }
            if (!activeOverlayRoot && adapter.optionsContainer) {
              activeOverlayRoot = document.querySelector(adapter.optionsContainer) || null;
            }
            if (!activeOverlayRoot) {
              const rootLis = Array.from(root.querySelectorAll(_optQ)).filter(o => isVisible(o));
              if (rootLis.length > 0) activeOverlayRoot = root;
            }
            _trace.overlayFound = !!activeOverlayRoot;
            _trace.overlayTag = activeOverlayRoot ? activeOverlayRoot.tagName + '.' + activeOverlayRoot.className.slice(0,40) : 'NONE';
            let attempts = 0;
            session.pollTimer = setInterval(() => {
              if (session.cancelled || session.resolved) { clearInterval(session.pollTimer); return; }
              attempts++;
              const searchRoot = activeOverlayRoot || root;
              let opts = Array.from(searchRoot.querySelectorAll(_optQ)).filter(o => isVisible(o));
              if (opts.length === 0 && searchRoot !== document) {
                opts = Array.from(document.querySelectorAll(_optQ)).filter(o => isVisible(o) && root.contains(o) === false && o.closest('[class*="dropdown"],[class*="options"],[class*="list"]'));
              }
              const v = value.toLowerCase().trim();
              _trace.optionCount = opts.length;
              function _matchScore(optText) {
                const ot = optText.toLowerCase().trim();
                if (ot === v) return 100;
                if (ot.includes(v)) return 80;
                if (v.includes(ot) && ot.length > 3) return 70;
                const vToks = v.split(/[\s()+,/\-]+/).filter(t=>t.length>2);
                const oToks = ot.split(/[\s()+,/\-]+/).filter(t=>t.length>2);
                const overlap = vToks.filter(t => oToks.some(o => o.includes(t) || t.includes(o))).length;
                if (overlap >= 2) return 60;
                if (overlap === 1 && (vToks.length <= 2 || oToks.length <= 2)) return 50;
                const eduSynonyms = [
          ['intermediate','higher secondary','10+2','12th','hsc','senior secondary'],
          ['matriculation','10th','sslc','secondary','high school','class 10','class x'],
          ['graduation','graduate','degree','bachelor','ug'],
          ['post graduation','post graduate','masters','pg','m.a','m.sc','m.com'],
                ];
                for (const group of eduSynonyms) {
          const vIn = group.some(s => v.includes(s));
          const oIn = group.some(s => ot.includes(s));
          if (vIn && oIn) return 55;
                }
                return 0;
              }
              let bestOpt = null, bestScore = 0;
              for (const o of opts) {
                const score = _matchScore(o.textContent.trim());
                if (score > bestScore) { bestScore = score; bestOpt = o; }
              }
              const opt = bestScore >= 50 ? bestOpt : null;
              if (opt) {
                clearInterval(session.pollTimer);
                if (session.cancelled || session.resolved) return;
                _trace.matchedOption = opt.textContent.trim();
                _trace.clicked = true;
                ['pointerdown','mousedown','mouseup','click'].forEach(ev =>
          opt.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }))
                );
                const verifyStart = Date.now();
                const triggerInitialText = trigger.textContent.trim();
                const verifyPoll = setInterval(() => {
          if (session.cancelled || session.resolved) { clearInterval(verifyPoll); return; }
          const verifyEl = adapter.verifySelector ? el.querySelector(adapter.verifySelector) : null;
          const displayed = verifyEl ? verifyEl.textContent.trim() : '';
          const overlayGone = activeOverlayRoot ? !isVisible(activeOverlayRoot) : false;
          const triggerChanged = trigger.textContent.trim() !== triggerInitialText;
          const ariaSelected = opt.getAttribute('aria-selected') === 'true';
          const ok = (displayed && !/^(select|choose|--)$/i.test(displayed)) || overlayGone || triggerChanged || ariaSelected;
          if (ok || Date.now() - verifyStart >= 3000) {
            clearInterval(verifyPoll);
            if (session.resolved) return;
            _trace.verifyStatus = ok ? 'ok' : 'verify-fail';
            _trace.durationMs = Date.now() - session.startedAt;
            cleanupSession(_trace.verifyStatus);
          }
                }, 200);
                session.timeoutIds.push(setInterval(() => {}, 0)); // placeholder — verifyPoll managed separately
              } else if (attempts >= 10) {
                clearInterval(session.pollTimer);
                if (session.resolved) return;
                document.body.click();
                _trace.durationMs = Date.now() - session.startedAt;
                cleanupSession('no-option');
              }
            }, 300);
          });
          return 1;
        }
        const _noAdapterLabel = filledBySource[selector]?.label || selector;
        _replayResults[_noAdapterLabel] = 'no-adapter';
        sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults));
        return 0;
        return 0;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
