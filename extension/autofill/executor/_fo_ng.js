      if (elType === 'ng-dropdown' || type === 'ng-dropdown') {
        const rootClass = el.className ? el.className.trim().split(/\s+/)[0] : 'ng-dropdown';
        const adapter = portalAdapters[rootClass] || portalAdapters['ng-dropdown'];
        if (adapter) {
          const _label = filledBySource[selector]?.label || selector;
          const trigger = el.querySelector(adapter.triggerSelector) || el;

          // ── Session lifecycle ────────────────────────────────────────
          if (!window._ccReplaySessions) window._ccReplaySessions = new Map();
          // Cancel any existing session for this field
          if (window._ccReplaySessions.has(_label)) {
            const old = window._ccReplaySessions.get(_label);
            old.cancelled = true;
            clearInterval(old.pollTimer);
            old.timeoutIds.forEach(id => clearTimeout(id));
            if (old.observer) old.observer.disconnect();
            window._ccReplaySessions.delete(_label);
            console.log('[CC][session-cancel] id='+old.id+' label='+_label);
          }
          const session = {
            id: Math.random().toString(36).slice(2,8),
            fieldKey: _label,
            resolved: false,
            cancelled: false,
            pollTimer: null,
            timeoutIds: [],
            observer: null,
            startedAt: Date.now(),
          };
          window._ccReplaySessions.set(_label, session);
          console.log('[CC][session-start] id='+session.id+' label='+_label);

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
            // Record ng-dropdown fill in replay records
            const _isOk = result === 'ok';
            _ccRecords.push({ selector, value, type: 'ng-dropdown', result: _isOk ? 'filled' : 'skipped', failReason: _isOk ? null : result, strategy: 'ng-dropdown-click', durationMs: Date.now()-session.startedAt, ts: Date.now(), rv: RUNTIME_VERSION });
            _flushRecords();
            console.log('[CC][session-cleanup] id='+session.id+' label='+_label+' result='+result+' duration='+(Date.now()-session.startedAt)+'ms');
          }

          const OVERLAY_TAGS = ['app-dropdown','ul','ng-dropdown-panel','cdk-overlay-container',
                                '.dropdown-options','.options-list','.dropdown-menu','.ng-dropdown-panel'];
          const addedNodes = [];
          const _trace = { triggerLabel: _label, overlayFound: false, overlayTag: '', mutationCount: 0, optionCount: 0, matchedOption: '', clicked: false, verifyStatus: '', durationMs: 0 };

          trigger.click();

          // MutationObserver starts AFTER click — only captures mutations from THIS click
          const mo = new MutationObserver(mutations => {
            if (session.cancelled || session.resolved) return;
            for (const m of mutations) {
              m.addedNodes.forEach(n => { if (n.nodeType === 1) addedNodes.push(n); });
            }
          });
          session.observer = mo;
          mo.observe(document.body, { childList: true, subtree: true });

          // Wait for DOM to stabilize (~150ms quiet), max 1200ms
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

            // Priority 1: newly added node with visible options
            for (const node of addedNodes) {
              if (!isVisible(node)) continue;
              const _optQ = adapter.optionSelector || 'li,.ng-option,mat-option,.dropdown-item';
              const lis = Array.from(node.querySelectorAll(_optQ)).filter(o => isVisible(o));
              if (lis.length > 0) { activeOverlayRoot = node; break; }
            }
            // Priority 2: existing overlay nearest trigger with visible options
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
            // Priority 3: adapter fallback
            if (!activeOverlayRoot && adapter.optionsContainer) {
              activeOverlayRoot = document.querySelector(adapter.optionsContainer) || null;
            }
            // Priority 4: options already in DOM inside the root component
            if (!activeOverlayRoot) {
              const rootLis = Array.from(root.querySelectorAll(_optQ)).filter(o => isVisible(o));
              if (rootLis.length > 0) activeOverlayRoot = root;
            }

            _trace.overlayFound = !!activeOverlayRoot;
            _trace.overlayTag = activeOverlayRoot ? activeOverlayRoot.tagName + '.' + activeOverlayRoot.className.slice(0,40) : 'NONE';
            console.log('[CC][overlay] id='+session.id+' label='+_label+' root='+_trace.overlayTag+' mutations='+addedNodes.length);

            // ── Poll for matching option ─────────────────────────────
            let attempts = 0;
            session.pollTimer = setInterval(() => {
              if (session.cancelled || session.resolved) { clearInterval(session.pollTimer); return; }
              attempts++;
              // Search in overlay root, then root component, then document
              const searchRoot = activeOverlayRoot || root;
              let opts = Array.from(searchRoot.querySelectorAll(_optQ)).filter(o => isVisible(o));
              // Fallback: if root has no visible options, try document
              if (opts.length === 0 && searchRoot !== document) {
                opts = Array.from(document.querySelectorAll(_optQ)).filter(o => isVisible(o) && root.contains(o) === false && o.closest('[class*="dropdown"],[class*="options"],[class*="list"]'));
              }
              const v = value.toLowerCase().trim();
              _trace.optionCount = opts.length;
              console.log('[CC][poll] id='+session.id+' attempt='+attempts+' opts='+opts.length+' v='+v);
              if (opts.length > 0 && attempts === 1) console.log('[CC][poll] sample:', opts.slice(0,3).map(o=>o.textContent.trim()));

              // ── Matching cascade: exact → contains → reverse-contains → token overlap → synonym
              function _matchScore(optText) {
                const ot = optText.toLowerCase().trim();
                if (ot === v) return 100;
                if (ot.includes(v)) return 80;
                if (v.includes(ot) && ot.length > 3) return 70;
                // Token overlap: split both into words, count matching tokens
                const vToks = v.split(/[\s()+,/\-]+/).filter(t=>t.length>2);
                const oToks = ot.split(/[\s()+,/\-]+/).filter(t=>t.length>2);
                const overlap = vToks.filter(t => oToks.some(o => o.includes(t) || t.includes(o))).length;
                if (overlap >= 2) return 60;
                if (overlap === 1 && (vToks.length <= 2 || oToks.length <= 2)) return 50;
                // Common education synonyms
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
                console.log('[CC][poll] matched: '+_trace.matchedOption+' id='+session.id);
                ['pointerdown','mousedown','mouseup','click'].forEach(ev =>
                  opt.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }))
                );
                // Multi-stage verify
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
                    console.log('[CC][session-resolve] id='+session.id+' label='+_label+' result='+_trace.verifyStatus+' duration='+_trace.durationMs+'ms');
                    cleanupSession(_trace.verifyStatus);
                  }
                }, 200);
                session.timeoutIds.push(setInterval(() => {}, 0)); // placeholder — verifyPoll managed separately

              } else if (attempts >= 10) {
                clearInterval(session.pollTimer);
                if (session.resolved) return;
                document.body.click();
                _trace.durationMs = Date.now() - session.startedAt;
                console.log('[CC][session-resolve] id='+session.id+' label='+_label+' result=no-option');
                cleanupSession('no-option');
              }
            }, 300);
          });

          return 1;
        }
        // No adapter yet
        const _noAdapterLabel = filledBySource[selector]?.label || selector;
        _replayResults[_noAdapterLabel] = 'no-adapter';
        sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults));
        return 0;
      }